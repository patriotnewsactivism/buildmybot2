-- 10DLC brand + campaign registration records, so a tenant's SMS marketing
-- carrier-registration status can be shown/polled in the BuildMyBot UI
-- without them ever visiting Telnyx directly. One brand+campaign per tenant
-- (LOW_VOLUME use case, simplified registration path -- see
-- api/sms/register.ts). Real business info is sent straight through to
-- Telnyx's Brands/Campaigns API; only IDs + status are kept here.

CREATE TABLE IF NOT EXISTS public.sms_10dlc_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text,
  user_id text,
  telnyx_brand_id text,
  company_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  vetting_score integer,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One brand per tenant scope (org if present, else user).
CREATE UNIQUE INDEX IF NOT EXISTS sms_10dlc_brands_tenant_idx
  ON public.sms_10dlc_brands (
    coalesce(organization_id, ''),
    coalesce(user_id, '')
  );

CREATE TABLE IF NOT EXISTS public.sms_10dlc_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_row_id uuid NOT NULL REFERENCES public.sms_10dlc_brands (id) ON DELETE CASCADE,
  organization_id text,
  user_id text,
  telnyx_campaign_id text,
  usecase text NOT NULL DEFAULT 'LOW_VOLUME',
  status text NOT NULL DEFAULT 'pending',
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_10dlc_campaigns_brand_idx
  ON public.sms_10dlc_campaigns (brand_row_id);

ALTER TABLE public.sms_10dlc_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_10dlc_campaigns ENABLE ROW LEVEL SECURITY;
-- Fail-closed by default (matches this schema's RLS posture) -- all access
-- goes through the service-role key from api/sms/register.ts, never
-- client-side.
