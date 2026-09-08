import {
  type PortfolioOutcomeEvent,
  recordOutcomeEvent,
  stripeOutcomeKey,
} from './outcome-ledger.js';

type StripeCheckoutSession = {
  id?: string;
  mode?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  customer?: string | null;
  payment_intent?: string | null;
  metadata?: Record<string, string | undefined>;
};

type StripeEvent = {
  id?: string;
  type?: string;
  created?: number;
  data?: { object?: StripeCheckoutSession };
};

function parseStripeEvent(rawBody: Buffer): StripeEvent | null {
  try {
    return JSON.parse(rawBody.toString('utf8')) as StripeEvent;
  } catch {
    return null;
  }
}

/**
 * Translate only an already-verified, genuinely paid one-time Stripe checkout
 * into a measured revenue fact. Subscription state, checkout creation and
 * failed/unpaid sessions deliberately produce no revenue event.
 */
export function translateProcessedStripeOutcome(
  rawBody: Buffer,
): PortfolioOutcomeEvent | null {
  const event = parseStripeEvent(rawBody);
  if (!event?.id || event.type !== 'checkout.session.completed') return null;

  const session = event.data?.object;
  if (session?.mode !== 'payment' || session.payment_status !== 'paid') {
    return null;
  }

  const organizationId = String(
    session.metadata?.organizationId || '',
  ).trim();
  const amountTotal = Number(session.amount_total);
  if (
    !organizationId ||
    !Number.isFinite(amountTotal) ||
    amountTotal <= 0
  ) {
    return null;
  }

  const amount = amountTotal / 100;
  const currency = String(session.currency || 'usd').toUpperCase();
  const key = stripeOutcomeKey(event.id, 'checkout-paid');
  const occurredAt = new Date(
    Number(event.created || Date.now() / 1000) * 1000,
  ).toISOString();

  return {
    schemaVersion: 1,
    idempotencyKey: key,
    source: 'buildmybot',
    organizationId,
    tenantId: organizationId,
    occurredAt,
    traceId: `stripe:${event.id}`,
    intent: 'Complete a paid BuildMyBot checkout',
    activity: {
      eventType: 'revenue.closed',
      responsibleWorkflow: 'stripe-checkout',
      humanIntervention: false,
    },
    entity: {
      type: 'RevenueEvent',
      externalId: String(session.id || event.id),
      name: 'Verified Stripe checkout',
      attributes: {
        paymentStatus: session.payment_status,
        mode: session.mode,
        customerId: session.customer || null,
        paymentIntentId: session.payment_intent || null,
      },
    },
    outcome: {
      outcomeType: 'payment_received',
      metricName: 'recognized_revenue',
      measuredResult: amount,
      unit: currency,
      classification: 'MEASURED',
      confidence: 1,
      status: 'paid',
      evidence: {
        stripeEventId: event.id,
        stripeSessionId: session.id,
      },
    },
    revenueEvents: [
      {
        idempotencyKey: `${key}:revenue`,
        amount,
        currency,
        kind: 'recognized',
        classification: 'MEASURED',
        customerExternalId: session.customer || undefined,
        evidence: {
          stripeEventId: event.id,
          stripeSessionId: session.id,
          paymentStatus: 'paid',
        },
      },
    ],
  };
}

/**
 * Called only after stripe-webhook.ts has returned a successful response for
 * the same raw body. That handler performs signature verification and its own
 * exactly-once financial claim before this adapter is invoked.
 *
 * Failure to enqueue telemetry must never roll back or retry a payment that
 * Stripe and BuildMyBot already processed; the caller logs errors separately.
 */
export async function recordProcessedStripeOutcome(
  rawBody: Buffer,
): Promise<boolean> {
  const event = translateProcessedStripeOutcome(rawBody);
  return event ? recordOutcomeEvent(event) : false;
}
