import { recordOutcomeEvent, stripeOutcomeKey } from './outcome-ledger.js';

/**
 * Called only after stripe-webhook.ts has returned a successful response for
 * the same raw body. That handler performs signature verification and its own
 * exactly-once financial claim before this adapter is invoked.
 *
 * Failure to enqueue telemetry must never roll back or retry a payment that
 * Stripe and BuildMyBot already processed; the caller logs errors separately.
 */
export async function recordProcessedStripeOutcome(rawBody: Buffer): Promise<boolean> {
  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return false;
  }
  if (!event?.id || !event?.type) return false;

  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object;
    if (session?.mode !== 'payment' || session?.payment_status !== 'paid') return false;
    const organizationId = String(session.metadata?.organizationId || '').trim();
    const amountTotal = Number(session.amount_total);
    if (!organizationId || !Number.isFinite(amountTotal) || amountTotal <= 0) return false;
    const amount = amountTotal / 100;
    const key = stripeOutcomeKey(event.id, 'checkout-paid');
    return recordOutcomeEvent({
      schemaVersion: 1,
      idempotencyKey: key,
      source: 'buildmybot',
      organizationId,
      tenantId: organizationId,
      occurredAt: new Date(Number(event.created || Date.now() / 1000) * 1000).toISOString(),
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
        unit: String(session.currency || 'usd').toUpperCase(),
        classification: 'MEASURED',
        confidence: 1,
        status: 'paid',
        evidence: { stripeEventId: event.id, stripeSessionId: session.id },
      },
      revenueEvents: [{
        idempotencyKey: `${key}:revenue`,
        amount,
        currency: String(session.currency || 'usd').toUpperCase(),
        kind: 'recognized',
        classification: 'MEASURED',
        customerExternalId: session.customer ? String(session.customer) : undefined,
        evidence: { stripeEventId: event.id, stripeSessionId: session.id, paymentStatus: 'paid' },
      }],
    });
  }

  return false;
}
