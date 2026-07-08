-- knowledge_sources was historically created out-of-band (drizzle db:push),
-- so create it here if missing to make the migration chain self-sufficient.
CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid,
  organization_id uuid,
  source_type text NOT NULL DEFAULT 'text', -- url | file | text
  source_name text,
  source_url text,
  status text NOT NULL DEFAULT 'pending',   -- pending | processing | ready | failed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS processing_state jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;

ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS last_processed_at timestamp with time zone;

ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS source_text text;

ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS page_count integer;

ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS next_retry_at timestamp with time zone;

ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamp with time zone;
