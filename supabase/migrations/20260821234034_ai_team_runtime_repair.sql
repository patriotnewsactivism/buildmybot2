-- Consolidated, idempotent repair for the live AI Team runtime.
-- Migration version matches the production Supabase history.
-- Production showed the application code ahead of its database: missing
-- ai_agent_memories.organization_id, match_agent_memories, context columns,
-- audit_logs.user_email, and the durable LLM call governor. Reapplying this
-- migration is safe and also adds explicit service_role grants required by
-- Supabase's new non-auto-exposure default for newly created entities.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.ai_agent_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id text NOT NULL,
  subject_type text NOT NULL DEFAULT 'system',
  subject_id text,
  content text NOT NULL,
  embedding public.vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  organization_id text NOT NULL DEFAULT 'house',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agent_memories
  ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'house';

CREATE INDEX IF NOT EXISTS ai_agent_memories_subject_idx
  ON public.ai_agent_memories (subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_agent_memories_role_idx
  ON public.ai_agent_memories (role_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_agent_memories_org_idx
  ON public.ai_agent_memories (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_agent_memories_embedding_idx
  ON public.ai_agent_memories
  USING hnsw (embedding public.vector_cosine_ops);

DROP FUNCTION IF EXISTS public.match_agent_memories(
  public.vector(1536), text, text, text, float, int
);

CREATE OR REPLACE FUNCTION public.match_agent_memories(
  query_embedding public.vector(1536),
  match_subject_type text DEFAULT NULL,
  match_subject_id text DEFAULT NULL,
  match_role_id text DEFAULT NULL,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 8,
  match_organization_id text DEFAULT 'house'
)
RETURNS TABLE (
  id uuid,
  role_id text,
  subject_type text,
  subject_id text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.role_id,
    m.subject_type,
    m.subject_id,
    m.content,
    m.metadata,
    m.created_at,
    1 - (m.embedding OPERATOR(public.<=>) query_embedding) AS similarity
  FROM public.ai_agent_memories m
  WHERE m.embedding IS NOT NULL
    AND m.organization_id = match_organization_id
    AND (match_subject_type IS NULL OR m.subject_type = match_subject_type)
    AND (match_subject_id IS NULL OR m.subject_id = match_subject_id)
    AND (match_role_id IS NULL OR m.role_id = match_role_id)
    AND 1 - (m.embedding OPERATOR(public.<=>) query_embedding) >= match_threshold
  ORDER BY m.embedding OPERATOR(public.<=>) query_embedding
  LIMIT match_count;
END;
$$;

CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid,
  source text NOT NULL,
  level text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS error_logs_status_idx
  ON public.error_logs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_employee text NOT NULL,
  to_employee text NOT NULL,
  subject text,
  body text NOT NULL,
  thread_id uuid,
  requires_president boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'sent',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  employee_id text,
  from_address text,
  subject text,
  summary text,
  reason text,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  forwarded_to text NOT NULL DEFAULT 'president@buildmybot.app',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.agent_messages
  ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.escalations
  ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_email text;

CREATE TABLE IF NOT EXISTS public.llm_usage_daily (
  day date PRIMARY KEY,
  call_count integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.increment_llm_usage(usage_day date)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO public.llm_usage_daily (day, call_count)
  VALUES (usage_day, 1)
  ON CONFLICT (day)
  DO UPDATE SET call_count = public.llm_usage_daily.call_count + 1
  RETURNING call_count INTO new_count;

  RETURN new_count;
END;
$$;

GRANT USAGE ON SCHEMA public TO service_role;
REVOKE ALL PRIVILEGES ON TABLE
  public.ai_agent_memories,
  public.error_logs,
  public.agent_messages,
  public.escalations,
  public.audit_logs,
  public.llm_usage_daily
FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.ai_agent_memories,
  public.error_logs,
  public.agent_messages,
  public.escalations,
  public.audit_logs,
  public.llm_usage_daily
TO service_role;
REVOKE EXECUTE ON FUNCTION public.match_agent_memories(
  public.vector(1536), text, text, text, float, int, text
) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_llm_usage(date)
  FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_agent_memories(
  public.vector(1536), text, text, text, float, int, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_llm_usage(date) TO service_role;

ALTER TABLE public.ai_agent_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_usage_daily ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

COMMIT;
