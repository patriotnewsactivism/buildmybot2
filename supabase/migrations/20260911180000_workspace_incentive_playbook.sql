-- Workspace Support Manager incentive playbook (config only).
-- DO NOT apply to production until docs/MIGRATION_BASELINE_RECONCILIATION.md
-- hold is cleared. Runtime currently reads organizations.settings.incentivePlaybook
-- with safe in-code defaults, so this table is an optional durable store.

CREATE TABLE IF NOT EXISTS public.workspace_incentive_configs (
  organization_id text PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  max_percent_off numeric(5,2) NOT NULL DEFAULT 25 CHECK (max_percent_off >= 0 AND max_percent_off <= 100),
  free_month_ceiling integer NOT NULL DEFAULT 1 CHECK (free_month_ceiling >= 0 AND free_month_ceiling <= 6),
  offers jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_incentive_offers_is_array CHECK (jsonb_typeof(offers) = 'array')
);

ALTER TABLE public.workspace_incentive_configs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.workspace_incentive_configs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_incentive_configs TO service_role;

COMMENT ON TABLE public.workspace_incentive_configs IS
  'Pre-approved Support Manager incentive tiers per workspace. Application code fails closed without objection tag + value-pitch attempt; do not treat this table as open-ended discount authority.';

NOTIFY pgrst, 'reload schema';
