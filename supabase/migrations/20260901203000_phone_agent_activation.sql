-- Phone Agent activation state and tenant-isolated Twilio subaccounts.
-- This migration extends the tracked production phone_numbers schema from
-- 20260724000500_phone_numbers_and_call_logs.sql. Keep canonical number,
-- provider_number_sid, bot_id, and UUID key types instead of creating aliases.

CREATE TABLE IF NOT EXISTS public.telephony_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  provider text NOT NULL DEFAULT 'twilio',
  provider_account_sid text NOT NULL,
  auth_token_encrypted text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS telephony_accounts_provider_sid_idx
  ON public.telephony_accounts (provider, provider_account_sid);
CREATE UNIQUE INDEX IF NOT EXISTS telephony_accounts_org_provider_idx
  ON public.telephony_accounts (provider, organization_id)
  WHERE organization_id IS NOT NULL AND status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS telephony_accounts_user_provider_idx
  ON public.telephony_accounts (provider, user_id)
  WHERE organization_id IS NULL AND user_id IS NOT NULL AND status = 'active';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS voice_plan text;

ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS voice_agent_id text;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS provider_account_sid text;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS setup_mode text;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS source_number text;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS activation_status text NOT NULL DEFAULT 'active';
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

-- Existing/legacy rows have provider_account_sid NULL, so this constraint only
-- governs newly provisioned tenant numbers and cannot collide with legacy rows.
CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_active_provider_number_uidx
  ON public.phone_numbers (provider_account_sid, number)
  WHERE provider_account_sid IS NOT NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS public.phone_agent_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  telephony_account_id uuid REFERENCES public.telephony_accounts(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('new', 'forward', 'port')),
  source_number text,
  destination_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL,
  knowledge_mode text NOT NULL DEFAULT 'shared'
    CHECK (knowledge_mode IN ('shared', 'voice_only')),
  carrier text,
  status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);

CREATE INDEX IF NOT EXISTS phone_agent_activations_org_idx
  ON public.phone_agent_activations (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS phone_agent_activations_user_idx
  ON public.phone_agent_activations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS phone_agent_activations_status_idx
  ON public.phone_agent_activations (status, created_at DESC);

-- Backend-only tables. The service role bypasses RLS; browser roles get no
-- direct grants and no policies.
ALTER TABLE public.telephony_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_agent_activations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.telephony_accounts FROM anon, authenticated;
REVOKE ALL ON TABLE public.phone_agent_activations FROM anon, authenticated;

COMMENT ON TABLE public.telephony_accounts IS
  'Per-tenant telephony provider accounts. Provider auth tokens are encrypted server-side and are never returned to clients.';
COMMENT ON TABLE public.phone_agent_activations IS
  'Auditable phone onboarding state for new-number, forwarding, and port workflows.';
COMMENT ON COLUMN public.phone_numbers.provider_account_sid IS
  'Twilio account/subaccount that owns provider_number_sid.';
