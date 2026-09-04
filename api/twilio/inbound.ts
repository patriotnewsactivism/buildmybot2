/**
 * Inbound call handling for customer-purchased phone numbers.
 *
 * Production calls prefer a bidirectional Twilio Media Stream bridged to
 * Gemini Live. The older speech-Gather -> text LLM -> TTS loop remains as a
 * deliberate fallback so a Gemini outage does not make a customer's number
 * unreachable.
 */

import { createHmac } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createTwilioStreamToken } from '../voice/twilio-live.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://buildmybot.app';

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY || '',
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY || ''}`,
  'Content-Type': 'application/json',
};

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req: VercelRequest): any {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return req.body;
    }
  }
  return req.body || {};
}

async function validateTwilioRequest(req: VercelRequest): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  if (!authToken || !accountSid) {
    // P0 FIX: fail closed in production instead of accepting any body that
    // merely looks Twilio-shaped.
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[twilio][inbound] Twilio credentials not configured — rejecting webhook',
      );
      return false;
    }
    const body = parseBody(req);
    return !!(body.CallSid || body.AccountSid);
  }
  const signature = req.headers['x-twilio-signature'] as string | undefined;
  if (!signature) return false;
  try {
    const twilio = (await import('twilio')).default;
    const fullUrl = `${APP_BASE_URL}${req.url || ''}`;
    const body = parseBody(req);
    return twilio.validateRequest(authToken, signature, fullUrl, body);
  } catch (error) {
    console.error('[twilio][inbound] Signature validation threw:', error);
    return false;
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function speakLine(text: string, voice = 'eve'): string {
  const xaiApiKey = process.env.XAI_API_KEY;
  if (xaiApiKey) {
    const token = createHmac('sha256', xaiApiKey)
      .update(`${text}|${voice}`)
      .digest('hex')
      .slice(0, 16);
    const params = new URLSearchParams({ text, voice, token });
    const url = `${APP_BASE_URL}/api/voice/tts-clip?${params.toString()}`;
    return `<Play>${escapeXml(url)}</Play>`;
  }
  return `<Say voice="Polly.Joanna">${escapeXml(text)}</Say>`;
}

async function sbFetch(table: string, params: string, init?: RequestInit) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    ...init,
    headers: { ...SUPABASE_HEADERS, ...(init?.headers || {}) },
  });
  if (!response.ok) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface BusinessBot {
  id: string;
  name: string;
  system_prompt: string | null;
}

async function resolveBotForNumber(calledNumber: string): Promise<{
  phoneNumberId: string;
  bot: BusinessBot | null;
} | null> {
  const numbers = await sbFetch(
    'phone_numbers',
    `number=eq.${encodeURIComponent(calledNumber)}&status=eq.active&select=id,bot_id&limit=1`,
  );
  const row = numbers?.[0];
  if (!row) return null;

  if (!row.bot_id) return { phoneNumberId: row.id, bot: null };

  const bots = await sbFetch(
    'bots',
    `id=eq.${row.bot_id}&select=id,name,system_prompt&limit=1`,
  );
  return { phoneNumberId: row.id, bot: bots?.[0] || null };
}

async function createCallLog(options: {
  botId: string | null;
  callerNumber: string;
  calledNumber: string;
  callSid: string;
}): Promise<string | null> {
  const rows = await sbFetch('call_logs', '', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      bot_id: options.botId,
      provider: 'twilio',
      direction: 'inbound',
      caller_number: options.callerNumber,
      called_number: options.calledNumber,
      call_sid: options.callSid,
      status: 'in-progress',
      metadata: { source: 'inbound-phone' },
      started_at: new Date().toISOString(),
    }),
  });
  return rows?.[0]?.id || null;
}

function mediaStreamUrl(): string {
  const base = APP_BASE_URL.replace(/^https:/i, 'wss:').replace(
    /^http:/i,
    'ws:',
  );
  return `${base.replace(/\/$/, '')}/api/voice/twilio-media`;
}

function realtimeTwiml(options: {
  botId: string;
  logId: string;
  callSid: string;
  callerNumber: string;
  calledNumber: string;
}): string {
  const token = createTwilioStreamToken({
    callSid: options.callSid,
    botId: options.botId,
    logId: options.logId,
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(mediaStreamUrl())}">
      <Parameter name="token" value="${escapeXml(token)}" />
      <Parameter name="botId" value="${escapeXml(options.botId)}" />
      <Parameter name="logId" value="${escapeXml(options.logId)}" />
      <Parameter name="callSid" value="${escapeXml(options.callSid)}" />
      <Parameter name="callerNumber" value="${escapeXml(options.callerNumber)}" />
      <Parameter name="calledNumber" value="${escapeXml(options.calledNumber)}" />
    </Stream>
  </Connect>
  ${speakLine('The live voice session ended. Please call back if you still need help.')}
  <Hangup/>
</Response>`;
}

/**
 * POST /api/twilio/inbound-voice-handler
 * Resolve the customer bot and start a Gemini Live media session when the
 * realtime engine is configured. Fall back to Gather/TTS when it is not.
 */
export async function inboundVoiceHandler(
  req: VercelRequest,
  res: VercelResponse,
) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const valid = await validateTwilioRequest(req);
  if (!valid) return res.status(403).json({ error: 'Invalid Twilio request' });

  const body = parseBody(req);
  const calledNumber = body.To || '';
  const callerNumber = body.From || '';
  const callSid = body.CallSid || '';

  const resolved = await resolveBotForNumber(calledNumber);
  const bot = resolved?.bot || null;
  const logId = await createCallLog({
    botId: bot?.id || null,
    callerNumber,
    calledNumber,
    callSid,
  });

  if (bot && process.env.GEMINI_API_KEY && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const twiml = realtimeTwiml({
        botId: bot.id,
        logId: logId || '',
        callSid,
        callerNumber,
        calledNumber,
      });
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml);
    } catch (error) {
      console.error(
        '[twilio][inbound] Unable to start Gemini Live stream; using fallback:',
        error,
      );
    }
  }

  let greeting = bot
    ? `Thanks for calling ${bot.name}. How can I help you today?`
    : "Thanks for calling. I'm not fully set up yet, but I'll do my best to help.";

  if (bot?.system_prompt) {
    try {
      const { callLLM } = await import('../ai-team/lib.js');
      greeting = await callLLM(
        `You are the AI receptionist for a business. Business persona/instructions: ${bot.system_prompt}`,
        'Generate a short (under 25 words), natural-sounding phone greeting for an incoming call. This will be spoken aloud via text-to-speech.',
      );
      if (greeting.length > 500) greeting = `${greeting.slice(0, 497)}...`;
    } catch (error: any) {
      console.error(
        '[twilio][inbound] Greeting generation failed:',
        error.message,
      );
    }
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speakLine(greeting)}
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${APP_BASE_URL}/api/twilio/inbound-voice-respond?logId=${encodeURIComponent(logId || '')}&amp;botId=${encodeURIComponent(bot?.id || '')}&amp;turn=1" method="POST">
    ${speakLine("I'm listening.")}
  </Gather>
  ${speakLine('Feel free to call back anytime. Have a great day!')}
  <Hangup/>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
}

const MAX_TURNS = 12;

/**
 * Legacy fallback conversation loop used only if Gemini Live cannot be used.
 */
export async function inboundVoiceRespond(
  req: VercelRequest,
  res: VercelResponse,
) {
  setCors(res);
  if (req.method !== 'POST') return res.status(405).end();

  const valid = await validateTwilioRequest(req);
  if (!valid) return res.status(403).json({ error: 'Invalid Twilio request' });

  const body = parseBody(req);
  const speechResult = body.SpeechResult || '';
  const url = new URL(req.url || '/', 'http://localhost');
  const logId = url.searchParams.get('logId') || '';
  const botId = url.searchParams.get('botId') || '';
  const turn = Number.parseInt(url.searchParams.get('turn') || '1', 10);

  if (turn > MAX_TURNS || !speechResult) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speakLine('Thanks again for calling — have a great day!')}
  <Hangup/>
</Response>`;
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml);
  }

  let aiResponse =
    "I'm sorry, could you say that again? I want to make sure I help you correctly.";

  try {
    const { callLLM } = await import('../ai-team/lib.js');
    let systemPrompt =
      'You are a helpful AI receptionist answering a business phone line.';
    if (botId) {
      const bots = await sbFetch(
        'bots',
        `id=eq.${botId}&select=system_prompt&limit=1`,
      );
      if (bots?.[0]?.system_prompt) systemPrompt = bots[0].system_prompt;

      const { searchKnowledge } = await import('../rag.js');
      const chunks = await searchKnowledge(botId, speechResult, 3).catch(
        () => [],
      );
      if (chunks.length) {
        systemPrompt += `\n\nRelevant business knowledge:\n${chunks.join('\n---\n').slice(0, 3000)}`;
      }
    }

    aiResponse = await callLLM(
      `${systemPrompt}\n\nThis is a live phone call. Keep responses under 40 words — they will be spoken aloud. Be natural, warm, and concise. Never invent facts not in your instructions or the business knowledge provided. If you can't help, offer to have someone follow up.`,
      `The caller just said: "${speechResult}"`,
    );
    if (aiResponse.length > 500) aiResponse = `${aiResponse.slice(0, 497)}...`;
  } catch (error: any) {
    console.error(
      '[twilio][inbound] Response generation failed:',
      error.message,
    );
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speakLine(aiResponse)}
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${APP_BASE_URL}/api/twilio/inbound-voice-respond?logId=${encodeURIComponent(logId)}&amp;botId=${encodeURIComponent(botId)}&amp;turn=${turn + 1}" method="POST">
  </Gather>
  ${speakLine('Are you still there? Feel free to call back anytime. Goodbye!')}
  <Hangup/>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
}

/**
 * POST /api/twilio/inbound-status-callback
 * Close out the call_logs row once Twilio reports a terminal call state.
 */
export async function inboundStatusCallback(
  req: VercelRequest,
  res: VercelResponse,
) {
  setCors(res);
  if (req.method !== 'POST') return res.status(405).end();

  const valid = await validateTwilioRequest(req);
  if (!valid) return res.status(403).json({ error: 'Invalid Twilio request' });

  const body = parseBody(req);
  const callStatus = body.CallStatus || '';
  const duration = Number.parseInt(body.CallDuration || '0', 10);
  const callSid = body.CallSid || '';
  const url = new URL(req.url || '/', 'http://localhost');
  const logId = url.searchParams.get('logId') || '';

  const terminal = [
    'completed',
    'busy',
    'no-answer',
    'failed',
    'canceled',
  ].includes(callStatus);
  if (terminal) {
    const filter = logId
      ? `id=eq.${encodeURIComponent(logId)}`
      : `call_sid=eq.${encodeURIComponent(callSid)}&order=started_at.desc&limit=1`;
    await sbFetch('call_logs', filter, {
      method: 'PATCH',
      body: JSON.stringify({
        status: callStatus,
        duration,
        ended_at: new Date().toISOString(),
      }),
    });
  }

  return res.status(200).json({ received: true });
}
