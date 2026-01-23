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
