import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getSessionToken,
  verifyJwt,
  findUserById,
  safeUser,
} from './_shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = getSessionToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const payload = verifyJwt(token);
    if (!payload) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await findUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    return res.json(safeUser(user));
  } catch (error) {
    console.error('Auth user error:', error);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
}
