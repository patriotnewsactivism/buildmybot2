import dotenv from 'dotenv';
import express from 'express';
import { v4 as uuid } from 'uuid';
import { WebSocketServer } from 'ws';
import { getTTSProvider } from './src/services/tts/index.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Session tracking (from your snippet)
const sessions = new Map();

function startCall(callId) {
  console.log(`Starting call: ${callId}`);
  sessions.set(callId, {
    startedAt: Date.now(),
    secondsUsed: 0,
    tier: 'standard',
    memory: [],
  });
}

function endCall(callId) {
  const s = sessions.get(callId);
  if (s) {
    const minutes = Math.ceil((Date.now() - s.startedAt) / 60000);
    console.log(`Ending call: ${callId}, Duration: ${minutes} min`);
    // TODO: write usage to DB
    sessions.delete(callId);
  }
}

// HTTP Server
const server = app.listen(port, () => {
  console.log(`Voice Agent Server running on port ${port}`);
});

// WebSocket Server for Voice Streaming
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const callId = uuid();
  startCall(callId);

  ws.on('message', async (message) => {
    try {
      // Expecting a JSON message with text to speak
      // In a real voice agent, this would be audio input -> STT -> LLM -> TTS
      // Here we simulate the TTS step using our abstraction.
      const data = JSON.parse(message);

      if (data.type === 'speak' && data.text) {
        console.log(`[${callId}] Speaking: ${data.text}`);

        const session = sessions.get(callId);
        const tts = getTTSProvider({ tier: session?.tier });

        // Create a stream wrapper to send audio back to the client
        // This simulates a Writable stream that sends data to the websocket
        const clientStream = {
          write: (chunk) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(chunk);
            }
          },
          end: () => {
            // Stream finished
          },
        };

        await tts.speak(data.text, clientStream);
      }
    } catch (err) {
      console.error(`[${callId}] Error:`, err);
    }
  });

  ws.on('close', () => {
    endCall(callId);
  });
});
