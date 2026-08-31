import {
  ArrowLeft,
  Bot,
  Mic,
  PhoneOff,
  ShieldCheck,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const GEMINI_MODEL = 'gemini-3.1-flash-live-preview';
const GEMINI_LIVE_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
const INPUT_SAMPLE_RATE = 16_000;
const OUTPUT_SAMPLE_RATE = 24_000;

type CallState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

interface GeminiPart {
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
}

interface GeminiServerMessage {
  setupComplete?: Record<string, never>;
  serverContent?: {
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: { parts?: GeminiPart[] };
    interrupted?: boolean;
    turnComplete?: boolean;
  };
  error?: { message?: string };
}

interface LiveTokenResponse {
  token?: string;
  error?: string;
}

function floatToPcm16(input: Float32Array, inputRate: number): Int16Array {
  const ratio = inputRate / INPUT_SAMPLE_RATE;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new Int16Array(length);

  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let total = 0;
    let samples = 0;

    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      total += input[sourceIndex];
      samples += 1;
    }

    const sample = Math.max(-1, Math.min(1, samples ? total / samples : 0));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return output;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return window.btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function getSampleRate(mimeType?: string): number {
  const match = mimeType?.match(/rate=(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : OUTPUT_SAMPLE_RATE;
}

export function VoiceAgentPage() {
  const [callState, setCallState] = useState<CallState>('idle');
  const [status, setStatus] = useState('Ready when you are');
  const [inputTranscript, setInputTranscript] = useState('');
  const [outputTranscript, setOutputTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silenceRef = useRef<GainNode | null>(null);
  const nextPlaybackTimeRef = useRef(0);
  const mountedRef = useRef(true);

  const stopMicrophone = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    silenceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    processorRef.current = null;
    sourceRef.current = null;
    silenceRef.current = null;
    streamRef.current = null;
  }, []);

  const endConversation = useCallback(
    (nextState: CallState = 'idle') => {
      stopMicrophone();

      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close(1000, 'Call ended');
        socketRef.current = null;
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }

      nextPlaybackTimeRef.current = 0;
      if (mountedRef.current) {
        setCallState(nextState);
        if (nextState === 'idle') setStatus('Ready when you are');
      }
    },
    [stopMicrophone],
  );

  const playPcmAudio = useCallback((data: string, mimeType?: string) => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    const bytes = base64ToBytes(data);
    const usableLength = bytes.byteLength - (bytes.byteLength % 2);
    if (!usableLength) return;

    const view = new DataView(bytes.buffer, bytes.byteOffset, usableLength);
    const sampleCount = usableLength / 2;
    const audioBuffer = audioContext.createBuffer(
      1,
      sampleCount,
      getSampleRate(mimeType),
    );
    const channel = audioBuffer.getChannelData(0);

    for (let index = 0; index < sampleCount; index += 1) {
      channel[index] = view.getInt16(index * 2, true) / 0x8000;
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    const startTime = Math.max(
      audioContext.currentTime + 0.02,
      nextPlaybackTimeRef.current,
    );
    source.start(startTime);
    nextPlaybackTimeRef.current = startTime + audioBuffer.duration;
  }, []);

  const startMicrophone = useCallback(async () => {
    const socket = socketRef.current;
    const audioContext = audioContextRef.current;
    if (!socket || !audioContext) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const silence = audioContext.createGain();
    silence.gain.value = 0;

    processor.onaudioprocess = (event) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const pcm = floatToPcm16(
        event.inputBuffer.getChannelData(0),
        audioContext.sampleRate,
      );
      const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);

      socket.send(
        JSON.stringify({
          realtimeInput: {
            audio: {
              data: bytesToBase64(bytes),
              mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
            },
          },
        }),
      );
    };

    source.connect(processor);
    processor.connect(silence);
    silence.connect(audioContext.destination);
    sourceRef.current = source;
    processorRef.current = processor;
    silenceRef.current = silence;
  }, []);

  const handleServerMessage = useCallback(
    async (event: MessageEvent) => {
      const raw =
        typeof event.data === 'string'
          ? event.data
          : event.data instanceof Blob
            ? await event.data.text()
            : '';
      if (!raw) return;

      const message = JSON.parse(raw) as GeminiServerMessage;
      if (message.error?.message) {
        throw new Error(message.error.message);
      }

      if (message.setupComplete) {
        await startMicrophone();
        setCallState('listening');
        setStatus('Listening — start talking');
        return;
      }

      const content = message.serverContent;
      if (!content) return;

      if (content.interrupted) {
        nextPlaybackTimeRef.current = audioContextRef.current?.currentTime || 0;
        setCallState('listening');
        setStatus('Listening');
      }

      if (content.inputTranscription?.text) {
        setInputTranscript(content.inputTranscription.text);
      }

      if (content.outputTranscription?.text) {
        setOutputTranscript(content.outputTranscription.text);
      }

      for (const part of content.modelTurn?.parts || []) {
        if (part.inlineData?.data) {
          setCallState('speaking');
          setStatus('BuildMyBot is speaking');
          playPcmAudio(part.inlineData.data, part.inlineData.mimeType);
        }
      }

      if (content.turnComplete) {
        setCallState('listening');
        setStatus('Listening');
      }
    },
    [playPcmAudio, startMicrophone],
  );

  const startConversation = async () => {
    if (callState !== 'idle' && callState !== 'error') return;

    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      setCallState('error');
      setErrorMessage(
        'Live voice requires a modern browser with microphone access.',
      );
      return;
    }

    setCallState('connecting');
    setStatus('Securing a live session');
    setErrorMessage('');
    setInputTranscript('');
    setOutputTranscript('');

    try {
      const tokenResponse = await fetch('/api/voice/live-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const tokenPayload = (await tokenResponse.json()) as LiveTokenResponse;
      if (!tokenResponse.ok || !tokenPayload.token) {
        throw new Error(tokenPayload.error || 'Unable to start a live session');
      }

      const audioContext = new AudioContext({ latencyHint: 'interactive' });
      await audioContext.resume();
      audioContextRef.current = audioContext;
      nextPlaybackTimeRef.current = audioContext.currentTime;

      const url = `${GEMINI_LIVE_URL}?access_token=${encodeURIComponent(tokenPayload.token)}`;
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        setStatus('Connecting to Gemini Live');
        socket.send(
          JSON.stringify({
            setup: {
              model: `models/${GEMINI_MODEL}`,
              responseModalities: ['AUDIO'],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
              },
              thinkingConfig: { thinkingLevel: 'minimal' },
              systemInstruction: {
                parts: [
                  {
                    text: 'You are the BuildMyBot live voice concierge. Be warm, natural, concise, and helpful. Explain how BuildMyBot creates AI chatbots and voice agents for businesses, answer product questions, and invite qualified visitors to create an account. Never pretend to be human. If asked for legal, medical, or financial advice, explain that you can only provide general information.',
                  },
                ],
              },
            },
          }),
        );
      };

      socket.onmessage = (event) => {
        void handleServerMessage(event).catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : 'Live voice session failed';
          setErrorMessage(message);
          setStatus('Connection error');
          endConversation('error');
        });
      };

      socket.onerror = () => {
        setErrorMessage('The live voice connection could not be established.');
        setStatus('Connection error');
        endConversation('error');
      };

      socket.onclose = (event) => {
        if (event.code !== 1000 && mountedRef.current) {
          setErrorMessage(
            event.reason || 'The live voice session ended unexpectedly.',
          );
          setStatus('Session ended');
          endConversation('error');
        }
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unable to start live voice';
      setErrorMessage(message);
      setStatus('Could not start');
      endConversation('error');
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopMicrophone();
      socketRef.current?.close(1000, 'Page closed');
      if (audioContextRef.current) void audioContextRef.current.close();
    };
  }, [stopMicrophone]);

  const isActive = callState === 'listening' || callState === 'speaking';

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.28),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(124,58,237,0.22),_transparent_38%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 transition hover:text-white"
          >
            <ArrowLeft size={18} /> Back to BuildMyBot
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
            <ShieldCheck size={15} /> Secure one-time session
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1fr_0.9fr] lg:py-16">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-400/10 px-4 py-2 text-sm font-semibold text-blue-200">
              <Sparkles size={16} /> Powered by Gemini 3.1 Flash Live
            </div>
            <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Talk with the BuildMyBot voice agent.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Ask about AI receptionists, website chatbots, lead capture,
              pricing, or how BuildMyBot can work for your business. This is a
              live, two-way voice conversation—not a prerecorded demo.
            </p>

            <div className="mt-8 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Mic className="mb-3 text-blue-300" size={22} />
                Natural conversation
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Volume2 className="mb-3 text-violet-300" size={22} />
                Real-time audio
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <ShieldCheck className="mb-3 text-emerald-300" size={22} />
                No API key exposed
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-blue-950/50 backdrop-blur-xl sm:p-8">
            <div className="text-center">
              <div
                className={`relative mx-auto flex h-32 w-32 items-center justify-center rounded-full transition-all duration-500 ${
                  callState === 'speaking'
                    ? 'scale-105 bg-violet-500 shadow-[0_0_80px_rgba(139,92,246,0.55)]'
                    : callState === 'listening'
                      ? 'bg-blue-500 shadow-[0_0_70px_rgba(59,130,246,0.45)]'
                      : 'bg-slate-800'
                }`}
              >
                {isActive && (
                  <span className="absolute inset-0 animate-ping rounded-full border border-blue-300/40" />
                )}
                <Bot className="relative" size={58} />
              </div>
              <h2 className="mt-6 text-2xl font-bold">BuildMyBot Live</h2>
              <p className="mt-2 min-h-6 text-sm font-medium text-blue-200">
                {status}
              </p>
            </div>

            <div className="mt-6 min-h-36 space-y-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  You
                </p>
                <p className="mt-1 text-sm text-slate-200">
                  {inputTranscript || 'Your words will appear here.'}
                </p>
              </div>
              <div className="border-t border-white/10 pt-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-blue-400">
                  Voice agent
                </p>
                <p className="mt-1 text-sm text-slate-200">
                  {outputTranscript || 'The live response will appear here.'}
                </p>
              </div>
            </div>

            {errorMessage && (
              <div className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </div>
            )}

            <button
              type="button"
              onClick={
                isActive ? () => endConversation('idle') : startConversation
              }
              disabled={callState === 'connecting'}
              className={`mt-6 flex w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 text-lg font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                isActive
                  ? 'bg-red-500 hover:bg-red-400'
                  : 'bg-blue-600 shadow-lg shadow-blue-600/25 hover:bg-blue-500'
              }`}
            >
              {isActive ? (
                <>
                  <PhoneOff size={22} /> End conversation
                </>
              ) : (
                <>
                  <Mic size={22} />
                  {callState === 'connecting' ? 'Connecting…' : 'Start talking'}
                </>
              )}
            </button>
            <p className="mt-4 text-center text-xs leading-5 text-slate-500">
              Your browser will ask for microphone permission. Audio is sent
              directly to Gemini for this session and the access token expires
              automatically.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
