-- Agent Memory + Error Recovery infrastructure for the autonomous AI Team.
-- 1. ai_agent_memories: pgvector-backed long-term memory. Every agent action
--    (email sent, lead touched, system observation) is embedded and stored
--    here; every agent reads relevant memories BEFORE executing a task.
-- 2. match_agent_memories: cosine-similarity RPC used by api/ai-team/lib.ts
--    recallMemories(). Mirrors the existing match_knowledge_chunks pattern.
-- 3. error_logs: real schema for the table the ErrorRecoveryDashboard
--    already reads via /api/bots/errors/recent (gateway handleBotErrors).
--    Previously undefined; agents now write unresolvable states here.
-- 4. leads: follow-up tracking columns used by api/cron/lead-followups.ts.

CREATE EXTENSION IF NOT EXISTS vector;

-- ── 1. Agent memory store (pgvector) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_agent_memories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id      text NOT NULL,                       -- which AI employee wrote this
  subject_type text NOT NULL DEFAULT 'system',      -- 'lead' | 'company' | 'system'
  subject_id   text,                                -- e.g. leads.id when subject_type='lead'
  content      text NOT NULL,                       -- the fact/observation itself
  embedding    public.vector(1536),                 -- text-embedding-3-small, matches knowledge_chunks
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_agent_memories_subject_idx
  ON public.ai_agent_memories (subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_agent_memories_role_idx
  ON public.ai_agent_memories (role_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_agent_memories_embedding_idx
  ON public.ai_agent_memories
  USING hnsw (embedding public.vector_cosine_ops);

-- ── 2. Similarity-search RPC ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_agent_memories(
  query_embedding public.vector(1536),
  match_subject_type text DEFAULT NULL,
  match_subject_id   text DEFAULT NULL,
  match_role_id      text DEFAULT NULL,
  match_threshold    float DEFAULT 0.3,
  match_count        int   DEFAULT 8
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
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id, m.role_id, m.subject_type, m.subject_id, m.content, m.metadata,
    m.created_at,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM public.ai_agent_memories m
  WHERE m.embedding IS NOT NULL
    AND (match_subject_type IS NULL OR m.subject_type = match_subject_type)
    AND (match_subject_id   IS NULL OR m.subject_id   = match_subject_id)
    AND (match_role_id      IS NULL OR m.role_id      = match_role_id)
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── 3. Error recovery log (feeds ErrorRecoveryDashboard) ───────────────────
CREATE TABLE IF NOT EXISTS public.error_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id      uuid,                                  -- nullable: agent errors aren't bot-scoped
  source      text NOT NULL,                         -- e.g. 'cron/lead-followups', 'ai-team/runRoleShift'
  level       text NOT NULL DEFAULT 'error',         -- 'warning' | 'error' | 'critical'
  message     text NOT NULL,
  context     jsonb NOT NULL DEFAULT '{}'::jsonb,    -- actionable detail for admin review
  status      text NOT NULL DEFAULT 'open',          -- 'open' | 'resolved' (gateway resolve sets this)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS error_logs_status_idx
  ON public.error_logs (status, created_at DESC);

-- ── 4. Lead follow-up tracking columns ──────────────────────────────────────
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS replied_at         timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS follow_up_sent_at  timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_ai_action_at  timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ai_notes           text;
