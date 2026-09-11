-- Four independent voice-agent definitions saved atomically per bot.
-- Runtime sessions use stable agent IDs: bot_id || ':' || department.
CREATE OR REPLACE FUNCTION public.valid_voice_team(config jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path = '' AS $$
DECLARE
  department text;
  agent jsonb;
  voices text[] := ARRAY[]::text[];
  names text[] := ARRAY[]::text[];
  field text;
BEGIN
  IF jsonb_typeof(config) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(config)) <> 4 THEN RETURN false; END IF;
  FOREACH department IN ARRAY ARRAY['receptionist', 'sales', 'support', 'manager'] LOOP
    agent := config -> department;
    IF jsonb_typeof(agent) IS DISTINCT FROM 'object'
      OR agent ->> 'department' IS DISTINCT FROM department
      OR agent #>> '{voice,provider}' IS DISTINCT FROM 'gemini'
      OR NOT COALESCE(agent #>> '{voice,voiceId}' = ANY(ARRAY['Aoede','Puck','Kore','Charon','Fenrir','Leda','Orus','Zephyr']), false)
      THEN RETURN false; END IF;
    FOREACH field IN ARRAY ARRAY['name','persona','speakingStyle','firstMessage'] LOOP
      IF jsonb_typeof(agent -> field) IS DISTINCT FROM 'string' OR length(btrim(agent ->> field)) = 0 THEN RETURN false; END IF;
    END LOOP;
    IF agent #>> '{voice,voiceId}' = ANY(voices) OR lower(btrim(agent ->> 'name')) = ANY(names) THEN RETURN false; END IF;
    voices := array_append(voices, agent #>> '{voice,voiceId}');
    names := array_append(names, lower(btrim(agent ->> 'name')));
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.valid_voice_team(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.valid_voice_team(jsonb) TO service_role;

CREATE TABLE public.voice_teams (
  bot_id text PRIMARY KEY REFERENCES public.bots(id) ON DELETE CASCADE,
  organization_id text,
  user_id text NOT NULL,
  config jsonb NOT NULL CHECK (public.valid_voice_team(config)),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX voice_teams_owner_idx ON public.voice_teams(user_id, organization_id);
ALTER TABLE public.voice_teams ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.voice_teams FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.voice_teams TO service_role;
COMMENT ON TABLE public.voice_teams IS 'Backend-only atomic configuration of four distinct Gemini Live agents per bot. Ownership is verified against bots on every request; revision prevents lost updates. Existing voice_agents rows retain the phone binding.';
NOTIFY pgrst, 'reload schema';
