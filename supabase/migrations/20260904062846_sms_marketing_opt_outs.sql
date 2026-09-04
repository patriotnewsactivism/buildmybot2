-- SMS marketing support: outbound send log + carrier-compliance opt-out list.
-- New capability added alongside the Twilio->Telnyx telephony migration
-- (see api/sms/send.ts, api/sms/webhooks.ts, api/lib/telephony-provider.ts).

CREATE TABLE IF NOT EXISTS public.sms_opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  organization_id text,
  user_id text,
  reason text NOT NULL DEFAULT 'stop_keyword',
  opted_out_at timestamptz NOT NULL DEFAULT now()
);

-- A phone number can opt out globally (org/user null) or scoped to a
-- specific sender's tenant, depending on how send.ts is called. Both
-- shapes are queried the same way (see sendMarketingSms in send.ts).
CREATE UNIQUE INDEX IF NOT EXISTS sms_opt_outs_number_scope_idx
  ON public.sms_opt_outs (
    phone_number,
    coalesce(organization_id, ''),
    coalesce(user_id, '')
  );

CREATE TABLE IF NOT EXISTS public.sms_marketing_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text,
  user_id text,
  to_number text NOT NULL,
  from_number text,
  body text NOT NULL,
  provider text NOT NULL DEFAULT 'telnyx',
  provider_message_id text,
  status text NOT NULL DEFAULT 'queued',
  direction text NOT NULL DEFAULT 'outbound',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_marketing_messages_to_idx
  ON public.sms_marketing_messages (to_number, created_at DESC);

ALTER TABLE public.sms_opt_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_marketing_messages ENABLE ROW LEVEL SECURITY;
-- Fail-closed by default (matches the rest of this schema's RLS posture,
-- see 20260822001303_enable_rls_all_public_tables.sql) -- all access goes
-- through the service-role key from api/sms/*.ts, never client-side.
