-- P0 BILLING: exactly-once processing of Stripe webhook events.
--
-- Stripe retries deliveries (and can deliver the same event twice). Before
-- this table, a retried checkout.session.completed credited the wallet twice
-- and a retried subscription event re-ran partner/reseller commission
-- payouts. api/stripe-webhook.ts inserts a row BEFORE doing any work; the
-- UNIQUE constraint on event_id makes that insert the atomic claim, so only
-- the first delivery of an event has any financial effect.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  status       text NOT NULL DEFAULT 'processing',
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error   text
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_received_at_idx
  ON public.stripe_webhook_events (received_at DESC);

-- Service-role only: no tenant ever reads or writes this table.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
