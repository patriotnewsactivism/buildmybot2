from pathlib import Path


def replace_between(text: str, start: str, end: str, replacement: str) -> str:
    s = text.index(start)
    e = text.index(end, s)
    return text[:s] + replacement.rstrip() + "\n\n" + text[e:]


# Production-authoritative migration. The live BuildMyBot database uses
# integer phone_numbers.id and text bots.id; canonical number columns are
# phone_number/provider_number_id/twilio_subaccount_sid.
migration = Path('supabase/migrations/20260901203000_phone_agent_activation.sql')
migration.write_text(r'''-- Guided phone-agent activation and tenant-isolated Twilio subaccounts.
-- Types and column names intentionally match the live BuildMyBot schema:
-- phone_numbers.id is integer, bots.id is text, and phone_number is canonical.

CREATE TABLE IF NOT EXISTS public.telephony_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text,
  user_id text,
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

-- Canonical phone activation columns used by the customer wizard.
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS knowledge_space_id uuid;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS twilio_subaccount_sid text;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS setup_method text NOT NULL DEFAULT 'new';
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS existing_business_number text;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS forwarding_mode text;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS test_until timestamptz;
ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

CREATE INDEX IF NOT EXISTS phone_numbers_twilio_subaccount_idx
  ON public.phone_numbers (twilio_subaccount_sid, status)
  WHERE twilio_subaccount_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS phone_numbers_knowledge_space_idx
  ON public.phone_numbers (knowledge_space_id)
  WHERE knowledge_space_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.phone_agent_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text,
  user_id text,
  telephony_account_id uuid REFERENCES public.telephony_accounts(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('new', 'forward', 'port')),
  source_number text,
  destination_number_id integer REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  bot_id text REFERENCES public.bots(id) ON DELETE SET NULL,
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

-- Backend-only operational tables. Service-role access bypasses RLS; browser
-- roles have no direct grants and no permissive policies.
ALTER TABLE public.telephony_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_agent_activations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.telephony_accounts FROM anon, authenticated;
REVOKE ALL ON TABLE public.phone_agent_activations FROM anon, authenticated;

COMMENT ON TABLE public.telephony_accounts IS
  'Per-tenant telephony provider accounts. Provider auth tokens are encrypted server-side and never returned to clients.';
COMMENT ON TABLE public.phone_agent_activations IS
  'Auditable state for new-number, forwarding, and port phone-agent onboarding.';
COMMENT ON COLUMN public.phone_numbers.twilio_subaccount_sid IS
  'Twilio subaccount that owns provider_number_id for tenant-isolated phone routing.';
''')

# Activation API: preserve hardening while using production columns/types.
p = Path('api/phone/activation.ts')
a = p.read_text()
a = a.replace(
'''interface VoiceAgentLink {
  id: string;
  botId: string;
}''',
'''interface VoiceAgentLink {
  id: string;
  botId: string;
  knowledgeSpaceId?: string | null;
}''')

ensure = r'''async function ensureVoiceAgentForBot(
  user: AuthUser,
  botId: string,
): Promise<VoiceAgentLink> {
  const bots = await sbSelect(
    'bots',
    'id,name,system_prompt,knowledge_space_id',
    {
      ...ownerFilter(user),
      id: `eq.${botId}`,
      limit: '1',
    },
  ).catch(() => []);
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
    return {
      id: existing[0].id,
      botId,
      knowledgeSpaceId: bot.knowledge_space_id || null,
    };
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
      'You are a helpful business receptionist for this business. Never invent facts.',
    greeting: `Thanks for calling ${bot.name || 'the business'}. How can I help you today?`,
    voice_model: 'gemini-live',
    language: 'en',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const created = await sbInsert('voice_agents', voiceAgentData);
    if (!created?.[0]?.id) throw new Error('Voice agent was not persisted');
    return {
      id: created[0].id,
      botId,
      knowledgeSpaceId: bot.knowledge_space_id || null,
    };
  } catch (error) {
    const raced = await sbSelect(
      'voice_agents',
      'id,bot_id,enabled,is_active',
      { bot_id: `eq.${botId}`, limit: '1' },
    ).catch(() => []);
    if (raced?.[0]?.id && raced[0].enabled && raced[0].is_active !== false) {
      return {
        id: raced[0].id,
        botId,
        knowledgeSpaceId: bot.knowledge_space_id || null,
      };
    }
    throw error;
  }
}'''
a = replace_between(a, 'async function ensureVoiceAgentForBot(', 'async function listKnowledgeBots(', ensure)

purchase = r'''async function purchaseDestinationNumber(options: {
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
      voice_agent_id: options.voiceAgent.id,
      user_id: options.user.id,
      organization_id: options.user.organizationId || null,
      provider: 'twilio',
      provider_number_id: purchased.sid,
      phone_number: purchased.phoneNumber,
      friendly_name: purchased.friendlyName || null,
      status: 'active',
      knowledge_space_id: options.voiceAgent.knowledgeSpaceId || null,
      twilio_subaccount_sid: options.accountSid,
      setup_method: options.setupMode,
      existing_business_number: options.sourceNumber || null,
      forwarding_mode:
        options.setupMode === 'forward' ? 'carrier_forwarding' : null,
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
a = replace_between(a, 'async function purchaseDestinationNumber(', 'async function createActivationRecord(', purchase)
a = a.replace('destinationNumberId?: string | null;', 'destinationNumberId?: number | string | null;')

available = r'''async function availableNumbers(
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

  // Inventory browsing must not create a paid/managed tenant subaccount.
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
a = replace_between(a, 'async function availableNumbers(', 'async function status(', available)

status = r'''async function status(res: VercelResponse, user: AuthUser) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  const [accounts, activations, numbers] = await Promise.all([
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
      'id,phone_number,friendly_name,voice_agent_id,status,provider_number_id,twilio_subaccount_sid,setup_method,existing_business_number,forwarding_mode,knowledge_space_id,activated_at,created_at',
      {
        ...ownerFilter(user),
        status: 'eq.active',
        order: 'created_at.desc',
        limit: '20',
      },
    ).catch(() => []),
  ]);

  return res.json({
    telephony: {
      configured: Boolean(accounts?.[0]?.id),
      status: accounts?.[0]?.status || 'not_configured',
    },
    activations,
    numbers,
  });
}'''
a = replace_between(a, 'async function status(', 'export async function handlePhoneActivation(', status)

a = a.replace(
'''        {
          voice_agent_id: voiceAgent.id,
          bot_id: botId,
        },
        { ...ownerFilter(user), id: `eq.${numberId}` },''',
'''        {
          voice_agent_id: voiceAgent.id,
          knowledge_space_id: voiceAgent.knowledgeSpaceId || null,
        },
        { ...ownerFilter(user), id: `eq.${numberId}` },''')
p.write_text(a)

# Tenant Twilio webhook lookup: bind called number to the signing subaccount,
# then derive bot through the voice agent FK.
tp = Path('api/phone/tenant-twilio.ts')
t = tp.read_text()
resolver = r'''async function resolveBotForNumber(
  calledNumber: string,
  accountSid: string,
): Promise<ResolvedPhoneNumber | null> {
  const numbers = await sbFetch(
    'phone_numbers',
    `phone_number=eq.${encodeURIComponent(calledNumber)}&twilio_subaccount_sid=eq.${encodeURIComponent(accountSid)}&status=eq.active&select=id,user_id,voice_agent_id&limit=2`,
  );
  if (!Array.isArray(numbers) || numbers.length !== 1) return null;
  const row = numbers[0];
  if (!row?.id || !row?.user_id || !row?.voice_agent_id) return null;

  const agents = await sbFetch(
    'voice_agents',
    `id=eq.${encodeURIComponent(row.voice_agent_id)}&select=id,bot_id,greeting&limit=1`,
  );
  const agent = agents?.[0];
  if (!agent?.id || !agent?.bot_id) return null;

  const bots = await sbFetch(
    'bots',
    `id=eq.${encodeURIComponent(agent.bot_id)}&select=id,name,system_prompt&limit=1`,
  );
  return {
    phoneNumberId: String(row.id),
    userId: String(row.user_id),
    voiceAgentId: String(agent.id),
    greeting: agent.greeting || null,
    bot: bots?.[0] || null,
  };
}'''
t = replace_between(t, 'async function resolveBotForNumber(', 'async function createCallLog(', resolver)
tp.write_text(t)

# Realtime bridge: the signed accountSid must own the canonical phone_number;
# verify its linked voice agent points at the signed botId.
lp = Path('api/voice/twilio-live.ts')
l = lp.read_text()
load = r'''async function loadSessionContext(
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
      ? `phone_number=eq.${encodeURIComponent(calledNumber)}&twilio_subaccount_sid=eq.${encodeURIComponent(accountSid)}&status=eq.active&select=user_id,organization_id,voice_agent_id&limit=2`
      : `phone_number=eq.${encodeURIComponent(calledNumber)}&status=eq.active&select=user_id,organization_id,voice_agent_id&limit=1`;
    const numberResult = await sbRequest('phone_numbers', numberParams);
    const numberRows = asRows(numberResult.data);
    if (!numberResult.ok || numberRows.length !== 1) return null;
    const number = numberRows[0];

    if (accountSid) {
      if (typeof number.voice_agent_id !== 'string') return null;
      const agentResult = await sbRequest(
        'voice_agents',
        `id=eq.${encodeURIComponent(number.voice_agent_id)}&select=bot_id&limit=1`,
      );
      const agent = asRows(agentResult.data)[0];
      if (!agentResult.ok || agent?.bot_id !== botId) return null;
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
l = replace_between(l, 'async function loadSessionContext(', 'function configuredString(', load)
lp.write_text(l)

# Correct the test cleanup if a prior run reintroduced assignment semantics.
testp = Path('test/api/phone-activation.test.ts')
test = testp.read_text().replace(
    "process.env.ENCRYPTION_KEY = undefined;",
    "Reflect.deleteProperty(process.env, 'ENCRYPTION_KEY');",
)
testp.write_text(test)

print('reconciled phone activation to live production schema')
