import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import {
  PLANS,
  SMS_MARKETING_PLANS,
  applyCommissionSafeguard,
  applySmsCommissionSafeguard,
} from '../constants.js';

// This is a dedicated Vercel function (not routed through gateway.ts) so we
// can read the raw request body -- Stripe signature verification requires
// the exact bytes Stripe signed, not a re-serialized JSON.parse round trip.
export const config = {
  api: {
    bodyParser: false,
  },
};

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

/**
 * Caps a computed commission dollar amount against the margin safeguard
 * for whichever plan family `planKey` belongs to (chatbot PLANS vs. the SMS
 * marketing add-on -- unrelated cost models, see constants.ts). Falls back
 * to the raw, uncapped commission for anything else (e.g. VOICE_PLANS,
 * WHITELABEL_FEE, or an unrecognized planKey) -- those don't have a margin
 * model yet, so behavior there is UNCHANGED from before this safeguard was
 * wired in.
 *
 * Added 2026-09-04: this was previously documented in constants.ts
 * (MAX_COMMISSION_SHARE_OF_MARGIN / applyCommissionSafeguard) but never
 * actually invoked here -- commission was computed as raw price * rate
 * with zero margin awareness. This closes that gap for the two plan
 * families that have a real cost model today.
 */
function capCommissionForPlan(
  planKey: string,
  computedCommissionUsd: number,
): { cappedCommissionUsd: number; wasCapped: boolean } {
  if (planKey in PLANS) {
    const result = applyCommissionSafeguard(
      planKey as keyof typeof PLANS,
      computedCommissionUsd,
    );
    return { cappedCommissionUsd: result.cappedCommissionUsd, wasCapped: result.wasCapped };
  }
  if (planKey in SMS_MARKETING_PLANS) {
    const result = applySmsCommissionSafeguard(
      planKey as keyof typeof SMS_MARKETING_PLANS,
      computedCommissionUsd,
    );
    return { cappedCommissionUsd: result.cappedCommissionUsd, wasCapped: result.wasCapped };
  }
  // No margin model for this plan family (e.g. VOICE_PLANS) -- unchanged,
  // uncapped behavior.
  return { cappedCommissionUsd: computedCommissionUsd, wasCapped: false };
}

async function sbSelect(
  table: string,
  select = '*',
  filters: Record<string, string> = {},
) {
  const params = new URLSearchParams({ select });
  for (const [k, v] of Object.entries(filters)) params.set(k, v);
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: SUPABASE_HEADERS,
  });
  if (!resp.ok) throw new Error(`Supabase error: ${resp.status}`);
  return resp.json();
}

async function sbUpdate(
  table: string,
  data: any,
  filters: Record<string, string>,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) params.set(k, v);
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error(`Supabase update error: ${resp.status}`);
  return resp.json();
}

async function sbInsert(table: string, data: any) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error(`Supabase insert error: ${resp.status}`);
  return resp.json();
}

async function sbUpsert(table: string, data: any, onConflict: string) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`,
    {
      method: 'POST',
      headers: {
        ...SUPABASE_HEADERS,
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(data),
    },
  );
  if (!resp.ok) throw new Error(`Supabase upsert error: ${resp.status}`);
  return resp.json();
}

async function stripeGet(path: string) {
  const auth = `Basic ${Buffer.from(`${STRIPE_SECRET_KEY}:`).toString('base64')}`;
  const resp = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: auth },
  });
  if (!resp.ok) throw new Error(`Stripe error ${resp.status}`);
  return resp.json();
}

/**
 * Stripe signs the exact bytes it sent. On Vercel `bodyParser: false` leaves
 * the stream unread, but on Cloud Run the Express app in server.ts has
 * ALREADY consumed the stream (express.raw) before this handler runs -- so
 * streaming here returned an empty Buffer and EVERY webhook failed signature
 * verification (silently dropping all billing events). We now prefer the raw
 * bytes the framework captured, and only fall back to reading the stream.
 */
export function getRawBody(req: VercelRequest): Promise<Buffer> {
  const anyReq = req as any;
  const captured = anyReq.rawBody ?? anyReq.body;
  if (Buffer.isBuffer(captured)) return Promise.resolve(captured);
  if (typeof captured === 'string' && captured.length > 0) {
    return Promise.resolve(Buffer.from(captured, 'utf8'));
  }
  if (anyReq.readableEnded || anyReq.complete) {
    // Stream already consumed and no raw bytes were preserved -- refuse
    // rather than "verify" a re-serialized body that can never match.
    return Promise.resolve(Buffer.alloc(0));
  }
  return readRawBody(req);
}

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Verify Stripe's webhook signature manually (no stripe SDK dependency).
 * Header format: t=<timestamp>,v1=<hex hmac>[,v1=<hex hmac>...] */
function verifyStripeSignature(
  rawBody: Buffer,
  sigHeader: string,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  const parts = sigHeader
    .split(',')
    .reduce<Record<string, string[]>>((acc, part) => {
      const [k, v] = part.split('=');
      if (!k || !v) return acc;
      (acc[k] = acc[k] || []).push(v);
      return acc;
    }, {});
  const timestamp = parts.t?.[0];
  const signatures = parts.v1 || [];
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > toleranceSeconds) return false;

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  // timingSafeEqual throws on length mismatch -- a forged short signature
  // would previously raise, escape verifyStripeSignature and 500 instead of
  // cleanly rejecting.
  const expectedBuf = Buffer.from(expected, 'utf8');
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, 'utf8');
    return (
      sigBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, expectedBuf)
    );
  });
}

/** Look up the planKey for a Stripe price by fetching its product's metadata. */
async function planKeyForPrice(priceId: string): Promise<string | null> {
  try {
    const price = await stripeGet(`/prices/${priceId}?expand[]=product`);
    return price?.product?.metadata?.planKey || null;
  } catch (err) {
    console.error(
      '[stripe-webhook] failed to resolve planKey for price',
      priceId,
      err,
    );
    return null;
  }
}

async function creditUsagePool(
  organizationId: string,
  resourceType: string,
  amount: number,
) {
  if (!organizationId || !amount) return;
  const existing = await sbSelect('usage_pools', 'id,total_credits', {
    organization_id: `eq.${organizationId}`,
    resource_type: `eq.${resourceType}`,
  }).catch(() => []);
  if (existing?.[0]) {
    await sbUpdate(
      'usage_pools',
      { total_credits: (existing[0].total_credits || 0) + amount },
      { id: `eq.${existing[0].id}` },
    );
  } else {
    await sbUpsert(
      'usage_pools',
      {
        id: crypto.randomUUID(),
        organization_id: organizationId,
        resource_type: resourceType,
        total_credits: amount,
        used_credits: 0,
      },
      'organization_id,resource_type',
    );
  }
}

/**
 * Idempotency: Stripe retries webhooks (and can deliver the same event more
 * than once). Without this, a retried `checkout.session.completed` credited
 * the wallet twice and a retried subscription event re-ran commission
 * payouts. `stripe_webhook_events.event_id` has a UNIQUE constraint (see
 * supabase-migrations/20260904_stripe_webhook_idempotency.sql), so the insert
 * below is the atomic claim: exactly one delivery can win.
 *
 * Returns true when this process claimed the event and should handle it.
 */
async function claimEvent(event: any): Promise<boolean> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/stripe_webhook_events`, {
    method: 'POST',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify({
      event_id: event.id,
      event_type: event.type,
      status: 'processing',
      received_at: new Date().toISOString(),
    }),
  });
  if (resp.ok) return true;
  // 409 Conflict = unique violation = already claimed by an earlier delivery.
  if (resp.status === 409) return false;
  const text = await resp.text().catch(() => '');
  if (/duplicate key|23505/i.test(text)) return false;
  throw new Error(`Idempotency claim failed: ${resp.status} ${text}`);
}

async function markEvent(eventId: string, status: string, error?: string) {
  await sbUpdate(
    'stripe_webhook_events',
    {
      status,
      processed_at: new Date().toISOString(),
      last_error: error ? String(error).slice(0, 500) : null,
    },
    { event_id: `eq.${eventId}` },
  ).catch(() => {});
}

async function handleSubscriptionChange(subscription: any) {
  const meta = subscription.metadata || {};
  const userId = meta.userId;
  if (!userId) {
    console.warn(
      '[stripe-webhook] subscription has no userId metadata, skipping',
      subscription.id,
    );
    return;
  }
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const status = subscription.status; // active, past_due, canceled, ...
  const isActive = ['active', 'trialing'].includes(status);

  if (meta.type === 'whitelabel') {
    await sbUpdate(
      'users',
      {
        whitelabel_subscription_id: subscription.id,
        whitelabel_enabled: isActive,
        ...(isActive
          ? { whitelabel_enabled_at: new Date().toISOString() }
          : {}),
      },
      { id: `eq.${userId}` },
    );
    return;
  }

  if (!priceId) return;
  const planKey = isActive ? await planKeyForPrice(priceId) : 'FREE';
  if (!planKey) return;

  await sbUpdate(
    'users',
    {
      plan: planKey,
      stripe_subscription_id: isActive ? subscription.id : null,
    },
    { id: `eq.${userId}` },
  );

  // ─── Partner/Reseller Commission Tracking ──────────────────────────
  if (isActive && planKey !== 'FREE') {
    try {
      // Check if this user was referred by a partner
      const partnerClients = await sbSelect(
        'partner_clients',
        'id,partner_id',
        {
          client_email: `eq.${meta.email || ''}`,
          status: 'eq.active',
        },
      ).catch(() => []);

      if (partnerClients?.[0]) {
        const pc = partnerClients[0];
        const partners = await sbSelect('partners', 'id,commission_rate', {
          id: `eq.${pc.partner_id}`,
          status: 'eq.active',
        }).catch(() => []);

        if (partners?.[0]) {
          const partner = partners[0];
          const amount =
            (subscription.items?.data?.[0]?.price?.unit_amount || 0) / 100;
          const rawCommission = +(
            amount * (partner.commission_rate || 0.15)
          ).toFixed(2);
          const { cappedCommissionUsd: commission, wasCapped } = capCommissionForPlan(
            planKey,
            rawCommission,
          );
          if (wasCapped) {
            console.warn(
              `[stripe-webhook] Partner ${partner.id} commission capped by margin safeguard on plan ${planKey}: raw $${rawCommission} -> capped $${commission}`,
            );
          }
          if (commission > 0) {
            await sbUpdate(
              'partners',
              {
                total_earned: `${(partner.total_earned || 0) + commission}`,
                pending_payout: `${(partner.pending_payout || 0) + commission}`,
              },
              { id: `eq.${partner.id}` },
            ).catch(() => {});
            await sbInsert('partner_payouts', [
              {
                partner_id: partner.id,
                amount: commission,
                status: 'pending',
              },
            ]).catch(() => {});
          }
        }
      }

      // Check if referred by a reseller
      const resellerClients = await sbSelect(
        'reseller_clients',
        'id,reseller_id',
        {
          client_email: `eq.${meta.email || ''}`,
          status: 'eq.active',
        },
      ).catch(() => []);

      if (resellerClients?.[0]) {
        const rc = resellerClients[0];
        const resellers = await sbSelect('resellers', 'id,commission_rate', {
          id: `eq.${rc.reseller_id}`,
          status: 'eq.active',
        }).catch(() => []);

        if (resellers?.[0]) {
          const reseller = resellers[0];
          const amount =
            (subscription.items?.data?.[0]?.price?.unit_amount || 0) / 100;
          const rawCommission = +(
            amount * (reseller.commission_rate || 0.2)
          ).toFixed(2);
          const { cappedCommissionUsd: commission, wasCapped } = capCommissionForPlan(
            planKey,
            rawCommission,
          );
          if (wasCapped) {
            console.warn(
              `[stripe-webhook] Reseller ${reseller.id} commission capped by margin safeguard on plan ${planKey}: raw $${rawCommission} -> capped $${commission}`,
            );
          }
          if (commission > 0) {
            await sbUpdate(
              'resellers',
              {
                total_earned: `${(reseller.total_earned || 0) + commission}`,
                pending_payout: `${(reseller.pending_payout || 0) + commission}`,
              },
              { id: `eq.${reseller.id}` },
            ).catch(() => {});
          }
        }
      }
    } catch (err: any) {
      console.error('[stripe-webhook] commission tracking error:', err.message);
      // Non-fatal — don't block the subscription update
    }
  }
}

async function handleSubscriptionDeleted(subscription: any) {
  const meta = subscription.metadata || {};
  const userId = meta.userId;
  if (!userId) return;

  if (meta.type === 'whitelabel') {
    await sbUpdate(
      'users',
      { whitelabel_enabled: false },
      { id: `eq.${userId}` },
    );
    return;
  }

  await sbUpdate(
    'users',
    { plan: 'FREE', stripe_subscription_id: null },
    { id: `eq.${userId}` },
  );
}

async function handlePaymentFailed(invoice: any) {
  // Dunning flow: when a payment fails, mark the user as past_due
  // and record the failure for follow-up
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  // Find the user by their subscription ID
  const users = await sbSelect('users', 'id,email,plan', {
    stripe_subscription_id: `eq.${subscriptionId}`,
  }).catch(() => []);
  const user = users?.[0];
  if (!user) return;

  const attemptCount = invoice.attempt_count || 1;
  const nextAttemptAt = invoice.next_payment_attempt
    ? new Date(invoice.next_payment_attempt * 1000).toISOString()
    : null;

  // Update user record with payment failure info
  await sbUpdate(
    'users',
    {
      payment_status: 'past_due',
      payment_failed_at: new Date().toISOString(),
      payment_attempt_count: attemptCount,
    },
    { id: `eq.${user.id}` },
  ).catch(() => {});

  // Log the failure for the admin dashboard
  await sbUpsert(
    'audit_logs',
    {
      id: crypto.randomUUID(),
      user_id: user.id,
      action: 'payment_failed',
      details: JSON.stringify({
        invoice_id: invoice.id,
        amount_due: invoice.amount_due,
        attempt_count: attemptCount,
        next_attempt_at: nextAttemptAt,
        subscription_id: subscriptionId,
      }),
      created_at: new Date().toISOString(),
    },
    'id',
  ).catch(() => {});

  // After 3 failed attempts with no next retry, downgrade to FREE
  if (attemptCount >= 3 && !nextAttemptAt) {
    await sbUpdate(
      'users',
      {
        plan: 'FREE',
        payment_status: 'canceled',
        stripe_subscription_id: null,
      },
      { id: `eq.${user.id}` },
    ).catch(() => {});
  }

  console.log(
    `[stripe-webhook] payment_failed for user ${user.id} (${user.email}), attempt ${attemptCount}`,
  );
}

async function handleOneTimeCheckout(session: any) {
  // Only a genuinely paid session may create credit.
  if (session.payment_status !== 'paid') {
    console.warn(
      '[stripe-webhook] checkout session not paid, no credit granted',
      session.id,
      session.payment_status,
    );
    return;
  }
  const meta = session.metadata || {};
  const { type, organizationId } = meta;
  if (!type || !organizationId) {
    console.warn(
      '[stripe-webhook] one-time checkout missing type/organizationId metadata',
      session.id,
    );
    return;
  }
  if (type === 'voice_minutes') {
    await creditUsagePool(
      organizationId,
      'voice_minutes',
      Number(meta.minutes || 0),
    );
  } else {
    // sms_credits, storage_mb, etc.
    await creditUsagePool(organizationId, type, Number(meta.credits || 0));
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  const rawBody = await getRawBody(req);
  if (!rawBody.length) {
    console.error('[stripe-webhook] empty raw body — cannot verify signature');
    return res.status(400).json({ error: 'Missing raw body' });
  }
  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!sig || !verifyStripeSignature(rawBody, sig, STRIPE_WEBHOOK_SECRET)) {
    console.error('[stripe-webhook] signature verification failed');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (!event?.id) return res.status(400).json({ error: 'Malformed event' });

  // Exactly-once: claim before doing anything with a financial effect.
  let claimed: boolean;
  try {
    claimed = await claimEvent(event);
  } catch (err: any) {
    console.error('[stripe-webhook] idempotency store unavailable:', err.message);
    // Fail closed: 500 makes Stripe retry rather than risk a double effect.
    return res.status(500).json({ error: 'Idempotency store unavailable' });
  }
  if (!claimed) {
    console.log('[stripe-webhook] duplicate event ignored:', event.id);
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'payment') {
          await handleOneTimeCheckout(session);
        }
        // mode === 'subscription' entitlements are applied from the
        // customer.subscription.* events below, which carry the price.
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      default:
        // Unhandled event types are fine to no-op on.
        break;
    }
    await markEvent(event.id, 'processed');
    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error(
      '[stripe-webhook] handler error for',
      event.type,
      err.message,
    );
    // Release the claim so Stripe's retry can actually re-run the handler.
    await sbUpdate(
      'stripe_webhook_events',
      { status: 'failed', last_error: String(err.message).slice(0, 500) },
      { event_id: `eq.${event.id}` },
    ).catch(() => {});
    await fetch(
      `${SUPABASE_URL}/rest/v1/stripe_webhook_events?event_id=eq.${event.id}`,
      { method: 'DELETE', headers: SUPABASE_HEADERS },
    ).catch(() => {});
    // Return 500 so Stripe retries -- our own bug shouldn't silently drop the event.
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
