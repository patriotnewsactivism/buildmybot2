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
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    sessions: sessions.size,
    uptime: process.uptime(),
    version: '2.0.0',
  });
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

const server = http.createServer(app);
const sessions = new Map();

// ─── Bot config cache (TTL 5 min) ──────────────────────────────────
const botConfigCache = new Map();
const BOT_CACHE_TTL = 5 * 60 * 1000;

async function getBotConfig(botId) {
  if (!botId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;

  const cached = botConfigCache.get(botId);
  if (cached && Date.now() - cached.ts < BOT_CACHE_TTL) return cached.data;

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/bots?id=eq.${botId}&select=name,system_prompt,voice_id,personality,greeting_message,knowledge_base`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (resp.ok) {
      const rows = await resp.json();
      const data = rows[0] || null;
      botConfigCache.set(botId, { data, ts: Date.now() });
      return data;
    }
  } catch (err) {
    console.error(`[bot-config] Failed to fetch bot ${botId}:`, err.message);
  }
  return null;
}

// ─── Session management ────────────────────────────────────────────
function startCall(callId, metadata = {}) {
  console.log(`[${callId}] Starting call session.`);
  sessions.set(callId, {
    startedAt: Date.now(),
    tier: metadata.tier || 'premium',
    botId: metadata.botId,
    memory: [],
    maxMemoryWindow: 20,
    isAISpeaking: false,
    interruptRequested: false,
    botConfig: null,
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

// ─── Sentence chunker for streaming TTS ────────────────────────────
function extractSentences(buffer) {
  const sentences = [];
  // Split on sentence-ending punctuation followed by space or end
  const re = /[^.!?]*[.!?]+(?:\s|$)/g;
  let lastIndex = 0;
  let match = re.exec(buffer);
  while (match !== null) {
    sentences.push(match[0].trim());
    lastIndex = re.lastIndex;
    match = re.exec(buffer);
  }
  const remainder = buffer.slice(lastIndex);
  return { sentences, remainder };
}

// ─── WebSocket Server ──────────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on('connection', async (ws) => {
  const callId = uuid();
  let session = null;
  let dgConnection = null;
  let tts = null;
  let currentAbortController = null;

  const stt = getSTTProvider();
  const llm = getLLMProvider();

  // Send JSON helper
  const sendJSON = (data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  // Send raw audio buffer
  const sendAudio = (chunk) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(chunk);
    }
  };

  ws.on('message', async (message) => {
    try {
      // Binary data = audio from mic
      if (message instanceof Buffer || message instanceof ArrayBuffer) {
        if (dgConnection) {
          const buf =
            message instanceof ArrayBuffer ? Buffer.from(message) : message;
          dgConnection.send(buf);

          // Barge-in: if user sends audio while AI is speaking, interrupt
          if (session?.isAISpeaking && buf.length > 100) {
            session.interruptRequested = true;
            if (currentAbortController) {
              currentAbortController.abort();
            }
            session.isAISpeaking = false;
            sendJSON({ event: 'interrupt' });
          }
        }
        return;
      }

      // Text messages = control events
      const data = JSON.parse(message);

      if (data.event === 'start' || data.type === 'start') {
        const metadata = data.start?.customParameters || data.metadata || data;
        startCall(callId, metadata);
        session = sessions.get(callId);
        tts = getTTSProvider({ tier: session.tier });

        // Fetch bot config for personalized system prompt
        if (metadata.botId) {
          session.botConfig = await getBotConfig(metadata.botId);
        }

        console.log(
          `[${callId}] Call started for bot: ${metadata.botId || 'default'} | tier: ${session.tier}`,
        );

        // Initialize STT streaming with high-quality settings
        try {
          dgConnection = await stt.startStream({
            model: 'nova-2-general',
            encoding: 'linear16',
            sample_rate: 16000,
            channels: 1,
            interim_results: true,
            utterance_end_ms: 1200,
            vad_events: true,
            endpointing: 300,
            smart_format: true,
            filler_words: false,
          });

          dgConnection.on('Results', async (result) => {
            const transcript = result.channel?.alternatives?.[0]?.transcript;
            if (!transcript || !session) return;

            if (result.is_final) {
              console.log(`[${callId}] User: ${transcript}`);
              session.memory.push({ role: 'user', content: transcript });

              // Trim memory window
              while (session.memory.length > session.maxMemoryWindow) {
                session.memory.shift();
              }

              // Generate streaming AI response
              await generateStreamingResponse(callId, session, llm, tts, ws);
            } else {
              // Send interim transcript to frontend for real-time display
              sendJSON({
                event: 'transcript',
                text: transcript,
                isFinal: false,
              });
            }
          });

          dgConnection.on('UtteranceEnd', () => {
            sendJSON({ event: 'utterance_end' });
          });
        } catch (err) {
          console.error(`[${callId}] STT init failed:`, err.message);
          sendJSON({
            event: 'error',
            message: 'Speech recognition failed to start',
          });
        }

        // Send greeting if bot has one
        if (session.botConfig?.greeting_message) {
          sendJSON({
            event: 'transcript',
            text: session.botConfig.greeting_message,
            isFinal: true,
            role: 'assistant',
          });
          session.memory.push({
            role: 'assistant',
            content: session.botConfig.greeting_message,
          });
          // Speak the greeting
          const greetStream = {
            write: (chunk) => sendAudio(chunk),
            end: () => {},
          };
          try {
            session.isAISpeaking = true;
            await tts.speak(session.botConfig.greeting_message, greetStream);
            session.isAISpeaking = false;
            sendJSON({ event: 'ai_done' });
          } catch (err) {
            console.error(`[${callId}] Greeting TTS error:`, err.message);
            session.isAISpeaking = false;
          }
        }

        sendJSON({ event: 'ready' });
      } else if (data.event === 'media' || data.type === 'media') {
        // Legacy Twilio-style media event
        if (data.media?.payload && dgConnection) {
          dgConnection.send(Buffer.from(data.media.payload, 'base64'));
        }
      } else if (data.event === 'stop' || data.type === 'stop') {
        ws.close();
      } else if (data.type === 'speak') {
        // Direct TTS request (e.g. for intro message from frontend)
        if (tts && data.text) {
          const directStream = {
            write: (chunk) => sendAudio(chunk),
            end: () => {},
          };
          try {
            if (session) session.isAISpeaking = true;
            await tts.speak(data.text, directStream);
            if (session) session.isAISpeaking = false;
            sendJSON({ event: 'ai_done' });
          } catch (err) {
            console.error(`[${callId}] Direct TTS error:`, err.message);
            if (session) session.isAISpeaking = false;
          }
        }
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
    if (currentAbortController) {
      currentAbortController.abort();
    }
    endCall(callId);
  });

  ws.on('error', (err) => {
    console.error(`[${callId}] WebSocket error:`, err.message);
  });

  // ── Streaming response: LLM → sentence chunk → TTS → audio ────
  async function generateStreamingResponse(callId, session, llm, tts, ws) {
    session.isAISpeaking = true;
    session.interruptRequested = false;
    currentAbortController = new AbortController();

    const botConfig = session.botConfig;
    const systemPrompt = botConfig?.system_prompt
      ? `${botConfig.system_prompt}\n\nIMPORTANT: You are speaking on a voice call. Be conversational, concise, and natural. Use short sentences. Never use markdown, lists, or formatting — only spoken language. Limit responses to 3-4 sentences unless asked for more detail.`
      : 'You are a professional, friendly voice agent for BuildMyBot.app. You help users build and manage AI chatbots. Be conversational, concise, and warm. Use short sentences. Never use markdown or formatting — speak naturally. Limit responses to 3-4 sentences.';

    let fullResponse = '';
    let sentenceBuffer = '';

    try {
      const stream = llm.streamComplete(session.memory, {
        system: systemPrompt,
        model: 'gpt-4o',
        temperature: 0.8,
        max_tokens: 500,
      });

      for await (const chunk of stream) {
        if (session.interruptRequested) {
          console.log(`[${callId}] Response interrupted by user.`);
          break;
        }

        fullResponse += chunk;
        sentenceBuffer += chunk;

        // Send text to frontend in real-time
        sendJSON({
          event: 'transcript',
          text: chunk,
          isFinal: false,
          role: 'assistant',
          streaming: true,
        });

        // Check for complete sentences to TTS
        const { sentences, remainder } = extractSentences(sentenceBuffer);
        sentenceBuffer = remainder;

        for (const sentence of sentences) {
          if (session.interruptRequested) break;
          const audioStream = {
            write: (audioChunk) => sendAudio(audioChunk),
            end: () => {},
          };
          try {
            await tts.speak(sentence, audioStream);
          } catch (ttsErr) {
            console.error(`[${callId}] TTS error:`, ttsErr.message);
          }
        }
      }

      // Speak any remaining text
      if (sentenceBuffer.trim() && !session.interruptRequested) {
        const audioStream = {
          write: (audioChunk) => sendAudio(audioChunk),
          end: () => {},
        };
        try {
          await tts.speak(sentenceBuffer.trim(), audioStream);
        } catch (ttsErr) {
          console.error(`[${callId}] TTS remainder error:`, ttsErr.message);
        }
      }

      // Add full response to memory
      if (fullResponse) {
        session.memory.push({ role: 'assistant', content: fullResponse });
        console.log(`[${callId}] AI: ${fullResponse.slice(0, 100)}...`);
        sendJSON({
          event: 'transcript',
          text: fullResponse,
          isFinal: true,
          role: 'assistant',
        });
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error(`[${callId}] Streaming response error:`, err.message);
      }
    } finally {
      session.isAISpeaking = false;
      currentAbortController = null;
      sendJSON({ event: 'ai_done' });
    }
  }
});

server.listen(port, () => {
  console.log(`Voice Agent v2.0.0 running on port ${port}`);
  console.log('WebSocket server ready — streaming pipeline active');
});
