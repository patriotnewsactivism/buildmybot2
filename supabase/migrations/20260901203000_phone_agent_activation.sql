-- Guided phone-agent activation and tenant-isolated Twilio subaccounts.
-- Types and column names intentionally match the live BuildMyBot schema:
-- phone_numbers.id is integer, bots.id is text, and phone_number is canonical.

CREATE TABLE IF NOT EXISTS public.telephony_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text,
  user_id text,
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

-- Canonical phone activation columns used by the customer wizard.
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS knowledge_space_id uuid;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS twilio_subaccount_sid text;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS setup_method text NOT NULL DEFAULT 'new';
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS existing_business_number text;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS forwarding_mode text;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS test_until timestamptz;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

CREATE INDEX IF NOT EXISTS phone_numbers_twilio_subaccount_idx
  ON public.phone_numbers (twilio_subaccount_sid, status)
  WHERE twilio_subaccount_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS phone_numbers_knowledge_space_idx
  ON public.phone_numbers (knowledge_space_id)
  WHERE knowledge_space_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.phone_agent_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text,
  user_id text,
  telephony_account_id uuid REFERENCES public.telephony_accounts(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('new', 'forward', 'port')),
  source_number text,
  destination_number_id integer REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  bot_id text REFERENCES public.bots(id) ON DELETE SET NULL,
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

-- Backend-only operational tables. Service-role access bypasses RLS; browser
-- roles have no direct grants and no permissive policies.
ALTER TABLE public.telephony_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_agent_activations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.telephony_accounts FROM anon, authenticated;
REVOKE ALL ON TABLE public.phone_agent_activations FROM anon, authenticated;

COMMENT ON TABLE public.telephony_accounts IS
  'Per-tenant telephony provider accounts. Provider auth tokens are encrypted server-side and never returned to clients.';
COMMENT ON TABLE public.phone_agent_activations IS
  'Auditable state for new-number, forwarding, and port phone-agent onboarding.';
COMMENT ON COLUMN public.phone_numbers.twilio_subaccount_sid IS
  'Twilio subaccount that owns provider_number_id for tenant-isolated phone routing.';
