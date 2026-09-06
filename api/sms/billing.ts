import { SMS_PLANS, type SmsPlan } from '../../shared/sms.js';
import { applySmsOverageCommissionSafeguard } from '../../constants.js';
import { accountFor } from './runtime.js';
import { db, filter, rpc, scoped, SmsError, type SmsUser } from './store.js';

type StripeObject = Record<string, any>;
export async function stripe(path: string, method = 'GET', values?: Record<string, string>, key?: string): Promise<StripeObject> {
  if (!process.env.STRIPE_SECRET_KEY) throw new SmsError(503, 'Billing is not configured');
  const response = await fetch(`https://api.stripe.com/v1${path}`, { method, headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(key ? { 'Idempotency-Key': key } : {}) }, body: values ? new URLSearchParams(values).toString() : undefined, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new SmsError(502, `Billing operation failed (${response.status})`);
  return response.json();
}

export async function createSmsCheckout(user: SmsUser, plan: SmsPlan) {
  const account = await accountFor(user.tenant);
  if (account.subscription_id) throw new SmsError(409, 'Manage the existing SMS subscription through billing before creating another');
  if (!account.business_name) throw new SmsError(400, 'Save the business name and timezone first');
  const priceId = process.env[`STRIPE_PRICE_${plan}`];
  if (!priceId) throw new SmsError(503, 'This SMS plan is not configured for checkout');
  const price = await stripe(`/prices/${encodeURIComponent(priceId)}`);
  if (!price.active || price.currency !== 'usd' || price.unit_amount !== SMS_PLANS[plan].price * 100 || price.recurring?.interval !== 'month' || (price.recurring?.interval_count || 1) !== 1) throw new SmsError(503, 'The configured billing price does not match the published SMS plan');
  const base = process.env.APP_BASE_URL || 'https://www.buildmybot.app';
  const session = await stripe('/checkout/sessions', 'POST', {
    mode: 'subscription', 'line_items[0][price]': priceId, 'line_items[0][quantity]': '1',
    success_url: `${base}/app/sms-marketing?payment=complete`, cancel_url: `${base}/app/sms-marketing?payment=cancelled`,
    'metadata[type]': 'sms', 'metadata[userId]': user.id, 'metadata[tenantKey]': user.tenant,
    'subscription_data[metadata][type]': 'sms', 'subscription_data[metadata][userId]': user.id,
    'subscription_data[metadata][tenantKey]': user.tenant, 'subscription_data[metadata][planKey]': plan,
    'payment_method_collection': 'always',
  }, `sms-checkout:${user.tenant}:${plan}:${Math.floor(Date.now() / 1800000)}`);
  return { url: session.url };
}

/** Invoked only AFTER the common Stripe signature and event-claim checks. */
export async function handleSmsBillingEvent(event: StripeObject): Promise<boolean> {
  const object = event.data.object;
  let subscription: StripeObject | null = null;
  if (event.type.startsWith('customer.subscription.')) subscription = object;
  else if (event.type.startsWith('invoice.')) {
    const id = object.subscription || object.parent?.subscription_details?.subscription;
    if (id) subscription = await stripe(`/subscriptions/${encodeURIComponent(typeof id === 'string' ? id : id.id)}`);
  }
  if (subscription?.metadata?.type !== 'sms') return object.metadata?.type === 'sms';
  const tenant = subscription.metadata.tenantKey;
  if (typeof tenant !== 'string') throw new Error('SMS subscription missing tenant');
  const a = await accountFor(tenant);
  if (a.user_id !== subscription.metadata.userId) throw new Error('SMS subscription identity mismatch');
  if (a.subscription_id && a.subscription_id !== subscription.id) throw new Error('Duplicate SMS subscription requires reconciliation');
  if (event.type === 'invoice.paid') {
    const plan = subscription.metadata.planKey as SmsPlan;
    if (!(plan in SMS_PLANS)) throw new Error('Unknown SMS plan');
    const item = subscription.items?.data?.find((i: StripeObject) => i.price?.id === process.env[`STRIPE_PRICE_${plan}`]);
    if (!item || object.paid !== true || object.amount_paid < SMS_PLANS[plan].price * 100 || object.currency !== 'usd') throw new Error('SMS provisioning requires a fully paid first month');
    const start = item.current_period_start || subscription.current_period_start || object.period_start;
    const end = item.current_period_end || subscription.current_period_end || object.period_end;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Invalid paid SMS period');
    await rpc('sms_apply_payment', { p_tenant: tenant, p_subscription: subscription.id, p_invoice: object.id, p_plan: plan, p_start: new Date(start * 1000).toISOString(), p_end: new Date(end * 1000).toISOString() });
  } else if (event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_failed' || ['unpaid', 'canceled', 'paused'].includes(subscription.status)) {
    await db(`sms_accounts?${scoped(tenant)}`, 'PATCH', { ready: false, paid_until: new Date().toISOString(), ...(event.type === 'customer.subscription.deleted' ? { subscription_id: null } : {}) });
  }
  return true; // SMS subscriptions must never overwrite users.plan/voice_plan.
}

/** Partner/reseller commission on SMS overage revenue -- mirrors the
 * base-subscription commission block in api/stripe-webhook.ts, but for the
 * standalone overage invoices created below, which carry no subscription
 * link and were previously never commissioned at all. Non-fatal by design:
 * a commission-tracking failure must never block the actual overage
 * invoice from being billed. */
async function recordSmsOverageCommission(subscription: StripeObject, overageMicros: number, invoiceId: string): Promise<void> {
  const userId = subscription.metadata?.userId;
  if (typeof userId !== 'string') return;
  const overageRevenueUsd = overageMicros / 1_000_000;
  if (overageRevenueUsd <= 0) return;

  const users = await db<Array<{ email: string }>>(`users?${filter({ id: `eq.${userId}`, select: 'email', limit: '1' })}`).catch(() => []);
  const email = users[0]?.email;
  if (!email) return;

  const partnerClients = await db<Array<{ id: string; partner_id: string }>>(`partner_clients?${filter({ client_email: `eq.${email}`, status: 'eq.active', select: 'id,partner_id', limit: '1' })}`).catch(() => []);
  if (partnerClients[0]) {
    const partners = await db<Array<{ id: string; commission_rate: number; total_earned: number; pending_payout: number }>>(`partners?${filter({ id: `eq.${partnerClients[0].partner_id}`, status: 'eq.active', select: 'id,commission_rate,total_earned,pending_payout', limit: '1' })}`).catch(() => []);
    const partner = partners[0];
    if (partner) {
      const rawCommission = +(overageRevenueUsd * (partner.commission_rate || 0.15)).toFixed(2);
      const { cappedCommissionUsd, wasCapped } = applySmsOverageCommissionSafeguard(overageRevenueUsd, rawCommission);
      if (cappedCommissionUsd > 0) {
        await db(`partners?${filter({ id: `eq.${partner.id}` })}`, 'PATCH', {
          total_earned: `${(partner.total_earned || 0) + cappedCommissionUsd}`,
          pending_payout: `${(partner.pending_payout || 0) + cappedCommissionUsd}`,
        }).catch(() => {});
        await db('partner_payouts', 'POST', [{ partner_id: partner.id, amount: cappedCommissionUsd, status: 'pending' }]).catch(() => {});
        if (wasCapped) console.warn(`[sms-billing] overage commission capped for partner ${partner.id} on invoice ${invoiceId}`);
      }
      return;
    }
  }

  const resellerClients = await db<Array<{ id: string; reseller_id: string }>>(`reseller_clients?${filter({ client_email: `eq.${email}`, status: 'eq.active', select: 'id,reseller_id', limit: '1' })}`).catch(() => []);
  if (resellerClients[0]) {
    const resellers = await db<Array<{ id: string; commission_rate: number; total_earned: number; pending_payout: number }>>(`resellers?${filter({ id: `eq.${resellerClients[0].reseller_id}`, status: 'eq.active', select: 'id,commission_rate,total_earned,pending_payout', limit: '1' })}`).catch(() => []);
    const reseller = resellers[0];
    if (reseller) {
      const rawCommission = +(overageRevenueUsd * (reseller.commission_rate || 0.2)).toFixed(2);
      const { cappedCommissionUsd, wasCapped } = applySmsOverageCommissionSafeguard(overageRevenueUsd, rawCommission);
      if (cappedCommissionUsd > 0) {
        await db(`resellers?${filter({ id: `eq.${reseller.id}` })}`, 'PATCH', {
          total_earned: `${(reseller.total_earned || 0) + cappedCommissionUsd}`,
          pending_payout: `${(reseller.pending_payout || 0) + cappedCommissionUsd}`,
        }).catch(() => {});
        if (wasCapped) console.warn(`[sms-billing] overage commission capped for reseller ${reseller.id} on invoice ${invoiceId}`);
      }
    }
  }
}

export async function reconcileOverages(): Promise<{ processed: number }> {
  const periods = await db<Array<{ invoice_id: string; subscription_id: string; overage_micros: number }>>(`sms_billing_periods?${filter({ ends_at: `lt.${new Date().toISOString()}`, stripe_invoice_item_id: 'is.null', overage_micros: 'gt.0', limit: '20' })}`);
  for (const p of periods) {
    const subscription = await stripe(`/subscriptions/${encodeURIComponent(p.subscription_id)}`);
    const item = await stripe('/invoiceitems', 'POST', { customer: String(subscription.customer), amount: String(Math.ceil(p.overage_micros / 10000)), currency: 'usd', description: 'BuildMyBot SMS overage segments', 'metadata[sms_period]': p.invoice_id }, `sms-overage-item:${p.invoice_id}`);
    // Invoice the actual reserved overage separately; pending items must not
    // disappear when the base SMS subscription is cancelled at period end.
    const invoice = await stripe('/invoices', 'POST', { customer: String(subscription.customer), collection_method: 'charge_automatically', auto_advance: 'true', pending_invoice_items_behavior: 'exclude' }, `sms-overage-invoice:${p.invoice_id}`);
    await stripe(`/invoiceitems/${encodeURIComponent(item.id)}`, 'POST', { invoice: invoice.id }, `sms-overage-attach:${p.invoice_id}`);
    await db(`sms_billing_periods?${filter({ invoice_id: `eq.${p.invoice_id}` })}`, 'PATCH', { stripe_invoice_item_id: item.id });
    await recordSmsOverageCommission(subscription, p.overage_micros, p.invoice_id).catch((err: any) => console.error('[sms-billing] overage commission error:', err?.message));
  }
  return { processed: periods.length };
}
