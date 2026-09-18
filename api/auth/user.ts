import type { ApiRequest, ApiResponse } from '../lib/http-types.js';
import { pgSelect } from '../lib/postgres-store.js';
const JWT_SECRET = process.env.SESSION_JWT_SECRET;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET')
    return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.DATABASE_URL || !JWT_SECRET) {
    console.error(
      '[auth/user] FATAL: DATABASE_URL / SESSION_JWT_SECRET not set',
    );
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    // Get session token from cookie
    const cookies = req.headers.cookie || '';
    const match = cookies.match(/bmb_session=([^;]+)/);
    if (!match) return res.status(401).json({ error: 'Not authenticated' });

    const token = match[1];
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature)
      return res.status(401).json({ error: 'Not authenticated' });

    // Verify JWT (constant-time comparison to avoid timing attacks)
    const crypto = await import('node:crypto');
    const expectedSig = crypto.default
      .createHmac('sha256', JWT_SECRET)
      .update(encoded)
      .digest('base64url');
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    const sigValid =
      sigBuf.length === expectedBuf.length &&
      crypto.default.timingSafeEqual(sigBuf, expectedBuf);
    if (!sigValid) return res.status(401).json({ error: 'Not authenticated' });

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const users = await pgSelect<any>('users', '*', {
      id: `eq.${payload.sub}`,
      deleted_at: 'is.null',
      limit: '1',
    });
    const user = users[0];
    if (!user) return res.status(401).json({ error: 'User not found' });

    const { password_hash, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error: any) {
    console.error('Auth user error:', error);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
}
