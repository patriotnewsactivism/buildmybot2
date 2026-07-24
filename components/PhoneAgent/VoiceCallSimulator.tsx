import { Loader, Mic, MicOff, Phone, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioWaveform } from './AudioWaveform';

interface VoiceCallSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  introMessage: string;
  voiceId: string;
  botId?: string;
}

const PLAYBACK_RATE = 24000;
const MIC_RATE = 16000;
const MIC_BUFFER_SIZE = 4096;

export const VoiceCallSimulator: React.FC<VoiceCallSimulatorProps> = ({
  isOpen,
  onClose,
  introMessage,
  voiceId,
  botId,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState('Ready to connect');
  const [transcript, setTranscript] = useState('');
  const [aiText, setAiText] = useState('');
  const [isAISpeaking, setIsAISpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueue = useRef<AudioBuffer[]>([]);
  const isPlaying = useRef(false);
  const nextPlayTime = useRef(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // ── Audio playback (AI voice → speaker) ──────────────────────────
  const processAndPlay = useCallback(async (audioData: ArrayBuffer) => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed')
      return;

    const pcmData = new Int16Array(audioData);
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 32768.0;
    }

    const audioBuffer = audioContextRef.current.createBuffer(
      1,
      floatData.length,
      PLAYBACK_RATE,
    );
    audioBuffer.copyToChannel(floatData, 0);
    audioQueue.current.push(audioBuffer);

    if (!isPlaying.current) {
      playQueue();
    }
  }, []);

  const playQueue = useCallback(() => {
    if (audioQueue.current.length === 0) {
      isPlaying.current = false;
      return;
    }
    if (!audioContextRef.current) return;

    isPlaying.current = true;
    const source = audioContextRef.current.createBufferSource();
    const buffer = audioQueue.current.shift()!;
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);

    const currentTime = audioContextRef.current.currentTime;
    const startTime = Math.max(currentTime, nextPlayTime.current);
    source.start(startTime);
    nextPlayTime.current = startTime + buffer.duration;
    source.onended = playQueue;
  }, []);

  // ── Clear audio queue (for interruption) ─────────────────────────
  const clearAudioQueue = useCallback(() => {
    audioQueue.current = [];
    isPlaying.current = false;
    nextPlayTime.current = audioContextRef.current?.currentTime || 0;
  }, []);

  // ── Microphone capture → WebSocket ───────────────────────────────
  const startMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: MIC_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      if (!audioContextRef.current) return;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      micSourceRef.current = source;

      // ScriptProcessor to get raw PCM samples
      const processor = audioContextRef.current.createScriptProcessor(
        MIC_BUFFER_SIZE,
        1,
        1,
      );
      micProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (
          isMuted ||
          !wsRef.current ||
          wsRef.current.readyState !== WebSocket.OPEN
        )
          return;

        const inputData = e.inputBuffer.getChannelData(0);
        // Downsample if needed and convert to Int16
        const ratio = audioContextRef.current
          ? audioContextRef.current.sampleRate / MIC_RATE
          : 1;
        const outputLength = Math.floor(inputData.length / ratio);
        const int16 = new Int16Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
          const srcIdx = Math.floor(i * ratio);
          const s = Math.max(-1, Math.min(1, inputData[srcIdx]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Send raw PCM bytes over WebSocket
        wsRef.current.send(int16.buffer);
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
    } catch (err) {
      console.error('Microphone access denied:', err);
      setStatus('Microphone access required');
    }
  }, [isMuted]);

  const stopMicrophone = useCallback(() => {
    micProcessorRef.current?.disconnect();
    micSourceRef.current?.disconnect();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micProcessorRef.current = null;
    micSourceRef.current = null;
    micStreamRef.current = null;
  }, []);

  // ── WebSocket connection ─────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
        nextPlayTime.current = audioContextRef.current.currentTime;
      } catch {
        setStatus('Audio not supported');
        return;
      }
    }

    const voiceUrl =
      import.meta.env.VITE_VOICE_AGENT_URL ||
      'wss://buildmybot2-backend-production.up.railway.app';
    const socket = new WebSocket(voiceUrl);
    wsRef.current = socket;

    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      setIsConnected(true);
      setStatus('Connected — click Start Call');
    };

    socket.onmessage = async (event) => {
      // Binary = audio from AI
      if (event.data instanceof ArrayBuffer) {
        processAndPlay(event.data);
        return;
      }

      // Text = JSON control events
      try {
        const msg = JSON.parse(event.data);

        if (msg.event === 'ready') {
          setStatus('Listening...');
        } else if (msg.event === 'transcript') {
          if (msg.role === 'assistant') {
            if (msg.isFinal) {
              setAiText(msg.text);
            } else if (msg.streaming) {
              setAiText((prev) => prev + msg.text);
            }
            setIsAISpeaking(true);
          } else {
            // User transcript
            if (msg.isFinal) {
              setTranscript(msg.text);
              setAiText('');
              setStatus('Thinking...');
            } else {
              setTranscript(msg.text);
            }
          }
        } else if (msg.event === 'ai_done') {
          setIsAISpeaking(false);
          setStatus('Listening...');
        } else if (msg.event === 'interrupt') {
          clearAudioQueue();
          setIsAISpeaking(false);
          setStatus('Listening...');
        } else if (msg.event === 'error') {
          setStatus(`Error: ${msg.message}`);
        }
      } catch {
        // ignore parse errors
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      setIsCallActive(false);
      setStatus('Disconnected');
    };

    socket.onerror = () => {
      setStatus('Connection error');
      setIsCallActive(false);
    };

    return () => {
      socket.close();
      stopMicrophone();
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== 'closed'
      ) {
        audioContextRef.current.close().then(() => {
          audioContextRef.current = null;
        });
      }
      audioQueue.current = [];
      isPlaying.current = false;
    };
  }, [isOpen, processAndPlay, playQueue, clearAudioQueue, stopMicrophone]);

  // ── Start / End call ─────────────────────────────────────────────
  const startCall = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    setIsCallActive(true);
    setStatus('Starting call...');
    setTranscript('');
    setAiText('');

    // Send start event
    wsRef.current.send(
      JSON.stringify({
        event: 'start',
        metadata: { botId, tier: 'premium', voiceId },
      }),
    );

    // Start microphone capture
    await startMicrophone();
  };

  const endCall = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'stop' }));
    }
    stopMicrophone();
    clearAudioQueue();
    setIsCallActive(false);
    setIsAISpeaking(false);
    onClose();
  };

  const toggleMute = () => {
    setIsMuted((m) => !m);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center animate-fade-in">
      <div className="bg-slate-800 text-white p-8 rounded-2xl shadow-2xl w-full max-w-md relative">
        <button
          type="button"
          onClick={endCall}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X size={24} />
        </button>
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Voice Call</h2>
          <p className="text-slate-400 mb-4">
            {isCallActive ? 'Live AI Voice Agent' : 'Click Start to begin'}
          </p>

          {/* Mic icon with speaking indicator */}
          <div
            className={`w-24 h-24 rounded-full mx-auto flex items-center justify-center mb-4 transition-all ${
              isAISpeaking
                ? 'bg-blue-600/30 ring-4 ring-blue-500/50'
                : isCallActive
                  ? 'bg-green-600/30 ring-4 ring-green-500/50'
                  : 'bg-slate-700'
            }`}
          >
            {isMuted ? (
              <MicOff size={48} className="text-red-400" />
            ) : (
              <Mic
                size={48}
                className={
                  isCallActive
                    ? isAISpeaking
                      ? 'text-blue-400 animate-pulse'
                      : 'text-green-400 animate-pulse'
                    : 'text-slate-400'
                }
              />
            )}
          </div>

          {/* Waveform */}
          <div className="h-[60px] mb-4 flex items-center justify-center">
            <AudioWaveform
              isActive={isCallActive && (isAISpeaking || !isMuted)}
              color={isAISpeaking ? '#60a5fa' : '#4ade80'}
            />
          </div>

          {/* Live transcript */}
          {isCallActive && (
            <div className="mb-4 text-left bg-slate-900/50 rounded-lg p-3 max-h-32 overflow-y-auto">
              {transcript && (
                <p className="text-sm text-green-300 mb-1">
                  <span className="font-semibold">You:</span> {transcript}
                </p>
              )}
              {aiText && (
                <p className="text-sm text-blue-300">
                  <span className="font-semibold">AI:</span> {aiText}
                </p>
              )}
              {!transcript && !aiText && (
                <p className="text-sm text-slate-500 italic">
                  Speak to begin the conversation...
                </p>
              )}
            </div>
          )}

          <p className="text-sm font-medium mb-6 h-5 text-slate-300">
            {status}
          </p>

          {!isCallActive ? (
            <button
              type="button"
              onClick={startCall}
              disabled={!isConnected}
              className="w-full px-6 py-4 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isConnected ? (
                <Phone size={20} />
              ) : (
                <Loader size={20} className="animate-spin" />
              )}
              {isConnected ? 'Start Call' : 'Connecting...'}
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={toggleMute}
                className={`flex-1 px-4 py-4 rounded-lg font-bold transition flex items-center justify-center gap-2 ${
                  isMuted
                    ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-slate-600 hover:bg-slate-700'
                }`}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
              <button
                type="button"
                onClick={endCall}
                className="flex-1 px-4 py-4 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition flex items-center justify-center gap-2"
              >
                <Phone size={20} />
                End Call
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
