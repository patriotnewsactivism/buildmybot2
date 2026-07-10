import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// This is a dedicated Vercel function (not routed through gateway.ts) so we
// can read the raw request body -- Stripe signature verification requires
// the exact bytes Stripe signed, not a re-serialized JSON.parse round trip.
export const config = {
  api: {
    bodyParser: false,
  },
};

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

async function sbSelect(table: string, select = '*', filters: Record<string, string> = {}) {
  const params = new URLSearchParams({ select });
  for (const [k, v] of Object.entries(filters)) params.set(k, v);
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: SUPABASE_HEADERS,
  });
  if (!resp.ok) throw new Error(`Supabase error: ${resp.status}`);
  return resp.json();
}

async function sbUpdate(table: string, data: any, filters: Record<string, string>) {
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
  const auth = 'Basic ' + Buffer.from(`${STRIPE_SECRET_KEY}:`).toString('base64');
  const resp = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: auth },
  });
  if (!resp.ok) throw new Error(`Stripe error ${resp.status}`);
  return resp.json();
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
  const parts = sigHeader.split(',').reduce<Record<string, string[]>>((acc, part) => {
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

  return signatures.some((sig) =>
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)),
  );
}

/** Look up the planKey for a Stripe price by fetching its product's metadata. */
async function planKeyForPrice(priceId: string): Promise<string | null> {
  try {
    const price = await stripeGet(`/prices/${priceId}?expand[]=product`);
    return price?.product?.metadata?.planKey || null;
  } catch (err) {
    console.error('[stripe-webhook] failed to resolve planKey for price', priceId, err);
    return null;
  }
}

async function creditUsagePool(organizationId: string, resourceType: string, amount: number) {
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

async function handleSubscriptionChange(subscription: any) {
  const meta = subscription.metadata || {};
  const userId = meta.userId;
  if (!userId) {
    console.warn('[stripe-webhook] subscription has no userId metadata, skipping', subscription.id);
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
        ...(isActive ? { whitelabel_enabled_at: new Date().toISOString() } : {}),
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
      { plan: 'FREE', payment_status: 'canceled', stripe_subscription_id: null },
      { id: `eq.${user.id}` },
    ).catch(() => {});
  }

  console.log(
    `[stripe-webhook] payment_failed for user ${user.id} (${user.email}), attempt ${attemptCount}`,
  );
}

async function handleOneTimeCheckout(session: any) {
  const meta = session.metadata || {};
  const { type, organizationId } = meta;
  if (!type || !organizationId) {
    console.warn('[stripe-webhook] one-time checkout missing type/organizationId metadata', session.id);
    return;
  }
  if (type === 'voice_minutes') {
    await creditUsagePool(organizationId, 'voice_minutes', Number(meta.minutes || 0));
  } else {
    // sms_credits, storage_mb, etc.
    await creditUsagePool(organizationId, type, Number(meta.credits || 0));
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  const rawBody = await readRawBody(req);
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
    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[stripe-webhook] handler error for', event.type, err.message);
    // Return 500 so Stripe retries -- our own bug shouldn't silently drop the event.
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
