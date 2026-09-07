import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import WebSocket, { type RawData } from 'ws';
import { z } from 'zod';
import { recordMilestone } from '../growth/milestones.js';
import { sendSms, telnyxConfigured } from '../lib/telephony-provider.js';
import { searchKnowledge } from '../rag.js';

const GEMINI_MODEL = 'models/gemini-3.1-flash-live-preview';
const GEMINI_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://buildmybot.app';

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY || '',
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY || ''}`,
  'Content-Type': 'application/json',
};

// --- Gemini Live health / circuit breaker --------------------------------
// Serverless instances are ephemeral, so this is a best-effort in-memory
// signal scoped to a single warm instance. It still meaningfully protects
// against repeatedly attempting a genuinely degraded Gemini Live endpoint
// within that instance's lifetime -- new inbound calls check it before even
// opening a Gemini socket (see api/twilio/inbound.ts).
const GEMINI_HEALTH_WINDOW_MS = 5 * 60 * 1000;
const GEMINI_HEALTH_MIN_SAMPLES = 3;
const GEMINI_HEALTH_FAILURE_RATIO = 0.6;
const geminiHealthEvents: Array<{ at: number; ok: boolean }> = [];

function pruneGeminiHealthEvents() {
  const now = Date.now();
  while (
    geminiHealthEvents.length &&
    now - geminiHealthEvents[0].at > GEMINI_HEALTH_WINDOW_MS
  ) {
    geminiHealthEvents.shift();
  }
}

function recordGeminiOutcome(ok: boolean) {
  geminiHealthEvents.push({ at: Date.now(), ok });
  pruneGeminiHealthEvents();
}

export function isGeminiLiveCircuitOpen(): boolean {
  pruneGeminiHealthEvents();
  if (geminiHealthEvents.length < GEMINI_HEALTH_MIN_SAMPLES) return false;
  const failures = geminiHealthEvents.filter((event) => !event.ok).length;
  return failures / geminiHealthEvents.length >= GEMINI_HEALTH_FAILURE_RATIO;
}

/**
 * Mid-call rescue: redirect an in-progress Twilio call away from a broken
 * Gemini Live session and into the legacy Gather/TTS loop, instead of just
 * dropping the caller. Reuses the same fallback conversation endpoint the
 * static pre-call routing decision falls back to.
 */
async function redirectCallToFallback(
  context: SessionContext,
  reason: string,
): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken || !context.callSid) return false;
  try {
    const twilio = (await import('twilio')).default;
    const client = context.accountSid
      ? twilio(accountSid, authToken, { accountSid: context.accountSid })
      : twilio(accountSid, authToken);
    const respondUrl = `${APP_BASE_URL}/api/twilio/inbound-voice-respond?logId=${encodeURIComponent(context.logId || '')}&botId=${encodeURIComponent(context.botId || '')}&turn=1`;
    const twiml = [
      '<Response>',
      '<Say voice="Polly.Joanna">Sorry about that, let me connect you a different way.</Say>',
      `<Gather input="speech" timeout="5" speechTimeout="auto" action="${respondUrl.replace(/&/g, '&amp;')}" method="POST">`,
      '<Say voice="Polly.Joanna">Go ahead, I am listening.</Say>',
      '</Gather>',
      '<Say voice="Polly.Joanna">Feel free to call back anytime. Have a great day!</Say>',
      '<Hangup/>',
      '</Response>',
    ].join('');
    await client.calls(context.callSid).update({ twiml });
    console.error(
      `[voice-live] Redirected call ${context.callSid} to legacy fallback: ${reason}`,
    );
    return true;
  } catch (error: unknown) {
    console.error(
      '[voice-live] Fallback redirect failed:',
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

type JsonObject = Record<string, unknown>;
type ToolResult = JsonObject & { success: boolean };

type TwilioStart = {
  streamSid?: string;
  callSid?: string;
  customParameters?: Record<string, string>;
};

type TwilioMessage = {
  event?: 'connected' | 'start' | 'media' | 'mark' | 'stop' | 'dtmf';
  start?: TwilioStart;
  media?: { payload?: string };
};

type GeminiFunctionCall = {
  id?: string;
  name?: string;
  args?: JsonObject;
};

type GeminiMessage = {
  setupComplete?: JsonObject;
  serverContent?: {
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: {
      parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
    };
    interrupted?: boolean;
  };
  toolCall?: { functionCalls?: GeminiFunctionCall[] };
  error?: { message?: string };
};

type SessionContext = {
  botId: string;
  logId: string;
  callSid: string;
  accountSid: string;
  streamSid: string;
  callerNumber: string;
  calledNumber: string;
  botName: string;
  systemPrompt: string;
  userId: string | null;
  organizationId: string | null;
  phoneConfig: Record<string, unknown>;
};

function streamSigningSecret(): string {
  const secret =
    process.env.TWILIO_AUTH_TOKEN || process.env.SESSION_JWT_SECRET;
  if (!secret) {
    throw new Error('No secure Twilio stream signing secret is configured');
  }
  return secret;
}

export function createTwilioStreamToken(input: {
  callSid: string;
  botId: string;
  logId: string;
  accountSid?: string;
}): string {
  const material = input.accountSid
    ? `${input.callSid}|${input.botId}|${input.logId}|${input.accountSid}`
    : `${input.callSid}|${input.botId}|${input.logId}`;
  return createHmac('sha256', streamSigningSecret())
    .update(material)
    .digest('base64url');
}

function validTwilioStreamToken(input: {
  callSid: string;
  botId: string;
  logId: string;
  token: string;
  accountSid?: string;
}): boolean {
  try {
    const expected = Buffer.from(
      createTwilioStreamToken({
        callSid: input.callSid,
        botId: input.botId,
        logId: input.logId,
        accountSid: input.accountSid,
      }),
    );
    const received = Buffer.from(input.token);
    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  } catch {
    return false;
  }
}

async function sbRequest(
  table: string,
  params = '',
  init?: RequestInit,
): Promise<{ ok: boolean; data: unknown }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { ok: false, data: null };
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      ...init,
      headers: { ...SUPABASE_HEADERS, ...(init?.headers || {}) },
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { ok: response.ok, data };
  } catch (error: unknown) {
    console.error(
      `[voice-live] Supabase ${table} request failed:`,
      error instanceof Error ? error.message : error,
    );
    return { ok: false, data: null };
  }
}

function asRows(data: unknown): JsonObject[] {
  return Array.isArray(data) ? (data as JsonObject[]) : [];
}

function decodeMuLawByte(value: number): number {
  const sample = ~value & 0xff;
  const sign = sample & 0x80;
  const exponent = (sample >> 4) & 0x07;
  const mantissa = sample & 0x0f;
  let magnitude = ((mantissa << 3) + 0x84) << exponent;
  magnitude -= 0x84;
  return sign ? -magnitude : magnitude;
}

function encodeMuLawSample(sample: number): number {
  const bias = 0x84;
  const clip = 32635;
  let pcm = Math.max(-clip, Math.min(clip, Math.round(sample)));
  const sign = pcm < 0 ? 0x80 : 0;
  if (pcm < 0) pcm = -pcm;
  pcm += bias;

  let exponent = 7;
  for (let mask = 0x4000; exponent > 0 && (pcm & mask) === 0; mask >>= 1) {
    exponent -= 1;
  }
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function muLaw8kToPcm16k(payload: string): string {
  const input = Buffer.from(payload, 'base64');
  const output = Buffer.allocUnsafe(input.length * 4);

  for (let index = 0; index < input.length; index += 1) {
    const current = decodeMuLawByte(input[index]);
    const next =
      index + 1 < input.length ? decodeMuLawByte(input[index + 1]) : current;
    output.writeInt16LE(current, index * 4);
    output.writeInt16LE(Math.round((current + next) / 2), index * 4 + 2);
  }

  return output.toString('base64');
}

export function pcm24kToMuLaw8k(payload: string): string {
  const input = Buffer.from(payload, 'base64');
  const sampleCount = Math.floor(input.length / 2);
  const outputCount = Math.floor(sampleCount / 3);
  const output = Buffer.allocUnsafe(outputCount);

  for (let index = 0; index < outputCount; index += 1) {
    const sourceIndex = index * 3;
    const offset = sourceIndex * 2;
    const a = input.readInt16LE(offset);
    const b = sourceIndex + 1 < sampleCount ? input.readInt16LE(offset + 2) : a;
    const c = sourceIndex + 2 < sampleCount ? input.readInt16LE(offset + 4) : b;
    output[index] = encodeMuLawSample((a + b + c) / 3);
  }

  return output.toString('base64');
}

function parseSocketMessage(data: RawData): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

const streamParametersSchema = z
  .object({
    botId: z.string().min(1),
    logId: z.string(),
    token: z.string().min(1),
    callSid: z.string().optional(),
    accountSid: z.string().optional(),
    callerNumber: z.string().optional(),
    calledNumber: z.string().optional(),
  })
  .passthrough();

async function loadSessionContext(
  start: TwilioStart,
): Promise<SessionContext | null> {
  const parsedParameters = streamParametersSchema.safeParse(
    start.customParameters || {},
  );
  if (!parsedParameters.success) return null;
  const parameters = parsedParameters.data;
  const botId = parameters.botId;
  const logId = parameters.logId;
  const callerNumber = parameters.callerNumber || '';
  const calledNumber = parameters.calledNumber || '';
  const token = parameters.token;
  const callSid = start.callSid || parameters.callSid || '';
  const accountSid = parameters.accountSid || '';
  const streamSid = start.streamSid || '';

  if (!callSid || !streamSid) return null;
  if (
    !validTwilioStreamToken({
      callSid,
      botId,
      logId,
      token,
      accountSid: accountSid || undefined,
    })
  ) {
    return null;
  }

  const botResult = await sbRequest(
    'bots',
    `id=eq.${encodeURIComponent(botId)}&select=id,name,system_prompt,user_id,organization_id&limit=1`,
  );
  const bot = asRows(botResult.data)[0];
  if (!botResult.ok || !bot) return null;

  let userId = typeof bot.user_id === 'string' ? bot.user_id : null;
  let organizationId =
    typeof bot.organization_id === 'string' ? bot.organization_id : null;

  if (calledNumber) {
    const numberParams = accountSid
      ? `phone_number=eq.${encodeURIComponent(calledNumber)}&twilio_subaccount_sid=eq.${encodeURIComponent(accountSid)}&status=eq.active&select=user_id,organization_id,voice_agent_id&limit=2`
      : `phone_number=eq.${encodeURIComponent(calledNumber)}&status=eq.active&select=user_id,organization_id,voice_agent_id&limit=1`;
    const numberResult = await sbRequest('phone_numbers', numberParams);
    const numberRows = asRows(numberResult.data);
    if (!numberResult.ok || numberRows.length !== 1) return null;
    const number = numberRows[0];

    if (accountSid) {
      if (typeof number.voice_agent_id !== 'string') return null;
      const agentResult = await sbRequest(
        'voice_agents',
        `id=eq.${encodeURIComponent(number.voice_agent_id)}&select=bot_id&limit=1`,
      );
      const agent = asRows(agentResult.data)[0];
      if (!agentResult.ok || agent?.bot_id !== botId) return null;
    }

    if (typeof number.user_id === 'string') userId = number.user_id;
    if (typeof number.organization_id === 'string') {
      organizationId = number.organization_id;
    }
  }

  let phoneConfig: Record<string, unknown> = {};
  if (userId) {
    const userResult = await sbRequest(
      'users',
      `id=eq.${encodeURIComponent(userId)}&select=phone_config&limit=1`,
    );
    const user = asRows(userResult.data)[0];
    if (user?.phone_config && typeof user.phone_config === 'object') {
      phoneConfig = user.phone_config as Record<string, unknown>;
    }
  }

  return {
    botId,
    logId,
    callSid,
    accountSid,
    streamSid,
    callerNumber,
    calledNumber,
    botName: typeof bot.name === 'string' ? bot.name : 'the business',
    systemPrompt:
      typeof bot.system_prompt === 'string' && bot.system_prompt.trim()
        ? bot.system_prompt
        : 'You are a helpful business receptionist.',
    userId,
    organizationId,
    phoneConfig,
  };
}

function configuredString(
  config: Record<string, unknown>,
  key: string,
): string {
  return typeof config[key] === 'string' ? config[key].trim() : '';
}

function buildSystemInstruction(context: SessionContext): string {
  const intro = configuredString(context.phoneConfig, 'introMessage');
  const transferNumber = configuredString(
    context.phoneConfig,
    'transferNumber',
  );
  const bookingWebhook = configuredString(
    context.phoneConfig,
    'bookingWebhookUrl',
  );

  return [
    `You are the live AI receptionist for ${context.botName}.`,
    context.systemPrompt,
    intro ? `Preferred opening greeting: ${intro}` : '',
    'Speak naturally and concisely. Allow normal pauses, corrections, filler words, and interruptions.',
    'Never claim that a transfer, appointment, CRM update, text message, payment, or any external action succeeded unless the matching tool returned success.',
    'Use search_business_knowledge for business-specific facts that are not already explicit in your instructions.',
    'Use capture_lead when the caller provides usable contact information or shows meaningful buying intent.',
    transferNumber
      ? 'Use transfer_to_human when the caller asks for a person, is frustrated, presents a high-value opportunity, or the issue is better handled by staff.'
      : 'Human transfer is not configured. Offer to capture details for follow-up instead of pretending to transfer.',
    bookingWebhook
      ? 'Use request_appointment for booking or rescheduling. Only confirm an appointment after the tool reports success.'
      : 'Direct calendar booking is not configured. You may collect a preferred date and time for follow-up, but do not claim it is booked.',
    'For emergencies or immediate threats to life or safety, direct the caller to local emergency services rather than attempting to handle the emergency.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildTools(context: SessionContext) {
  const functionDeclarations: JsonObject[] = [
    {
      name: 'search_business_knowledge',
      description:
        'Search the business knowledge base for accurate service, policy, hours, pricing, location, or FAQ information.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: {
            type: 'STRING',
            description: 'The business fact or question to look up',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'capture_lead',
      description:
        'Capture a caller as a CRM lead after receiving contact information or meaningful buying intent.',
      parameters: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          phone: { type: 'STRING' },
          email: { type: 'STRING' },
          summary: { type: 'STRING' },
          score: { type: 'NUMBER', description: 'Lead quality from 0 to 100' },
        },
      },
    },
  ];

  if (configuredString(context.phoneConfig, 'transferNumber')) {
    functionDeclarations.push({
      name: 'transfer_to_human',
      description:
        'Transfer the current live phone call to the configured human handoff number.',
      parameters: {
        type: 'OBJECT',
        properties: {
          reason: { type: 'STRING' },
          callerName: { type: 'STRING' },
        },
        required: ['reason'],
      },
    });
  }

  if (configuredString(context.phoneConfig, 'bookingWebhookUrl')) {
    functionDeclarations.push({
      name: 'request_appointment',
      description:
        'Send an appointment request to the configured scheduling integration and return whether it was accepted.',
      parameters: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          phone: { type: 'STRING' },
          email: { type: 'STRING' },
          requestedTime: { type: 'STRING' },
          service: { type: 'STRING' },
          notes: { type: 'STRING' },
        },
        required: ['requestedTime'],
      },
    });
  }

  return [{ functionDeclarations }];
}

async function patchCallLog(
  logId: string,
  patch: JsonObject,
): Promise<boolean> {
  if (!logId) return false;
  const result = await sbRequest(
    'call_logs',
    `id=eq.${encodeURIComponent(logId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  );
  return result.ok;
}

async function mergeCallMetadata(
  logId: string,
  extra: JsonObject,
): Promise<boolean> {
  if (!logId) return false;
  const current = await sbRequest(
    'call_logs',
    `id=eq.${encodeURIComponent(logId)}&select=metadata&limit=1`,
  );
  const row = asRows(current.data)[0];
  const metadata =
    row?.metadata && typeof row.metadata === 'object'
      ? (row.metadata as JsonObject)
      : {};
  return patchCallLog(logId, { metadata: { ...metadata, ...extra } });
}

async function sendHotLeadAlert(
  context: SessionContext,
  details: JsonObject,
): Promise<ToolResult> {
  const alertNumber =
    configuredString(context.phoneConfig, 'hotLeadNumber') ||
    configuredString(context.phoneConfig, 'transferNumber');
  if (!alertNumber) {
    return { success: false, reason: 'No hot-lead alert number is configured' };
  }

  const name = String(details.name || 'Caller').slice(0, 120);
  const phone = String(details.phone || context.callerNumber || 'unknown');
  const score = String(details.score || '');
  const summary = String(details.summary || '').slice(0, 600);
  const body = `BuildMyBot hot lead${score ? ` (${score}/100)` : ''}: ${name} ${phone}${summary ? ` — ${summary}` : ''}`;

  // Telnyx first (the number was provisioned there going forward -- see
  // api/lib/telephony-provider.ts / PR "Twilio -> Telnyx migration"), with a
  // Twilio fallback for any tenant still on a legacy Twilio-purchased number
  // (TWILIO_ACCOUNT_SID/AUTH_TOKEN still configured). This is a single
  // transactional text, not the live-call audio pipeline, so it was safe to
  // move ahead of the full "part 2" webhook migration.
  if (telnyxConfigured()) {
    try {
      const sent = await sendSms({
        to: alertNumber,
        from: context.calledNumber || undefined,
        text: body,
      });
      return { success: true, messageSid: sent.id };
    } catch (error: unknown) {
      const reason =
        error instanceof Error ? error.message : 'Telnyx SMS alert failed';
      console.error('[voice-live] Hot-lead SMS via Telnyx failed:', reason);
      return { success: false, reason };
    }
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = context.accountSid
    ? context.calledNumber
    : process.env.TWILIO_PHONE_NUMBER || context.calledNumber;
  if (!accountSid || !authToken || !fromNumber) {
    return {
      success: false,
      reason: 'No SMS provider is configured (Telnyx or Twilio)',
    };
  }

  try {
    const twilio = (await import('twilio')).default;
    const client = context.accountSid
      ? twilio(accountSid, authToken, { accountSid: context.accountSid })
      : twilio(accountSid, authToken);
    const message = await client.messages.create({
      to: alertNumber,
      from: fromNumber,
      body,
    });
    return { success: true, messageSid: message.sid };
  } catch (error: unknown) {
    const reason =
      error instanceof Error ? error.message : 'Twilio SMS alert failed';
    console.error('[voice-live] Hot-lead SMS via Twilio failed:', reason);
    return { success: false, reason };
  }
}

async function captureLead(
  context: SessionContext,
  args: JsonObject,
): Promise<ToolResult> {
  const scoreValue = Number(args.score ?? 50);
  const score = Number.isFinite(scoreValue)
    ? Math.max(0, Math.min(100, Math.round(scoreValue)))
    : 50;
  const phone = String(args.phone || context.callerNumber || '').trim();
  const email = String(args.email || '')
    .trim()
    .slice(0, 255);
  const name = String(args.name || 'Phone caller')
    .trim()
    .slice(0, 255);
  const summary = String(args.summary || '')
    .trim()
    .slice(0, 4000);
  const leadId = randomUUID();
  const now = new Date().toISOString();

  const inserted = await sbRequest('leads', '', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      id: leadId,
      name,
      email,
      phone,
      score,
      status: score >= 70 ? 'Qualified' : 'New',
      source_bot_id: context.botId,
      source: 'voice',
      user_id: context.userId,
      organization_id: context.organizationId,
      notes: summary || null,
      ai_notes: summary || null,
      contact_method: 'call',
      last_contacted_at: now,
    }),
  });

  if (!inserted.ok || !asRows(inserted.data)[0]) {
    return { success: false, reason: 'CRM lead creation failed' };
  }

  const logLinked = context.logId
    ? await patchCallLog(context.logId, { lead_id: leadId })
    : false;
  if (context.logId) {
    await mergeCallMetadata(context.logId, {
      leadScore: score,
      leadSummary: summary,
    });
  }

  const alert =
    score >= 70
      ? await sendHotLeadAlert(context, { name, phone, summary, score })
      : { success: false, reason: 'Lead score below hot-lead threshold' };

  return {
    success: true,
    leadId,
    score,
    callLogLinked: logLinked,
    hotLeadAlertSent: alert.success,
  };
}

async function transferToHuman(
  context: SessionContext,
  args: JsonObject,
): Promise<ToolResult> {
  const transferNumber = configuredString(
    context.phoneConfig,
    'transferNumber',
  );
  if (!transferNumber) {
    return { success: false, reason: 'Human transfer is not configured' };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return { success: false, reason: 'Twilio call control is not configured' };
  }

  try {
    const twilio = (await import('twilio')).default;
    const client = context.accountSid
      ? twilio(accountSid, authToken, { accountSid: context.accountSid })
      : twilio(accountSid, authToken);
    const reason = String(args.reason || 'Human handoff requested').slice(
      0,
      300,
    );
    const alert = await sendHotLeadAlert(context, {
      name: String(args.callerName || 'Caller'),
      phone: context.callerNumber,
      score: 100,
      summary: reason,
    });
    const twiml = [
      '<Response>',
      '<Say voice="Polly.Joanna">One moment while I connect you.</Say>',
      `<Dial timeout="25">${transferNumber.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Dial>`,
      '<Say voice="Polly.Joanna">I could not reach the team. I saved the reason for your call so they can follow up.</Say>',
      '</Response>',
    ].join('');
    await client.calls(context.callSid).update({ twiml });
    if (context.logId) {
      await mergeCallMetadata(context.logId, {
        handoffRequested: true,
        handoffReason: reason,
        handoffNumber: transferNumber,
      });
    }
    return {
      success: true,
      transferredTo: transferNumber,
      hotLeadAlertSent: alert.success,
    };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'Transfer failed';
    console.error('[voice-live] Human transfer failed:', reason);
    return { success: false, reason };
  }
}

async function requestAppointment(
  context: SessionContext,
  args: JsonObject,
): Promise<ToolResult> {
  const bookingWebhookUrl = configuredString(
    context.phoneConfig,
    'bookingWebhookUrl',
  );
  if (!bookingWebhookUrl) {
    return {
      success: false,
      reason: 'Scheduling integration is not configured',
    };
  }

  try {
    const response = await fetch(bookingWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'buildmybot-voice',
        botId: context.botId,
        callSid: context.callSid,
        callerNumber: context.callerNumber,
        ...args,
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        success: false,
        reason: `Scheduling service returned HTTP ${response.status}`,
      };
    }
    // First-value tracking: only on a real accepted booking, never on a
    // failed/unconfigured one.
    if (context.userId) {
      recordMilestone({
        milestone: 'first_appointment',
        userId: context.userId,
        organizationId: context.organizationId,
        botId: context.botId,
        metadata: { callSid: context.callSid },
      }).catch(() => {});
    }
    return { success: true, result: text.slice(0, 1000) || 'accepted' };
  } catch (error: unknown) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : 'Scheduling failed',
    };
  }
}

async function executeFunction(
  context: SessionContext,
  call: GeminiFunctionCall,
): Promise<ToolResult> {
  const args = call.args || {};
  switch (call.name) {
    case 'search_business_knowledge': {
      const query = String(args.query || '').trim();
      if (!query) return { success: false, reason: 'Query is required' };
      const chunks = await searchKnowledge(context.botId, query, 5).catch(
        () => [],
      );
      return {
        success: true,
        matches: chunks.slice(0, 5).map((chunk) => chunk.slice(0, 1800)),
      };
    }
    case 'capture_lead':
      return captureLead(context, args);
    case 'transfer_to_human':
      return transferToHuman(context, args);
    case 'request_appointment':
      return requestAppointment(context, args);
    default:
      return {
        success: false,
        reason: `Unknown tool: ${call.name || 'unnamed'}`,
      };
  }
}

function setupGeminiSession(gemini: WebSocket, context: SessionContext) {
  sendJson(gemini, {
    setup: {
      model: GEMINI_MODEL,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName:
                configuredString(context.phoneConfig, 'geminiVoice') || 'Aoede',
            },
          },
        },
      },
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
          endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
          prefixPaddingMs: 120,
          silenceDurationMs: 750,
        },
        activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: {
        parts: [{ text: buildSystemInstruction(context) }],
      },
      tools: buildTools(context),
    },
  });
}

function promptInitialGreeting(gemini: WebSocket) {
  sendJson(gemini, {
    clientContent: {
      turns: [
        {
          role: 'user',
          parts: [
            {
              text: 'The caller just connected. Greet them now using the configured greeting or a short natural greeting, then ask how you can help.',
            },
          ],
        },
      ],
      turnComplete: true,
    },
  });
}

export function handleTwilioMediaConnection(
  twilioSocket: WebSocket,
  _request: IncomingMessage,
) {
  let context: SessionContext | null = null;
  let gemini: WebSocket | null = null;
  const transcript: Array<{
    role: 'caller' | 'agent';
    text: string;
    at: string;
  }> = [];
  let finalized = false;
  let geminiReady = false;
  let connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  // Outbound audio pacing: Gemini returns audio in bursty 100-300ms chunks,
  // but Twilio Media Streams expects ~20ms frames delivered at real-time
  // cadence. Buffer everything Gemini sends and drain it to Twilio at a
  // fixed 20ms/160-byte tick instead of forwarding each burst immediately.
  const OUTBOUND_FRAME_BYTES = 160; // 20ms of 8kHz mu-law audio
  const OUTBOUND_FRAME_MS = 20;
  let pendingAudio = Buffer.alloc(0);
  let pacingTimer: ReturnType<typeof setInterval> | null = null;

  const stopPacingTimer = () => {
    if (pacingTimer) {
      clearInterval(pacingTimer);
      pacingTimer = null;
    }
  };

  const ensurePacingTimer = () => {
    if (pacingTimer) return;
    pacingTimer = setInterval(() => {
      if (!context || twilioSocket.readyState !== WebSocket.OPEN) return;
      if (pendingAudio.length < OUTBOUND_FRAME_BYTES) return;
      const frame = pendingAudio.subarray(0, OUTBOUND_FRAME_BYTES);
      pendingAudio = pendingAudio.subarray(OUTBOUND_FRAME_BYTES);
      sendJson(twilioSocket, {
        event: 'media',
        streamSid: context.streamSid,
        media: { payload: frame.toString('base64') },
      });
    }, OUTBOUND_FRAME_MS);
  };

  const closeGemini = () => {
    if (connectTimeoutTimer) {
      clearTimeout(connectTimeoutTimer);
      connectTimeoutTimer = null;
    }
    if (!gemini) return;
    if (gemini.readyState === WebSocket.OPEN) {
      gemini.close(1000, 'Twilio stream ended');
    } else if (gemini.readyState === WebSocket.CONNECTING) {
      gemini.terminate();
    }
    gemini = null;
  };

  const finalize = async (status = 'completed') => {
    if (finalized) return;
    finalized = true;
    closeGemini();
    stopPacingTimer();
    pendingAudio = Buffer.alloc(0);
    if (context?.logId) {
      await patchCallLog(context.logId, {
        status,
        transcript,
        ended_at: new Date().toISOString(),
      });
      await mergeCallMetadata(context.logId, {
        source: 'gemini-live',
        realtime: true,
        streamSid: context.streamSid,
      });
    }
  };

  twilioSocket.on('message', async (data) => {
    let message: TwilioMessage;
    try {
      message = JSON.parse(parseSocketMessage(data)) as TwilioMessage;
    } catch {
      return;
    }

    if (message.event === 'start' && message.start) {
      context = await loadSessionContext(message.start);
      if (!context) {
        console.error('[voice-live] Rejected Twilio stream session');
        twilioSocket.close(1008, 'Invalid stream session');
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error('[voice-live] GEMINI_API_KEY is not configured');
        twilioSocket.close(1011, 'Voice engine unavailable');
        return;
      }

      gemini = new WebSocket(
        `${GEMINI_WS_URL}?key=${encodeURIComponent(apiKey)}`,
      );
      ensurePacingTimer();
      connectTimeoutTimer = setTimeout(() => {
        if (geminiReady || finalized) return;
        recordGeminiOutcome(false);
        console.error('[voice-live] Gemini Live setup timed out');
        void (async () => {
          const redirected = context
            ? await redirectCallToFallback(
                context,
                'Gemini Live setup timed out',
              )
            : false;
          await finalize(redirected ? 'completed' : 'failed');
        })();
      }, 4000);
      gemini.on('open', () => {
        if (context && gemini) setupGeminiSession(gemini, context);
      });
      gemini.on('message', async (geminiData) => {
        if (!context || !gemini) return;
        let response: GeminiMessage;
        try {
          response = JSON.parse(
            parseSocketMessage(geminiData),
          ) as GeminiMessage;
        } catch {
          return;
        }

        if (response.error?.message) {
          console.error('[voice-live] Gemini error:', response.error.message);
          return;
        }
        if (response.setupComplete) {
          geminiReady = true;
          if (connectTimeoutTimer) {
            clearTimeout(connectTimeoutTimer);
            connectTimeoutTimer = null;
          }
          recordGeminiOutcome(true);
          promptInitialGreeting(gemini);
          return;
        }

        const content = response.serverContent;
        if (content?.interrupted) {
          pendingAudio = Buffer.alloc(0);
          sendJson(twilioSocket, {
            event: 'clear',
            streamSid: context.streamSid,
          });
        }

        const callerText = content?.inputTranscription?.text?.trim();
        if (callerText) {
          transcript.push({
            role: 'caller',
            text: callerText,
            at: new Date().toISOString(),
          });
        }
        const agentText = content?.outputTranscription?.text?.trim();
        if (agentText) {
          transcript.push({
            role: 'agent',
            text: agentText,
            at: new Date().toISOString(),
          });
        }

        for (const part of content?.modelTurn?.parts || []) {
          const audio = part.inlineData?.data;
          if (!audio) continue;
          pendingAudio = Buffer.concat([
            pendingAudio,
            Buffer.from(pcm24kToMuLaw8k(audio), 'base64'),
          ]);
        }

        const functionCalls = response.toolCall?.functionCalls || [];
        if (functionCalls.length) {
          const functionResponses = [];
          for (const call of functionCalls) {
            const result = await executeFunction(context, call);
            functionResponses.push({
              id: call.id,
              name: call.name,
              response: result,
            });
          }
          sendJson(gemini, { toolResponse: { functionResponses } });
        }
      });
      gemini.on('error', (error) => {
        console.error('[voice-live] Gemini WebSocket error:', error.message);
        if (finalized) return;
        recordGeminiOutcome(false);
        void (async () => {
          const redirected = context
            ? await redirectCallToFallback(
                context,
                `Gemini WebSocket error: ${error.message}`,
              )
            : false;
          await finalize(redirected ? 'completed' : 'failed');
        })();
      });
      gemini.on('close', () => {
        if (finalized) return;
        if (!geminiReady) {
          // Already handled by the connect-timeout / error paths above in
          // practice, but cover the case where the socket closes before
          // either fires.
          recordGeminiOutcome(false);
        }
        if (twilioSocket.readyState === WebSocket.OPEN) {
          void (async () => {
            const redirected = context
              ? await redirectCallToFallback(
                  context,
                  'Gemini Live connection closed unexpectedly',
                )
              : false;
            await finalize(redirected ? 'completed' : 'failed');
          })();
        } else {
          void finalize('failed');
        }
      });
      return;
    }

    if (message.event === 'media' && message.media?.payload && gemini) {
      if (gemini.readyState !== WebSocket.OPEN) return;
      sendJson(gemini, {
        realtimeInput: {
          audio: {
            data: muLaw8kToPcm16k(message.media.payload),
            mimeType: 'audio/pcm;rate=16000',
          },
        },
      });
      return;
    }

    if (message.event === 'stop') {
      if (gemini?.readyState === WebSocket.OPEN) {
        sendJson(gemini, { realtimeInput: { audioStreamEnd: true } });
      }
      await finalize('completed');
    }
  });

  twilioSocket.on('close', () => {
    void finalize('completed');
  });
  twilioSocket.on('error', (error) => {
    console.error('[voice-live] Twilio WebSocket error:', error.message);
    void finalize('failed');
  });
}
