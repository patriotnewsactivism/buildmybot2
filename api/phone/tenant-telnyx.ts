/**
 * Telnyx Call Control webhook handler for inbound phone-agent calls.
 *
 * This is the Telnyx equivalent of api/phone/tenant-twilio.ts. Ported for
 * the "part 2" Twilio -> Telnyx voice-webhook migration (see
 * api/lib/telephony-provider.ts module header).
 *
 * Architecture difference from Twilio (deliberate, not a missing feature):
 * Twilio's webhook model is synchronous request/response -- a webhook POST
 * gets a TwiML response body telling Twilio what to do next, and Twilio
 * needs THREE separate URLs (inbound/respond/status) because each turn of
 * the Gather loop is its own HTTP round-trip. Telnyx Call Control is
 * event-driven and asynchronous -- ONE webhook URL receives every event
 * type for a call (call.initiated, call.answered, call.hangup, plus
 * streaming.started/streaming.stopped), we ack each webhook with a plain
 * 200 immediately, and issue whatever action we want (answer/speak/
 * transfer/hangup/start-streaming) as a SEPARATE authenticated REST call
 * against api.telnyx.com. So this single dispatcher replaces
 * tenant-twilio.ts's three exported handlers (tenantInboundVoiceHandler /
 * tenantInboundVoiceRespond / tenantInboundStatusCallback).
 *
 * Primary path (GEMINI_API_KEY configured, or VOICE_ENGINE=deepgram with
 * DEEPGRAM_API_KEY): call.initiated -> resolve bot/tenant by called number ->
 * create call_logs row -> answer the call with client_state encoding
 * {botId, logId} AND request bidirectional PCMU streaming to
 * wss://.../api/voice/telnyx-media in the SAME answer action. Default media
 * owner is api/voice/telnyx-live.ts (Gemini Live voice-team). When
 * VOICE_ENGINE=deepgram, server.ts routes the same WebSocket path to
 * api/voice/deepgram-agent.ts instead.
 *
 * Fallback path (no realtime key, or answer fails): a single spoken
 * message via the `speak` Call Control action, then hang up. This is
 * DELIBERATELY simpler than tenant-twilio.ts's old multi-turn Gather/TTS
 * loop -- Telnyx's speech-gather mechanics (gather_using_speak) differ
 * enough from Twilio's <Gather input="speech"> that faithfully porting a
 * multi-turn loop without any way to test it against a real call risked
 * shipping something subtly broken. Since a realtime key is confirmed set
 * in production, this fallback exists only for defense-in-depth (provider
 * outage / misconfigured tenant), not as the normal path. Flagged
 * explicitly in the PR -- if Don wants full fallback IVR parity, that's a
 * scoped follow-up once this can be tested against a real call.
 */

import { z } from 'zod';
import type { ApiRequest, ApiResponse } from '../lib/http-types.js';
import {
  answerCall,
  hangupCall,
  speakText,
} from '../lib/telephony-provider.js';
import { verifyTelnyxSignature } from '../sms/webhooks.js';
import { CORPORATE, corporateMediaUrl } from './corporate-config.js';
import { handleCorporateAnswered } from './corporate.js';
import { createTelnyxStreamToken } from './tenant-telnyx-token.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIRECT_MEDIA_ORIGIN =
  process.env.TELNYX_MEDIA_BASE_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : 'https://buildmybot2-web-production.up.railway.app');

export const config = { api: { bodyParser: false } };

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY || '',
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY || ''}`,
  'Content-Type': 'application/json',
};

async function sbFetch(table: string, params: string, init?: RequestInit) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      ...init,
      signal: controller.signal,
      headers: { ...SUPABASE_HEADERS, ...(init?.headers || {}) },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(
        `[tenant-telnyx] Supabase ${init?.method || 'GET'} ${table} failed: ${response.status}${detail ? ` ${detail}` : ''}`,
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
  } catch (error) {
    console.error(
      `[tenant-telnyx] Supabase ${init?.method || 'GET'} ${table} transport failed:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

interface BusinessBot {
  id: string;
  name: string;
  system_prompt: string | null;
}

interface ResolvedPhoneNumber {
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
    `phone_number=eq.${encodeURIComponent(calledNumber)}&status=eq.active&select=user_id,voice_agent_id&limit=2`,
  );
  if (!Array.isArray(numbers) || numbers.length !== 1) return null;
  const row = numbers[0];
  if (!row?.user_id || !row?.voice_agent_id) return null;

  const agents = await sbFetch(
    'voice_agents',
    `id=eq.${encodeURIComponent(row.voice_agent_id)}&enabled=eq.true&is_active=eq.true&select=id,bot_id,greeting&limit=1`,
  );
  const agent = agents?.[0];
  if (!agent?.id || !agent?.bot_id) return null;

  const bots = await sbFetch(
    'bots',
    `id=eq.${encodeURIComponent(agent.bot_id)}&user_id=eq.${encodeURIComponent(row.user_id)}&active=eq.true&deleted_at=is.null&select=id,name,system_prompt&limit=1`,
  );
  return {
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
  callControlId: string;
}): Promise<string | null> {
  const rows = await sbFetch('call_logs', '', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      voice_agent_id: options.voiceAgentId,
      bot_id: options.botId,
      user_id: options.userId,
      provider: 'telnyx',
      direction: 'inbound',
      caller_number: options.callerNumber,
      called_number: options.calledNumber,
      call_sid: options.callControlId,
      status: 'in-progress',
      metadata: { source: 'phone-agent-activation-telnyx' },
      started_at: new Date().toISOString(),
    }),
  });
  if (rows?.[0]?.id != null) return String(rows[0].id);
  const existing = await sbFetch(
    'call_logs',
    `call_sid=eq.${encodeURIComponent(options.callControlId)}&select=id&limit=1`,
  );
  return existing?.[0]?.id != null ? String(existing[0].id) : null;
}

function mediaStreamUrl(): string {
  const base = DIRECT_MEDIA_ORIGIN.replace(/^https:/i, 'wss:').replace(
    /^http:/i,
    'ws:',
  );
  return `${base.replace(/\/$/, '')}/api/voice/telnyx-media`;
}

const callInitiatedSchema = z.object({
  direction: z.enum(['incoming', 'outgoing']).optional(),
  call_control_id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
});

const callHangupSchema = z.object({
  call_control_id: z.string().min(1),
  hangup_cause: z.string().optional(),
});

async function handleCallInitiated(payload: unknown): Promise<void> {
  const parsed = callInitiatedSchema.safeParse(payload);
  if (!parsed.success) {
    console.error('[tenant-telnyx] Malformed call.initiated payload');
    return;
  }
  if (parsed.data.direction === 'outgoing') return;
  const {
    call_control_id: callControlId,
    from: callerNumber,
    to: calledNumber,
  } = parsed.data;

  const resolved = await resolveBotForNumber(calledNumber);
  const bot = resolved?.bot || null;

  if (!bot || !resolved) {
    // No tenant/bot configured for this number -- answer and give a short
    // spoken message rather than silently rejecting the call.
    try {
      await answerCall(callControlId);
      await speakText(
        callControlId,
        "Thanks for calling. I'm not fully set up yet, but I'll do my best to help. Please try again later.",
      );
    } catch (error) {
      console.error(
        '[tenant-telnyx] Answer/speak failed for unconfigured number:',
        error instanceof Error ? error.message : error,
      );
    }
    return;
  }

  const logId = await createCallLog({
    voiceAgentId: resolved.voiceAgentId,
    userId: resolved.userId,
    botId: bot.id,
    callerNumber,
    calledNumber,
    callControlId,
  });

  if (
    logId &&
    (process.env.GEMINI_API_KEY ||
      ((process.env.VOICE_ENGINE || '').trim().toLowerCase() === 'deepgram' &&
        process.env.DEEPGRAM_API_KEY))
  ) {
    const clientState = createTelnyxStreamToken({
      callControlId,
      botId: bot.id,
      logId,
    });
    try {
      await answerCall(callControlId, {
        clientState,
        streamUrl:
          calledNumber === CORPORATE.number
            ? corporateMediaUrl()
            : mediaStreamUrl(),
        bidirectional: true,
      });
      return;
    } catch (error) {
      console.error(
        '[tenant-telnyx] Failed to answer with media streaming, falling back:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  // Fallback: no Gemini configured, or streaming answer failed. See module
  // header -- deliberately a single spoken message, not a full multi-turn
  // IVR loop.
  try {
    await answerCall(callControlId);
    const greeting = `Thanks for calling ${bot.name}. Our voice connection is temporarily unavailable. Please call back shortly or contact our team through our website.`;
    await speakText(callControlId, greeting);
  } catch (error) {
    console.error(
      '[tenant-telnyx] Fallback answer/speak failed:',
      error instanceof Error ? error.message : error,
    );
  }
}

async function handleCallHangup(payload: unknown): Promise<void> {
  const parsed = callHangupSchema.safeParse(payload);
  if (!parsed.success) return;
  await sbFetch(
    'call_logs',
    `call_sid=eq.${encodeURIComponent(parsed.data.call_control_id)}&status=eq.in-progress&order=started_at.desc&limit=1`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'completed',
        ended_at: new Date().toISOString(),
      }),
    },
  );
}

const webhookEventSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    event_type: z.string(),
    occurred_at: z.string(),
    payload: z.record(z.string(), z.unknown()),
  }),
});

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = String(req.headers['telnyx-signature-ed25519'] || '');
  const timestamp = String(req.headers['telnyx-timestamp'] || '');
  if (!verifyTelnyxSignature(raw, signature, timestamp)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  let event: z.infer<typeof webhookEventSchema>;
  try {
    event = webhookEventSchema.parse(JSON.parse(raw.toString()));
  } catch {
    return res.status(400).json({ error: 'Malformed webhook event' });
  }

  // Ack immediately -- Telnyx retries webhooks that don't get a fast 2xx.
  // Any follow-up Call Control action (answer/speak/hangup) is a separate
  // authenticated REST call, not part of this response.
  res.status(200).json({ received: true });

  try {
    switch (event.data.event_type) {
      case 'call.initiated':
        await handleCallInitiated(event.data.payload);
        break;
      case 'call.answered':
        await handleCorporateAnswered(event.data.payload);
        break;
      case 'call.hangup':
        await handleCallHangup(event.data.payload);
        break;
      // call.answered, streaming.started, streaming.stopped: no action
      // needed here -- streaming was already requested as part of the
      // answer command above, and api/voice/telnyx-live.ts owns everything
      // that happens once the media WebSocket connects.
      default:
        break;
    }
  } catch (error) {
    console.error(
      `[tenant-telnyx] Handling ${event.data.event_type} failed:`,
      error instanceof Error ? error.message : error,
    );
  }
}
