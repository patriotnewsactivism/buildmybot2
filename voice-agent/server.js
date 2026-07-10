import http from 'node:http';
import dotenv from 'dotenv';
import express from 'express';
import { v4 as uuid } from 'uuid';
import { WebSocketServer } from 'ws';
import { getLLMProvider } from './src/services/llm/index.js';
import { getSTTProvider } from './src/services/stt/index.js';
import { getTTSProvider } from './src/services/tts/index.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const BUILDMYBOT_API_URL =
  process.env.BUILDMYBOT_API_URL || 'https://www.buildmybot.app';

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', sessions: sessions.size, uptime: process.uptime() });
});

// CORS for the main app
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept',
  );
  next();
});

// Create HTTP server (needed for WebSocket upgrade)
const server = http.createServer(app);

// Session tracking
const sessions = new Map();

function startCall(callId, metadata = {}) {
  console.log(`[${callId}] Starting call session.`);
  sessions.set(callId, {
    startedAt: Date.now(),
    secondsUsed: 0,
    tier: metadata.tier || 'standard',
    botId: metadata.botId,
    memory: [],
    maxMemoryWindow: 10,
  });
}

async function endCall(callId) {
  const session = sessions.get(callId);
  if (session) {
    const durationMs = Date.now() - session.startedAt;
    const minutes = Math.ceil(durationMs / 60000);
    console.log(
      `[${callId}] Call ended. Duration: ${minutes} min. Tier: ${session.tier}`,
    );

    // Report usage back to BuildMyBot for billing
    try {
      await fetch(`${BUILDMYBOT_API_URL}/api/voice/billing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId,
          minutes,
          tier: session.tier,
          botId: session.botId,
        }),
      });
    } catch (err) {
      console.error(`[${callId}] Failed to report billing:`, err.message);
    }

    sessions.delete(callId);
  }
}

// WebSocket Server for Voice Streaming
const wss = new WebSocketServer({ server });

wss.on('connection', async (ws) => {
  const callId = uuid();
  let session = null;

  const stt = getSTTProvider();
  const llm = getLLMProvider();
  let tts = null;

  let dgConnection = null;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.event === 'start') {
        const metadata = data.start?.customParameters || data.metadata || {};
        startCall(callId, metadata);
        session = sessions.get(callId);
        tts = getTTSProvider({ tier: session.tier });
        console.log(
          `[${callId}] Orchestrating call for bot: ${metadata.botId} with ${session.tier} voice.`,
        );

        // Initialize STT streaming
        try {
          dgConnection = await stt.startStream({
            model: 'nova-2-phonecall',
            encoding: 'mulaw',
            sample_rate: 8000,
          });

          dgConnection.on('Results', async (data) => {
            const transcript = data.channel?.alternatives?.[0]?.transcript;
            if (transcript && data.is_final && session) {
              console.log(`[${callId}] User: ${transcript}`);
              session.memory.push({ role: 'user', content: transcript });

              if (session.memory.length > session.maxMemoryWindow) {
                session.memory.shift();
              }

              console.log(
                `[${callId}] Generating AI response (Tier: ${session.tier})...`,
              );
              const aiResponse = await llm.complete(session.memory, {
                system:
                  'You are a professional voice agent. Be concise and helpful. (Max 2-3 sentences)',
              });

              console.log(`[${callId}] AI: ${aiResponse}`);
              session.memory.push({ role: 'assistant', content: aiResponse });

              const clientStream = {
                write: (chunk) => {
                  if (ws.readyState === ws.OPEN) {
                    ws.send(
                      JSON.stringify({
                        event: 'media',
                        media: {
                          payload: Buffer.from(chunk).toString('base64'),
                        },
                      }),
                    );
                  }
                },
                end: () => {},
              };

              await tts.speak(aiResponse, clientStream);
            }
          });
        } catch (err) {
          console.error(`[${callId}] STT init failed:`, err.message);
        }
      } else if (data.event === 'media' && data.media?.payload) {
        if (dgConnection) {
          dgConnection.send(Buffer.from(data.media.payload, 'base64'));
        }
      } else if (data.event === 'stop') {
        ws.close();
      }
    } catch (err) {
      console.error(`[${callId}] Error:`, err);
    }
  });

  ws.on('close', () => {
    if (dgConnection) {
      try {
        dgConnection.finish();
      } catch (_) {}
    }
    endCall(callId);
  });

  ws.on('error', (err) => {
    console.error(`[${callId}] WebSocket error:`, err.message);
  });
});

server.listen(port, () => {
  console.log(`Voice Agent server running on port ${port}`);
  console.log('WebSocket server ready for connections');
});
