import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';

export class SmsError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export interface SmsUser { id: string; organizationId: string | null; tenant: string; role: string; }
export async function db<T = unknown>(path: string, method = 'GET', body?: unknown, prefer = 'return=representation'): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new SmsError(503, 'Database is not configured');
  const response = await fetch(`${url}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: prefer }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    if (response.status === 409) throw new SmsError(409, 'This record or keyword already exists');
    throw new SmsError(503, `Database operation failed (${response.status})`);
  }
  const value = await response.text();
  return (value ? JSON.parse(value) : null) as T;
}
export const filter = (values: Record<string, string>) => new URLSearchParams(values).toString();
export const scoped = (tenant: string, values: Record<string, string> = {}) => filter({ tenant_key: `eq.${tenant}`, ...values });
export const rpc = <T = unknown>(name: string, args: unknown) => db<T>(`rpc/${name}`, 'POST', args);

export async function authenticate(req: VercelRequest): Promise<SmsUser> {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret) throw new SmsError(503, 'Authentication is not configured');
  let token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  try {
    if (!token) {
      const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(c => { const [k, ...v] = c.trim().split('='); return [k, decodeURIComponent(v.join('='))]; }));
      token = cookies.bmb_session || cookies.session || '';
    }
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) throw new Error('Invalid token');
    const expected = createHmac('sha256', secret).update(payload).digest('base64url');
    if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new Error('Invalid token');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof claims.sub !== 'string' || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) throw new Error('Expired token');
    // Login tokens carry only sub. Resolve current tenancy from the database,
    // never from an unverified browser organization selector or stale JWT org.
    const users = await db<Array<{ id: string; organization_id: string | null; role: string }>>(`users?${filter({ id: `eq.${claims.sub}`, select: 'id,organization_id,role', limit: '1' })}`);
    const user = users[0];
    if (!user) throw new Error('Unknown user');
    return { id: user.id, organizationId: user.organization_id, tenant: user.organization_id ? `org:${user.organization_id}` : `user:${user.id}`, role: user.role };
  } catch (error) {
    if (error instanceof SmsError) throw error;
    throw new SmsError(401, 'Authentication required');
  }
}

export function requireWorker(req: VercelRequest) {
  const expected = process.env.SMS_WORKER_SECRET;
  const received = req.headers.authorization?.replace(/^Bearer /, '') || '';
  if (!expected || received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) throw new SmsError(401, 'Worker authentication required');
}
export function requireLaunch() {
  if (process.env.SMS_LAUNCH_ENABLED !== 'true') throw new SmsError(503, 'SMS activation is awaiting production verification');
}
