-- phone_numbers and call_logs are used extensively by api/gateway.ts
-- (handlePhone) and api/twilio/service.ts (initiateOutboundCall,
-- logCallOutcome) but neither table appears in any prior tracked
-- migration — they were either created out-of-band directly in the
-- Supabase dashboard, or every read/write against them has been silently
-- swallowed by the .catch(() => []) fallbacks throughout those call sites.
-- Either way, this makes both tables real and idempotent to (re)apply.
--
-- Column shapes are taken from actual usage in the code, not from
-- shared/schema.ts's Drizzle definitions (which use an integer PK for
-- phone_numbers — inconsistent with the uuid ids the gateway actually
-- inserts, and are local-script-only per CLAUDE.md, not what production
-- serverless functions read/write).

CREATE TABLE IF NOT EXISTS public.phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  number text NOT NULL,
  friendly_name text,
  provider text NOT NULL DEFAULT 'twilio',
  provider_number_sid text,
  bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

CREATE INDEX IF NOT EXISTS phone_numbers_org_idx
  ON public.phone_numbers (organization_id, status);
CREATE INDEX IF NOT EXISTS phone_numbers_number_idx
  ON public.phone_numbers (number);

-- In case the table already exists live with a different shape, make sure
-- the columns this pass depends on are present.
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS provider_number_sid text;
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.phone_numbers ADD COLUMN IF NOT EXISTS released_at timestamptz;

CREATE TABLE IF NOT EXISTS public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_agent_id text,
  bot_id uuid,
  user_id text,
  lead_id uuid,
  provider text NOT NULL DEFAULT 'twilio',
  direction text NOT NULL, -- inbound | outbound
  caller_number text,
  called_number text,
  call_sid text,
  status text NOT NULL DEFAULT 'initiating',
  duration integer, -- seconds
  recording_url text,
  transcript jsonb,
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS call_logs_bot_idx ON public.call_logs (bot_id, started_at DESC);
CREATE INDEX IF NOT EXISTS call_logs_lead_idx ON public.call_logs (lead_id);
CREATE INDEX IF NOT EXISTS call_logs_number_idx ON public.call_logs (called_number, caller_number);
