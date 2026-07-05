/**
 * Shared auth utilities for Vercel serverless functions.
 * Replaces Express session auth with JWT-in-cookie auth.
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// ─── Supabase config ──────────────────────────────────────────
const SUPABASE_URL = 'https://evkjlnbpntimbxklnhoz.supabase.co';
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2a2psbmJwbnRpbWJ4a2xuaG96Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzIwMzAyMSwiZXhwIjoyMDkyNzc5MDIxfQ.EStJlLR_jOLxTuTSs9Ll2hoqWNnyy5tXgIkklOgoFho';

// JWT secret — derived from Supabase service key
const JWT_SECRET = SUPABASE_SERVICE_KEY.slice(0, 32);
const COOKIE_NAME = 'bmb_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// ─── Types ────────────────────────────────────────────────────
export interface DbUser {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  role: string;
  plan: string;
  company_name: string | null;
  status: string;
  organization_id: string | null;
  avatar_url: string | null;
  referred_by: string | null;
  last_login_at: string | null;
  deleted_at: string | null;
  created_at: string;
  preferences: Record<string, unknown>;
}

// ─── Supabase REST helpers ────────────────────────────────────
async function supabaseSelect(
  table: string,
  params: Record<string, string>,
): Promise<any[]> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase select failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function supabaseInsert(
  table: string,
  data: Record<string, unknown>,
): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Supabase insert failed: ${res.status} ${await res.text()}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function supabaseUpdate(
  table: string,
  data: Record<string, unknown>,
  filter: string,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Supabase update failed: ${res.status} ${await res.text()}`);
  }
}

// ─── User queries ─────────────────────────────────────────────
export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const rows = await supabaseSelect('users', {
    select: '*',
    email: `eq.${email.toLowerCase()}`,
    deleted_at: 'is.null',
    limit: '1',
  });
  return rows[0] || null;
}

export async function findUserById(id: string): Promise<DbUser | null> {
  const rows = await supabaseSelect('users', {
    select: '*',
    id: `eq.${id}`,
    deleted_at: 'is.null',
    limit: '1',
  });
  return rows[0] || null;
}

export async function createUser(data: {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  plan: string;
  status: string;
  company_name: string | null;
  referred_by: string | null;
}): Promise<DbUser> {
  return supabaseInsert('users', {
    ...data,
    preferences: {},
    referral_credits: 0,
    reseller_client_count: 0,
    whitelabel_enabled: false,
    created_at: new Date().toISOString(),
  });
}

export async function updateLastLogin(userId: string): Promise<void> {
  await supabaseUpdate(
    'users',
    { last_login_at: new Date().toISOString() },
    `id=eq.${userId}`,
  );
}

// ─── Password ─────────────────────────────────────────────────
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

// ─── JWT ──────────────────────────────────────────────────────
export function createJwt(userId: string): string {
  const payload = {
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyJwt(token: string): { sub: string; exp: number } | null {
  try {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;

    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(encoded)
      .digest('base64url');

    if (signature !== expectedSig) return null;

    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString(),
    ) as { sub: string; exp: number };

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ─── Cookie helpers ───────────────────────────────────────────
export function setSessionCookie(
  res: { setHeader: (k: string, v: string | string[]) => void },
  token: string,
): void {
  const cookie = `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`;
  res.setHeader('Set-Cookie', cookie);
}

export function clearSessionCookie(
  res: { setHeader: (k: string, v: string | string[]) => void },
): void {
  const cookie = `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
  res.setHeader('Set-Cookie', cookie);
}

export function getSessionToken(req: {
  headers: { cookie?: string };
}): string | null {
  const cookies = req.headers.cookie || '';
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

// ─── Safe user (no password hash) ─────────────────────────────
export function safeUser(user: DbUser) {
  const { password_hash, ...safe } = user;
  return safe;
}

// ─── Master admin emails ──────────────────────────────────────
const MASTER_ADMIN_EMAILS = [
  'jadj19@gmail.com',
  'mreardon@wtpnews.org',
  'patriotnewsactivism@gmail.com',
];

export function isMasterAdmin(email: string): boolean {
  return MASTER_ADMIN_EMAILS.includes(email.toLowerCase());
}

export { COOKIE_NAME };
