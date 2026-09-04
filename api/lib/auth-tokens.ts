// =====================================================================
// P1: Expiring, single-use auth tokens (password reset + email verify).
//
// Only a SHA-256 hash of the token is stored, so a database leak cannot
// be replayed to take over accounts. Tokens are single-use (used_at is
// set atomically on consumption) and always expire.
// =====================================================================

import crypto from 'node:crypto';
import { sendEmail } from './mailer.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function headers(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export type AuthTokenType = 'password_reset' | 'email_verification';

export const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  password_reset: 60 * 60_000, // 1 hour
  email_verification: 24 * 60 * 60_000, // 24 hours
};

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Issues a new token, invalidating any outstanding tokens of the same
 * type for that user. Returns the RAW token — it is never stored and can
 * only be delivered by email.
 */
export async function issueAuthToken(
  userId: string,
  type: AuthTokenType,
): Promise<{ token: string; expiresAt: string }> {
  // Invalidate outstanding tokens of this type first.
  await fetch(
    `${SUPABASE_URL}/rest/v1/auth_tokens?user_id=eq.${userId}&type=eq.${type}&used_at=is.null`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ used_at: new Date().toISOString() }),
    },
  ).catch(() => {});

  const raw = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS[type]).toISOString();

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/auth_tokens`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      id: crypto.randomUUID(),
      user_id: userId,
      type,
      token_hash: hashToken(raw),
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`auth_tokens insert failed: ${resp.status} ${detail}`);
  }

  return { token: raw, expiresAt };
}

export interface ConsumedToken {
  ok: boolean;
  userId?: string;
  reason?: 'invalid' | 'expired' | 'used' | 'error';
}

/**
 * Validates and atomically burns a token. A token is accepted at most
 * once: consumption uses a conditional PATCH on used_at IS NULL, so two
 * concurrent requests cannot both succeed.
 */
export async function consumeAuthToken(
  raw: string,
  type: AuthTokenType,
): Promise<ConsumedToken> {
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'invalid' };
  const tokenHash = hashToken(raw);

  const lookup = await fetch(
    `${SUPABASE_URL}/rest/v1/auth_tokens?select=id,user_id,expires_at,used_at&token_hash=eq.${tokenHash}&type=eq.${type}&limit=1`,
    { headers: headers() },
  );
  if (!lookup.ok) return { ok: false, reason: 'error' };
  const rows = (await lookup.json().catch(() => [])) as any[];
  const row = rows?.[0];
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.used_at) return { ok: false, reason: 'used' };
  if (new Date(row.expires_at).getTime() <= Date.now())
    return { ok: false, reason: 'expired' };

  const burn = await fetch(
    `${SUPABASE_URL}/rest/v1/auth_tokens?id=eq.${row.id}&used_at=is.null`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ used_at: new Date().toISOString() }),
    },
  );
  if (!burn.ok) return { ok: false, reason: 'error' };
  const burned = (await burn.json().catch(() => [])) as any[];
  // Empty array => another request burned it first.
  if (!burned?.length) return { ok: false, reason: 'used' };

  return { ok: true, userId: row.user_id };
}

export function appBaseUrl(): string {
  return (
    process.env.PUBLIC_SITE_URL ||
    process.env.APP_BASE_URL ||
    'https://buildmybot.app'
  ).replace(/\/$/, '');
}

/** Issues an email-verification token and mails the link. */
export async function sendVerificationEmail(
  userId: string,
  email: string,
  name?: string,
): Promise<{ sent: boolean; reason?: string }> {
  const { token } = await issueAuthToken(userId, 'email_verification');
  const link = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const result = await sendEmail({
    from: process.env.AUTH_FROM_EMAIL || 'no-reply@buildmybot.app',
    fromName: 'BuildMyBot',
    to: email,
    subject: 'Verify your BuildMyBot email address',
    text: [
      `${`Hi ${name || ''}`.trim()},`,
      '',
      'Please confirm your email address to activate your BuildMyBot account. This link expires in 24 hours:',
      link,
    ].join('\n'),
  });
  if (!result.sent) {
    console.error('[auth] verification email not delivered:', result.reason);
  }
  return result;
}
