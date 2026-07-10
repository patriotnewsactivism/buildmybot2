-- Trial system fields on users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS payment_attempt_count integer DEFAULT 0;

-- Partners table (for the partner dashboard)
CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid,
  tier text NOT NULL DEFAULT 'bronze',  -- bronze, silver, gold, platinum
  commission_rate numeric(5,4) NOT NULL DEFAULT 0.15,
  status text NOT NULL DEFAULT 'active',
  referral_code text UNIQUE,
  total_earned numeric(12,2) DEFAULT 0,
  total_paid numeric(12,2) DEFAULT 0,
  pending_payout numeric(12,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partners_user_id_idx ON public.partners(user_id);
CREATE INDEX IF NOT EXISTS partners_referral_code_idx ON public.partners(referral_code);

-- Partner clients
CREATE TABLE IF NOT EXISTS public.partner_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  organization_id uuid,
  client_name text,
  client_email text,
  plan text DEFAULT 'FREE',
  monthly_revenue numeric(12,2) DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Partner payouts history
CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, processing, paid, failed
  payout_method text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Resellers table
CREATE TABLE IF NOT EXISTS public.resellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid,
  tier text NOT NULL DEFAULT 'bronze',
  commission_rate numeric(5,4) NOT NULL DEFAULT 0.20,
  referral_code text UNIQUE,
  total_earned numeric(12,2) DEFAULT 0,
  total_paid numeric(12,2) DEFAULT 0,
  pending_payout numeric(12,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  branding jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resellers_user_id_idx ON public.resellers(user_id);

-- Reseller clients
CREATE TABLE IF NOT EXISTS public.reseller_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid REFERENCES public.resellers(id) ON DELETE CASCADE,
  organization_id uuid,
  client_name text,
  client_email text,
  plan text DEFAULT 'FREE',
  status text DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit log table (ensure it exists with proper columns)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  organization_id uuid,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs(action);
