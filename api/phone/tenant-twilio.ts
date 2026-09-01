/**
 * Twilio webhook handlers for phone-agent activations provisioned into
 * tenant-isolated Twilio subaccounts.
 *
 * Legacy BuildMyBot numbers continue using api/twilio/inbound.ts. New numbers
 * use these endpoints so webhook signatures are validated with the auth token
 * that belongs to the AccountSid that actually signed the request.
 */

import { createHmac } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createTwilioStreamToken } from '../voice/twilio-live.js';
import { decryptSecret } from './crypto.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://buildmybot.app';
const TWILIO_WEBHOOK_BASE_URL =
  process.env.TWILIO_WEBHOOK_BASE_URL || APP_BASE_URL;

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY || '',
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY || ''}`,
  'Content-Type': 'application/json',
};

function parseBody(req: VercelRequest): Record<string, any> {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body || {};
}

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function sbFetch(table: string, params: string, init?: RequestInit) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    ...init,
    headers: { ...SUPABASE_HEADERS, ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(
      `[tenant-twilio] Supabase ${init?.method || 'GET'} ${table} failed: ${response.status}${detail ? ` ${detail}` : ''}`,
    );
    return null;
  }
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function twilioAuthTokenForAccount(
  accountSid: string,
): Promise<string | null> {
  if (!accountSid) return null;

  if (
    accountSid === process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN
  ) {
    return process.env.TWILIO_AUTH_TOKEN;
  }

  const rows = await sbFetch(
    'telephony_accounts',
    `provider=eq.twilio&provider_account_sid=eq.${encodeURIComponent(accountSid)}&status=eq.active&select=auth_token_encrypted&limit=1`,
  );
  const encrypted = rows?.[0]?.auth_token_encrypted;
  if (!encrypted) return null;

  try {
    return decryptSecret(encrypted);
  } catch (error) {
    console.error(
      '[tenant-twilio] Unable to decrypt subaccount credential:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function validateTwilioRequest(req: VercelRequest): Promise<boolean> {
  const signature = req.headers['x-twilio-signature'] as string | undefined;
  if (!signature) return false;

  const body = parseBody(req);
  const accountSid = String(body.AccountSid || '');
  const authToken = await twilioAuthTokenForAccount(accountSid);
  if (!authToken) return false;

  try {
    const twilio = (await import('twilio')).default;
    const base = TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '');
    const requestPath = req.url?.startsWith('/')
      ? req.url
      : `/${req.url || ''}`;
    return twilio.validateRequest(
      authToken,
      signature,
      `${base}${requestPath}`,
      body,
    );
  } catch (error) {
    console.error(
      '[tenant-twilio] Signature validation failed:',
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

function speakLine(text: string, voice = 'eve'): string {
  const xaiApiKey = process.env.XAI_API_KEY;
  if (xaiApiKey) {
    const token = createHmac('sha256', xaiApiKey)
      .update(`${text}|${voice}`)
      .digest('hex')
      .slice(0, 16);
    const params = new URLSearchParams({ text, voice, token });
    return `<Play>${escapeXml(
      `${APP_BASE_URL}/api/voice/tts-clip?${params.toString()}`,
    )}</Play>`;
  }
  return `<Say voice="Polly.Joanna">${escapeXml(text)}</Say>`;
}

interface BusinessBot {
  id: string;
  name: string;
  system_prompt: string | null;
}

interface ResolvedPhoneNumber {
  phoneNumberId: string;
  userId: string;
  voiceAgentId: string;
  greeting: string | null;
  bot: BusinessBot | null;
}

async function resolveBotForNumber(
  calledNumber: string,
): Promise<ResolvedPhoneNumber | null> {
  const numbers = await sbFetch(
    'phone_numbers',
    `phone_number=eq.${encodeURIComponent(calledNumber)}&status=eq.active&select=id,user_id,voice_agent_id&limit=1`,
  );
  const row = numbers?.[0];
  if (!row?.id || !row?.user_id || !row?.voice_agent_id) return null;

  const agents = await sbFetch(
    'voice_agents',
    `id=eq.${encodeURIComponent(row.voice_agent_id)}&select=id,bot_id,greeting&limit=1`,
  );
  const agent = agents?.[0];
  if (!agent?.id || !agent?.bot_id) {
    return {
      phoneNumberId: String(row.id),
      userId: String(row.user_id),
      voiceAgentId: String(row.voice_agent_id),
      greeting: null,
      bot: null,
    };
  }

  const bots = await sbFetch(
    'bots',
    `id=eq.${encodeURIComponent(agent.bot_id)}&select=id,name,system_prompt&limit=1`,
  );
  return {
    phoneNumberId: String(row.id),
    userId: String(row.user_id),
    voiceAgentId: String(agent.id),
    greeting: agent.greeting || null,
    bot: bots?.[0] || null,
  };
}

async function createCallLog(options: {
  voiceAgentId: string;
  userId: string;
  botId: string;
  callerNumber: string;
  calledNumber: string;
  callSid: string;
  accountSid: string;
}): Promise<string | null> {
  const rows = await sbFetch('call_logs', '', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      voice_agent_id: options.voiceAgentId,
      bot_id: options.botId,
      user_id: options.userId,
      provider: 'twilio',
      direction: 'inbound',
      caller_number: options.callerNumber,
      called_number: options.calledNumber,
      call_sid: options.callSid,
      status: 'in-progress',
      metadata: {
        source: 'phone-agent-activation',
        account_sid: options.accountSid,
      },
      started_at: new Date().toISOString(),
    }),
  });
  if (rows?.[0]?.id != null) return String(rows[0].id);

  const existing = await sbFetch(
    'call_logs',
    `call_sid=eq.${encodeURIComponent(options.callSid)}&select=id&limit=1`,
  );
  return existing?.[0]?.id != null ? String(existing[0].id) : null;
}

function mediaStreamUrl(): string {
  const base = TWILIO_WEBHOOK_BASE_URL.replace(/^https:/i, 'wss:').replace(
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
  ${speakLine(
    'The live voice session ended. Please call back if you still need help.',
  )}
  <Hangup/>
</Response>`;
}

export async function tenantInboundVoiceHandler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await validateTwilioRequest(req))) {
    return res.status(403).json({ error: 'Invalid Twilio request' });
  }

  const body = parseBody(req);
  const calledNumber = String(body.To || '');
  const callerNumber = String(body.From || '');
  const callSid = String(body.CallSid || '');
  const accountSid = String(body.AccountSid || '');

  const resolved = await resolveBotForNumber(calledNumber);
  const bot = resolved?.bot || null;
  const logId =
    resolved && bot
      ? await createCallLog({
          voiceAgentId: resolved.voiceAgentId,
          userId: resolved.userId,
          botId: bot.id,
          callerNumber,
          calledNumber,
          callSid,
          accountSid,
        })
      : null;

  if (bot && logId && process.env.GEMINI_API_KEY) {
    try {
      const twiml = realtimeTwiml({
        botId: bot.id,
        logId,
        callSid,
        callerNumber,
        calledNumber,
      });
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml);
    } catch (error) {
      console.error(
        '[tenant-twilio] Unable to start Gemini Live; using fallback:',
        error,
      );
    }
  }

  let greeting =
    resolved?.greeting ||
    (bot
      ? `Thanks for calling ${bot.name}. How can I help you today?`
      : "Thanks for calling. I'm not fully set up yet, but I'll do my best to help.");

  if (!resolved?.greeting && bot?.system_prompt) {
    try {
      const { callLLM } = await import('../ai-team/lib.js');
      greeting = await callLLM(
        `You are the AI receptionist for a business. Business persona/instructions: ${bot.system_prompt}`,
        'Generate a short, natural phone greeting under 25 words. It will be spoken aloud.',
      );
      if (greeting.length > 500) greeting = `${greeting.slice(0, 497)}...`;
    } catch (error) {
      console.error(
        '[tenant-twilio] Greeting generation failed:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  const nextUrl = `${TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '')}/api/phone/activation/twilio/respond?logId=${encodeURIComponent(
    logId || '',
  )}&botId=${encodeURIComponent(bot?.id || '')}&turn=1`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speakLine(greeting)}
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${escapeXml(
    nextUrl,
  )}" method="POST">
    ${speakLine("I'm listening.")}
  </Gather>
  ${speakLine('Feel free to call back anytime. Have a great day!')}
  <Hangup/>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
}

const MAX_TURNS = 12;

export async function tenantInboundVoiceRespond(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await validateTwilioRequest(req))) {
    return res.status(403).json({ error: 'Invalid Twilio request' });
  }

  const body = parseBody(req);
  const speechResult = String(body.SpeechResult || '');
  const url = new URL(req.url || '/', 'http://localhost');
  const logId = url.searchParams.get('logId') || '';
  const botId = url.searchParams.get('botId') || '';
  const turn = Number.parseInt(url.searchParams.get('turn') || '1', 10);

  if (turn > MAX_TURNS || !speechResult) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speakLine('Thanks again for calling. Have a great day!')}
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
        `id=eq.${encodeURIComponent(botId)}&select=system_prompt&limit=1`,
      );
      if (bots?.[0]?.system_prompt) {
        systemPrompt = bots[0].system_prompt;
      }

      const { searchKnowledge } = await import('../rag.js');
      const chunks = await searchKnowledge(botId, speechResult, 3).catch(
        () => [],
      );
      if (chunks.length) {
        systemPrompt += `\n\nRelevant business knowledge:\n${chunks
          .join('\n---\n')
          .slice(0, 3000)}`;
      }
    }

    aiResponse = await callLLM(
      `${systemPrompt}\n\nThis is a live phone call. Keep responses under 40 words. Be natural, warm, and concise. Never invent facts. Never claim an external action succeeded unless a real tool confirms it.`,
      `The caller just said: "${speechResult}"`,
    );
    if (aiResponse.length > 500) {
      aiResponse = `${aiResponse.slice(0, 497)}...`;
    }
  } catch (error) {
    console.error(
      '[tenant-twilio] Fallback response generation failed:',
      error instanceof Error ? error.message : error,
    );
  }

  const nextUrl = `${TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '')}/api/phone/activation/twilio/respond?logId=${encodeURIComponent(
    logId,
  )}&botId=${encodeURIComponent(botId)}&turn=${turn + 1}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speakLine(aiResponse)}
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${escapeXml(
    nextUrl,
  )}" method="POST"></Gather>
  ${speakLine('Are you still there? Feel free to call back anytime. Goodbye!')}
  <Hangup/>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
}

export async function tenantInboundStatusCallback(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await validateTwilioRequest(req))) {
    return res.status(403).json({ error: 'Invalid Twilio request' });
  }

  const body = parseBody(req);
  const callStatus = String(body.CallStatus || '');
  const duration = Number.parseInt(String(body.CallDuration || '0'), 10);
  const callSid = String(body.CallSid || '');

  if (
    ['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(
      callStatus,
    )
  ) {
    await sbFetch(
      'call_logs',
      `call_sid=eq.${encodeURIComponent(
        callSid,
      )}&order=started_at.desc&limit=1`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: callStatus,
          duration: Number.isFinite(duration) ? duration : 0,
          ended_at: new Date().toISOString(),
        }),
      },
    );
  }

  return res.status(200).json({ received: true });
}

export async function handleTenantTwilioWebhook(
  req: VercelRequest,
  res: VercelResponse,
) {
  const pathname = (req.url || '').split('?')[0] || '';
  if (pathname.endsWith('/twilio/inbound')) {
    return tenantInboundVoiceHandler(req, res);
  }
  if (pathname.endsWith('/twilio/respond')) {
    return tenantInboundVoiceRespond(req, res);
  }
  if (pathname.endsWith('/twilio/status')) {
    return tenantInboundStatusCallback(req, res);
  }
  return res.status(404).json({ error: 'Twilio activation webhook not found' });
}
