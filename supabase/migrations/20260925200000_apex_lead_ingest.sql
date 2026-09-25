-- Apex lead ingest (additive, idempotent).
--
-- DO NOT apply to production until docs/MIGRATION_BASELINE_RECONCILIATION.md
-- is completed for this migration. Production project blyebndyrojmreensbxe is
-- under a migration-history hold. Presence of this file is not approval to
-- run `supabase db push`.
--
-- Gives POST /api/integrations/apex/leads a durable idempotency key on the
-- existing CRM `leads` table: (organization_id, source='apex', external_id),
-- with a user-scoped fallback when the tenant has no organization yet.
-- Phone-only leads need email to be nullable. The column check already
-- allowed NULL; this only drops the NOT NULL constraint. The lead-followup
-- worker already skips rows with no email.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.leads ALTER COLUMN email DROP NOT NULL;

COMMENT ON COLUMN public.leads.external_id IS
  'Caller-supplied idempotency key. Apex ingest dedupes on (organization_id or user_id, source=apex, external_id).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_apex_org_external_id
  ON public.leads (organization_id, external_id)
  WHERE source = 'apex'
    AND external_id IS NOT NULL
    AND organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_apex_user_external_id
  ON public.leads (user_id, external_id)
  WHERE source = 'apex'
    AND external_id IS NOT NULL
    AND organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_organization_created_at
  ON public.leads (organization_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
