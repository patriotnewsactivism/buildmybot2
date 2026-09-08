-- Unified Outcome Ledger publisher outbox.
--
-- BuildMyBot owns its operational transaction. APEX owns the canonical cross-
-- portfolio ledger. This outbox is the durable handoff between them: a local
-- business transaction commits once, then the server publisher retries until
-- APEX accepts the idempotency key. No revenue or labor savings are inferred.

CREATE TABLE IF NOT EXISTS public.outcome_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outcome_event_outbox_pending_idx
  ON public.outcome_event_outbox (next_attempt_at, created_at)
  WHERE published_at IS NULL;

ALTER TABLE public.outcome_event_outbox ENABLE ROW LEVEL SECURITY;
-- There are deliberately no anon/authenticated policies. Server-side service
-- role access and SECURITY DEFINER triggers are the only writers/readers.

CREATE OR REPLACE FUNCTION public.enqueue_outcome_event(
  p_event_key text,
  p_payload jsonb,
  p_occurred_at timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.outcome_event_outbox (event_key, payload, occurred_at)
  VALUES (p_event_key, p_payload, p_occurred_at)
  ON CONFLICT (event_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_outcome_event(text,jsonb,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_outcome_event(text,jsonb,timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_outcome_event(text,jsonb,timestamptz) FROM authenticated;

CREATE OR REPLACE FUNCTION public.outcome_row_tenant(p_row jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(p_row->>'organization_id',''),
    NULLIF(p_row->>'user_id',''),
    NULLIF(p_row->>'tenant_id',''),
    'buildmybot'
  );
$$;

-- Lead lifecycle evidence -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_lead_outcome_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_json jsonb := to_jsonb(NEW);
  old_json jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  tenant text := public.outcome_row_tenant(row_json);
  external_id text := row_json->>'id';
  event_type text;
  event_key text;
  outcome_json jsonb := NULL;
BEGIN
  IF TG_OP = 'INSERT' THEN
    event_type := 'lead.sourced';
    event_key := 'buildmybot:lead:' || external_id || ':sourced';
  ELSIF NULLIF(row_json->>'replied_at','') IS NOT NULL AND NULLIF(old_json->>'replied_at','') IS NULL THEN
    event_type := 'lead.responded';
    event_key := 'buildmybot:lead:' || external_id || ':responded';
    outcome_json := jsonb_build_object(
      'outcomeType','lead_response','metricName','lead_response','measuredResult',true,
      'unit','boolean','classification','MEASURED','confidence',1
    );
  ELSIF row_json->>'status' IS DISTINCT FROM old_json->>'status' THEN
    event_type := CASE lower(COALESCE(row_json->>'status',''))
      WHEN 'contacted' THEN 'lead.contacted'
      WHEN 'qualified' THEN 'lead.qualified'
      WHEN 'won' THEN 'lead.won'
      WHEN 'lost' THEN 'lead.lost'
      ELSE 'lead.status_changed'
    END;
    event_key := 'buildmybot:lead:' || external_id || ':status:' || COALESCE(row_json->>'status','unknown');
    IF lower(COALESCE(row_json->>'status','')) = 'qualified' THEN
      outcome_json := jsonb_build_object(
        'outcomeType','lead_qualification','metricName','lead_qualified','measuredResult',true,
        'unit','boolean','classification','MEASURED','confidence',1
      );
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.enqueue_outcome_event(
    event_key,
    jsonb_strip_nulls(jsonb_build_object(
      'schemaVersion',1,
      'idempotencyKey',event_key,
      'source','buildmybot',
      'organizationId',tenant,
      'tenantId',tenant,
      'occurredAt',COALESCE(row_json->>'updated_at',row_json->>'created_at',now()::text),
      'traceId','lead:' || external_id,
      'activity',jsonb_build_object(
        'eventType',event_type,
        'responsibleAgentId',row_json->>'ai_agent_id',
        'responsibleWorkflow','lead-lifecycle',
        'humanIntervention',false
      ),
      'entity',jsonb_build_object(
        'type','Lead','externalId',external_id,
        'name',COALESCE(row_json->>'name',row_json->>'email'),
        'attributes',jsonb_strip_nulls(jsonb_build_object(
          'botId',row_json->>'bot_id','status',row_json->>'status','source',row_json->>'source'
        ))
      ),
      'outcome',outcome_json,
      'metadata',jsonb_strip_nulls(jsonb_build_object('botId',row_json->>'bot_id'))
    )),
    COALESCE(NULLIF(row_json->>'updated_at','')::timestamptz,NULLIF(row_json->>'created_at','')::timestamptz,now())
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_outcome_event_outbox ON public.leads;
CREATE TRIGGER leads_outcome_event_outbox
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.publish_lead_outcome_event();

-- Conversation creation evidence --------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_conversation_outcome_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_json jsonb := to_jsonb(NEW);
  tenant text := public.outcome_row_tenant(row_json);
  external_id text := row_json->>'id';
  event_key text := 'buildmybot:conversation:' || (row_json->>'id') || ':started';
  occurred timestamptz := COALESCE(NULLIF(row_json->>'created_at','')::timestamptz,now());
BEGIN
  PERFORM public.enqueue_outcome_event(
    event_key,
    jsonb_build_object(
      'schemaVersion',1,'idempotencyKey',event_key,'source','buildmybot',
      'organizationId',tenant,'tenantId',tenant,'occurredAt',occurred,
      'traceId','conversation:' || external_id,
      'activity',jsonb_build_object('eventType','conversation.started','responsibleWorkflow','chatbot-conversation','humanIntervention',false),
      'entity',jsonb_build_object('type','Conversation','externalId',external_id,'attributes',jsonb_strip_nulls(jsonb_build_object('botId',row_json->>'bot_id')))
    ),
    occurred
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_outcome_event_outbox ON public.conversations;
CREATE TRIGGER conversations_outcome_event_outbox
AFTER INSERT ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.publish_conversation_outcome_event();

-- Phone call lifecycle evidence ---------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_call_outcome_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_json jsonb := to_jsonb(NEW);
  old_json jsonb := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  tenant text := public.outcome_row_tenant(row_json);
  external_id text := row_json->>'id';
  event_type text;
  event_key text;
  occurred timestamptz;
  terminal boolean := lower(COALESCE(row_json->>'status','')) IN ('completed','failed','busy','no-answer','canceled');
BEGIN
  IF TG_OP='INSERT' THEN
    event_type := 'call.started';
    event_key := 'buildmybot:call:' || external_id || ':started';
    occurred := COALESCE(NULLIF(row_json->>'started_at','')::timestamptz,now());
  ELSIF terminal AND (row_json->>'status' IS DISTINCT FROM old_json->>'status' OR (row_json->>'ended_at' IS NOT NULL AND old_json->>'ended_at' IS NULL)) THEN
    event_type := CASE WHEN lower(COALESCE(row_json->>'status',''))='completed' THEN 'call.completed' ELSE 'call.failed' END;
    event_key := 'buildmybot:call:' || external_id || ':terminal:' || COALESCE(row_json->>'status','unknown');
    occurred := COALESCE(NULLIF(row_json->>'ended_at','')::timestamptz,now());
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.enqueue_outcome_event(
    event_key,
    jsonb_build_object(
      'schemaVersion',1,'idempotencyKey',event_key,'source','buildmybot',
      'organizationId',tenant,'tenantId',tenant,'occurredAt',occurred,
      'traceId',COALESCE(row_json->>'call_sid','call:' || external_id),
      'activity',jsonb_strip_nulls(jsonb_build_object(
        'eventType',event_type,'responsibleAgentId',row_json->>'voice_agent_id',
        'responsibleWorkflow','voice-call','humanIntervention',false
      )),
      'entity',jsonb_build_object('type','Call','externalId',external_id,'attributes',jsonb_strip_nulls(jsonb_build_object(
        'botId',row_json->>'bot_id','leadId',row_json->>'lead_id','direction',row_json->>'direction','provider',row_json->>'provider','status',row_json->>'status','durationSeconds',row_json->>'duration'
      ))),
      'outcome',CASE WHEN terminal THEN jsonb_build_object(
        'outcomeType','call_completion','metricName','call_completed',
        'measuredResult',lower(COALESCE(row_json->>'status',''))='completed',
        'unit','boolean','classification','MEASURED','confidence',1,
        'status',row_json->>'status','evidence',jsonb_strip_nulls(jsonb_build_object('durationSeconds',row_json->>'duration'))
      ) ELSE NULL END,
      'metadata',jsonb_strip_nulls(jsonb_build_object('leadId',row_json->>'lead_id','botId',row_json->>'bot_id'))
    ),
    occurred
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS call_logs_outcome_event_outbox ON public.call_logs;
CREATE TRIGGER call_logs_outcome_event_outbox
AFTER INSERT OR UPDATE ON public.call_logs
FOR EACH ROW EXECUTE FUNCTION public.publish_call_outcome_event();

COMMENT ON TABLE public.outcome_event_outbox IS
  'Durable, service-role-only outbox for standardized APEX Outcome Ledger events. Values marked MEASURED/ESTIMATED/INFERRED/UNKNOWN must never be silently upgraded.';
