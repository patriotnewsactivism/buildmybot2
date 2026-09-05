import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { appointmentSchema, contactSchema, programSchema, smsSegments, SMS_PLANS, timezoneSchema } from '../../shared/sms.js';
import { accountFor, contactFor, enqueue, ensureAccount, runWorker, saveAppointment, type Contact } from './runtime.js';
import { authenticate, db, filter, requireLaunch, requireWorker, rpc, scoped, SmsError } from './store.js';
import { createSmsCheckout } from './billing.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const path = new URL(req.url || '/', 'https://buildmybot.app').pathname.split('/').filter(Boolean).slice(2);
    const [resource = 'account', id, action] = path;
    const body = req.body || {};
    if (resource === 'worker') {
      if (req.method !== 'POST') throw new SmsError(405, 'Method not allowed');
      requireWorker(req); requireLaunch();
      return res.json(await runWorker());
    }
    if (resource === 'booking-webhook') {
      if (req.method !== 'POST' || !id) throw new SmsError(405, 'Method not allowed');
      const [account] = await db<Array<{ tenant_key: string; booking_secret_hash: string }>>(`sms_accounts?${filter({ tenant_key: `eq.${id}`, select: 'tenant_key,booking_secret_hash' })}`);
      const token = req.headers.authorization?.replace(/^Bearer /, '') || '';
      const hash = createHash('sha256').update(token).digest('hex');
      if (!account?.booking_secret_hash || !timingSafeEqual(Buffer.from(hash), Buffer.from(account.booking_secret_hash))) throw new SmsError(401, 'Invalid booking credentials');
      return res.json(await saveAppointment(account.tenant_key, appointmentSchema.parse(body)));
    }
    const user = await authenticate(req);
    await ensureAccount(user);
    if (resource === 'account') {
      if (req.method === 'GET') return res.json({ account: await accountFor(user.tenant), plans: SMS_PLANS, launchEnabled: process.env.SMS_LAUNCH_ENABLED === 'true' });
      if (req.method === 'PATCH') {
        const input = z.object({ businessName: z.string().trim().min(1).max(160), timezone: timezoneSchema,
          spendLimit: z.number().min(0).max(1000), aiEnabled: z.boolean(), knowledgeBaseId: z.uuid().nullable().optional(),
          quietStart: z.number().int().min(9).max(19).default(9), quietEnd: z.number().int().min(10).max(20).default(20),
        }).refine(v => v.quietStart < v.quietEnd, 'Quiet-hour range is invalid').parse(body);
        if (input.knowledgeBaseId) {
          const owned = await db<unknown[]>(`business_knowledge_bases?${scoped(user.tenant, { id: `eq.${input.knowledgeBaseId}` })}`);
          if (!owned.length) throw new SmsError(404, 'Knowledge base not found');
        }
        return res.json(await db(`sms_accounts?${scoped(user.tenant)}`, 'PATCH', { business_name: input.businessName, timezone: input.timezone, spend_limit_micros: Math.round(input.spendLimit * 1000000), ai_enabled: input.aiEnabled, knowledge_base_id: input.knowledgeBaseId || null, quiet_start: input.quietStart, quiet_end: input.quietEnd }));
      }
    }
    if (resource === 'checkout' && req.method === 'POST') {
      requireLaunch();
      const { plan } = z.object({ plan: z.enum(['SMS_STARTER', 'SMS_GROWTH', 'SMS_SCALE']) }).parse(body);
      return res.json(await createSmsCheckout(user, plan));
    }
    if (resource === 'booking-secret' && req.method === 'POST') {
      const secret = randomBytes(32).toString('base64url');
      await db(`sms_accounts?${scoped(user.tenant)}`, 'PATCH', { booking_secret_hash: createHash('sha256').update(secret).digest('hex') });
      return res.json({ secret, path: `/api/sms/booking-webhook/${encodeURIComponent(user.tenant)}` });
    }
    if (resource === 'contacts') {
      if (req.method === 'GET') return res.json(await db(`sms_contacts?${scoped(user.tenant, { order: 'created_at.desc', limit: '500' })}`));
      if (req.method === 'POST') {
        const inputs = z.array(contactSchema).min(1).max(500).parse(Array.isArray(body) ? body : [body]);
        for (const c of inputs) {
          // Imports never clear STOP or overwrite existing consent history.
          await db('sms_contacts?on_conflict=tenant_key,phone', 'POST', { tenant_key: user.tenant, phone: c.phone, name: c.name, timezone: c.timezone || null, tags: c.tags, consents: c.consents, consent_source: c.consentSource, birth_month: c.birthMonth || null, birth_day: c.birthDay || null }, 'resolution=ignore-duplicates,return=minimal');
        }
        return res.status(201).json({ processed: inputs.length, note: 'Existing contacts and opt-outs were preserved' });
      }
      if (req.method === 'PATCH' && id) {
        const input = z.object({ manualTakeover: z.boolean() }).parse(body);
        await contactFor(user.tenant, id);
        await db(`sms_contacts?${scoped(user.tenant, { id: `eq.${id}` })}`, 'PATCH', { manual_takeover: input.manualTakeover });
        if (input.manualTakeover) await db(`sms_jobs?${scoped(user.tenant, { contact_id: `eq.${id}`, program_id: 'not.is.null', status: 'in.(queued,leased)' })}`, 'PATCH', { status: 'cancelled', last_error: 'Manual takeover' });
        return res.json({ updated: true });
      }
    }
    if (resource === 'programs') {
      if (req.method === 'GET') return res.json(await db(`sms_programs?${scoped(user.tenant, { order: 'created_at.desc' })}`));
      if (req.method === 'POST' || (req.method === 'PATCH' && id)) {
        const p = programSchema.parse(body);
        const a = await accountFor(user.tenant);
        if (p.status === 'active') {
          requireLaunch();
          if (!a.ready || !a.paid_until || new Date(a.paid_until) <= new Date()) throw new SmsError(402, 'Paid subscription and an approved sender are required');
          if (p.kind === 'contest' && a.campaign_usecase !== 'SWEEPSTAKES') throw new SmsError(409, 'Contests need an approved sweepstakes sender campaign');
        }
        if (id) {
          const [old] = await db<Array<{ status: string }>>(`sms_programs?${scoped(user.tenant, { id: `eq.${id}` })}`);
          if (!old) throw new SmsError(404, 'Program not found');
          if (old.status === 'active' && p.status === 'active') throw new SmsError(409, 'Pause this program before editing its approved template');
          await db(`sms_jobs?${scoped(user.tenant, { program_id: `eq.${id}`, status: 'in.(queued,leased)' })}`, 'PATCH', { status: 'cancelled', last_error: 'Program edited or paused' });
        }
        const row = { tenant_key: user.tenant, name: p.name, kind: p.kind, keyword: p.keyword || null, status: p.status, config: p };
        return res.status(id ? 200 : 201).json(await db(id ? `sms_programs?${scoped(user.tenant, { id: `eq.${id}` })}` : 'sms_programs', id ? 'PATCH' : 'POST', row));
      }
    }
    if (resource === 'appointments') {
      if (req.method === 'GET') return res.json(await db(`sms_appointments?${scoped(user.tenant, { order: 'starts_at', limit: '500' })}`));
      if (req.method === 'POST') {
        const inputs = z.array(appointmentSchema).min(1).max(500).parse(Array.isArray(body) ? body : [body]);
        const results = [];
        for (const input of inputs) results.push(await saveAppointment(user.tenant, input));
        return res.status(201).json(results);
      }
    }
    if (resource === 'contests' && id) {
      if (req.method === 'GET') return res.json({ entries: await db(`sms_contest_entries?${scoped(user.tenant, { program_id: `eq.${id}` })}`), draws: await db(`sms_contest_draws?${scoped(user.tenant, { program_id: `eq.${id}`, order: 'round.desc' })}`) });
      if (req.method === 'POST') {
        const input = z.object({ action: z.enum(['draw', 'approve', 'disqualify', 'replace']), contactId: z.uuid().optional(), reason: z.string().min(3).max(1000).optional() }).parse(body);
        return res.json(await rpc('sms_contest_action', { p_tenant: user.tenant, p_program: z.uuid().parse(id), p_action: input.action, p_contact: input.contactId || null, p_actor: user.id, p_reason: input.reason || null }));
      }
    }
    if (resource === 'inbox' && req.method === 'GET') {
      return res.json({ inbound: await db(`sms_inbound_events?${scoped(user.tenant, { order: 'received_at.desc', limit: '200' })}`), outbound: await db(`sms_jobs?${scoped(user.tenant, { order: 'created_at.desc', limit: '200' })}`) });
    }
    if (resource === 'send' && req.method === 'POST') {
      requireLaunch();
      const input = z.object({ contactId: z.uuid(), text: z.string().trim().min(1).max(1600), requestId: z.uuid() }).parse(body);
      await contactFor(user.tenant, input.contactId);
      await enqueue({ tenant: user.tenant, contactId: input.contactId, body: input.text, purpose: 'conversation', key: `manual:${input.requestId}` });
      return res.status(202).json({ queued: true, segments: smsSegments(input.text) });
    }
    throw new SmsError(404, 'SMS route not found');
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map(i => i.message).join('; ') });
    return res.status(error instanceof SmsError ? error.status : 500).json({ error: error instanceof SmsError ? error.message : 'SMS operation failed; retry or contact support' });
  }
}
