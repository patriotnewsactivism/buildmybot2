import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const bcrypt = await import('bcryptjs');
    const hash = bcrypt.default.hashSync('test', 10);
    const valid = bcrypt.default.compareSync('test', hash);
    res.json({ ok: true, hash: hash.substring(0, 10), valid });
  } catch (err: any) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}
