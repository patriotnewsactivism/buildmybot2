-- Escalation-SLA sweep support: escalations and agent_messages requiring
-- president attention could sit open forever if the first notification was
-- missed — nothing re-notified. Adds a context jsonb column to both (same
-- dedup pattern already used on error_logs for the stale-critical sweep in
-- api/cron/_pulse.ts) so a pulse can flag "already reminded" per row and
-- never spam the same escalation twice.

ALTER TABLE public.escalations
  ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.agent_messages
  ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}'::jsonb;
