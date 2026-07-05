import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  findUserByEmail,
  verifyPassword,
  updateLastLogin,
  createJwt,
  setSessionCookie,
  safeUser,
} from './_shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await findUserByEmail(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.status === 'Suspended') {
      return res.status(403).json({ error: 'Account is suspended' });
    }

    // Update last login (fire and forget)
    updateLastLogin(user.id).catch(() => {});

    // Create JWT and set cookie
    const token = createJwt(user.id);
    setSessionCookie(res, token);

    return res.json({ user: safeUser(user), message: 'Login successful' });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}
