DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bots'
      AND column_name = 'knowledge_base'
      AND data_type <> 'jsonb'
  ) THEN
    ALTER TABLE public.bots
      ALTER COLUMN knowledge_base TYPE jsonb
      USING to_jsonb(knowledge_base);
  END IF;
END $$;

ALTER TABLE public.bots
  ALTER COLUMN knowledge_base SET DEFAULT '[]'::jsonb;

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS embed_type text DEFAULT 'hover';

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS lead_capture jsonb DEFAULT '{"enabled":false,"promptAfter":3,"emailRequired":true,"nameRequired":false,"phoneRequired":false}'::jsonb;

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS analytics jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS organization_id uuid;

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS ab_test_config jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bots_organization_id_fkey'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
  ) THEN
    ALTER TABLE public.bots
      ADD CONSTRAINT bots_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations(id)
      ON DELETE SET NULL;
  END IF;
END $$;
