import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = 'https://evkjlnbpntimbxklnhoz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2a2psbmJwbnRpbWJ4a2xuaG96Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzIwMzAyMSwiZXhwIjoyMDkyNzc5MDIxfQ.EStJlLR_jOLxTuTSs9Ll2hoqWNnyy5tXgIkklOgoFho';
const JWT_SECRET = SUPABASE_KEY.slice(0, 32);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Get session token from cookie
    const cookies = req.headers.cookie || '';
    const match = cookies.match(/bmb_session=([^;]+)/);
    if (!match) return res.status(401).json({ error: 'Not authenticated' });

    const token = match[1];
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return res.status(401).json({ error: 'Not authenticated' });

    // Verify JWT
    const crypto = await import('crypto');
    const expectedSig = crypto.default.createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url');
    if (signature !== expectedSig) return res.status(401).json({ error: 'Not authenticated' });

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
    const user = users[0];
    if (!user) return res.status(401).json({ error: 'User not found' });

    const { password_hash, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error: any) {
    console.error('Auth user error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
}
