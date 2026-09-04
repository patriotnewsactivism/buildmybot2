// SMS marketing send endpoint -- Telnyx-backed. New capability added
// alongside the Twilio->Telnyx telephony migration (see PR description).
//
// Auth pattern mirrors api/phone/activation.ts's inline session-cookie/
// Bearer JWT check (this codebase does not export a shared auth helper
// across route files -- see that file's getAuthUser for the same logic).

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendSms } from '../lib/telephony-provider.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_JWT_SECRET = process.env.SESSION_JWT_SECRET;

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY || '',
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY || ''}`,
  'Content-Type': 'application/json',
};

interface AuthUser {
  id: string;
  organizationId?: string;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) cookies[name.trim()] = decodeURIComponent(rest.join('=').trim());
  });
  return cookies;
}

async function getAuthUser(req: VercelRequest): Promise<AuthUser | null> {
  if (!SESSION_JWT_SECRET || !SUPABASE_SERVICE_KEY || !SUPABASE_URL) return null;
  const authHeader = req.headers.authorization;
  let token: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies.bmb_session || cookies.session || null;
  }
  if (!token) return null;
  try {
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra) return null;
    const expected = createHmac('sha256', SESSION_JWT_SECRET).update(encoded).digest('base64url');
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.sub) return null;
    if (payload.exp && Date.now() > Number(payload.exp) * 1000) return null;
    return { id: payload.sub, organizationId: payload.org || undefined };
  } catch {
    return null;
  }
}

async function isOptedOut(phoneNumber: string, user: AuthUser): Promise<boolean> {
  const params = new URLSearchParams({ select: 'id', phone_number: `eq.${phoneNumber}`, limit: '1' });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/sms_opt_outs?${params.toString()}`, {
    headers: SUPABASE_HEADERS,
  });
  if (!response.ok) return false; // fail open on read errors, never block on a transient DB blip
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function logMessage(row: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/sms_marketing_messages`, {
    method: 'POST',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  }).catch((error) => {
    console.error('[sms-send] Failed to log outbound message:', error instanceof Error ? error.message : error);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  if (!process.env.TELNYX_API_KEY) {
    return res.status(503).json({ error: 'SMS sending is not configured (TELNYX_API_KEY missing)' });
  }

  const body = (req.body || {}) as { to?: string | string[]; text?: string; from?: string };
  const recipients = Array.isArray(body.to) ? body.to : body.to ? [body.to] : [];
  const text = (body.text || '').trim();

  if (!recipients.length || !text) {
    return res.status(400).json({ error: '"to" (string or array) and "text" are required' });
  }
  if (recipients.length > 100) {
    return res.status(400).json({ error: 'Max 100 recipients per request -- batch larger sends client-side' });
  }

  const results: Array<{ to: string; status: string; id?: string; error?: string }> = [];

  for (const to of recipients) {
    if (await isOptedOut(to, user)) {
      results.push({ to, status: 'skipped_opted_out' });
      continue;
    }
    try {
      const sent = await sendSms({ to, from: body.from, text });
      await logMessage({
        organization_id: user.organizationId || null,
        user_id: user.id,
        to_number: to,
        from_number: body.from || null,
        body: text,
        provider: 'telnyx',
        provider_message_id: sent.id,
        status: sent.status,
      });
      results.push({ to, status: sent.status, id: sent.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Send failed';
      await logMessage({
        organization_id: user.organizationId || null,
        user_id: user.id,
        to_number: to,
        from_number: body.from || null,
        body: text,
        provider: 'telnyx',
        status: 'failed',
      });
      results.push({ to, status: 'failed', error: message });
    }
  }

  return res.status(200).json({ results });
}
