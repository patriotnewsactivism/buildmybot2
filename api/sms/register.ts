import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { telnyxRequest } from '../lib/telephony-provider.js';
import { accountFor, ensureAccount } from './runtime.js';
import { authenticate, db, requireLaunch, scoped, SmsError } from './store.js';

const registration = z.object({
  companyName: z.string().trim().min(2).max(100), ein: z.string().regex(/^\d{2}-?\d{7}$/),
  phone: z.string().regex(/^\+1\d{10}$/), email: z.email(), website: z.url(),
  street: z.string().min(3), city: z.string().min(2), state: z.string().length(2), postalCode: z.string().regex(/^\d{5}(-\d{4})?$/),
  description: z.string().min(40).max(4096), sample1: z.string().min(20).max(1024), sample2: z.string().min(20).max(1024),
  messageFlow: z.string().min(40).max(4096), helpMessage: z.string().min(20).max(1024),
  vertical: z.string().min(2).max(50), entityType: z.enum(['PRIVATE_PROFIT','PUBLIC_PROFIT','NON_PROFIT']),
  usecase: z.enum(['MIXED', 'SWEEPSTAKES']).default('MIXED'),
  privacyPolicyLink: z.url(), termsAndConditionsLink: z.url(), areaCode: z.string().regex(/^\d{3}$/),
});
type Registration = z.infer<typeof registration>;
interface Provisioning { tenant_key: string; status: string; step: string; provider_brand_id: string | null; provider_campaign_id: string | null; provider_order_id: string | null; sender: string | null; request: Registration; last_error: string | null; }
function unwrap(value: Record<string, any>) { return value.data || value; }
async function patch(tenant: string, values: Record<string, unknown>) { return db(`sms_provisioning?${scoped(tenant)}`, 'PATCH', { ...values, updated_at: new Date().toISOString() }); }

export async function advanceProvisioning(tenant: string) {
  requireLaunch();
  const account = await accountFor(tenant);
  if (!account.paid_until || new Date(account.paid_until) <= new Date()) throw new SmsError(402, 'Pay the first month before registration and number provisioning');
  const [p] = await db<Provisioning[]>(`sms_provisioning?${scoped(tenant)}`);
  if (!p || p.status === 'ready' || p.status === 'working' || p.status === 'unknown') return;
  const cost = Number(process.env.SMS_PROVISIONING_RESERVE_USD);
  if (!Number.isFinite(cost) || cost <= 0) throw new SmsError(503, 'Provider setup cost reserve has not been configured');
  const balance = unwrap(await telnyxRequest('/balance'));
  if (balance.currency !== 'USD' || !Number.isFinite(Number(balance.balance)) || Number(balance.balance) < cost) {
    await patch(tenant, { status: 'waiting_funding', last_error: 'Paid first month received; waiting for sufficient provider funding' }); return;
  }
  // A durable conditional claim precedes any provider side effect. Unknown
  // outcomes are never retried blindly; support reconciles the provider ID.
  const claimed = await db<Provisioning[]>(`sms_provisioning?${scoped(tenant, { status: `eq.${p.status}`, step: `eq.${p.step}` })}`, 'PATCH', { status: 'working' });
  if (!claimed.length) return;
  let sideEffect = false;
  try {
    const input = p.request;
    if (!p.provider_brand_id) {
      sideEffect = true;
      const brand = unwrap(await telnyxRequest('/10dlc/brand', { method: 'POST', body: JSON.stringify({ entityType: input.entityType, companyName: input.companyName, displayName: input.companyName, ein: input.ein, einIssuingCountry: 'US', phone: input.phone, email: input.email, website: input.website, street: input.street, city: input.city, state: input.state, postalCode: input.postalCode, country: 'US', vertical: input.vertical }) }));
      if (!brand.brandId) throw new Error('Brand ID missing');
      await patch(tenant, { provider_brand_id: brand.brandId, status: 'pending', step: 'campaign', last_error: null }); return;
    }
    if (!p.provider_campaign_id) {
      const brand = unwrap(await telnyxRequest(`/10dlc/brand/${encodeURIComponent(p.provider_brand_id)}`));
      if (!['VERIFIED','VETTED_VERIFIED','APPROVED'].includes(String(brand.identityStatus || brand.status).toUpperCase())) { await patch(tenant, { status: 'pending', last_error: 'Waiting for brand verification' }); return; }
      await telnyxRequest(`/10dlc/campaignBuilder/brand/${encodeURIComponent(p.provider_brand_id)}/usecase/${input.usecase}`);
      sideEffect = true;
      const campaign = unwrap(await telnyxRequest('/10dlc/campaignBuilder', { method: 'POST', body: JSON.stringify({ brandId: p.provider_brand_id, usecase: input.usecase, ...(input.usecase === 'MIXED' ? { subUsecases: ['MARKETING','CUSTOMER_CARE','ACCOUNT_NOTIFICATION'] } : {}), description: input.description, sample1: input.sample1, sample2: input.sample2, messageFlow: input.messageFlow, helpMessage: input.helpMessage, optinKeywords: 'START,YES,SUBSCRIBE', optoutKeywords: 'STOP,STOPALL,UNSUBSCRIBE,CANCEL,END,QUIT', helpKeywords: 'HELP,INFO', optinMessage: `${input.companyName}: you have subscribed. Reply HELP for help or STOP to stop. Message and data rates may apply.`, optoutMessage: `${input.companyName}: you have unsubscribed and will receive no more messages.`, privacyPolicyLink: input.privacyPolicyLink, termsAndConditionsLink: input.termsAndConditionsLink }) }));
      if (!campaign.campaignId) throw new Error('Campaign ID missing');
      await patch(tenant, { provider_campaign_id: campaign.campaignId, status: 'pending', step: 'number', last_error: null }); return;
    }
    const campaign = unwrap(await telnyxRequest(`/10dlc/campaignBuilder/${encodeURIComponent(p.provider_campaign_id)}`));
    if (!['ACTIVE','APPROVED'].includes(String(campaign.status).toUpperCase())) { await patch(tenant, { status: 'pending', last_error: `Carrier campaign status: ${String(campaign.status || 'pending').slice(0,80)}` }); return; }
    if (!p.provider_order_id) {
      const inventory = await telnyxRequest<{ data: Array<{phone_number:string}> }>(`/available_phone_numbers?${new URLSearchParams({ 'filter[phone_number][country_code]': 'US', 'filter[national_destination_code]': input.areaCode, 'filter[features][]': 'sms', 'filter[limit]': '1' })}`);
      const candidate = inventory.data?.[0]?.phone_number;
      if (!candidate) { await patch(tenant, { status: 'pending', last_error: 'No available SMS number in this area code' }); return; }
      sideEffect = true;
      const order = unwrap(await telnyxRequest('/number_orders', { method: 'POST', body: JSON.stringify({ phone_numbers: [{ phone_number: candidate }], messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID, connection_id: process.env.TELNYX_CONNECTION_ID }) }));
      if (!order.id) throw new Error('Number order ID missing');
      await patch(tenant, { provider_order_id: order.id, sender: candidate, status: 'pending', step: 'assignment' }); return;
    }
    const order = unwrap(await telnyxRequest(`/number_orders/${encodeURIComponent(p.provider_order_id)}`));
    if (!['success','completed'].includes(String(order.status).toLowerCase())) { await patch(tenant, { status: 'pending', last_error: 'Number order is processing' }); return; }
    // PUT is idempotent for an exact phone/campaign assignment.
    await telnyxRequest(`/10dlc/phone_number_campaigns/${encodeURIComponent(p.sender || '')}`, { method: 'PUT', body: JSON.stringify({ campaignId: p.provider_campaign_id }) });
    const assignment = unwrap(await telnyxRequest(`/10dlc/phone_number_campaigns/${encodeURIComponent(p.sender || '')}`));
    if (!['ASSIGNED','ACTIVE','APPROVED'].includes(String(assignment.assignmentStatus || assignment.status).toUpperCase())) { await patch(tenant, { status: 'pending', last_error: 'Waiting for carrier number assignment' }); return; }
    await db(`sms_accounts?${scoped(tenant)}`, 'PATCH', { sender: p.sender, messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID, campaign_id: p.provider_campaign_id, campaign_usecase: input.usecase, ready: true });
    await patch(tenant, { status: 'ready', step: 'complete', last_error: null });
  } catch (error) {
    await patch(tenant, { status: sideEffect ? 'unknown' : 'pending', last_error: sideEffect ? 'Provider result uncertain; support must reconcile before retrying' : 'Provider status check failed; will retry' });
    if (sideEffect) throw new SmsError(502, 'Provider setup needs reconciliation; no duplicate purchase will be attempted');
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await authenticate(req); const a = await ensureAccount(user);
    if (req.method === 'POST') {
      requireLaunch();
      if (!a.paid_until || new Date(a.paid_until) <= new Date()) throw new SmsError(402, 'The first month must be paid before registration');
      const input = registration.parse(req.body);
      await db('sms_provisioning?on_conflict=tenant_key', 'POST', { tenant_key: user.tenant, request: input }, 'resolution=ignore-duplicates,return=minimal');
      await advanceProvisioning(user.tenant);
    } else if (req.method !== 'GET') throw new SmsError(405, 'Method not allowed');
    const [p] = await db<Provisioning[]>(`sms_provisioning?${scoped(user.tenant)}`);
    return res.json({ registered: Boolean(p), status: p?.status || 'not_registered', step: p?.step, error: p?.last_error, smsReady: (await accountFor(user.tenant)).ready });
  } catch (error) {
    return res.status(error instanceof SmsError ? error.status : error instanceof z.ZodError ? 400 : 500).json({ error: error instanceof z.ZodError ? error.issues.map(i => i.message).join('; ') : error instanceof SmsError ? error.message : 'Registration failed' });
  }
}
