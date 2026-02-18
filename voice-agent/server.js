import dotenv from 'dotenv';
import express from 'express';
import { v4 as uuid } from 'uuid';
import { WebSocketServer } from 'ws';
import { getSTTProvider } from './src/services/stt/index.js';
import { getLLMProvider } from './src/services/llm/index.js';
import { getTTSProvider } from './src/services/tts/index.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Session tracking
const sessions = new Map();

function startCall(callId, metadata = {}) {
  console.log(`[${callId}] Starting call session.`);
  sessions.set(callId, {
    startedAt: Date.now(),
    secondsUsed: 0,
    tier: metadata.tier || 'standard', // 'standard' or 'premium'
    botId: metadata.botId,
    memory: [],
    maxMemoryWindow: 10, // Only keep last 10 messages for low latency/cost
  });
}

function endCall(callId) {
  const session = sessions.get(callId);
  if (session) {
    const durationMs = Date.now() - session.startedAt;
    const minutes = Math.ceil(durationMs / 60000);
    console.log(`[${callId}] Call ended. Duration: ${minutes} min. Tier: ${session.tier}`);
    
    // Webhook call back to BuildMyBot main server for billing
    // await fetch(`${process.env.APP_BASE_URL}/api/voice/billing`, { 
    //   method: 'POST', 
    //   body: JSON.stringify({ callId, minutes, tier: session.tier, botId: session.botId }) 
    // });
    
    sessions.delete(callId);
  }
}

// WebSocket Server for Voice Streaming (Orchestrator)
const wss = new WebSocketServer({ server });

wss.on('connection', async (ws) => {
  const callId = uuid();
  let session = null;

  // Providers
  const stt = getSTTProvider();
  const llm = getLLMProvider();
  let tts = null; // Wait for session metadata to pick tier

  // 1. STT: Start streaming connection (Deepgram)
  const dgConnection = await stt.startStream({
    model: 'nova-2-phonecall',
    encoding: 'mulaw',
    sample_rate: 8000,
  });

  dgConnection.on('Results', async (data) => {
    const transcript = data.channel.alternatives[0].transcript;
    if (transcript && data.is_final) {
      if (!session) return;
      
      console.log(`[${callId}] User: ${transcript}`);
      session.memory.push({ role: 'user', content: transcript });

      // Keep memory window clean
      if (session.memory.length > session.maxMemoryWindow) {
        session.memory.shift();
      }

      // 2. Agent Brain (LLM)
      console.log(`[${callId}] Generating AI response (Tier: ${session.tier})...`);
      const aiResponse = await llm.complete(session.memory, {
        system: "You are a professional voice agent. Be concise and helpful. (Max 2-3 sentences)",
      });

      console.log(`[${callId}] AI: ${aiResponse}`);
      session.memory.push({ role: 'assistant', content: aiResponse });

      // 3. TTS (Tiered)
      const clientStream = {
        write: (chunk) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              event: 'media',
              media: { payload: Buffer.from(chunk).toString('base64') }
            }));
          }
        },
        end: () => {}
      };

      await tts.speak(aiResponse, clientStream);
    }
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.event === 'start') {
        const metadata = data.start.customParameters || {};
        startCall(callId, metadata);
        session = sessions.get(callId);
        tts = getTTSProvider({ tier: session.tier });
        console.log(`[${callId}] Orchestrating call for bot: ${metadata.botId} with ${session.tier} voice.`);
      } else if (data.event === 'media' && data.media.payload) {
        // Forward audio to Deepgram (STT)
        dgConnection.send(Buffer.from(data.media.payload, 'base64'));
      }
    } catch (err) {
      console.error(`[${callId}] Error:`, err);
    }
  });

  ws.on('close', () => {
    if (dgConnection) dgConnection.finish();
    endCall(callId);
  });
});
