-- Daily LLM call budget for the internal AI Team (callLLM in api/ai-team/lib.ts).
-- Does NOT cover callLLMMessages (customer-facing chat) — a runaway internal
-- shift loop must never throttle paying customers' bots.
--
-- increment_llm_usage() is an atomic upsert+increment so concurrent
-- serverless invocations never race on a read-then-write.

CREATE TABLE IF NOT EXISTS public.llm_usage_daily (
  day date PRIMARY KEY,
  call_count integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.increment_llm_usage(usage_day date)
RETURNS integer
LANGUAGE plpgsql
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
