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

-- ── Missing-answer inbox / answer feedback ───────────────────────────
-- One row per graded Q/A turn. `status='unanswered' AND resolved=false`
-- is the owner's inbox; a correction sets resolved and is appended to the
-- bot's knowledge base, so answering the inbox is how a bot gets trained.
CREATE TABLE IF NOT EXISTS answer_events (
  id               text PRIMARY KEY,
  bot_id           text NOT NULL,
  user_id          text,
  organization_id  text,
  session_id       text,
  channel          varchar(20) DEFAULT 'chat',
  question         text NOT NULL,
  answer           text,
  status           varchar(20) NOT NULL DEFAULT 'answered',
  reason           varchar(40),
  confidence       real,
  feedback         varchar(10),
  corrected_answer text,
  resolved         boolean NOT NULL DEFAULT false,
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS answer_events_inbox_idx
  ON answer_events (bot_id, status, resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS answer_events_org_idx
  ON answer_events (organization_id);
