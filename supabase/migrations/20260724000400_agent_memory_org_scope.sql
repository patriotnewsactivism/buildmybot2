-- ai_agent_memories has no tenant column today — every row is implicitly
-- "house" (BuildMyBot's own internal sales/ops pipeline acting on its own
-- behalf), which is fine while System A never acts for a client org. The
-- moment an agent acts on behalf of a client organization, cross-tenant
-- memory recall becomes a data-governance incident, so this column goes in
-- now rather than after that happens. Defaults to 'house' so every existing
-- call site (none of which pass an org today) keeps its current behavior
-- with zero code changes required beyond the function signatures.

ALTER TABLE public.ai_agent_memories
  ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'house';

CREATE INDEX IF NOT EXISTS ai_agent_memories_org_idx
  ON public.ai_agent_memories (organization_id, created_at DESC);

-- PostgreSQL treats an added trailing parameter as a distinct overload, not
-- a replacement of the 6-arg version — drop it explicitly so callers can't
-- accidentally resolve to the old, non-org-scoped signature.
DROP FUNCTION IF EXISTS public.match_agent_memories(
  public.vector(1536), text, text, text, float, int
);

CREATE OR REPLACE FUNCTION public.match_agent_memories(
  query_embedding public.vector(1536),
  match_subject_type text DEFAULT NULL,
  match_subject_id   text DEFAULT NULL,
  match_role_id      text DEFAULT NULL,
  match_threshold    float DEFAULT 0.3,
  match_count        int   DEFAULT 8,
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
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id, m.role_id, m.subject_type, m.subject_id, m.content, m.metadata,
    m.created_at,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM public.ai_agent_memories m
  WHERE m.embedding IS NOT NULL
    AND m.organization_id = match_organization_id
    AND (match_subject_type IS NULL OR m.subject_type = match_subject_type)
    AND (match_subject_id   IS NULL OR m.subject_id   = match_subject_id)
    AND (match_role_id      IS NULL OR m.role_id      = match_role_id)
    AND 1 - (m.embedding <=> query_embedding) >= match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
