from pathlib import Path


def replace_between(text: str, start: str, end: str, replacement: str) -> str:
    start_index = text.index(start)
    end_index = text.index(end, start_index)
    return text[:start_index] + replacement.rstrip() + "\n\n" + text[end_index:]


# --- Migration: normalize to the tracked production schema and lock client access. ---
migration = Path('supabase/migrations/20260901203000_phone_agent_activation.sql')
migration.write_text(r'''-- Phone Agent activation state and tenant-isolated Twilio subaccounts.
-- This migration extends the tracked production phone_numbers schema from
-- 20260724000500_phone_numbers_and_call_logs.sql. Keep canonical number,
-- provider_number_sid, bot_id, and UUID key types instead of creating aliases.

CREATE TABLE IF NOT EXISTS public.telephony_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  provider text NOT NULL DEFAULT 'twilio',
  provider_account_sid text NOT NULL,
  auth_token_encrypted text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS telephony_accounts_provider_sid_idx
  ON public.telephony_accounts (provider, provider_account_sid);
CREATE UNIQUE INDEX IF NOT EXISTS telephony_accounts_org_provider_idx
  ON public.telephony_accounts (provider, organization_id)
  WHERE organization_id IS NOT NULL AND status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS telephony_accounts_user_provider_idx
  ON public.telephony_accounts (provider, user_id)
  WHERE organization_id IS NULL AND user_id IS NOT NULL AND status = 'active';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS voice_plan text;

ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS voice_agent_id text;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS provider_account_sid text;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS setup_mode text;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS source_number text;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS activation_status text NOT NULL DEFAULT 'active';
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

-- Existing/legacy rows have provider_account_sid NULL, so this constraint only
-- governs newly provisioned tenant numbers and cannot collide with legacy rows.
CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_active_provider_number_uidx
  ON public.phone_numbers (provider_account_sid, number)
  WHERE provider_account_sid IS NOT NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS public.phone_agent_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id uuid,
  telephony_account_id uuid REFERENCES public.telephony_accounts(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('new', 'forward', 'port')),
  source_number text,
  destination_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL,
  knowledge_mode text NOT NULL DEFAULT 'shared'
    CHECK (knowledge_mode IN ('shared', 'voice_only')),
  carrier text,
  status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);

CREATE INDEX IF NOT EXISTS phone_agent_activations_org_idx
  ON public.phone_agent_activations (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS phone_agent_activations_user_idx
  ON public.phone_agent_activations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS phone_agent_activations_status_idx
  ON public.phone_agent_activations (status, created_at DESC);

-- Backend-only tables. The service role bypasses RLS; browser roles get no
-- direct grants and no policies.
ALTER TABLE public.telephony_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_agent_activations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.telephony_accounts FROM anon, authenticated;
REVOKE ALL ON TABLE public.phone_agent_activations FROM anon, authenticated;

COMMENT ON TABLE public.telephony_accounts IS
  'Per-tenant telephony provider accounts. Provider auth tokens are encrypted server-side and are never returned to clients.';
COMMENT ON TABLE public.phone_agent_activations IS
  'Auditable phone onboarding state for new-number, forwarding, and port workflows.';
COMMENT ON COLUMN public.phone_numbers.provider_account_sid IS
  'Twilio account/subaccount that owns provider_number_sid.';
''')


# --- Activation API hardening and schema normalization. ---
activation_path = Path('api/phone/activation.ts')
a = activation_path.read_text()
a = a.replace(
    "const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;",
    "const SUPABASE_URL = process.env.SUPABASE_URL;",
)
a = a.replace(
'''interface VoiceAgentLink {
  id: string;
  botId: string;
  knowledgeSpaceId?: string | null;
}''',
'''interface VoiceAgentLink {
  id: string;
  botId: string;
}''')

# Add a service-role delete helper for compensation paths.
owner_marker = 'function ownerFilter(user: AuthUser): Record<string, string> {'
if 'async function sbDelete(' not in a:
    owner_index = a.index(owner_marker)
    delete_helper = '''async function sbDelete(
  table: string,
  filters: Record<string, string>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    params.set(key, value);
  }
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`,
    {
      method: 'DELETE',
      headers: SUPABASE_HEADERS,
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Supabase delete failed for ${table}: ${response.status} ${detail}`.trim(),
    );
  }
}

'''
    a = a[:owner_index] + delete_helper + a[owner_index:]

new_ensure_voice = r'''async function ensureVoiceAgentForBot(
  user: AuthUser,
  botId: string,
): Promise<VoiceAgentLink> {
  const bots = await sbSelect('bots', 'id,name,system_prompt', {
    ...ownerFilter(user),
    id: `eq.${botId}`,
    limit: '1',
  }).catch(() => []);
  const bot = bots?.[0];
  if (!bot?.id) {
    throw new Error('The selected knowledge workspace is not available');
  }

  const existing = await sbSelect(
    'voice_agents',
    'id,bot_id,enabled,is_active',
    { bot_id: `eq.${botId}`, limit: '1' },
  ).catch(() => []);
  if (existing?.[0]?.id) {
    if (!existing[0].enabled || existing[0].is_active === false) {
      const updated = await sbUpdate(
        'voice_agents',
        {
          enabled: true,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { id: `eq.${existing[0].id}` },
      );
      if (!updated?.[0]?.id || !updated[0].enabled || updated[0].is_active === false) {
        throw new Error('Unable to reactivate the selected voice agent');
      }
    }
    return { id: existing[0].id, botId };
  }

  const voiceAgentData = {
    id: randomUUID(),
    bot_id: botId,
    organization_id: user.organizationId || user.id,
    provider: 'gemini-live',
    enabled: true,
    is_active: true,
    system_prompt:
      bot.system_prompt ||
      'You are a helpful AI receptionist for this business. Never invent facts.',
    greeting: `Thanks for calling ${bot.name || 'the business'}. How can I help you today?`,
    voice_model: 'gemini-live',
    language: 'en',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const created = await sbInsert('voice_agents', voiceAgentData);
    if (!created?.[0]?.id) throw new Error('Voice agent was not persisted');
    return { id: created[0].id, botId };
  } catch (error) {
    const raced = await sbSelect(
      'voice_agents',
      'id,bot_id,enabled,is_active',
      { bot_id: `eq.${botId}`, limit: '1' },
    ).catch(() => []);
    if (raced?.[0]?.id && raced[0].enabled && raced[0].is_active !== false) {
      return { id: raced[0].id, botId };
    }
    throw error;
  }
}'''
a = replace_between(a, 'async function ensureVoiceAgentForBot(', 'async function listKnowledgeBots(', new_ensure_voice)

new_purchase = r'''async function purchaseDestinationNumber(options: {
  user: AuthUser;
  accountSid: string;
  phoneNumber: string;
  friendlyName?: string;
  voiceAgent: VoiceAgentLink;
  setupMode: 'new' | 'forward';
  sourceNumber?: string;
}) {
  const client = await tenantTwilioClient(options.accountSid);
  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber: options.phoneNumber,
    friendlyName: options.friendlyName || undefined,
    voiceUrl: `${TWILIO_WEBHOOK_BASE_URL}/api/phone/activation/twilio/inbound`,
    voiceMethod: 'POST',
    statusCallback: `${TWILIO_WEBHOOK_BASE_URL}/api/phone/activation/twilio/status`,
    statusCallbackMethod: 'POST',
  });

  try {
    const activatedAt =
      options.setupMode === 'new' ? new Date().toISOString() : null;
    const rows = await sbInsert('phone_numbers', {
      id: randomUUID(),
      voice_agent_id: options.voiceAgent.id,
      bot_id: options.voiceAgent.botId,
      user_id: options.user.id,
      organization_id: options.user.organizationId || null,
      provider: 'twilio',
      provider_number_sid: purchased.sid,
      number: purchased.phoneNumber,
      friendly_name: purchased.friendlyName || null,
      status: 'active',
      provider_account_sid: options.accountSid,
      setup_mode: options.setupMode,
      source_number: options.sourceNumber || null,
      activation_status:
        options.setupMode === 'new' ? 'active' : 'awaiting_forwarding',
      activated_at: activatedAt,
    });
    if (!rows?.[0]?.id) throw new Error('Phone number was not persisted');
    return { record: rows[0], purchased };
  } catch (error) {
    try {
      await client.incomingPhoneNumbers(purchased.sid).remove();
    } catch (cleanupError) {
      console.error(
        '[phone-activation] Failed to release number after DB insert failure:',
        cleanupError instanceof Error ? cleanupError.message : cleanupError,
      );
    }
    throw error;
  }
}'''
a = replace_between(a, 'async function purchaseDestinationNumber(', 'async function createActivationRecord(', new_purchase)

new_activation_helpers = r'''async function createActivationRecord(options: {
  user: AuthUser;
  accountId: string;
  mode: ActivationMode;
  botId: string;
  knowledgeMode: KnowledgeMode;
  sourceNumber?: string | null;
  destinationNumberId?: string | null;
  carrier?: string | null;
  status: string;
  metadata?: Record<string, unknown>;
}) {
  const rows = await sbInsert('phone_agent_activations', {
    id: randomUUID(),
    organization_id: options.user.organizationId || null,
    user_id: options.user.id,
    telephony_account_id: options.accountId,
    mode: options.mode,
    source_number: options.sourceNumber || null,
    destination_number_id: options.destinationNumberId || null,
    bot_id: options.botId,
    knowledge_mode: options.knowledgeMode,
    carrier: options.carrier || null,
    status: options.status,
    metadata: {
      created_from: '/app/phone',
      ...(options.metadata || {}),
    },
  });
  if (!rows?.[0]?.id) throw new Error('Activation record was not persisted');
  return rows[0];
}

async function updateActivationRecord(
  user: AuthUser,
  activationId: string,
  patch: Record<string, unknown>,
) {
  const rows = await sbUpdate('phone_agent_activations', patch, {
    ...ownerFilter(user),
    id: `eq.${activationId}`,
  });
  if (!rows?.[0]?.id) throw new Error('Activation state update failed');
  return rows[0];
}

async function cleanupProvisionedNumber(options: {
  user: AuthUser;
  accountSid: string;
  providerNumberSid: string;
  phoneNumberId: string;
}): Promise<boolean> {
  let providerReleased = false;
  try {
    const client = await tenantTwilioClient(options.accountSid);
    await client.incomingPhoneNumbers(options.providerNumberSid).remove();
    providerReleased = true;
  } catch (error) {
    console.error(
      '[phone-activation] Provider cleanup failed; retaining DB row for reconciliation:',
      error instanceof Error ? error.message : error,
    );
  }

  if (!providerReleased) return false;

  try {
    await sbDelete('phone_numbers', {
      ...ownerFilter(options.user),
      id: `eq.${options.phoneNumberId}`,
    });
    return true;
  } catch (error) {
    console.error(
      '[phone-activation] DB cleanup failed after provider release:',
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}'''
a = replace_between(a, 'async function createActivationRecord(', 'async function provision(', new_activation_helpers)

new_provision = r'''async function provision(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  const body = parseBody(req) as ProvisionBody;
  const mode = body.mode;
  if (!mode || !['new', 'forward', 'port'].includes(mode)) {
    return res
      .status(400)
      .json({ error: 'mode must be new, forward, or port' });
  }

  const knowledgeMode: KnowledgeMode =
    body.knowledgeMode === 'voice_only' ? 'voice_only' : 'shared';
  const sourceNumber = body.sourceNumber
    ? normalizePhoneNumber(body.sourceNumber)
    : '';
  if ((mode === 'forward' || mode === 'port') && !sourceNumber) {
    return res.status(400).json({
      error: 'A valid existing phone number is required for this setup mode',
    });
  }

  const selectedNumber =
    mode === 'port' ? '' : normalizePhoneNumber(body.phoneNumber || '');
  if (mode !== 'port' && !selectedNumber) {
    return res.status(400).json({
      error: 'Select a valid Twilio phone number before activation',
    });
  }

  if (!(await hasVoiceEntitlement(user))) {
    return res.status(402).json({
      error:
        'No phone minutes are available yet. Add a voice plan before provisioning or porting a number.',
      voicePlanRequired: true,
      voicePlans: VOICE_PLANS,
    });
  }

  // Only mutate bot/agent/telephony state after all request preconditions pass.
  const botId = await resolveKnowledgeBot(user, body.botId, knowledgeMode);
  const voiceAgent = await ensureVoiceAgentForBot(user, botId);
  const account = await ensureTelephonyAccount(user);

  if (mode === 'port') {
    const activation = await createActivationRecord({
      user,
      accountId: account.id,
      mode,
      botId,
      knowledgeMode,
      sourceNumber,
      carrier: body.carrier?.trim() || null,
      status: 'pending_documents',
    });

    return res.status(202).json({
      activationId: activation.id,
      mode,
      status: 'pending_documents',
      sourceNumber,
      botId,
      message:
        'Port request recorded. The number remains with the current carrier until Twilio accepts the port and the cutover is confirmed.',
      nextSteps: [
        'Collect the current carrier account number and billing information.',
        'Complete the required Letter of Authorization and carrier documentation.',
        'Do not cancel the existing carrier service before the port completes.',
        'After Twilio confirms the port date, run an inbound call test before marking the agent active.',
      ],
    });
  }

  const activation = await createActivationRecord({
    user,
    accountId: account.id,
    mode,
    botId,
    knowledgeMode,
    sourceNumber: sourceNumber || null,
    carrier: body.carrier?.trim() || null,
    status: 'provisioning',
    metadata: { requested_number: selectedNumber },
  });

  let provisioned: Awaited<ReturnType<typeof purchaseDestinationNumber>>;
  try {
    provisioned = await purchaseDestinationNumber({
      user,
      accountSid: account.provider_account_sid,
      phoneNumber: selectedNumber,
      friendlyName:
        body.friendlyName?.trim() ||
        `BuildMyBot Voice - ${user.organizationId || user.id}`,
      voiceAgent,
      setupMode: mode,
      sourceNumber: sourceNumber || undefined,
    });
  } catch (error) {
    await updateActivationRecord(user, activation.id, {
      status: 'failed',
      metadata: {
        created_from: '/app/phone',
        requested_number: selectedNumber,
        failure_stage: 'provider_or_phone_persistence',
      },
      updated_at: new Date().toISOString(),
    }).catch(() => null);
    throw error;
  }

  const { record, purchased } = provisioned;
  const finalStatus = mode === 'new' ? 'active' : 'awaiting_forwarding';
  try {
    await updateActivationRecord(user, activation.id, {
      destination_number_id: record.id,
      status: finalStatus,
      activated_at: mode === 'new' ? new Date().toISOString() : null,
      metadata: {
        created_from: '/app/phone',
        requested_number: selectedNumber,
        provider_number_sid: purchased.sid,
      },
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    const cleaned = await cleanupProvisionedNumber({
      user,
      accountSid: account.provider_account_sid,
      providerNumberSid: purchased.sid,
      phoneNumberId: record.id,
    });
    await updateActivationRecord(user, activation.id, {
      status: cleaned ? 'failed' : 'cleanup_required',
      metadata: {
        created_from: '/app/phone',
        requested_number: selectedNumber,
        provider_number_sid: purchased.sid,
        failure_stage: 'activation_finalize',
        cleanup_complete: cleaned,
      },
      updated_at: new Date().toISOString(),
    }).catch(() => null);
    throw error;
  }

  if (mode === 'forward') {
    return res.status(201).json({
      activationId: activation.id,
      mode,
      status: finalStatus,
      botId,
      phoneNumber: purchased.phoneNumber,
      twilioSid: purchased.sid,
      sourceNumber,
      forwardingDestination: purchased.phoneNumber,
      message:
        'Your BuildMyBot destination number is ready. Calls will not reach it from the existing business number until carrier forwarding is configured.',
      nextSteps: [
        `Configure call forwarding from ${sourceNumber} to ${purchased.phoneNumber} with the current carrier.`,
        'Place a real inbound test call from a different phone.',
        'Verify the call appears in Recent Calls before relying on forwarding in production.',
      ],
    });
  }

  return res.status(201).json({
    activationId: activation.id,
    mode,
    status: finalStatus,
    botId,
    phoneNumber: purchased.phoneNumber,
    twilioSid: purchased.sid,
    message:
      'The new BuildMyBot number is provisioned and attached to the selected knowledge workspace.',
  });
}'''
a = replace_between(a, 'async function provision(', 'async function availableNumbers(', new_provision)

new_available = r'''async function availableNumbers(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  const url = new URL(req.url || '/', 'http://localhost');
  const areaCode = (url.searchParams.get('areaCode') || '')
    .replace(/\D/g, '')
    .slice(0, 3);
  const countryCode = (
    url.searchParams.get('countryCode') || 'US'
  ).toUpperCase();

  if (areaCode && areaCode.length !== 3) {
    return res.status(400).json({ error: 'areaCode must be three digits' });
  }
  if (!(await hasVoiceEntitlement(user))) {
    return res.status(402).json({
      error: 'A voice plan is required before searching provisionable numbers.',
      voicePlanRequired: true,
      voicePlans: VOICE_PLANS,
    });
  }

  // Number inventory is global to Twilio. Do not create a tenant subaccount
  // merely because a customer browsed available numbers.
  const client = await rootTwilioClient();
  const numbers = await client.availablePhoneNumbers(countryCode).local.list({
    ...(areaCode ? { areaCode: Number(areaCode) } : {}),
    limit: 12,
  });

  return res.json(
    numbers.map((number: any) => ({
      phoneNumber: number.phoneNumber,
      friendlyName: number.friendlyName || number.phoneNumber,
      locality: number.locality || '',
      region: number.region || '',
    })),
  );
}'''
a = replace_between(a, 'async function availableNumbers(', 'async function status(', new_available)

new_status = r'''async function status(res: VercelResponse, user: AuthUser) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  const [accounts, activations, numberRows] = await Promise.all([
    sbSelect(
      'telephony_accounts',
      'id,status,provider,provider_account_sid,created_at',
      { ...tenantTelephonyFilter(user), limit: '1' },
    ).catch(() => []),
    sbSelect('phone_agent_activations', '*', {
      ...ownerFilter(user),
      order: 'created_at.desc',
      limit: '20',
    }).catch(() => []),
    sbSelect(
      'phone_numbers',
      'id,number,friendly_name,voice_agent_id,bot_id,status,provider_number_sid,provider_account_sid,setup_mode,source_number,activation_status,activated_at,created_at',
      {
        ...ownerFilter(user),
        status: 'eq.active',
        order: 'created_at.desc',
        limit: '20',
      },
    ).catch(() => []),
  ]);

  const numbers = (numberRows || []).map((row: any) => ({
    ...row,
    phone_number: row.number,
    provider_number_id: row.provider_number_sid,
  }));

  return res.json({
    telephony: {
      configured: Boolean(accounts?.[0]?.id),
      status: accounts?.[0]?.status || 'not_configured',
    },
    activations,
    numbers,
  });
}'''
a = replace_between(a, 'async function status(', 'export async function handlePhoneActivation(', new_status)

a = a.replace(
'''      await sbUpdate(
        'phone_numbers',
        {
          voice_agent_id: voiceAgent.id,
          knowledge_space_id: voiceAgent.knowledgeSpaceId || null,
        },
        { id: `eq.${numberId}` },
      );''',
'''      await sbUpdate(
        'phone_numbers',
        {
          voice_agent_id: voiceAgent.id,
          bot_id: botId,
        },
        { ...ownerFilter(user), id: `eq.${numberId}` },
      );''')
activation_path.write_text(a)


# --- Tenant Twilio webhooks: typed validation, tenant binding, timeouts. ---
tenant_path = Path('api/phone/tenant-twilio.ts')
t = tenant_path.read_text()
t = t.replace("import type { VercelRequest, VercelResponse } from '@vercel/node';", "import type { VercelRequest, VercelResponse } from '@vercel/node';\nimport { z } from 'zod';")
t = t.replace(
    "const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;",
    "const SUPABASE_URL = process.env.SUPABASE_URL;",
)

old_parse_start = 'function parseBody(req: VercelRequest): Record<string, any> {'
new_validation = r'''function rawBody(req: VercelRequest): unknown {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body;
}

const twilioBaseSchema = z
  .object({ AccountSid: z.string().min(1) })
  .passthrough();
const inboundWebhookSchema = twilioBaseSchema.extend({
  To: z.string().min(1),
  From: z.string().min(1),
  CallSid: z.string().min(1),
});
const respondWebhookSchema = twilioBaseSchema.extend({
  CallSid: z.string().min(1),
  SpeechResult: z.string().optional().default(''),
});
const statusWebhookSchema = twilioBaseSchema.extend({
  CallSid: z.string().min(1),
  CallStatus: z.string().min(1),
  CallDuration: z.string().regex(/^\d+$/).optional().default('0'),
});

function parseWebhookBody<T extends z.ZodType>(
  req: VercelRequest,
  schema: T,
): z.infer<T> | null {
  const parsed = schema.safeParse(rawBody(req));
  return parsed.success ? parsed.data : null;
}'''
t = replace_between(t, old_parse_start, 'function escapeXml(', new_validation)

new_sbfetch = r'''async function sbFetch(table: string, params: string, init?: RequestInit) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      ...init,
      signal: controller.signal,
      headers: { ...SUPABASE_HEADERS, ...(init?.headers || {}) },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(
        `[tenant-twilio] Supabase ${init?.method || 'GET'} ${table} failed: ${response.status}${detail ? ` ${detail}` : ''}`,
      );
      return null;
    }
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch (error) {
    console.error(
      `[tenant-twilio] Supabase ${init?.method || 'GET'} ${table} transport failed:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}'''
t = replace_between(t, 'async function sbFetch(', 'async function twilioAuthTokenForAccount(', new_sbfetch)

new_validate = r'''async function validateTwilioRequest(req: VercelRequest): Promise<boolean> {
  const signature = req.headers['x-twilio-signature'] as string | undefined;
  if (!signature) return false;

  const body = parseWebhookBody(req, twilioBaseSchema);
  if (!body) return false;
  const authToken = await twilioAuthTokenForAccount(body.AccountSid);
  if (!authToken) return false;

  try {
    const twilio = (await import('twilio')).default;
    const base = TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, '');
    const requestPath = req.url?.startsWith('/')
      ? req.url
      : `/${req.url || ''}`;
    return twilio.validateRequest(
      authToken,
      signature,
      `${base}${requestPath}`,
      body as Record<string, string>,
    );
  } catch (error) {
    console.error(
      '[tenant-twilio] Signature validation failed:',
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}'''
t = replace_between(t, 'async function validateTwilioRequest(', 'function speakLine(', new_validate)

new_resolve = r'''async function resolveBotForNumber(
  calledNumber: string,
  accountSid: string,
): Promise<ResolvedPhoneNumber | null> {
  const numbers = await sbFetch(
    'phone_numbers',
    `number=eq.${encodeURIComponent(calledNumber)}&provider_account_sid=eq.${encodeURIComponent(accountSid)}&status=eq.active&select=id,user_id,voice_agent_id,bot_id&limit=2`,
  );
  if (!Array.isArray(numbers) || numbers.length !== 1) return null;
  const row = numbers[0];
  if (!row?.id || !row?.user_id || !row?.voice_agent_id) return null;

  const agents = await sbFetch(
    'voice_agents',
    `id=eq.${encodeURIComponent(row.voice_agent_id)}&select=id,bot_id,greeting&limit=1`,
  );
  const agent = agents?.[0];
  if (!agent?.id) return null;

  const botId = agent.bot_id || row.bot_id;
  if (!botId) {
    return {
      phoneNumberId: String(row.id),
      userId: String(row.user_id),
      voiceAgentId: String(agent.id),
      greeting: agent.greeting || null,
      bot: null,
    };
  }

  const bots = await sbFetch(
    'bots',
    `id=eq.${encodeURIComponent(botId)}&select=id,name,system_prompt&limit=1`,
  );
  return {
    phoneNumberId: String(row.id),
    userId: String(row.user_id),
    voiceAgentId: String(agent.id),
    greeting: agent.greeting || null,
    bot: bots?.[0] || null,
  };
}'''
t = replace_between(t, 'async function resolveBotForNumber(', 'async function createCallLog(', new_resolve)

t = t.replace(
'''  const token = createTwilioStreamToken({
    callSid: options.callSid,
    botId: options.botId,
    logId: options.logId,
  });''',
'''  const token = createTwilioStreamToken({
    callSid: options.callSid,
    botId: options.botId,
    logId: options.logId,
    accountSid: options.accountSid,
  });''')

t = t.replace(
'''  const body = parseBody(req);
  const calledNumber = String(body.To || '');
  const callerNumber = String(body.From || '');
  const callSid = String(body.CallSid || '');
  const accountSid = String(body.AccountSid || '');

  const resolved = await resolveBotForNumber(calledNumber);''',
'''  const body = parseWebhookBody(req, inboundWebhookSchema);
  if (!body) return res.status(400).json({ error: 'Invalid Twilio payload' });
  const { To: calledNumber, From: callerNumber, CallSid: callSid, AccountSid: accountSid } = body;

  const resolved = await resolveBotForNumber(calledNumber, accountSid);''')

t = t.replace(
'''  const body = parseBody(req);
  const speechResult = String(body.SpeechResult || '');''',
'''  const body = parseWebhookBody(req, respondWebhookSchema);
  if (!body) return res.status(400).json({ error: 'Invalid Twilio payload' });
  const speechResult = body.SpeechResult;''')

t = t.replace(
'''  const body = parseBody(req);
  const callStatus = String(body.CallStatus || '');
  const duration = Number.parseInt(String(body.CallDuration || '0'), 10);
  const callSid = String(body.CallSid || '');''',
'''  const body = parseWebhookBody(req, statusWebhookSchema);
  if (!body) return res.status(400).json({ error: 'Invalid Twilio payload' });
  const callStatus = body.CallStatus;
  const duration = Number.parseInt(body.CallDuration, 10);
  const callSid = body.CallSid;''')
tenant_path.write_text(t)


# --- Realtime stream: account SID is part of the HMAC and DB lookup. ---
live_path = Path('api/voice/twilio-live.ts')
l = live_path.read_text()
l = l.replace("import WebSocket, { type RawData } from 'ws';", "import WebSocket, { type RawData } from 'ws';\nimport { z } from 'zod';")
l = l.replace(
    "const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;",
    "const SUPABASE_URL = process.env.SUPABASE_URL;",
)
l = l.replace(
'''export function createTwilioStreamToken(input: {
  callSid: string;
  botId: string;
  logId: string;
}): string {
  return createHmac('sha256', streamSigningSecret())
    .update(`${input.callSid}|${input.botId}|${input.logId}`)
    .digest('base64url');
}''',
'''export function createTwilioStreamToken(input: {
  callSid: string;
  botId: string;
  logId: string;
  accountSid?: string;
}): string {
  const material = input.accountSid
    ? `${input.callSid}|${input.botId}|${input.logId}|${input.accountSid}`
    : `${input.callSid}|${input.botId}|${input.logId}`;
  return createHmac('sha256', streamSigningSecret())
    .update(material)
    .digest('base64url');
}''')
l = l.replace(
'''function validTwilioStreamToken(input: {
  callSid: string;
  botId: string;
  logId: string;
  token: string;
}): boolean {''',
'''function validTwilioStreamToken(input: {
  callSid: string;
  botId: string;
  logId: string;
  token: string;
  accountSid?: string;
}): boolean {''')
l = l.replace(
'''      createTwilioStreamToken({
        callSid: input.callSid,
        botId: input.botId,
        logId: input.logId,
      }),''',
'''      createTwilioStreamToken({
        callSid: input.callSid,
        botId: input.botId,
        logId: input.logId,
        accountSid: input.accountSid,
      }),''')

insert_marker = 'async function loadSessionContext(\n'
stream_schema = r'''const streamParametersSchema = z
  .object({
    botId: z.string().min(1),
    logId: z.string(),
    token: z.string().min(1),
    callSid: z.string().optional(),
    accountSid: z.string().optional(),
    callerNumber: z.string().optional(),
    calledNumber: z.string().optional(),
  })
  .passthrough();

'''
if 'const streamParametersSchema' not in l:
    idx = l.index(insert_marker)
    l = l[:idx] + stream_schema + l[idx:]

new_load = r'''async function loadSessionContext(
  start: TwilioStart,
): Promise<SessionContext | null> {
  const parsedParameters = streamParametersSchema.safeParse(
    start.customParameters || {},
  );
  if (!parsedParameters.success) return null;
  const parameters = parsedParameters.data;
  const botId = parameters.botId;
  const logId = parameters.logId;
  const callerNumber = parameters.callerNumber || '';
  const calledNumber = parameters.calledNumber || '';
  const token = parameters.token;
  const callSid = start.callSid || parameters.callSid || '';
  const accountSid = parameters.accountSid || '';
  const streamSid = start.streamSid || '';

  if (!callSid || !streamSid) return null;
  if (
    !validTwilioStreamToken({
      callSid,
      botId,
      logId,
      token,
      accountSid: accountSid || undefined,
    })
  ) {
    return null;
  }

  const botResult = await sbRequest(
    'bots',
    `id=eq.${encodeURIComponent(botId)}&select=id,name,system_prompt,user_id,organization_id&limit=1`,
  );
  const bot = asRows(botResult.data)[0];
  if (!botResult.ok || !bot) return null;

  let userId = typeof bot.user_id === 'string' ? bot.user_id : null;
  let organizationId =
    typeof bot.organization_id === 'string' ? bot.organization_id : null;

  if (calledNumber) {
    const numberParams = accountSid
      ? `number=eq.${encodeURIComponent(calledNumber)}&provider_account_sid=eq.${encodeURIComponent(accountSid)}&status=eq.active&select=user_id,organization_id,bot_id&limit=2`
      : `number=eq.${encodeURIComponent(calledNumber)}&status=eq.active&select=user_id,organization_id,bot_id&limit=1`;
    const numberResult = await sbRequest('phone_numbers', numberParams);
    const numberRows = asRows(numberResult.data);
    if (!numberResult.ok || numberRows.length !== 1) return null;
    const number = numberRows[0];
    if (accountSid && typeof number.bot_id === 'string' && number.bot_id !== botId) {
      return null;
    }
    if (typeof number.user_id === 'string') userId = number.user_id;
    if (typeof number.organization_id === 'string') {
      organizationId = number.organization_id;
    }
  }

  let phoneConfig: Record<string, unknown> = {};
  if (userId) {
    const userResult = await sbRequest(
      'users',
      `id=eq.${encodeURIComponent(userId)}&select=phone_config&limit=1`,
    );
    const user = asRows(userResult.data)[0];
    if (user?.phone_config && typeof user.phone_config === 'object') {
      phoneConfig = user.phone_config as Record<string, unknown>;
    }
  }

  return {
    botId,
    logId,
    callSid,
    accountSid,
    streamSid,
    callerNumber,
    calledNumber,
    botName: typeof bot.name === 'string' ? bot.name : 'the business',
    systemPrompt:
      typeof bot.system_prompt === 'string' && bot.system_prompt.trim()
        ? bot.system_prompt
        : 'You are a helpful business receptionist.',
    userId,
    organizationId,
    phoneConfig,
  };
}'''
l = replace_between(l, 'async function loadSessionContext(', 'function configuredString(', new_load)
live_path.write_text(l)


# --- Deployment callback-origin recovery: keep recovered values in this shell. ---
workflow_path = Path('.github/workflows/deploy-cloud-run.yml')
w = workflow_path.read_text()
w = w.replace(
'''            if [[ -n "$plain" ]]; then
              echo "::add-mask::$plain"
              echo "$env_name=$plain" >> "$GITHUB_ENV"
              echo "Recovered $env_name from the existing Cloud Run service."
              return 0
            fi''',
'''            if [[ -n "$plain" ]]; then
              echo "::add-mask::$plain"
              printf -v "$env_name" '%s' "$plain"
              export "$env_name"
              echo "$env_name=$plain" >> "$GITHUB_ENV"
              echo "Recovered $env_name from the existing Cloud Run service."
              return 0
            fi''')
w = w.replace(
'''            if [[ -n "$secret_name" ]] && value="$(gcloud secrets versions access "$secret_version" --project "$GCP_PROJECT_ID" --secret "$secret_name" 2>/dev/null)" && [[ -n "$value" ]]; then
              echo "::add-mask::$value"
              echo "$env_name=$value" >> "$GITHUB_ENV"
              echo "Recovered $env_name from its existing Cloud Run Secret Manager binding."
            fi''',
'''            if [[ -n "$secret_name" ]] && value="$(gcloud secrets versions access "$secret_version" --project "$GCP_PROJECT_ID" --secret "$secret_name" 2>/dev/null)" && [[ -n "$value" ]]; then
              echo "::add-mask::$value"
              printf -v "$env_name" '%s' "$value"
              export "$env_name"
              echo "$env_name=$value" >> "$GITHUB_ENV"
              echo "Recovered $env_name from its existing Cloud Run Secret Manager binding."
            fi''')
workflow_path.write_text(w)


# --- Test environment restoration should truly remove absent env vars. ---
test_path = Path('test/api/phone-activation.test.ts')
test = test_path.read_text().replace(
'''  if (originalEncryptionKey === undefined) {
    process.env.ENCRYPTION_KEY = undefined;
  } else {''',
'''  if (originalEncryptionKey === undefined) {
    Reflect.deleteProperty(process.env, 'ENCRYPTION_KEY');
  } else {''')
test_path.write_text(test)

print('phone activation hardening patch applied')
