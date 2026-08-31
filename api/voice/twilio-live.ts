import { createHmac, timingSafeEqual } from 'node:crypto';
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

type TwilioStart = {
  streamSid?: string;
  callSid?: string;
  customParameters?: Record<string, string>;
};

type TwilioMessage = {
  event?: 'connected' | 'start' | 'media' | 'mark' | 'stop' | 'dtmf';
  streamSid?: string;
  start?: TwilioStart;
  media?: { payload?: string };
};

type GeminiPart = {
  inlineData?: { data?: string; mimeType?: string };
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
    modelTurn?: { parts?: GeminiPart[] };
    interrupted?: boolean;
    turnComplete?: boolean;
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

function secretForStreamToken(): string {
  return (
    process.env.TWILIO_AUTH_TOKEN ||
    process.env.SESSION_JWT_SECRET ||
    process.env.GEMINI_API_KEY ||
    'buildmybot-unconfigured-stream-secret'
  );
}

export function createTwilioStreamToken(input: {
  callSid: string;
  botId: string;
  logId: string;
}): string {
  return createHmac('sha256', secretForStreamToken())
    .update(`${input.callSid}|${input.botId}|${input.logId}`)
    .digest('base64url');
}

function validTwilioStreamToken(input: {
  callSid: string;
  botId: string;
  logId: string;
  token: string;
}): boolean {
  const expected = createTwilioStreamToken(input);
  const received = Buffer.from(input.token);
  const expectedBuffer = Buffer.from(expected);
  return (
    received.length === expectedBuffer.length &&
    timingSafeEqual(received, expectedBuffer)
  );
}

async function sbFetch(table: string, params: string, init?: RequestInit) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
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

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
  const BIAS = 0x84;
  const CLIP = 32635;
  let pcm = Math.max(-CLIP, Math.min(CLIP, Math.round(sample)));
  const sign = pcm < 0 ? 0x80 : 0;
  if (pcm < 0) pcm = -pcm;
  pcm += BIAS;

  let exponent = 7;
  for (let mask = 0x4000; exponent > 0 && (pcm & mask) === 0; mask >>= 1) {
    exponent -= 1;
  }
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function muLaw8kToPcm16k(payload: string): string {
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

function pcm24kToMuLaw8k(payload: string): string {
  const input = Buffer.from(payload, 'base64');
  const sampleCount = Math.floor(input.length / 2);
  const outputCount = Math.floor(sampleCount / 3);
  const output = Buffer.allocUnsafe(outputCount);

  for (let index = 0; index < outputCount; index += 1) {
    const sourceIndex = index * 3;
    const offset = sourceIndex * 2;
    const a = input.readInt16LE(offset);
    const b =
      sourceIndex + 1 < sampleCount ? input.readInt16LE(offset + 2) : a;
    const c =
      sourceIndex + 2 < sampleCount ? input.readInt16LE(offset + 4) : b;
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

async function loadSessionContext(start: TwilioStart): Promise<SessionContext | null> {
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

  const botRows = await sbFetch(
    'bots',
    `id=eq.${encodeURIComponent(botId)}&select=id,name,system_prompt,user_id,organization_id,config&limit=1`,
  );
  const bot = botRows?.[0];
  if (!bot) return null;

  let userId = bot.user_id || null;
  let organizationId = bot.organization_id || null;
  if (calledNumber) {
    const numberRows = await sbFetch(
      'phone_numbers',
      `number=eq.${encodeURIComponent(calledNumber)}&select=user_id,organization_id&limit=1`,
    );
    userId = numberRows?.[0]?.user_id || userId;
    organizationId = numberRows?.[0]?.organization_id || organizationId;
  }

  let phoneConfig: Record<string, unknown> = {};
  if (userId) {
    const users = await sbFetch(
      'users',
      `id=eq.${encodeURIComponent(userId)}&select=phone_config,name,company_name&limit=1`,
    );
    phoneConfig = users?.[0]?.phone_config || {};
  }

  return {
    botId,
    logId,
    callSid,
    streamSid,
    callerNumber,
    calledNumber,
    botName: bot.name || 'the business',
    systemPrompt: bot.system_prompt || 'You are a helpful business receptionist.',
    userId,
    organizationId,
    phoneConfig,
  };
}

function buildSystemInstruction(context: SessionContext): string {
  const intro =
    typeof context.phoneConfig.introMessage === 'string'
      ? context.phoneConfig.introMessage.trim()
      : '';
  const transferNumber =
    typeof context.phoneConfig.transferNumber === 'string'
      ? context.phoneConfig.transferNumber.trim()
      : '';
  const bookingConfigured =
    typeof context.phoneConfig.bookingWebhookUrl === 'string' &&
    context.phoneConfig.bookingWebhookUrl.trim().length > 0;

  return [
    `You are the live AI receptionist for ${context.botName}.`,
    context.systemPrompt,
    intro ? `Preferred opening greeting: ${intro}` : '',
    'Speak naturally and concisely. Allow normal pauses, corrections, filler words, and interruptions.',
    'Never claim that a transfer, appointment, CRM update, text message, payment, or other external action succeeded unless the corresponding tool returned success.',
    'Use search_business_knowledge when the caller asks for business-specific facts that are not already explicit in your instructions.',
    'Use capture_lead when you have enough contact information or buying intent to create a useful lead record.',
    transferNumber
      ? 'Use transfer_to_human when the caller asks for a person, is frustrated, presents a high-value opportunity, or the issue is better handled by staff.'
      : 'Human transfer is not configured. If a caller needs a person, offer to capture their details for follow-up instead of pretending to transfer.',
    bookingConfigured
      ? 'Use request_appointment when the caller wants to book or reschedule. Only confirm the booking after the tool reports success.'
      : 'Direct calendar booking is not configured. You may collect a preferred date/time for follow-up, but do not claim an appointment is booked.',
    'For emergencies or immediate threats to life or safety, tell the caller to contact local emergency services; do not try to handle the emergency yourself.',
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
          query: { type: 'STRING', description: 'What business fact to look up' },
        },
        required: ['query'],
      },
    },
    {
      name: 'capture_lead',
      description:
        'Create or update a lead when the caller provides contact information or shows meaningful buying intent.',
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

  if (
    typeof context.phoneConfig.transferNumber === 'string' &&
    context.phoneConfig.transferNumber.trim()
  ) {
    functionDeclarations.push({
      name: 'transfer_to_human',
      description:
        'Transfer this live phone call to the configured human handoff number.',
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

  if (
    typeof context.phoneConfig.bookingWebhookUrl === 'string' &&
    context.phoneConfig.bookingWebhookUrl.trim()
  ) {
    functionDeclarations.push({
      name: 'request_appointment',
      description:
        'Send an appointment request to the business scheduling webhook and return whether it was accepted.',
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

async function patchCallLog(logId: string, patch: JsonObject) {
  if (!logId) return;
  await sbFetch('call_logs', `id=eq.${encodeURIComponent(logId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }).catch(() => null);
}

async function insertLead(context: SessionContext, args: JsonObject) {
  const scoreValue = Number(args.score ?? 50);
  const score = Number.isFinite(scoreValue)
    ? Math.max(0, Math.min(100, Math.round(scoreValue)))
    : 50;
  const phone = String(args.phone || context.callerNumber || '').trim();
  const name = String(args.name || 'Phone caller').trim().slice(0, 200);
  const email = String(args.email || '').trim().slice(0, 320);
  const summary = String(args.summary || '').trim().slice(0, 2000);
  const id = crypto.randomUUID();

  const rows = await sbFetch('leads', '', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      id,
      name,
      email,
      phone,
      score,
      status: score >= 70 ? 'Qualified' : 'New',
      source_bot_id: context.botId,
      user_id: context.userId,
      organization_id: context.organizationId,
      metadata: {
        source: 'voice',
        callSid: context.callSid,
        callLogId: context.logId,
        summary,
      },
    }),
  });

  const leadId = rows?.[0]?.id || id;
  await patchCallLog(context.logId, {
    lead_id: leadId,
    metadata: {
      source: 'gemini-live',
      leadScore: score,
      leadSummary: summary,
    },
  });

  if (score >= 70) {
    await sendHotLeadAlert(context, {
      name,
      phone,
      summary,
      score,
    });
  }

  return { success: true, leadId, score };
}

async function sendHotLeadAlert(context: SessionContext, details: JsonObject) {
  const alertNumber =
    typeof context.phoneConfig.hotLeadNumber === 'string'
      ? context.phoneConfig.hotLeadNumber.trim()
      : typeof context.phoneConfig.transferNumber === 'string'
        ? context.phoneConfig.transferNumber.trim()
        : '';
  if (!alertNumber) return { success: false, reason: 'No alert number configured' };

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || context.calledNumber;
  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, reason: 'Twilio messaging is not configured' };
  }

  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(accountSid, authToken);
    const name = String(details.name || 'Caller');
    const phone = String(details.phone || context.callerNumber || 'unknown');
    const score = String(details.score || '');
    const summary = String(details.summary || '').slice(0, 600);
    await client.messages.create({
      to: alertNumber,
      from: fromNumber,
      body: `BuildMyBot hot lead${score ? ` (${score}/100)` : ''}: ${name} ${phone}${summary ? ` — ${summary}` : ''}`,
    });
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'SMS alert failed';
    console.error('[voice-live] Hot-lead SMS failed:', message);
    return { success: false, reason: message };
  }
}

async function transferToHuman(context: SessionContext, args: JsonObject) {
  const transferNumber =
    typeof context.phoneConfig.transferNumber === 'string'
      ? context.phoneConfig.transferNumber.trim()
      : '';
  if (!transferNumber) {
    return { success: false, reason: 'Human transfer is not configured' };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return { success: false, reason: 'Twilio call control is not configured' };
  }

  try {
    await sendHotLeadAlert(context, {
      name: String(args.callerName || 'Caller'),
      phone: context.callerNumber,
      score: 100,
      summary: String(args.reason || 'Human handoff requested'),
    });

    const twilio = (await import('twilio')).default;
    const client = twilio(accountSid, authToken);
    const reason = String(args.reason || 'Human handoff requested').slice(0, 300);
    const twiml = `<Response><Say voice="Polly.Joanna">One moment while I connect you.</Say><Dial timeout="25">${xmlEscape(transferNumber)}</Dial><Say voice="Polly.Joanna">I could not reach the team. I have saved the reason for your call so they can follow up.</Say></Response>`;
    await client.calls(context.callSid).update({ twiml });
    await patchCallLog(context.logId, {
      metadata: {
        source: 'gemini-live',
        handoffRequested: true,
        handoffReason: reason,
        handoffNumber: transferNumber,
      },
    });
    return { success: true, transferredTo: transferNumber };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Transfer failed';
    console.error('[voice-live] Human transfer failed:', message);
    return { success: false, reason: message };
  }
}

async function requestAppointment(context: SessionContext, args: JsonObject) {
  const bookingWebhookUrl =
    typeof context.phoneConfig.bookingWebhookUrl === 'string'
      ? context.phoneConfig.bookingWebhookUrl.trim()
      : '';
  if (!bookingWebhookUrl) {
    return { success: false, reason: 'Scheduling webhook is not configured' };
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
    const message = error instanceof Error ? error.message : 'Scheduling failed';
    return { success: false, reason: message };
  }
}

async function executeFunction(
  context: SessionContext,
  call: GeminiFunctionCall,
): Promise<JsonObject> {
  const args = call.args || {};
  switch (call.name) {
    case 'search_business_knowledge': {
      const query = String(args.query || '').trim();
      if (!query) return { success: false, reason: 'Query is required' };
      const chunks = await searchKnowledge(context.botId, query, 5).catch(() => []);
      return {
        success: true,
        matches: chunks.slice(0, 5).map((chunk) => chunk.slice(0, 1800)),
      };
    }
    case 'capture_lead':
      return insertLead(context, args);
    case 'transfer_to_human':
      return transferToHuman(context, args);
    case 'request_appointment':
      return requestAppointment(context, args);
    default:
      return { success: false, reason: `Unknown tool: ${call.name || 'unnamed'}` };
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
                typeof context.phoneConfig.geminiVoice === 'string'
                  ? context.phoneConfig.geminiVoice
                  : 'Aoede',
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
              text: 'The caller has just connected. Greet them now using the configured greeting or a short natural greeting, then ask how you can help.',
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
  let transcript: Array<{ role: 'caller' | 'agent'; text: string; at: string }> = [];
  let closed = false;

  const closeGemini = () => {
    if (gemini && gemini.readyState <= WebSocket.OPEN) {
      gemini.close(1000, 'Twilio stream ended');
    }
    gemini = null;
  };

  const finalize = async (status = 'completed') => {
    if (closed) return;
    closed = true;
    closeGemini();
    if (context?.logId) {
      await patchCallLog(context.logId, {
        status,
        transcript,
        ended_at: new Date().toISOString(),
        metadata: {
          source: 'gemini-live',
          realtime: true,
          streamSid: context.streamSid,
        },
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
        console.error('[voice-live] Rejected Twilio stream: invalid session context');
        twilioSocket.close(1008, 'Invalid stream session');
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error('[voice-live] GEMINI_API_KEY is not configured');
        twilioSocket.close(1011, 'Voice engine unavailable');
        return;
      }

      gemini = new WebSocket(`${GEMINI_WS_URL}?key=${encodeURIComponent(apiKey)}`);
      gemini.on('open', () => {
        if (context && gemini) setupGeminiSession(gemini, context);
      });
      gemini.on('message', async (geminiData) => {
        if (!context || !gemini) return;
        let response: GeminiMessage;
        try {
          response = JSON.parse(parseSocketMessage(geminiData)) as GeminiMessage;
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
        if (!closed && twilioSocket.readyState === WebSocket.OPEN) {
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
