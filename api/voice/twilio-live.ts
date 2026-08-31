import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import WebSocket, { type RawData } from 'ws';
import { searchKnowledge } from '../rag.js';

const GEMINI_MODEL = 'models/gemini-3.1-flash-live-preview';
const GEMINI_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY || '',
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY || ''}`,
  'Content-Type': 'application/json',
};

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
}): string {
  return createHmac('sha256', streamSigningSecret())
    .update(`${input.callSid}|${input.botId}|${input.logId}`)
    .digest('base64url');
}

function validTwilioStreamToken(input: {
  callSid: string;
  botId: string;
  logId: string;
  token: string;
}): boolean {
  try {
    const expected = Buffer.from(
      createTwilioStreamToken({
        callSid: input.callSid,
        botId: input.botId,
        logId: input.logId,
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

async function loadSessionContext(
  start: TwilioStart,
): Promise<SessionContext | null> {
  const parameters = start.customParameters || {};
  const botId = parameters.botId || '';
  const logId = parameters.logId || '';
  const callerNumber = parameters.callerNumber || '';
  const calledNumber = parameters.calledNumber || '';
  const token = parameters.token || '';
  const callSid = start.callSid || parameters.callSid || '';
  const streamSid = start.streamSid || '';

  if (!botId || !callSid || !streamSid || !token) return null;
  if (!validTwilioStreamToken({ callSid, botId, logId, token })) return null;

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
    const numberResult = await sbRequest(
      'phone_numbers',
      `number=eq.${encodeURIComponent(calledNumber)}&select=user_id,organization_id&limit=1`,
    );
    const number = asRows(numberResult.data)[0];
    if (number) {
      if (typeof number.user_id === 'string') userId = number.user_id;
      if (typeof number.organization_id === 'string') {
        organizationId = number.organization_id;
      }
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

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || context.calledNumber;
  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, reason: 'Twilio messaging is not configured' };
  }

  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(accountSid, authToken);
    const name = String(details.name || 'Caller').slice(0, 120);
    const phone = String(details.phone || context.callerNumber || 'unknown');
    const score = String(details.score || '');
    const summary = String(details.summary || '').slice(0, 600);
    const message = await client.messages.create({
      to: alertNumber,
      from: fromNumber,
      body: `BuildMyBot hot lead${score ? ` (${score}/100)` : ''}: ${name} ${phone}${summary ? ` — ${summary}` : ''}`,
    });
    return { success: true, messageSid: message.sid };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'SMS alert failed';
    console.error('[voice-live] Hot-lead SMS failed:', reason);
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
    const client = twilio(accountSid, authToken);
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

  const closeGemini = () => {
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
          promptInitialGreeting(gemini);
          return;
        }

        const content = response.serverContent;
        if (content?.interrupted) {
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
          sendJson(twilioSocket, {
            event: 'media',
            streamSid: context.streamSid,
            media: { payload: pcm24kToMuLaw8k(audio) },
          });
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
      });
      gemini.on('close', () => {
        if (!finalized && twilioSocket.readyState === WebSocket.OPEN) {
          twilioSocket.close(1011, 'Voice engine disconnected');
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
