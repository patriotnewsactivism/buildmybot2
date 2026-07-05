import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = 'https://evkjlnbpntimbxklnhoz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2a2psbmJwbnRpbWJ4a2xuaG96Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzIwMzAyMSwiZXhwIjoyMDkyNzc5MDIxfQ.EStJlLR_jOLxTuTSs9Ll2hoqWNnyy5tXgIkklOgoFho';
const JWT_SECRET = SUPABASE_KEY.slice(0, 32);
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const MASTER_ADMINS = ['jadj19@gmail.com', 'mreardon@wtpnews.org', 'patriotnewsactivism@gmail.com'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password, name, companyName, referredBy } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user exists
    const checkUrl = new URL(`${SUPABASE_URL}/rest/v1/users`);
    checkUrl.searchParams.set('select', 'id');
    checkUrl.searchParams.set('email', `eq.${email.toLowerCase()}`);
    checkUrl.searchParams.set('limit', '1');

    const checkRes = await fetch(checkUrl.toString(), {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const existing = await checkRes.json();
    if (existing[0]) return res.status(409).json({ error: 'Email already registered' });

    // Hash password
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash(password, 12);

    // Generate UUID
    const crypto = await import('crypto');
    const userId = crypto.default.randomUUID();

    const isAdmin = MASTER_ADMINS.includes(email.toLowerCase());

    // Create user
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        id: userId,
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        password_hash: passwordHash,
        role: isAdmin ? 'ADMIN' : 'OWNER',
        plan: isAdmin ? 'ENTERPRISE' : 'FREE',
        status: 'Active',
        company_name: companyName || null,
        referred_by: referredBy || null,
        preferences: {},
        referral_credits: 0,
        reseller_client_count: 0,
        whitelabel_enabled: false,
        created_at: new Date().toISOString(),
      }),
    });

    if (!createRes.ok) {
      console.error('Create user failed:', createRes.status, await createRes.text());
      return res.status(500).json({ error: 'Failed to create account' });
    }

    const newUser = (await createRes.json())[0];

    // Create JWT
    const payload = {
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.default.createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url');
    const token = `${encoded}.${signature}`;

    res.setHeader('Set-Cookie', `bmb_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`);

    const { password_hash, ...safeUser } = newUser;
    return res.status(201).json({ user: safeUser, message: 'Account created successfully' });
  } catch (error: any) {
    console.error('Signup error:', error.message);
    return res.status(500).json({ error: 'Signup failed' });
  }
}
