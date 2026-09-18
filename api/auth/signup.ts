import type { ApiRequest, ApiResponse } from '../lib/http-types.js';
import { sendVerificationEmail } from '../lib/auth-tokens.js';
import { RATE_LIMITS, enforceRateLimit } from '../lib/rate-limit.js';
import { pgInsert, pgSelect } from '../lib/postgres-store.js';

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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.DATABASE_URL || !JWT_SECRET) {
    console.error(
      '[signup] FATAL: DATABASE_URL / SESSION_JWT_SECRET not set',
    );
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    if (enforceRateLimit(req, res, RATE_LIMITS.signup)) return;
    const { email, password, name, companyName, referredBy } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existing = await pgSelect<any>('users', 'id', {
      email: `eq.${email.toLowerCase()}`,
      limit: '1',
    });
    if (existing[0])
      return res.status(409).json({ error: 'Email already registered' });

    // Hash password
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash(password, 12);

    // Generate UUID
    const crypto = await import('node:crypto');
    const userId = crypto.default.randomUUID();

    // Create user in Neon/Postgres.
    const createdUsers = await pgInsert<any>('users', {
      id: userId,
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      password_hash: passwordHash,
      role: 'OWNER',
      plan: 'FREE',
      status: 'Active',
      company_name: companyName || null,
      referred_by: referredBy || null,
      preferences: {},
      email_verified: false,
      referral_credits: 0,
      reseller_client_count: 0,
      whitelabel_enabled: false,
      created_at: new Date().toISOString(),
    });
    const newUser = createdUsers[0];

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
    // mail provider is down — the account is simply left unverified and
    // the user can request a new link from /api/auth/resend-verification.
    let verificationSent = false;
    try {
      const result = await sendVerificationEmail(
        userId,
        email.toLowerCase(),
        name,
      );
      verificationSent = result.sent;
    } catch (err) {
      console.error('[signup] verification email failed:', err);
    }

    const { password_hash, ...safeUser } = newUser;
    return res.status(201).json({
      user: safeUser,
      emailVerified: false,
      verificationSent,
      message: 'Account created successfully. Please verify your email.',
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Signup failed' });
  }
}
