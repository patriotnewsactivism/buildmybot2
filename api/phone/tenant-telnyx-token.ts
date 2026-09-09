/**
 * Shared client_state signing/verification for the Telnyx voice pipeline.
 *
 * Telnyx's Call Control `client_state` is a base64 string WE set once when
 * answering a call (api/phone/tenant-telnyx.ts) -- Telnyx echoes it back
 * verbatim in every subsequent webhook for that call AND in the
 * bidirectional-streaming WebSocket's `start` event (api/voice/telnyx-live.ts).
 * This is the direct equivalent of Twilio's <Stream><Parameter>
 * customParameters + createTwilioStreamToken/validTwilioStreamToken in the
 * old api/voice/twilio-live.ts.
 *
 * Split into its own module (rather than living in tenant-telnyx.ts or
 * telnyx-live.ts) so both files can import it without a circular
 * api/phone <-> api/voice dependency.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

function streamSigningSecret(): string {
  const secret = process.env.TELNYX_API_KEY || process.env.SESSION_JWT_SECRET;
  if (!secret) {
    throw new Error('No secure Telnyx stream signing secret is configured');
  }
  return secret;
}

function signature(callControlId: string, botId: string, logId: string): string {
  return createHmac('sha256', streamSigningSecret())
    .update(`${callControlId}|${botId}|${logId}`)
    .digest('base64url');
}

/**
 * Build the base64 client_state payload to pass to answerCall(). Encodes
 * botId/logId plus an HMAC signature over (callControlId, botId, logId) so
 * a tampered or replayed client_state from a different call can't be used
 * to hijack another tenant's bot/call-log context when the WS stream
 * connects.
 */
export function createTelnyxStreamToken(input: { callControlId: string; botId: string; logId: string }): string {
  const payload = {
    botId: input.botId,
    logId: input.logId,
    sig: signature(input.callControlId, input.botId, input.logId),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

/**
 * Decode + verify a client_state string against the call_control_id it
 * arrived on. Returns the embedded {botId, logId} on success, or null if
 * the client_state is missing, malformed, or the signature doesn't match
 * (e.g. TELNYX_API_KEY rotated after the call started, or tampering).
 */
export function validTelnyxClientState(
  clientStateBase64: string,
  callControlId: string,
): { botId: string; logId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(clientStateBase64, 'base64').toString('utf8')) as {
      botId?: string;
      logId?: string;
      sig?: string;
    };
    if (!decoded.botId || typeof decoded.sig !== 'string') return null;
    const logId = decoded.logId || '';
    const expected = Buffer.from(signature(callControlId, decoded.botId, logId));
    const received = Buffer.from(decoded.sig);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    return { botId: decoded.botId, logId };
  } catch {
    return null;
  }
}
