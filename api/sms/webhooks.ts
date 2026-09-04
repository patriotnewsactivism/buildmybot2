// Inbound Telnyx messaging webhook: delivery-status callbacks + inbound
// SMS (including STOP/opt-out keywords, which we are legally required to
// honor -- see 20260904062846_sms_marketing_opt_outs.sql migration).
//
// Telnyx signs every webhook with Ed25519 (telnyx-signature-ed25519 +
// telnyx-timestamp headers), verified against the account's PUBLIC key
// (not a shared secret like Twilio's HMAC signing). Node's crypto module
// verifies Ed25519 natively but needs the raw 32-byte base64 public key
// wrapped in the standard SPKI DER envelope first (RFC 8410) -- Node has
// no "raw key" import path for asymmetric keys.

import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELNYX_PUBLIC_KEY = process.env.TELNYX_PUBLIC_KEY;

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY || '',
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY || ''}`,
  'Content-Type': 'application/json',
};

// Fixed 12-byte ASN.1 SPKI prefix for Ed25519 public keys (RFC 8410).
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

const STOP_KEYWORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit']);

function verifyTelnyxSignature(rawBody: string, signatureHeader: string | undefined, timestampHeader: string | undefined): boolean {
  if (!TELNYX_PUBLIC_KEY) {
    // No public key configured -- cannot verify. Caller decides whether to
    // proceed anyway (we default to rejecting in the handler below).
    return false;
  }
  if (!signatureHeader || !timestampHeader) return false;
  try {
    const rawKey = Buffer.from(TELNYX_PUBLIC_KEY, 'base64');
    const spkiDer = Buffer.concat([ED25519_SPKI_PREFIX, rawKey]);
    const publicKey = createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
    const signedPayload = Buffer.from(`${timestampHeader}|${rawBody}`, 'utf8');
    const signature = Buffer.from(signatureHeader, 'base64');
    return cryptoVerify(null, signedPayload, publicKey, signature);
  } catch (error) {
    console.error('[sms-webhooks] Signature verification error:', error instanceof Error ? error.message : error);
    return false;
  }
}

async function recordOptOut(phoneNumber: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/sms_opt_outs`, {
    method: 'POST',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify({ phone_number: phoneNumber, reason: 'stop_keyword' }),
  }).catch((error) => {
    console.error('[sms-webhooks] Failed to record opt-out:', error instanceof Error ? error.message : error);
  });
}

async function updateMessageStatus(providerMessageId: string, status: string): Promise<void> {
  const params = new URLSearchParams({ provider_message_id: `eq.${providerMessageId}` });
  await fetch(`${SUPABASE_URL}/rest/v1/sms_marketing_messages?${params.toString()}`, {
    method: 'PATCH',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
  }).catch((error) => {
    console.error('[sms-webhooks] Failed to update message status:', error instanceof Error ? error.message : error);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const signatureHeader = req.headers['telnyx-signature-ed25519'] as string | undefined;
  const timestampHeader = req.headers['telnyx-timestamp'] as string | undefined;

  if (!verifyTelnyxSignature(rawBody, signatureHeader, timestampHeader)) {
    console.error('[sms-webhooks] Rejected webhook with invalid or missing signature');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const event = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
    data?: {
      event_type?: string;
      payload?: {
        id?: string;
        direction?: string;
        from?: { phone_number?: string };
        text?: string;
        to?: Array<{ status?: string }>;
      };
    };
  };

  const eventType = event.data?.event_type;
  const payload = event.data?.payload;

  try {
    if (eventType === 'message.received' && payload?.direction === 'inbound') {
      const fromNumber = payload.from?.phone_number;
      const text = (payload.text || '').trim().toLowerCase();
      if (fromNumber && STOP_KEYWORDS.has(text)) {
        await recordOptOut(fromNumber);
      }
    } else if (eventType === 'message.finalized' && payload?.id) {
      const status = payload.to?.[0]?.status || 'unknown';
      await updateMessageStatus(payload.id, status);
    }
  } catch (error) {
    console.error('[sms-webhooks] Handler error:', error instanceof Error ? error.message : error);
    // Still 200 -- Telnyx retries on non-2xx, and we've already logged the
    // failure. A retry storm from a transient DB blip is worse than a
    // missed status update we can reconcile later.
  }

  return res.status(200).json({ received: true });
}
