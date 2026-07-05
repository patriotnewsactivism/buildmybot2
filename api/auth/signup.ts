import type { VercelRequest, VercelResponse } from '@vercel/node';
import { v4 as uuidv4 } from 'uuid';
import {
  findUserByEmail,
  createUser,
  hashPassword,
  createJwt,
  setSessionCookie,
  safeUser,
  isMasterAdmin,
} from './_shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password, name, companyName, referredBy } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user already exists
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await hashPassword(password);
    const admin = isMasterAdmin(email);

    const user = await createUser({
      id: uuidv4(),
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      password_hash: passwordHash,
      role: admin ? 'ADMIN' : 'OWNER',
      plan: admin ? 'ENTERPRISE' : 'FREE',
      status: 'Active',
      company_name: companyName || null,
      referred_by: referredBy || null,
    });

    // Create JWT and set cookie
    const token = createJwt(user.id);
    setSessionCookie(res, token);

    return res
      .status(201)
      .json({ user: safeUser(user), message: 'Account created successfully' });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Signup failed' });
  }
}
