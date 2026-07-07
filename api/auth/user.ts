import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://evkjlnbpntimbxklnhoz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.SESSION_JWT_SECRET;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_KEY || !JWT_SECRET) {
    console.error('[auth/user] FATAL: SUPABASE_SERVICE_ROLE_KEY / SESSION_JWT_SECRET not set');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    // Get session token from cookie
    const cookies = req.headers.cookie || '';
    const match = cookies.match(/bmb_session=([^;]+)/);
    if (!match) return res.status(401).json({ error: 'Not authenticated' });

    const token = match[1];
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return res.status(401).json({ error: 'Not authenticated' });

    // Verify JWT (constant-time comparison to avoid timing attacks)
    const crypto = await import('crypto');
    const expectedSig = crypto.default.createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    const sigValid = sigBuf.length === expectedBuf.length && crypto.default.timingSafeEqual(sigBuf, expectedBuf);
    if (!sigValid) return res.status(401).json({ error: 'Not authenticated' });

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ error: 'Session expired' });
    }

    // Fetch user from Supabase
    const userUrl = new URL(`${SUPABASE_URL}/rest/v1/users`);
    userUrl.searchParams.set('select', '*');
    userUrl.searchParams.set('id', `eq.${payload.sub}`);
    userUrl.searchParams.set('deleted_at', 'is.null');
    userUrl.searchParams.set('limit', '1');

    const userRes = await fetch(userUrl.toString(), {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!userRes.ok) return res.status(500).json({ error: 'Database query failed' });

    const users = await userRes.json();
    c