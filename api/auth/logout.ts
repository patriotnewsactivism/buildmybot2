import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearSessionCookie } from './_shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  clearSessionCookie(res);
  return res.json({ message: 'Logged out successfully' });
}
