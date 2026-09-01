import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PLAN_LIMITS, VOICE_PLANS } from '../../constants.js';
import { encryptSecret } from './crypto.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_JWT_SECRET = process.env.SESSION_JWT_SECRET;
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://buildmybot.app';
const TWILIO_WEBHOOK_BASE_URL =
  process.env.TWILIO_WEBHOOK_BASE_URL || APP_BASE_URL;

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY || '',
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY || ''}`,
  'Content-Type': 'application/json',
};

interface AuthUser {
  id: string;
  email: string;
  role: string;
  organizationId?: string;
  plan?: string;
}

type ActivationMode = 'new' | 'forward' | 'port';
type KnowledgeMode = 'shared' | 'voice_only';

interface TelephonyAccount {
  id: string;
  organization_id?: string | null;
  user_id?: string | null;
  provider_account_sid: string;
  status: string;
}

interface ProvisionBody {
  mode?: ActivationMode;
  phoneNumber?: string;
  sourceNumber?: string;
  carrier?: string;
  friendlyName?: string;
  areaCode?: string;
  botId?: string;
  knowledgeMode?: KnowledgeMode;
}

function parseCookies(
  cookieHeader: string | undefined,
): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      cookies[name.trim()] = decodeURIComponent(rest.join('=').trim());
    }
  });
  return cookies;
}

async function sbSelect(
  table: string,
  select = '*',
  filters: Record<string, string> = {},
) {
  const params = new URLSearchParams({ select });
  for (const [key, value] of Object.entries(filters)) {
    params.set(key, value);
  }
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`,
    { headers: SUPABASE_HEADERS },
  );
  if (!response.ok) {
    throw new Error(`Supabase select failed for ${table}: ${response.status}`);
  }
  return response.json();
}

async function sbInsert(table: string, data: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Supabase insert failed for ${table}: ${response.status} ${detail}`.trim(),
    );
  }
  return response.json();
}

async function sbUpdate(
  table: string,
  data: Record<string, unknown>,
  filters: Record<string, string>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    params.set(key, value);
  }
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`,
    {
      method: 'PATCH',
      headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Supabase update failed for ${table}: ${response.status} ${detail}`.trim(),
    );
  }
  return response.json();
}

function ownerFilter(user: AuthUser): Record<string, string> {
  return user.organizationId
    ? { organization_id: `eq.${user.organizationId}` }
    : { user_id: `eq.${user.id}` };
}

function tenantTelephonyFilter(user: AuthUser): Record<string, string> {
  return {
    provider: 'eq.twilio',
    status: 'eq.active',
    ...(user.organizationId
      ? { organization_id: `eq.${user.organizationId}` }
      : { user_id: `eq.${user.id}`, organization_id: 'is.null' }),
  };
}

async function getAuthUser(req: VercelRequest): Promise<AuthUser | null> {
  if (!SESSION_JWT_SECRET || !SUPABASE_SERVICE_KEY || !SUPABASE_URL) {
    return null;
  }

  const authHeader = req.headers.authorization;
  let token: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies.bmb_session || cookies.session || null;
  }
  if (!token) return null;

  try {
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra) return null;

    const expected = createHmac('sha256', SESSION_JWT_SECRET)
      .update(encoded)
      .digest('base64url');
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    );
    if (!payload.sub) return null;
    if (payload.exp && Date.now() > Number(payload.exp) * 1000) return null;

    const rows = await sbSelect(
      'users',
      'id,email,role,organization_id,plan,status',
      { id: `eq.${payload.sub}`, limit: '1' },
    );
    const liveUser = rows?.[0];
    if (!liveUser || liveUser.status === 'Suspended') return null;

    return {
      id: liveUser.id,
      email: liveUser.email,
      role: liveUser.role || 'user',
      organizationId: liveUser.organization_id || undefined,
      plan: liveUser.plan || undefined,
    };
  } catch {
    return null;
  }
}

function setCors(res: VercelResponse) {
  const origin = process.env.CORS_ORIGINS?.split(',')[0]?.trim();
  res.setHeader('Access-Control-Allow-Origin', origin || APP_BASE_URL);
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PATCH,OPTIONS',
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Cookie',
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function parseBody(req: VercelRequest): Record<string, any> {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body || {};
}

export function activationSubpath(url = ''): string[] {
  const pathname = url.split('?')[0] || '';
  const marker = '/api/phone/activation';
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) return [];
  return pathname
    .slice(markerIndex + marker.length)
    .split('/')
    .filter(Boolean);
}

export function normalizePhoneNumber(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) {
    const normalized = `+${raw.slice(1).replace(/\D/g, '')}`;
    return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : '';
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return /^\d{8,15}$/.test(digits) ? `+${digits}` : '';
}

function friendlyTenantName(user: AuthUser): string {
  const suffix = user.organizationId || user.id;
  return `BuildMyBot ${suffix}`.slice(0, 64);
}

function rootTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN,
  );
}

async function rootTwilioClient() {
  if (!rootTwilioConfigured()) {
    throw new Error('Twilio parent account is not configured');
  }
  const Twilio = (await import('twilio')).default;
  return new Twilio(
    process.env.TWILIO_ACCOUNT_SID as string,
    process.env.TWILIO_AUTH_TOKEN as string,
  );
}

async function tenantTwilioClient(accountSid: string) {
  if (!rootTwilioConfigured()) {
    throw new Error('Twilio parent account is not configured');
  }
  const Twilio = (await import('twilio')).default;
  return new Twilio(
    process.env.TWILIO_ACCOUNT_SID as string,
    process.env.TWILIO_AUTH_TOKEN as string,
    { accountSid },
  );
}

async function ensureTelephonyAccount(
  user: AuthUser,
): Promise<TelephonyAccount> {
  const existing = await sbSelect(
    'telephony_accounts',
    'id,organization_id,user_id,provider_account_sid,status',
    { ...tenantTelephonyFilter(user), limit: '1' },
  ).catch(() => []);
  if (existing?.[0]?.provider_account_sid) {
    return existing[0] as TelephonyAccount;
  }

  if (!process.env.ENCRYPTION_KEY) {
    throw new Error(
      'ENCRYPTION_KEY is required before customer telephony subaccounts can be created',
    );
  }

  const rootClient = await rootTwilioClient();
  const created = await rootClient.api.v2010.accounts.create({
    friendlyName: friendlyTenantName(user),
  });
  if (!created.sid || !created.authToken) {
    throw new Error('Twilio did not return complete subaccount credentials');
  }

  const encryptedAuthToken = encryptSecret(created.authToken);
  try {
    const inserted = await sbInsert('telephony_accounts', {
      id: randomUUID(),
      organization_id: user.organizationId || null,
      user_id: user.id,
      provider: 'twilio',
      provider_account_sid: created.sid,
      auth_token_encrypted: encryptedAuthToken,
      status: 'active',
      metadata: {
        isolation: 'per-tenant-subaccount',
        created_by: 'phone-agent-activation',
      },
    });
    return inserted[0] as TelephonyAccount;
  } catch (error) {
    // Avoid leaving a billable orphan if persistence fails immediately after
    // creation. Twilio only allows closing an account from its parent.
    try {
      await rootClient.api.v2010
        .accounts(created.sid)
        .update({ status: 'closed' });
    } catch (cleanupError) {
      console.error(
        '[phone-activation] Unable to close orphaned Twilio subaccount:',
        cleanupError instanceof Error ? cleanupError.message : cleanupError,
      );
    }

    // If this was a concurrent first-use race, the other request may have
    // already created the tenant row. Re-read before surfacing an error.
    const raced = await sbSelect(
      'telephony_accounts',
      'id,organization_id,user_id,provider_account_sid,status',
      { ...tenantTelephonyFilter(user), limit: '1' },
    ).catch(() => []);
    if (raced?.[0]?.provider_account_sid) {
      return raced[0] as TelephonyAccount;
    }
    throw error;
  }
}

async function hasVoiceEntitlement(user: AuthUser): Promise<boolean> {
  const planKey = (user.plan || 'FREE').toUpperCase();
  const bundledMinutes =
    Number((PLAN_LIMITS as any)?.[planKey]?.phone_minutes || 0) || 0;
  const rows = await sbSelect('users', 'voice_plan', {
    id: `eq.${user.id}`,
    limit: '1',
  }).catch(() => []);
  const voicePlan = rows?.[0]?.voice_plan;
  const standaloneMinutes =
    Number((VOICE_PLANS as any)?.[voicePlan]?.minutes || 0) || 0;
  return bundledMinutes + standaloneMinutes > 0;
}

async function createVoiceOnlyBot(user: AuthUser): Promise<string> {
  const existing = await sbSelect('bots', 'id', {
    ...ownerFilter(user),
    type: 'eq.voice',
    limit: '1',
  }).catch(() => []);
  if (existing?.[0]?.id) return existing[0].id;

  const created = await sbInsert('bots', {
    id: randomUUID(),
    user_id: user.id,
    organization_id: user.organizationId || null,
    name: 'Phone Agent',
    type: 'voice',
    system_prompt:
      'You are a helpful AI receptionist for this business. Use only verified business information and the connected knowledge base. Never invent details.',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    knowledge_base: [],
    active: true,
  });
  if (!created?.[0]?.id) {
    throw new Error('Failed to create a voice knowledge workspace');
  }
  return created[0].id;
}

async function resolveKnowledgeBot(
  user: AuthUser,
  requestedBotId: string | undefined,
  knowledgeMode: KnowledgeMode,
): Promise<string> {
  if (requestedBotId) {
    const requested = await sbSelect('bots', 'id,name,type,active', {
      ...ownerFilter(user),
      id: `eq.${requestedBotId}`,
      limit: '1',
    }).catch(() => []);
    if (!requested?.[0]?.id) {
      throw new Error('The selected knowledge workspace is not available');
    }
    return requested[0].id;
  }

  if (knowledgeMode === 'shared') {
    const bots = await sbSelect('bots', 'id,name,type,active', {
      ...ownerFilter(user),
      active: 'eq.true',
      limit: '50',
    }).catch(() => []);
    const chatbot = (bots || []).find((bot: any) => bot.type !== 'voice');
    if (chatbot?.id) return chatbot.id;
  }

  return createVoiceOnlyBot(user);
}

async function listKnowledgeBots(user: AuthUser) {
  const bots = await sbSelect('bots', 'id,name,type,active,created_at', {
    ...ownerFilter(user),
    active: 'eq.true',
    order: 'created_at.asc',
    limit: '100',
  }).catch(() => []);

  return (bots || []).map((bot: any) => ({
    id: bot.id,
    name: bot.name || 'Untitled bot',
    type: bot.type || 'chat',
    sharedRecommended: bot.type !== 'voice',
  }));
}

async function purchaseDestinationNumber(options: {
  user: AuthUser;
  accountSid: string;
  phoneNumber: string;
  friendlyName?: string;
  botId: string;
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
    const rows = await sbInsert('phone_numbers', {
      id: randomUUID(),
      organization_id: options.user.organizationId || null,
      user_id: options.user.id,
      number: purchased.phoneNumber,
      friendly_name: purchased.friendlyName || null,
      provider: 'twilio',
      provider_account_sid: options.accountSid,
      provider_number_sid: purchased.sid,
      bot_id: options.botId,
      setup_mode: options.setupMode,
      source_number: options.sourceNumber || null,
      activation_status:
        options.setupMode === 'new' ? 'active' : 'awaiting_forwarding',
      activated_at:
        options.setupMode === 'new' ? new Date().toISOString() : null,
      status: 'active',
    });
    return {
      record: rows[0],
      purchased,
    };
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
}

async function createActivationRecord(options: {
  user: AuthUser;
  accountId: string;
  mode: ActivationMode;
  botId: string;
  knowledgeMode: KnowledgeMode;
  sourceNumber?: string | null;
  destinationNumberId?: string | null;
  carrier?: string | null;
  status: string;
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
    },
  });
  return rows[0];
}

async function provision(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  const body = parseBody(req) as ProvisionBody;
  const mode = body.mode;
  if (!mode || !['new', 'forward', 'port'].includes(mode)) {
    return res.status(400).json({
      error: 'mode must be new, forward, or port',
    });
  }

  const knowledgeMode: KnowledgeMode =
    body.knowledgeMode === 'voice_only' ? 'voice_only' : 'shared';
  const botId = await resolveKnowledgeBot(
    user,
    body.botId,
    knowledgeMode,
  );

  const sourceNumber = body.sourceNumber
    ? normalizePhoneNumber(body.sourceNumber)
    : '';
  if ((mode === 'forward' || mode === 'port') && !sourceNumber) {
    return res.status(400).json({
      error: 'A valid existing phone number is required for this setup mode',
    });
  }

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

  if (!(await hasVoiceEntitlement(user))) {
    return res.status(402).json({
      error:
        'No phone minutes are available yet. Add a voice plan before provisioning a number.',
      voicePlanRequired: true,
      voicePlans: VOICE_PLANS,
    });
  }

  const selectedNumber = normalizePhoneNumber(body.phoneNumber || '');
  if (!selectedNumber) {
    return res.status(400).json({
      error: 'Select a valid Twilio phone number before activation',
    });
  }

  const { record, purchased } = await purchaseDestinationNumber({
    user,
    accountSid: account.provider_account_sid,
    phoneNumber: selectedNumber,
    friendlyName:
      body.friendlyName?.trim() ||
      `BuildMyBot Voice - ${user.organizationId || user.id}`,
    botId,
    setupMode: mode,
    sourceNumber: sourceNumber || undefined,
  });

  const status = mode === 'new' ? 'active' : 'awaiting_forwarding';
  const activation = await createActivationRecord({
    user,
    accountId: account.id,
    mode,
    botId,
    knowledgeMode,
    sourceNumber: sourceNumber || null,
    destinationNumberId: record.id,
    carrier: body.carrier?.trim() || null,
    status,
  });

  if (mode === 'forward') {
    return res.status(201).json({
      activationId: activation.id,
      mode,
      status,
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
    status,
    botId,
    phoneNumber: purchased.phoneNumber,
    twilioSid: purchased.sid,
    message:
      'The new BuildMyBot number is provisioned and attached to the selected knowledge workspace.',
  });
}

async function availableNumbers(
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

  const account = await ensureTelephonyAccount(user);
  const client = await tenantTwilioClient(account.provider_account_sid);
  const numbers = await client
    .availablePhoneNumbers(countryCode)
    .local.list({
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
}

async function status(
  res: VercelResponse,
  user: AuthUser,
) {
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
      'id,number,friendly_name,bot_id,status,setup_mode,source_number,activation_status,activated_at,created_at',
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
}

export async function handlePhoneActivation(
  req: VercelRequest,
  res: VercelResponse,
) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SESSION_JWT_SECRET) {
    return res.status(503).json({
      error: 'Phone activation backend is missing required server configuration',
    });
  }

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const [action = 'status'] = activationSubpath(req.url || '');

  try {
    if (action === 'status' && req.method === 'GET') {
      return await status(res, user);
    }

    if (action === 'bots' && req.method === 'GET') {
      return res.json({ bots: await listKnowledgeBots(user) });
    }

    if (action === 'available' && req.method === 'GET') {
      return await availableNumbers(req, res, user);
    }

    if (action === 'provision' && req.method === 'POST') {
      return await provision(req, res, user);
    }

    if (action === 'knowledge' && req.method === 'PATCH') {
      const body = parseBody(req);
      const numberId = String(body.numberId || '');
      const requestedBotId = String(body.botId || '');
      if (!numberId || !requestedBotId) {
        return res.status(400).json({
          error: 'numberId and botId are required',
        });
      }
      const botId = await resolveKnowledgeBot(
        user,
        requestedBotId,
        'shared',
      );
      const numbers = await sbSelect('phone_numbers', 'id', {
        ...ownerFilter(user),
        id: `eq.${numberId}`,
        status: 'eq.active',
        limit: '1',
      });
      if (!numbers?.[0]?.id) {
        return res.status(404).json({ error: 'Phone number not found' });
      }
      await sbUpdate(
        'phone_numbers',
        { bot_id: botId },
        { id: `eq.${numberId}` },
      );
      return res.json({ success: true, numberId, botId });
    }

    return res.status(404).json({ error: 'Activation endpoint not found' });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Phone activation failed';
    console.error('[phone-activation]', message);
    return res.status(500).json({
      error:
        message.includes('ENCRYPTION_KEY') ||
        message.includes('Twilio parent account')
          ? message
          : 'Phone activation failed. No provisioning result was assumed.',
    });
  }
}
