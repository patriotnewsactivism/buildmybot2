import {
  RETENTION_OBJECTIONS,
  type RetentionObjection,
  type RetentionState,
  authorizeNextRetentionOffer,
  createRetentionState,
  markLatestRetentionOfferOutcome,
  retentionAuditSnapshot,
} from '../../shared/voice-commercial-policy.js';
import {
  GEMINI_LIVE_MODEL,
  type SharedCallContext,
  VOICE_TEAM_ROUTING,
  type VoiceDepartment,
  type VoiceTeam,
  agentIdentity,
  createDefaultVoiceTeam,
  destinationDepartment,
  handoffContextText,
} from '../../shared/voice-team.js';
import { departmentInstructions } from '../phone/corporate-routing.js';
import { loadVoiceTeam } from './team-store.js';
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
 * Barge-in clears both local PCM queues and Telnyx playback using its
 * documented {event:"clear"} control message.
 */

import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import WebSocket, { type RawData } from 'ws';
import { z } from 'zod';
import { recordMilestone } from '../growth/milestones.js';
import { sendSms, speakText, transferCall } from '../lib/telephony-provider.js';
import { CORPORATE } from '../phone/corporate-config.js';
import { validTelnyxClientState } from '../phone/tenant-telnyx-token.js';
import { searchKnowledge } from '../rag.js';

export const GEMINI_MODEL = GEMINI_LIVE_MODEL;
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
      'Sorry, our voice connection has dropped. Please try calling again, or contact our team at buildmybot.app.',
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
  team?: VoiceTeam;
  teamRevision?: number;
  department?: VoiceDepartment;
  sharedContext?: SharedCallContext;
  retentionState: RetentionState;
