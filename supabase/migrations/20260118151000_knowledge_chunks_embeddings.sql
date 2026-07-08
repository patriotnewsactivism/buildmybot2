CREATE EXTENSION IF NOT EXISTS vector;

-- knowledge_chunks was historically created out-of-band (drizzle db:push),
-- so create it here if missing to make the migration chain self-sufficient.
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  bot_id uuid,
  chunk_index integer NOT NULL DEFAULT 0,
  content text NOT NULL,
  token_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON public.knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops);
