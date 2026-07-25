-- analytics_events was historically created out-of-band (drizzle db:push),
-- so create it here if missing to make the migration chain self-sufficient
-- (same reasoning as the knowledge_sources migration). Instrumented funnel
-- moments: lead_captured, outreach_sent, followup_sent, call_completed.
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  bot_id uuid,
  user_id uuid,
  event_type varchar(50) NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_org_type
  ON public.analytics_events (organization_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_bot
  ON public.analytics_events (bot_id, created_at DESC);
