import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.SESSION_JWT_SECRET;
// Security: sessions are short-lived (24h) and are NOT persisted as a
// long-lived cookie -- no Max-Age is set on the cookie itself, so it's a
// browser-session cookie that disappears when the browser is closed. The
// JWT's own exp also caps replay of a copied cookie value at 24h even if
// the browser session somehow lives longer.
const SESSION_JWT_TTL = 24 * 60 * 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_KEY || !JWT_SECRET) {
    console.error('[login] FATAL: SUPABASE_SERVICE_ROLE_KEY / SESSION_JWT_SECRET not set');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Query Supabase for user
    const userUrl = new URL(`${SUPABASE_URL}/rest/v1/users`);
    userUrl.searchParams.set('select', '*');
    userUrl.searchParams.set('email', `eq.${email.toLowerCase()}`);
    userUrl.searchParams.set('deleted_at', 'is.null');
    userUrl.searchParams.set('limit', '1');

    const userRes = await fetch(userUrl.toString(), {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!userRes.ok) {
      console.error('Supabase error:', userRes.status, await userRes.text());
      return res.status(500).json({ error: 'Database query failed' });
    }

    const users = await userRes.json();
    const user = users[0];
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const bcrypt = await import('bcryptjs');
    const valid = await bcrypt.default.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.status === 'Suspended') {
      return res.status(403).json({ error: 'Account is suspended' });
    }

    // Update last login (fire and forget)
    fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ last_login_at: new Date().toISOString() }),
    }).catch(() => {});

    // Create JWT
    const crypto = await import('crypto');
    const payload = {
      sub: user.id,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SESSION_JWT_TTL,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.default.createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url');
    const token = `${encoded}.${signature}`;

    // Set cookie
    res.setHeader('Set-Cookie', `bmb_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/`);

    // Return safe user (no password hash)
    const { password_hash, ...safeUser } = user;
    return res.json({ user: safeUser, message: 'Login successful' });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}
