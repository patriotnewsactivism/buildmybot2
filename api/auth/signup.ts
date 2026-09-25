import { sendVerificationEmail } from '../lib/auth-tokens.js';
import type { ApiRequest, ApiResponse } from '../lib/http-types.js';
import { RATE_LIMITS, enforceRateLimit } from '../lib/rate-limit.js';
import {
  buildSignupUserInsert,
  omitColumn,
  postgrestMissingColumn,
} from './signup-insert.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.SESSION_JWT_SECRET;
// Security: sessions are short-lived (24h) and are NOT persisted as a
// long-lived cookie -- no Max-Age is set on the cookie itself, so it's a
// browser-session cookie that disappears when the browser is closed. The
// JWT's own exp also caps replay of a copied cookie value at 24h even if
// the browser session somehow lives longer.
const SESSION_JWT_TTL = 24 * 60 * 60;
// SECURITY (P0): signup used to promote three hard-coded email addresses to
// role ADMIN + plan ENTERPRISE. Anyone who could receive mail at (or spoof a
// signup for) one of those addresses got platform-wide admin, and the list
// was duplicated in the client bundle where it was publicly readable.
// Self-service signup now ALWAYS creates a plain customer account; staff
// access is granted out-of-band by an existing platform admin
// (scripts/setAdminPermissions.ts) against the database.

const LOOKUP_FAILED = {
  error: 'Could not verify whether this email is already registered',
};

function supabaseHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SUPABASE_KEY || '',
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

async function insertUser(row: Record<string, unknown>) {
  return fetch(`${SUPABASE_URL}/rest/v1/users`, {
    method: 'POST',
    headers: supabaseHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }),
    body: JSON.stringify(row),
  });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_KEY || !JWT_SECRET) {
    console.error(
      '[signup] FATAL: SUPABASE_SERVICE_ROLE_KEY / SESSION_JWT_SECRET not set',
    );
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    if (enforceRateLimit(req, res, RATE_LIMITS.signup)) return;
    const { email, password, name, companyName, referredBy } = req.body || {};
    if (!email || !password || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user exists. A failed lookup must not be treated as "no row":
    // PostgREST error bodies are objects, and reading [0] off them used to
    // fall through into the insert and surface later as a generic 500.
    const checkUrl = new URL(`${SUPABASE_URL}/rest/v1/users`);
    checkUrl.searchParams.set('select', 'id');
    checkUrl.searchParams.set('email', `eq.${email.toLowerCase()}`);
    checkUrl.searchParams.set('limit', '1');

    const checkRes = await fetch(checkUrl.toString(), {
      headers: supabaseHeaders(),
    });
    const checkBody = await checkRes.text();
    if (!checkRes.ok) {
      console.error(
        '[signup] existing-user lookup failed:',
        checkRes.status,
        checkBody,
      );
      return res.status(502).json(LOOKUP_FAILED);
    }
    let existing: unknown;
    try {
      existing = JSON.parse(checkBody);
    } catch {
      console.error('[signup] existing-user lookup returned non-JSON');
      return res.status(502).json(LOOKUP_FAILED);
    }
    if (!Array.isArray(existing)) {
      console.error(
        '[signup] existing-user lookup returned an unexpected payload',
      );
      return res.status(502).json(LOOKUP_FAILED);
    }
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash(password, 12);

    // Generate UUID
    const crypto = await import('node:crypto');
    const userId = crypto.default.randomUUID();

    // Create user. Prefer an explicit email_verified=false so new accounts
    // stay unverified once the column exists. If PostgREST has not learned
    // the column yet (migration not applied, or schema cache stale), retry
    // once without it. The migration default is false, and verification
    // still sets the column when the caller confirms.
    let row = buildSignupUserInsert({
      id: userId,
      email,
      passwordHash,
      name: typeof name === 'string' ? name : null,
      companyName: typeof companyName === 'string' ? companyName : null,
      referredBy: typeof referredBy === 'string' ? referredBy : null,
    });
    let createRes = await insertUser(row);
    if (!createRes.ok) {
      const errText = await createRes.text();
      if (
        postgrestMissingColumn(createRes.status, errText) === 'email_verified'
      ) {
        console.warn(
          '[signup] users.email_verified is absent from the schema cache; retrying insert without it',
        );
        row = omitColumn(row, 'email_verified');
        createRes = await insertUser(row);
        if (!createRes.ok) {
          console.error(
            '[signup] create user failed after schema-cache retry:',
            createRes.status,
            await createRes.text(),
          );
          return res.status(500).json({ error: 'Failed to create account' });
        }
      } else {
        console.error(
          '[signup] create user failed:',
          createRes.status,
          errText,
        );
        return res.status(500).json({ error: 'Failed to create account' });
      }
    }

    const created: unknown = await createRes.json();
    const newUser = Array.isArray(created) ? created[0] : null;
    if (!newUser || typeof newUser !== 'object') {
      console.error('[signup] create user returned an unexpected payload');
      return res.status(500).json({ error: 'Failed to create account' });
    }

    // Create JWT
    const payload = {
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SESSION_JWT_TTL,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.default
      .createHmac('sha256', JWT_SECRET)
      .update(encoded)
      .digest('base64url');
    const token = `${encoded}.${signature}`;

    res.setHeader(
      'Set-Cookie',
      `bmb_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/`,
    );

    // Send the verification email. Signup itself still succeeds if the
    // mail provider is down or auth_tokens does not exist yet — the account
    // is simply left unverified and the user can request a new link from
    // /api/auth/resend-verification once the migration is applied.
    let verificationSent = false;
    try {
      const result = await sendVerificationEmail(
        userId,
        email.toLowerCase(),
        typeof name === 'string' ? name : undefined,
      );
      verificationSent = result.sent;
    } catch (err) {
      console.error('[signup] verification email failed:', err);
    }

    const safeUser = omitColumn(
      newUser as Record<string, unknown>,
      'password_hash',
    );
    return res.status(201).json({
      user: safeUser,
      emailVerified: false,
      verificationSent,
      message: 'Account created successfully. Please verify your email.',
    });
  } catch (error: unknown) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Signup failed' });
  }
}
