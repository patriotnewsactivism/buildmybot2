import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Bot,
  CalendarCheck,
  Check,
  Database,
  Headphones,
  MessageSquareText,
  Mic,
  PhoneCall,
  PhoneForwarded,
  PhoneOff,
  ShieldCheck,
  Sparkles,
  Volume2,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const GEMINI_MODEL = 'gemini-3.1-flash-live-preview';
const GEMINI_LIVE_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
const INPUT_SAMPLE_RATE = 16_000;
const OUTPUT_SAMPLE_RATE = 24_000;
const NATURAL_SILENCE_MS = 750;

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
  model?: string;
  error?: string;
}

const CAPABILITIES = [
  {
    icon: PhoneCall,
    title: '24/7 call answering',
    description:
      'Answer new callers after hours, during rushes, or whenever your team cannot pick up.',
  },
  {
    icon: MessageSquareText,
    title: 'Natural conversation',
    description:
      'Handle pauses, corrections, interruptions, follow-up questions, and normal conversational language.',
  },
  {
    icon: Database,
    title: 'Business-aware answers',
    description:
      'Ground the agent in your services, FAQs, policies, hours, service area, and approved business knowledge.',
  },
  {
    icon: CalendarCheck,
    title: 'Book appointments',
    description:
      'Connect scheduling tools so qualified callers can move from question to booked appointment in one call.',
  },
  {
    icon: BellRing,
    title: 'Hot-lead alerts',
    description:
      'Score buying intent and alert the owner or sales team immediately when a high-value opportunity appears.',
  },
  {
    icon: PhoneForwarded,
    title: 'Human handoff',
    description:
      'Escalate qualified, frustrated, complex, or human-requested calls with context instead of starting over.',
  },
];

const INDUSTRIES = [
  'Locksmiths',
  'Automotive key replacement',
  'HVAC',
  'Plumbing',
  'Roofing',
  'Dental',
  'Med spas',
  'Law firms',
  'Real estate',
  'Property management',
  'Hotels',
  'Home services',
];

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
  const [status, setStatus] = useState('Ready for a live conversation');
  const [inputTranscript, setInputTranscript] = useState('');
  const [outputTranscript, setOutputTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silenceRef = useRef<GainNode | null>(null);
  const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
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

  const clearPlayback = useCallback(() => {
    for (const source of playbackSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Source may already have ended. Clearing the set below is sufficient.
      }
      source.disconnect();
    }
    playbackSourcesRef.current.clear();
    nextPlaybackTimeRef.current = audioContextRef.current?.currentTime || 0;
  }, []);

  const endConversation = useCallback(
    (nextState: CallState = 'idle') => {
      stopMicrophone();
      clearPlayback();

      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close(1000, 'Call ended');
        socketRef.current = null;
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }

      if (mountedRef.current) {
        setCallState(nextState);
        if (nextState === 'idle') {
          setStatus('Ready for a live conversation');
        }
      }
    },
    [clearPlayback, stopMicrophone],
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
    playbackSourcesRef.current.add(source);
    source.onended = () => {
      playbackSourcesRef.current.delete(source);
      source.disconnect();
    };

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
        setStatus('Listening — speak naturally');
        return;
      }

      const content = message.serverContent;
      if (!content) return;

      if (content.interrupted) {
        clearPlayback();
        setCallState('listening');
        setStatus('Listening — go ahead');
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
        setStatus('Listening — your turn');
      }
    },
    [clearPlayback, playPcmAudio, startMicrophone],
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
    setStatus('Securing a Gemini Live session');
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
        const model = tokenPayload.model || GEMINI_MODEL;
        socket.send(
          JSON.stringify({
            setup: {
              model: `models/${model}`,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                  },
                },
                thinkingConfig: { thinkingLevel: 'minimal' },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              realtimeInputConfig: {
                automaticActivityDetection: {
                  disabled: false,
                  startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
                  endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                  prefixPaddingMs: 40,
                  silenceDurationMs: NATURAL_SILENCE_MS,
                },
                activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
                turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
              },
              systemInstruction: {
                parts: [
                  {
                    text: 'You are the BuildMyBot live voice concierge. Speak naturally and concisely. Let visitors finish their thoughts and tolerate normal pauses. If they correct a detail mid-sentence, use the corrected detail. Explain BuildMyBot AI receptionists, chatbots, lead capture, scheduling, CRM actions, hot-lead alerts, and human handoffs accurately. Ask one question at a time. Never pretend to be human. Never claim you completed a real transfer, booking, payment, text message, or CRM action in this public browser demo. If a visitor is interested, invite them to start free or contact the BuildMyBot team.',
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
        setErrorMessage(
          'The live voice connection could not be established. Please try again.',
        );
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
      clearPlayback();
      socketRef.current?.close(1000, 'Page closed');
      if (audioContextRef.current) void audioContextRef.current.close();
    };
  }, [clearPlayback, stopMicrophone]);

  const isActive = callState === 'listening' || callState === 'speaking';

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_5%,_rgba(37,99,235,0.22),_transparent_35%),radial-gradient(circle_at_90%_20%,_rgba(124,58,237,0.18),_transparent_30%),radial-gradient(circle_at_50%_100%,_rgba(14,165,233,0.12),_transparent_36%)]" />

      <div className="relative">
        <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
            <Link to="/" className="flex items-center gap-3 font-black tracking-tight">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/25">
                <Bot size={22} />
              </span>
              <span className="text-xl">BuildMyBot</span>
            </Link>
            <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-300 md:flex">
              <a href="#capabilities" className="transition hover:text-white">
                Capabilities
              </a>
              <a href="#handoff" className="transition hover:text-white">
                Human handoff
              </a>
              <Link to="/pricing" className="transition hover:text-white">
                Pricing
              </Link>
            </nav>
            <div className="flex items-center gap-2">
              <Link
                to="/?auth=login"
                className="hidden rounded-xl px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white sm:inline-flex"
              >
                Log in
              </Link>
              <Link
                to="/?auth=signup"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold shadow-lg shadow-blue-600/25 transition hover:bg-blue-500"
              >
                Start free <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </header>

        <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-28 lg:pt-20">
          <div>
            <Link
              to="/"
              className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-white"
            >
              <ArrowLeft size={16} /> Back to BuildMyBot
            </Link>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-400/10 px-4 py-2 text-sm font-semibold text-blue-200">
              <Sparkles size={16} /> Gemini Live AI Receptionist
            </div>
            <h1 className="max-w-4xl text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              An AI receptionist that can actually{' '}
              <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
                hold a conversation.
              </span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
              Answer calls 24/7, understand real speech, qualify leads, book
              appointments, use business tools, alert your team, and hand hot
              callers to a human when it matters.
            </p>

            <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold text-slate-300">
              {[
                'Natural pause tolerance',
                'Caller interruption handling',
                'CRM + calendar actions',
                'Hot-lead alerts',
              ].map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2"
                >
                  <Check size={15} className="text-emerald-400" /> {item}
                </span>
              ))}
            </div>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={startConversation}
                disabled={callState === 'connecting' || isActive}
                className="inline-flex items-center justify-center gap-3 rounded-2xl bg-blue-600 px-7 py-4 text-base font-bold shadow-xl shadow-blue-600/25 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Mic size={20} /> Try the live voice agent
              </button>
              <Link
                to="/?auth=signup"
                className="inline-flex items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-7 py-4 text-base font-bold transition hover:bg-white/10"
              >
                Build yours free <ArrowRight size={19} />
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              No prerecorded clip. The demo below opens a real two-way Gemini
              Live session in your browser.
            </p>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 rounded-[3rem] bg-blue-600/10 blur-3xl" />
            <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-blue-950/50 backdrop-blur-xl sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">
                    Live browser demo
                  </p>
                  <h2 className="mt-1 text-2xl font-black">BuildMyBot Voice</h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                  <ShieldCheck size={14} /> Ephemeral session
                </div>
              </div>

              <div className="py-8 text-center">
                <div
                  className={`relative mx-auto flex h-32 w-32 items-center justify-center rounded-full transition-all duration-300 ${
                    callState === 'speaking'
                      ? 'scale-105 bg-violet-500 shadow-[0_0_80px_rgba(139,92,246,0.55)]'
                      : callState === 'listening'
                        ? 'bg-blue-500 shadow-[0_0_70px_rgba(59,130,246,0.45)]'
                        : callState === 'connecting'
                          ? 'bg-sky-600 shadow-[0_0_55px_rgba(2,132,199,0.35)]'
                          : 'bg-slate-800'
                  }`}
                >
                  {(isActive || callState === 'connecting') && (
                    <span className="absolute inset-0 animate-ping rounded-full border border-blue-300/40" />
                  )}
                  {callState === 'speaking' ? (
                    <Volume2 className="relative" size={54} />
                  ) : (
                    <Headphones className="relative" size={54} />
                  )}
                </div>
                <p
                  aria-live="polite"
                  className="mt-5 min-h-6 text-sm font-semibold text-blue-200"
                >
                  {status}
                </p>
              </div>

              <div className="min-h-40 space-y-4 rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    You
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-200">
                    {inputTranscript ||
                      'Try: “I need a locksmith for my, uh… hold on… 2019—no, 2020 Camry.”'}
                  </p>
                </div>
                <div className="border-t border-white/10 pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-blue-400">
                    Voice agent
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-200">
                    {outputTranscript ||
                      'The agent response will appear here while you talk.'}
                  </p>
                </div>
              </div>

              {errorMessage && (
                <div className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm leading-6 text-red-200">
                  {errorMessage}
                </div>
              )}

              <button
                type="button"
                onClick={
                  isActive ? () => endConversation('idle') : startConversation
                }
                disabled={callState === 'connecting'}
                className={`mt-5 flex w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 text-lg font-bold transition disabled:cursor-wait disabled:opacity-60 ${
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
                Your browser will request microphone access. The public demo is
                conversational only; production customer agents can be wired to
                approved tools, routing, CRM, and scheduling actions.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.03]">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-5 py-8 sm:grid-cols-4 sm:px-8">
            {[
              ['24/7', 'Call coverage'],
              ['750ms', 'Natural pause target'],
              ['1', 'Conversation + actions'],
              ['0', 'Missed hot leads goal'],
            ].map(([value, label]) => (
              <div key={label} className="px-4 py-4 text-center">
                <p className="text-3xl font-black text-white">{value}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="capabilities" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-blue-400">
              More than text-to-speech
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
              A voice agent built to do business, not just answer questions.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-400">
              Gemini Live handles the conversation layer. BuildMyBot connects
              that conversation to the business systems that make the call
              valuable.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition hover:-translate-y-1 hover:border-blue-400/25 hover:bg-white/[0.06]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
                  <Icon size={23} />
                </div>
                <h3 className="mt-5 text-xl font-bold">{title}</h3>
                <p className="mt-3 leading-7 text-slate-400">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="handoff" className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
          <div className="overflow-hidden rounded-[2rem] border border-violet-400/20 bg-gradient-to-br from-violet-500/10 via-slate-900 to-blue-500/10 p-7 sm:p-10 lg:p-12">
            <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-400/10 px-4 py-2 text-sm font-semibold text-violet-200">
                  <PhoneForwarded size={16} /> Intelligent human handoff
                </div>
                <h2 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
                  AI when it should be. Human when it matters.
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-300">
                  Configure rules for buying intent, high-value opportunities,
                  frustrated callers, special pricing, or anyone who simply asks
                  for a person. The agent can prepare context before your team
                  takes over.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  ['1', 'Caller shows strong buying intent'],
                  ['2', 'BuildMyBot qualifies and updates the lead'],
                  ['3', 'Owner receives an immediate hot-lead alert'],
                  ['4', 'Call is routed with a concise handoff brief'],
                ].map(([number, copy]) => (
                  <div
                    key={number}
                    className="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500 font-black">
                      {number}
                    </span>
                    <p className="font-semibold text-slate-200">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.025]">
          <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-blue-400">
                  Vertical-ready
                </p>
                <h2 className="mt-4 text-4xl font-black tracking-tight">
                  Start where every missed call can cost real money.
                </h2>
                <p className="mt-5 leading-7 text-slate-400">
                  The same core agent can be trained and packaged around each
                  industry's workflows, terminology, qualifying questions, and
                  escalation rules.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {INDUSTRIES.map((industry) => (
                  <span
                    key={industry}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-300"
                  >
                    {industry}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-24 text-center sm:px-8 sm:py-28">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-xl shadow-blue-600/30">
            <Zap size={26} />
          </div>
          <h2 className="mt-7 text-4xl font-black tracking-tight sm:text-5xl">
            Your next lead should never die in voicemail.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-400">
            Build the receptionist around your business, test it, connect your
            number, and decide exactly when the AI acts and when your team takes
            over.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/?auth=signup"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-7 py-4 font-bold shadow-xl shadow-blue-600/25 transition hover:bg-blue-500"
            >
              Start building free <ArrowRight size={18} />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-7 py-4 font-bold transition hover:bg-white/10"
            >
              View pricing
            </Link>
          </div>
        </section>

        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p>© 2026 BuildMyBot. AI chatbots and voice agents for businesses.</p>
            <div className="flex gap-5">
              <Link to="/privacy" className="transition hover:text-slate-300">
                Privacy
              </Link>
              <Link to="/contact" className="transition hover:text-slate-300">
                Contact
              </Link>
              <Link to="/faq" className="transition hover:text-slate-300">
                FAQ
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
