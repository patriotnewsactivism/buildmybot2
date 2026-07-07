import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://evkjlnbpntimbxklnhoz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.SESSION_JWT_SECRET;
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
// TODO: single-source this with App.tsx's MASTER_ADMINS (currently duplicated in two places)
const MASTER_ADMINS = ['jadj19@gmail.com', 'mreardon@wtpnews.org', 'patriotnewsactivism@gmail.com'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_KEY || !JWT_SECRET) {
    console.error('[signup] FATAL: SUPABASE_SERVICE_ROLE_KEY / SESSION_JWT_SECRET not set');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

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
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Signup failed' });
  }
}
