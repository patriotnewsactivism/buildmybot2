/**
 * Telnyx bidirectional Call Control streaming -> Gemini Live voice pipeline.
 *
 * This is the Telnyx equivalent of api/voice/twilio-live.ts (Twilio Media
 * Streams). Ported for the "part 2" Twilio -> Telnyx voice-webhook migration
 * (see api/lib/telephony-provider.ts module header). ALL AI logic --
 * transcoding, tool declarations, circuit breaker, transcript logging -- is
 * copied unchanged from twilio-live.ts. Only the transport layer differs:
 *
 *  - Twilio Media Streams WS messages: {event: 'start'|'media'|'stop', start:
 *    {streamSid, callSid, customParameters}, media: {payload}}
 *  - Telnyx bidirectional streaming WS messages (confirmed against Telnyx's
 *    own docs, developers.telnyx.com/docs/voice/programmable-voice/media-streaming):
 *    {event: 'connected'|'start'|'media'|'stop', start: {call_control_id,
 *    call_session_id, from, to, client_state, media_format: {encoding,
 *    sample_rate, channels}}, media: {track, chunk, timestamp, payload},
 *    stream_id}. Outbound audio we send back is just {event:'media',
 *    media:{payload}} -- no stream_id needed (Telnyx allows only one
 *    bidirectional stream per call).
 *  - Session context: Twilio's <Stream><Parameter> customParameters become
 *    Telnyx's `client_state` -- a base64 string WE set once when answering
 *    the call (api/phone/tenant-telnyx.ts), which Telnyx echoes back
 *    verbatim in every subsequent webhook AND in this WS stream's `start`
 *    event for the life of the call. Same role, different mechanism.
 *  - Call-control actions (redirect on failure, transfer to human) use
 *    Telnyx's REST Call Control API (speakText/transferCall in
 *    api/lib/telephony-provider.ts) instead of the Twilio SDK's
 *    `client.calls(sid).update({twiml})`.
 *
 * KNOWN GAP (disclosed, not silently dropped): Twilio Media Streams supports
 * an explicit {event:'clear'} message telling Twilio to flush its outbound
 * audio buffer instantly on caller barge-in. Telnyx's bidirectional
 * streaming docs do not document an equivalent client->Telnyx "clear
 * buffered audio" message. This code still stops ENQUEUEING further stale
 * audio the instant Gemini reports an interruption (same as the Twilio
 * path), but whatever Telnyx already has in its own internal playback
 * buffer at that instant may finish playing out -- interruption cutoff may
 * be slightly less instant than the Twilio path. Not verified against a
 * real call; flag to Don if barge-in feels laggy in testing.
 */

import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import WebSocket, { type RawData } from 'ws';
import { z } from 'zod';
import { recordMilestone } from '../growth/milestones.js';
import { sendSms, speakText, transferCall } from '../lib/telephony-provider.js';
import { validTelnyxClientState } from '../phone/tenant-telnyx-token.js';
import { searchKnowledge } from '../rag.js';

const GEMINI_MODEL = 'models/gemini-3.1-flash-live-preview';
const GEMINI_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY || '',
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY || ''}`,
  'Content-Type': 'application/json',
};

// --- Gemini Live health / circuit breaker (identical to twilio-live.ts) --
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
 * Mid-call rescue: redirect an in-progress Telnyx call away from a broken
 * Gemini Live session into a simple spoken message + transfer/hangup,
 * instead of just dropping the caller. Telnyx Call Control has no TwiML
 * "update the call" primitive like Twilio's client.calls(sid).update() --
 * the closest equivalent is issuing a fresh speak/transfer/hangup action
 * against the same call_control_id.
 */
async function redirectCallToFallback(
  context: SessionContext,
  reason: string,
): Promise<boolean> {
  if (!context.callControlId) return false;
  try {
    await speakText(
      context.callControlId,
      'Sorry about that, let me have someone follow up with you instead.',
    );
    console.error(
      `[telnyx-voice-live] Redirected call ${context.callControlId} to fallback speak: ${reason}`,
    );
    if (context.logId) {
      await mergeCallMetadata(context.logId, { fallbackReason: reason });
    }
    return true;
  } catch (error: unknown) {
    console.error(
      '[telnyx-voice-live] Fallback redirect failed:',
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

type JsonObject = Record<string, unknown>;
type ToolResult = JsonObject & { success: boolean };

type TelnyxStreamStart = {
  call_control_id?: string;
  call_session_id?: string;
  from?: string;
  to?: string;
  client_state?: string;
  media_format?: { encoding?: string; sample_rate?: number; channels?: number };
};

type TelnyxMessage = {
  event?: 'connected' | 'start' | 'media' | 'stop';
  start?: TelnyxStreamStart;
  media?: {
    track?: string;
    chunk?: string;
    timestamp?: string;
    payload?: string;
  };
};

type GeminiFunctionCall = { id?: string; name?: string; args?: JsonObject };

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
  callControlId: string;
  callerNumber: string;
  calledNumber: string;
  botName: string;
  systemPrompt: string;
  userId: string | null;
  organizationId: string | null;
  phoneConfig: Record<string, unknown>;
};

async function sbRequest(
  table: string,
  params = '',
  init?: RequestInit,
): Promise<{ ok: boolean; data: unknown }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return { ok: false, data: null };
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
      `[telnyx-voice-live] Supabase ${table} request failed:`,
      error instanceof Error ? error.message : error,
    );
    return { ok: false, data: null };
  }
}

function asRows(data: unknown): JsonObject[] {
  return Array.isArray(data) ? (data as JsonObject[]) : [];
}

// --- mu-law/PCM transcoding (byte-for-byte identical to twilio-live.ts --
// same PCMU 8kHz codec on the Telnyx side) -------------------------------
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

async function loadSessionContext(
  start: TelnyxStreamStart,
): Promise<SessionContext | null> {
  const callControlId = start.call_control_id || '';
  const clientStateRaw = start.client_state || '';
  if (!callControlId || !clientStateRaw) return null;

  const state = validTelnyxClientState(clientStateRaw, callControlId);
  if (!state) return null;
  const { botId, logId } = state;

  const botResult = await sbRequest(
    'bots',
    `id=eq.${encodeURIComponent(botId)}&select=id,name,system_prompt,user_id,organization_id&limit=1`,
  );
  const bot = asRows(botResult.data)[0];
  if (!botResult.ok || !bot) return null;

  let userId = typeof bot.user_id === 'string' ? bot.user_id : null;
  let organizationId =
    typeof bot.organization_id === 'string' ? bot.organization_id : null;
  const calledNumber = start.to || '';

  if (calledNumber) {
    const numberResult = await sbRequest(
      'phone_numbers',
      `phone_number=eq.${encodeURIComponent(calledNumber)}&status=eq.active&select=user_id,organization_id&limit=1`,
    );
    const number = asRows(numberResult.data)[0];
    if (number && typeof number.user_id === 'string') userId = number.user_id;
    if (number && typeof number.organization_id === 'string')
      organizationId = number.organization_id;
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
    callControlId,
    callerNumber: start.from || '',
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
  if (!alertNumber)
    return { success: false, reason: 'No hot-lead alert number is configured' };
  const name = String(details.name || 'Caller').slice(0, 120);
  const phone = String(details.phone || context.callerNumber || 'unknown');
  const score = String(details.score || '');
  const summary = String(details.summary || '').slice(0, 600);
  const body = `BuildMyBot hot lead${score ? ` (${score}/100)` : ''}: ${name} ${phone}${summary ? ` — ${summary}` : ''}`;
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
    console.error('[telnyx-voice-live] Hot-lead SMS failed:', reason);
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
  if (!inserted.ok || !asRows(inserted.data)[0])
    return { success: false, reason: 'CRM lead creation failed' };

  const logLinked = context.logId
    ? await patchCallLog(context.logId, { lead_id: leadId })
    : false;
  if (context.logId)
    await mergeCallMetadata(context.logId, {
      leadScore: score,
      leadSummary: summary,
    });

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
  if (!transferNumber)
    return { success: false, reason: 'Human transfer is not configured' };
  if (!context.callControlId)
    return { success: false, reason: 'Telnyx call control is not configured' };

  try {
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
    await transferCall(context.callControlId, transferNumber, {
      from: context.calledNumber || undefined,
    });
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
    console.error('[telnyx-voice-live] Human transfer failed:', reason);
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
  if (!bookingWebhookUrl)
    return {
      success: false,
      reason: 'Scheduling integration is not configured',
    };
  try {
    const response = await fetch(bookingWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'buildmybot-voice',
        botId: context.botId,
        callControlId: context.callControlId,
        callerNumber: context.callerNumber,
        ...args,
      }),
    });
    const text = await response.text();
    if (!response.ok)
      return {
        success: false,
        reason: `Scheduling service returned HTTP ${response.status}`,
      };
    if (context.userId) {
      recordMilestone({
        milestone: 'first_appointment',
        userId: context.userId,
        organizationId: context.organizationId,
        botId: context.botId,
        metadata: { callControlId: context.callControlId },
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
      systemInstruction: { parts: [{ text: buildSystemInstruction(context) }] },
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

export function handleTelnyxMediaConnection(
  telnyxSocket: WebSocket,
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

  // Outbound audio pacing -- identical rationale/cadence to twilio-live.ts:
  // Gemini returns audio in bursty chunks, Telnyx bidirectional streaming
  // (like Twilio Media Streams) expects ~20ms/160-byte 8kHz mu-law frames.
  const OUTBOUND_FRAME_BYTES = 160;
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
      if (!context || telnyxSocket.readyState !== WebSocket.OPEN) return;
      if (pendingAudio.length < OUTBOUND_FRAME_BYTES) return;
      const frame = pendingAudio.subarray(0, OUTBOUND_FRAME_BYTES);
      pendingAudio = pendingAudio.subarray(OUTBOUND_FRAME_BYTES);
      // Telnyx bidirectional streaming: no stream_id/streamSid needed on
      // outbound media messages (only one bidirectional stream per call is
      // supported), unlike Twilio which requires streamSid on every frame.
      sendJson(telnyxSocket, {
        event: 'media',
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
      gemini.close(1000, 'Telnyx stream ended');
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
        provider: 'telnyx',
      });
    }
  };

  telnyxSocket.on('message', async (data) => {
    let message: TelnyxMessage;
    try {
      message = JSON.parse(parseSocketMessage(data)) as TelnyxMessage;
    } catch {
      return;
    }

    if (message.event === 'start' && message.start) {
      context = await loadSessionContext(message.start);
      if (!context) {
        console.error('[telnyx-voice-live] Rejected Telnyx stream session');
        telnyxSocket.close(1008, 'Invalid stream session');
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error('[telnyx-voice-live] GEMINI_API_KEY is not configured');
        telnyxSocket.close(1011, 'Voice engine unavailable');
        return;
      }

      gemini = new WebSocket(
        `${GEMINI_WS_URL}?key=${encodeURIComponent(apiKey)}`,
      );
      ensurePacingTimer();
      connectTimeoutTimer = setTimeout(() => {
        if (geminiReady || finalized) return;
        recordGeminiOutcome(false);
        console.error('[telnyx-voice-live] Gemini Live setup timed out');
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
          console.error(
            '[telnyx-voice-live] Gemini error:',
            response.error.message,
          );
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
          // See module header "KNOWN GAP" -- we stop enqueueing further
          // audio immediately; Telnyx's own already-buffered playback may
          // trail slightly longer than Twilio's explicit {event:'clear'}
          // would have cut it off.
          pendingAudio = Buffer.alloc(0);
        }

        const callerText = content?.inputTranscription?.text?.trim();
        if (callerText)
          transcript.push({
            role: 'caller',
            text: callerText,
            at: new Date().toISOString(),
          });
        const agentText = content?.outputTranscription?.text?.trim();
        if (agentText)
          transcript.push({
            role: 'agent',
            text: agentText,
            at: new Date().toISOString(),
          });

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
        console.error(
          '[telnyx-voice-live] Gemini WebSocket error:',
          error.message,
        );
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
        if (!geminiReady) recordGeminiOutcome(false);
        if (telnyxSocket.readyState === WebSocket.OPEN) {
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

  telnyxSocket.on('close', () => {
    void finalize('completed');
  });
  telnyxSocket.on('error', (error) => {
    console.error('[telnyx-voice-live] Telnyx WebSocket error:', error.message);
    void finalize('failed');
  });
}
