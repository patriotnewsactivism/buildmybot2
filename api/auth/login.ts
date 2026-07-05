import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = 'https://evkjlnbpntimbxklnhoz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2a2psbmJwbnRpbWJ4a2xuaG96Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzIwMzAyMSwiZXhwIjoyMDkyNzc5MDIxfQ.EStJlLR_jOLxTuTSs9Ll2hoqWNnyy5tXgIkklOgoFho';
const JWT_SECRET = SUPABASE_KEY.slice(0, 32);
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
      exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.default.createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url');
    const token = `${encoded}.${signature}`;

    // Set cookie
    res.setHeader('Set-Cookie', `bmb_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`);

    // Return safe user (no password hash)
    const { password_hash, ...safeUser } = user;
    return res.json({ user: safeUser, message: 'Login successful' });
  } catch (error: any) {
    console.error('Login error:', error.message, error.stack);
    return res.status(500).json({ error: 'Login failed', detail: error.message });
  }
}
