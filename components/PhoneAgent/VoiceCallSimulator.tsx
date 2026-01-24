import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Mic, Phone, Loader } from 'lucide-react';
import { AudioWaveform } from './AudioWaveform';

interface VoiceCallSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  introMessage: string;
  voiceId: string;
  cartesiaApiKey: string;
}

const SAMPLING_RATE = 24000;

export const VoiceCallSimulator: React.FC<VoiceCallSimulatorProps> = ({
  isOpen,
  onClose,
  introMessage,
  voiceId,
  cartesiaApiKey,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [status, setStatus] = useState('Ready to connect');
  const ws = useRef<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioQueue = useRef<AudioBuffer[]>([]);
  const isPlaying = useRef(false);
  const nextPlayTime = useRef(0);

  const processAndPlay = useCallback(async (audioData: ArrayBuffer) => {
    if (!audioContext.current || audioContext.current.state === 'closed') return;

    // s16le to Float32
    const pcmData = new Int16Array(audioData);
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 32768.0;
    }

    const audioBuffer = audioContext.current.createBuffer(1, floatData.length, SAMPLING_RATE);
    audioBuffer.copyToChannel(floatData, 0);
    
    audioQueue.current.push(audioBuffer);
    
    if (!isPlaying.current) {
        playQueue();
    }
  }, []);

  const playQueue = useCallback(() => {
    if (audioQueue.current.length === 0) {
      isPlaying.current = false;
      setStatus('Call ended');
      setIsCallActive(false);
      return;
    }
    
    isPlaying.current = true;
    const source = audioContext.current!.createBufferSource();
    const buffer = audioQueue.current.shift()!;
    source.buffer = buffer;
    source.connect(audioContext.current!.destination);
    
    const currentTime = audioContext.current!.currentTime;
    const startTime = Math.max(currentTime, nextPlayTime.current);
    
    source.start(startTime);
    
    nextPlayTime.current = startTime + buffer.duration;
    
    source.onended = playQueue;

  }, []);


  useEffect(() => {
    if (isOpen) {
      if (!audioContext.current) {
        try {
          audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          nextPlayTime.current = audioContext.current.currentTime;
        } catch(e) {
            console.error("Error creating AudioContext", e);
            setStatus("Audio context not supported");
            return;
        }
      }
      
      ws.current = new WebSocket('ws://localhost:3000');
      
      ws.current.onopen = () => {
        setIsConnected(true);
        setStatus('Connected. Click to start call.');
      };

      ws.current.onmessage = async (event) => {
        if (event.data instanceof Blob) {
            const arrayBuffer = await event.data.arrayBuffer();
            processAndPlay(arrayBuffer);
        }
      };

      ws.current.onclose = () => {
        setIsConnected(false);
        setStatus('Disconnected');
        setIsCallActive(false);
      };

      ws.current.onerror = (err) => {
        console.error('WebSocket Error:', err);
        setStatus('Connection error');
        setIsCallActive(false);
      };

      return () => {
        ws.current?.close();
        if(audioContext.current && audioContext.current.state !== "closed"){
            audioContext.current.close().then(() => {
                audioContext.current = null;
            });
        }
        audioQueue.current = [];
        isPlaying.current = false;
      };
    }
  }, [isOpen, processAndPlay, playQueue]);

  const startCall = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      if(audioContext.current?.state === 'suspended') {
        audioContext.current.resume();
      }
      setIsCallActive(true);
      setStatus('AI is speaking...');
      ws.current.send(JSON.stringify({ type: 'speak', text: introMessage }));
    }
  };

  const endCall = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center animate-fade-in">
      <div className="bg-slate-800 text-white p-8 rounded-2xl shadow-2xl w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
          <X size={24} />
        </button>
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Voice Call Simulation</h2>
          <p className="text-slate-400 mb-6">Live test of your AI Voice Agent</p>

          <div className="w-24 h-24 rounded-full mx-auto flex items-center justify-center mb-6 bg-slate-700">
             <Mic size={48} className={isCallActive ? 'text-green-400 animate-pulse' : 'text-slate-400'} />
          </div>

          <div className="h-[60px] mb-6 flex items-center justify-center">
            <AudioWaveform isActive={isCallActive} color="#4ade80" />
          </div>
          
          <p className="text-sm font-medium mb-8 h-5">{status}</p>

          {!isCallActive ? (
            <button
              onClick={startCall}
              disabled={!isConnected}
              className="w-full px-6 py-4 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isConnected ? <Phone size={20}/> : <Loader size={20} className="animate-spin" />}
              {isConnected ? 'Start Call' : 'Connecting...'}
            </button>
          ) : (
            <button
              onClick={endCall}
              className="w-full px-6 py-4 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition flex items-center justify-center gap-2"
            >
              <Phone size={20} />
              End Call
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
