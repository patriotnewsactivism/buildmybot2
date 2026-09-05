import { createPublicKey, verify } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { normalizePhone } from '../../shared/sms.js';
import { db, filter, rpc } from './store.js';

export const config = { api: { bodyParser: false } };
export function verifyTelnyxSignature(raw: Buffer, signature: string, timestamp: string, key = process.env.TELNYX_PUBLIC_KEY || '', now = Date.now()): boolean {
  if (!/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  try {
    const decoded = Buffer.from(key, 'base64'); const sig = Buffer.from(signature, 'base64');
    if (decoded.length !== 32 || sig.length !== 64 || !raw.length) return false;
    const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), decoded]), format: 'der', type: 'spki' });
    return verify(null, Buffer.concat([Buffer.from(`${timestamp}|`), raw]), publicKey, sig);
  } catch { return false; }
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyTelnyxSignature(raw, String(req.headers['telnyx-signature-ed25519'] || ''), String(req.headers['telnyx-timestamp'] || ''))) return res.status(401).json({ error: 'Invalid webhook signature' });
  try {
    const event = z.object({ data: z.object({ id: z.string().min(1), event_type: z.string(), occurred_at: z.iso.datetime({ offset: true }), payload: z.record(z.string(), z.unknown()) }) }).parse(JSON.parse(raw.toString()));
    const payload = event.data.payload;
    if (event.data.event_type === 'message.received') {
      const inbound = z.object({ from: z.object({ phone_number: z.string() }), to: z.array(z.object({ phone_number: z.string() })).min(1), text: z.string().max(16000), direction: z.literal('inbound') }).parse(payload);
      const result = await rpc('sms_receive', { p_event: event.data.id, p_sender: normalizePhone(inbound.to[0].phone_number), p_phone: normalizePhone(inbound.from.phone_number), p_body: inbound.text });
      return res.json(result);
    }
    if (event.data.event_type === 'message.finalized') {
      const finalized = z.object({ id: z.string(), to: z.array(z.object({ status: z.string() })).min(1) }).parse(payload);
      const status = finalized.to[0].status;
      await db(`sms_jobs?${filter({ provider_message_id: `eq.${finalized.id}`, status: 'not.in.(delivered,delivery_failed)' })}`, 'PATCH', { status: status === 'delivered' ? 'delivered' : 'delivery_failed', delivered_at: status === 'delivered' ? event.data.occurred_at : null, updated_at: event.data.occurred_at, last_error: status === 'delivered' ? null : status });
    }
    return res.json({ received: true });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return res.status(400).json({ error: 'Malformed messaging event' });
    return res.status(503).json({ error: 'Event persistence unavailable; retry delivery' });
  }
}
