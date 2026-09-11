import type { ApiRequest, ApiResponse } from '../lib/http-types.js';
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader(
    'Set-Cookie',
    'bmb_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
  );
  return res.json({ message: 'Logged out successfully' });
}
