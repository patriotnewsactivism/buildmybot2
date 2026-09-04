-- P2 retention/growth: first-value milestones + usage alert bookkeeping.
-- Safe to re-run.

-- ── First-value milestones ───────────────────────────────────────────
-- One row per (user, milestone). The unique constraint is what makes
-- recording idempotent: the very first chat/lead/answered call/appointment
-- wins and later ones are no-ops, so "time to first value" stays truthful.
CREATE TABLE IF NOT EXISTS activation_milestones (
  id              text PRIMARY KEY,
  user_id         text NOT NULL,
  organization_id text,
  milestone       varchar(50) NOT NULL,
  bot_id          text,
  metadata        jsonb DEFAULT '{}'::jsonb,
  achieved_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS activation_milestones_user_milestone_idx
  ON activation_milestones (user_id, milestone);
CREATE INDEX IF NOT EXISTS activation_milestones_org_idx
  ON activation_milestones (organization_id);

-- ── Usage alerts ─────────────────────────────────────────────────────
-- One row per (user, resource, period, threshold) so a customer is told
-- once per billing period per threshold instead of on every request.
CREATE TABLE IF NOT EXISTS usage_alerts (
  id         text PRIMARY KEY,
  user_id    text NOT NULL,
  resource   varchar(50) NOT NULL,
  threshold  integer NOT NULL,
  period     varchar(7) NOT NULL, -- YYYY-MM
  current    integer,
  limit_value integer,
  sent_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_alerts_unique_idx
  ON usage_alerts (user_id, resource, period, threshold);

-- Per-tenant overage policy. Absent row = platform default (hard cap).
ALTER TABLE users ADD COLUMN IF NOT EXISTS overage_policy varchar(20);
