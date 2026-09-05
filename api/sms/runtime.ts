import { randomUUID } from 'node:crypto';
import { birthdayDate, localParts, nextSendTime, normalizePhone, renderSms, smsSegments, type SmsProgram, type SmsPurpose } from '../../shared/sms.js';
import { sendSms } from '../lib/telephony-provider.js';
import { db, filter, rpc, scoped, SmsError, type SmsUser } from './store.js';

export interface Account {
  tenant_key: string; user_id: string; organization_id: string | null; business_name: string; timezone: string;
  sender: string | null; messaging_profile_id: string | null; campaign_id: string | null; campaign_usecase: string | null;
  ready: boolean; ai_enabled: boolean; knowledge_base_id: string | null; plan_key: string | null; paid_until: string | null;
  quiet_start: number; quiet_end: number; included_segments: number; used_segments: number;
  spend_limit_micros: number; overage_used_micros: number; subscription_id: string | null;
}
export interface Contact {
  id: string; tenant_key: string; phone: string; name: string; timezone: string | null; tags: string[];
  consents: SmsPurpose[]; suppressed: boolean; manual_takeover: boolean; birth_month: number | null; birth_day: number | null;
  enrollment_state: { kind: 'birthday' | 'contest'; programId: string } | null;
}
export interface Program { id: string; tenant_key: string; kind: SmsProgram['kind']; status: string; version: number; config: SmsProgram; }
export interface Job { id: string; tenant_key: string; contact_id: string; program_id: string | null; appointment_id: string | null; purpose: SmsPurpose | 'system'; body: string; lease_token: string; attempts: number; }
interface Inbound { id: string; tenant_key: string; contact_id: string; body: string; lease_token: string; }

export async function accountFor(tenant: string): Promise<Account> {
  const [account] = await db<Account[]>(`sms_accounts?${scoped(tenant)}`);
  if (!account) throw new SmsError(404, 'Complete SMS setup first');
  return account;
}
export async function ensureAccount(user: SmsUser) {
  await db('sms_accounts?on_conflict=tenant_key', 'POST', { tenant_key: user.tenant, user_id: user.id, organization_id: user.organizationId }, 'resolution=ignore-duplicates,return=minimal');
  return accountFor(user.tenant);
}
export async function contactFor(tenant: string, id: string) {
  const [contact] = await db<Contact[]>(`sms_contacts?${scoped(tenant, { id: `eq.${id}` })}`);
  if (!contact) throw new SmsError(404, 'Contact not found');
  return contact;
}
export async function enqueue(input: { tenant: string; contactId: string; body: string; purpose: SmsPurpose | 'system'; key: string; due?: Date; programId?: string; appointmentId?: string }) {
  if (!input.body.trim() || smsSegments(input.body) > 30) throw new SmsError(400, 'Message is empty or too long');
  return db('sms_jobs?on_conflict=tenant_key,dedupe_key', 'POST', {
    tenant_key: input.tenant, contact_id: input.contactId, body: input.body,
    purpose: input.purpose, dedupe_key: input.key, due_at: (input.due || new Date()).toISOString(),
    program_id: input.programId || null, appointment_id: input.appointmentId || null,
  }, 'resolution=ignore-duplicates,return=minimal');
}
function fields(a: Account, c: Contact) { return { name: c.name, first_name: c.name.split(' ')[0], business: a.business_name, phone: c.phone }; }
export async function schedulePrograms(now = new Date()) {
  const programs = await db<Program[]>('sms_programs?status=eq.active&order=created_at&limit=500');
  for (const p of programs) {
    const a = await accountFor(p.tenant_key);
    if (!a.paid_until || new Date(a.paid_until) <= now) continue;
    if (p.kind === 'contest' && p.config.closesAt && new Date(p.config.closesAt) <= now) {
      await rpc('sms_contest_action', { p_tenant: p.tenant_key, p_program: p.id, p_action: 'draw', p_contact: null, p_actor: null, p_reason: null });
      continue;
    }
    if (p.kind !== 'campaign' && p.kind !== 'birthday') continue;
    for (let offset = 0; ; offset += 500) {
      const contacts = await db<Contact[]>(`sms_contacts?${scoped(p.tenant_key, { suppressed: 'eq.false', order: 'id', limit: '500', offset: String(offset) })}`);
      for (const c of contacts) {
        if (p.config.tag && !c.tags.includes(p.config.tag)) continue;
        const timezone = c.timezone || a.timezone;
        let due = new Date(p.config.scheduledAt || now);
        let key = `campaign:${p.id}:${c.id}`;
        const purpose = p.kind === 'birthday' ? 'birthday' : 'marketing';
        if (!c.consents.includes(purpose)) continue;
        if (p.kind === 'birthday') {
          if (!c.birth_month || !c.birth_day) continue;
          const local = localParts(now, timezone);
          due = birthdayDate(local.year, c.birth_month, c.birth_day, timezone);
          const birth = localParts(due, timezone);
          // No late birthday backfill after an outage or a new import.
          if (local.month !== birth.month || local.day !== birth.day) continue;
          key = `birthday:${c.id}:${local.year}`;
        }
        due = nextSendTime(due < now ? now : due, timezone, a.quiet_start, a.quiet_end);
        await enqueue({ tenant: p.tenant_key, contactId: c.id, body: renderSms(p.config.text, fields(a, c)), purpose, key, due, programId: p.id });
      }
      if (contacts.length < 500) break;
    }
  }
}

export async function scheduleAppointments(now = new Date()) {
  for (let offset = 0; ; offset += 200) {
    const rows = await db<Array<{ id: string; tenant_key: string; contact_id: string; starts_at: string; version: number; timezone: string; config: { offsets: number[]; text: string } }>>(`sms_appointments?${filter({ status: 'in.(scheduled,confirmed)', starts_at: `gt.${now.toISOString()}`, order: 'id', limit: '200', offset: String(offset) })}`);
    for (const appointment of rows) {
      const a = await accountFor(appointment.tenant_key);
      const c = await contactFor(appointment.tenant_key, appointment.contact_id);
      if (!c.consents.includes('appointment') || c.suppressed) continue;
      for (const minutes of appointment.config.offsets) {
        const due = new Date(new Date(appointment.starts_at).getTime() - minutes * 60000);
        if (due < now) continue;
        const appointmentTime = new Intl.DateTimeFormat('en-US', { timeZone: appointment.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(appointment.starts_at));
        await enqueue({ tenant: a.tenant_key, contactId: c.id, purpose: 'appointment', body: renderSms(appointment.config.text, { ...fields(a, c), appointment_time: appointmentTime }), key: `appointment:${appointment.id}:${appointment.version}:${minutes}`, due, appointmentId: appointment.id });
      }
    }
    if (rows.length < 200) break;
  }
}

async function reply(event: Inbound, body: string, purpose: SmsPurpose | 'system' = 'system', programId?: string, suffix = 'reply') {
  await enqueue({ tenant: event.tenant_key, contactId: event.contact_id, body, purpose, key: `inbound:${event.id}:${suffix}`, programId });
}
async function patchContact(c: Contact, values: Record<string, unknown>) {
  await db(`sms_contacts?${scoped(c.tenant_key, { id: `eq.${c.id}` })}`, 'PATCH', values);
}
export async function handleInbound(event: Inbound) {
  const a = await accountFor(event.tenant_key);
  const c = await contactFor(event.tenant_key, event.contact_id);
  const keyword = event.body.trim().toUpperCase();
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(keyword)) {
    // Telnyx Advanced Opt-Out sends the carrier confirmation. Sending another
    // one here would duplicate it and may be blocked by the sender profile.
    return;
  }
  if (['HELP', 'INFO'].includes(keyword)) {
    await reply(event, `${a.business_name}: contact the business for help. Reply STOP to stop texts.`); return;
  }
  if (['START', 'YES', 'SUBSCRIBE'].includes(keyword)) {
    // Re-enable conversational service, never silently restore marketing,
    // birthday, or reminder consent withdrawn by STOP.
    await patchContact(c, { suppressed: false, consents: [...new Set([...c.consents, 'conversation'])], consent_source: `inbound:${event.id}`, consent_at: new Date().toISOString() });
    await reply(event, `${a.business_name}: conversational texts resumed. Join each club separately for offers. Reply STOP to stop.`); return;
  }
  if (c.suppressed || c.manual_takeover) return;
  if (c.enrollment_state) {
    const [p] = await db<Program[]>(`sms_programs?${scoped(a.tenant_key, { id: `eq.${c.enrollment_state.programId}`, status: 'eq.active' })}`);
    if (!p) { await patchContact(c, { enrollment_state: null }); return; }
    if (c.enrollment_state.kind === 'birthday') {
      const match = event.body.trim().match(/^(\d{1,2})[/-](\d{1,2})$/);
      if (match) {
        const month = Number(match[1]); const day = Number(match[2]);
        try { birthdayDate(2000, month, day, a.timezone); } catch { await reply(event, 'Please send a valid birthday as MM/DD.'); return; }
        await patchContact(c, { birth_month: month, birth_day: day, consents: [...new Set([...c.consents, 'birthday'])], enrollment_state: null, consent_source: `birthday enrollment:${event.id}`, consent_at: new Date().toISOString() });
        await reply(event, `${a.business_name}: you joined the birthday club! Expect one birthday message each year. Reply STOP to stop.`);
      } else await reply(event, 'To join the birthday club, reply with your birthday as MM/DD. No year needed. Reply STOP to stop.');
      return;
    }
    if (keyword === 'ENTER') {
      const result = await rpc<{ entered?: boolean; duplicate?: boolean; closed?: boolean }>('sms_contest_action', { p_tenant: a.tenant_key, p_program: p.id, p_action: 'enter', p_contact: c.id, p_actor: null, p_reason: null });
      await patchContact(c, { enrollment_state: null, consents: [...new Set([...c.consents, 'contest'])], consent_source: `contest entry:${event.id}`, consent_at: new Date().toISOString() });
      await reply(event, result.closed ? 'This contest is closed.' : result.duplicate ? 'Your entry is already recorded.' : `${a.business_name}: entry confirmed. Rules: ${p.config.rulesUrl}. Entry does not subscribe you to marketing.`);
    } else await reply(event, `Reply ENTER to confirm you meet the eligibility rules and enter: ${p.config.rulesUrl}`);
    return;
  }
  if (['CONFIRM', 'RESCHEDULE'].includes(keyword)) {
    const appointments = await db<Array<{ id: string }>>(`sms_appointments?${scoped(a.tenant_key, { contact_id: `eq.${c.id}`, status: 'in.(scheduled,confirmed)', starts_at: `gt.${new Date().toISOString()}`, order: 'starts_at', limit: '2' })}`);
    if (appointments.length === 1) {
      await db(`sms_appointments?${scoped(a.tenant_key, { id: `eq.${appointments[0].id}` })}`, 'PATCH', { request: keyword === 'CONFIRM' ? 'confirmation_requested' : 'reschedule_requested' });
      await reply(event, `${a.business_name}: your ${keyword === 'CONFIRM' ? 'confirmation' : 'rescheduling'} request is saved for the team. Your booking has not been changed.`);
    } else await reply(event, 'Please tell the team which appointment you mean. Your request is in the inbox.');
    return;
  }
  const programs = await db<Program[]>(`sms_programs?${scoped(a.tenant_key, { status: 'eq.active', order: 'created_at' })}`);
  const p = programs.find(p => p.config.keyword === keyword);
  if (p) {
    if (p.kind === 'birthday') {
      await patchContact(c, { enrollment_state: { kind: 'birthday', programId: p.id } });
      await reply(event, `${a.business_name} birthday club: reply MM/DD to opt in to one annual birthday offer. Message/data rates may apply. Reply STOP to stop.`); return;
    }
    if (p.kind === 'contest') {
      const now = new Date().toISOString();
      if (!p.config.opensAt || !p.config.closesAt || now < p.config.opensAt || now >= p.config.closesAt) { await reply(event, 'This contest is not open.'); return; }
      await patchContact(c, { enrollment_state: { kind: 'contest', programId: p.id } });
      await reply(event, `${p.config.prize}. Eligibility: ${p.config.eligibility}. Rules: ${p.config.rulesUrl}. Free entry: ${p.config.entryUrl}. Reply ENTER to attest eligibility and enter. No marketing subscription.`); return;
    }
    // A configured promotional keyword represents the disclosed keyword CTA.
    // Its confirmation is a reply; timed marketing requires separately stored consent.
    await reply(event, renderSms(p.config.text, fields(a, c)), 'conversation', p.id);
    if (p.kind === 'sequence' && c.consents.includes('marketing')) {
      let elapsed = 0;
      for (const [index, step] of p.config.steps.entries()) {
        elapsed += step.delayMinutes;
        const due = nextSendTime(new Date(Date.now() + elapsed * 60000), c.timezone || a.timezone, a.quiet_start, a.quiet_end);
        await enqueue({ tenant: a.tenant_key, contactId: c.id, purpose: 'marketing', body: renderSms(step.text, fields(a, c)), key: `sequence:${p.id}:${event.id}:${index}`, programId: p.id, due });
      }
    }
    return;
  }
  const prior = await db<Inbound[]>(`sms_inbound_events?${scoped(a.tenant_key, { contact_id: `eq.${c.id}`, order: 'received_at', limit: '2' })}`);
  const local = localParts(new Date(), a.timezone);
  const auto = (local.hour < a.quiet_start || local.hour >= a.quiet_end) ? programs.find(p => p.kind === 'after_hours') : prior.length === 1 ? programs.find(p => p.kind === 'welcome') : undefined;
  if (auto) {
    await enqueue({ tenant: a.tenant_key, contactId: c.id, purpose: 'conversation', body: renderSms(auto.config.text, fields(a, c)), key: `${auto.kind}:${c.id}:${local.year}-${local.month}-${local.day}`, programId: auto.id }); return;
  }
  if (a.ai_enabled && a.knowledge_base_id) {
    const { answerBusinessSms } = await import('../knowledge/business.js');
    const answer = await answerBusinessSms(a.tenant_key, a.knowledge_base_id, event.body);
    await reply(event, answer, 'conversation');
  }
}

export async function runWorker() {
  const inbound = await rpc<Inbound[]>('sms_claim_inbound', {});
  for (const event of inbound) {
    await handleInbound(event);
    await db(`sms_inbound_events?${filter({ id: `eq.${event.id}`, lease_token: `eq.${event.lease_token}` })}`, 'PATCH', { status: 'processed' });
  }
  await schedulePrograms();
  await scheduleAppointments();
  const jobs = await rpc<Job[]>('sms_claim_jobs', { p_limit: 20 });
  let accepted = 0;
  for (const job of jobs) {
    const a = await accountFor(job.tenant_key);
    const c = await contactFor(job.tenant_key, job.contact_id);
    if (['marketing', 'birthday'].includes(job.purpose)) {
      const now = new Date(); const due = nextSendTime(now, c.timezone || a.timezone, a.quiet_start, a.quiet_end);
      if (due > now) { await db(`sms_jobs?${filter({ id: `eq.${job.id}`, lease_token: `eq.${job.lease_token}` })}`, 'PATCH', { status: 'queued', due_at: due.toISOString(), attempts: 0 }); continue; }
    }
    const prepared = await rpc<{ ok: boolean; from: string; to: string; profile: string }>('sms_prepare_job', { p_id: job.id, p_token: job.lease_token, p_segments: smsSegments(job.body) });
    if (!prepared.ok) continue;
    try {
      const result = await sendSms({ from: prepared.from, to: prepared.to, text: job.body, messagingProfileId: prepared.profile });
      if (!result.id) throw new Error('Provider did not return a message ID');
      await db(`sms_jobs?${filter({ id: `eq.${job.id}` })}`, 'PATCH', { status: 'accepted', provider_message_id: result.id, updated_at: new Date().toISOString() });
      accepted++;
    } catch {
      // Never automatically repeat a send whose provider acceptance is unknown.
      // The reserved usage remains until an operator reconciles delivery.
      await db(`sms_jobs?${filter({ id: `eq.${job.id}` })}`, 'PATCH', { status: 'unknown', last_error: 'Provider acceptance uncertain; reconcile before retrying', updated_at: new Date().toISOString() });
    }
  }
  return { inbound: inbound.length, processed: jobs.length, accepted };
}

export async function saveAppointment(tenant: string, data: { phone: string; name: string; reminderConsent: boolean; consentSource: string } & Record<string, unknown>) {
  const phone = normalizePhone(data.phone);
  await db('sms_contacts?on_conflict=tenant_key,phone', 'POST', { tenant_key: tenant, phone, name: data.name, consent_source: data.consentSource, consents: data.reminderConsent ? ['appointment'] : [] }, 'resolution=ignore-duplicates,return=minimal');
  const [c] = await db<Contact[]>(`sms_contacts?${scoped(tenant, { phone: `eq.${phone}` })}`);
  if (data.reminderConsent && !c.suppressed) await patchContact(c, { consents: [...new Set([...c.consents, 'appointment'])], consent_source: data.consentSource, consent_at: new Date().toISOString() });
  return rpc('sms_save_appointment', { p_tenant: tenant, p_contact: c.id, p_config: data });
}
