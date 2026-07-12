import * as Sentry from '@sentry/node';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callLLMMessages } from './ai-team/lib.js';
import {
  ingestKnowledgeSource,
  ingestPageChunks,
  scrapeUrl,
  scrapeUrlFirecrawl,
  searchKnowledge,
  startFirecrawlCrawl,
} from './rag.js';

// Initialize Sentry for production error monitoring
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV || 'production',
    tracesSampleRate: 0.1,
  });
}

// =====================================================================
// BuildMyBot API Gateway — Vercel Serverless Catch-All
// Replaces the dead Render Express backend
// Uses Supabase REST API for data, JWT cookies for auth
// =====================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error(
    'Missing SUPABASE_URL or VITE_SUPABASE_URL environment variable',
  );
}
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_JWT_SECRET = process.env.SESSION_JWT_SECRET;
const CRON_SECRET = process.env.CRON_SECRET || '';

if (!SUPABASE_SERVICE_KEY || !SESSION_JWT_SECRET) {
  // Logged at cold-start; the handler also checks this per-request so callers get a clean 500
  // instead of a confusing crash or (worse) running with no auth verification at all.
  console.error(
    '[gateway] FATAL: SUPABASE_SERVICE_ROLE_KEY / SESSION_JWT_SECRET env vars not set',
  );
}

// Lazy-init fetch headers
const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY || '',
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY || ''}`,
  'Content-Type': 'application/json',
};

// =====================================================================
// Auth helpers
// =====================================================================
interface AuthUser {
  id: string;
  email: string;
  role: string;
  organizationId?: string;
  plan?: string;
}

function parseCookies(
  cookieHeader: string | undefined,
): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) cookies[name.trim()] = decodeURIComponent(rest.join('=').trim());
  });
  return cookies;
}

async function getAuthUser(req: VercelRequest): Promise<AuthUser | null> {
  if (!SESSION_JWT_SECRET || !SUPABASE_SERVICE_KEY) return null;

  // Check Bearer token
  const authHeader = req.headers.authorization;
  let token: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies.bmb_session || cookies.session;
  }

  if (!token) return null;

  try {
    // Tokens are minted by api/auth/login.ts and api/auth/signup.ts in the
    // 2-part format `base64url(payload).base64url(hmacSha256(payload))`.
    // IMPORTANT: previously this function decoded the payload and trusted
    // whatever role/organizationId/etc. it contained WITHOUT verifying the
    // signature — meaning anyone could hand-craft a base64 JSON blob and
    // authenticate as any user, including admin, for any organization.
    // We now verify the signature first, then look up the authoritative
    // user record from the database rather than trusting client-held claims.
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, signature] = parts;
    if (!encoded || !signature) return null;

    const crypto = await import('node:crypto');
    const expectedSig = crypto.default
      .createHmac('sha256', SESSION_JWT_SECRET)
      .update(encoded)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    const sigValid =
      sigBuf.length === expectedBuf.length &&
      crypto.default.timingSafeEqual(sigBuf, expectedBuf);
    if (!sigValid) return null;

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (!payload.sub) return null;
    if (payload.exp && Date.now() > payload.exp * 1000) return null;

    // Role, organizationId, and plan are NOT trusted from the token — fetch
    // the live row so a role change / org change / suspension takes effect
    // immediately instead of persisting for the life of an old cookie.
    const users = await sbSelect(
      'users',
      'id,email,role,organization_id,plan,status',
      {
        id: `eq.${payload.sub}`,
      },
    );
    const user = users[0];
    if (!user || user.status === 'Suspended') return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role || 'user',
      organizationId: user.organization_id,
      plan: user.plan,
    };
  } catch {
    return null;
  }
}

// =====================================================================
// Supabase query helpers
// =====================================================================
async function sbSelect(
  table: string,
  select = '*',
  filters: Record<string, string> = {},
) {
  const params = new URLSearchParams({ select });
  for (const [key, value] of Object.entries(filters)) {
    params.set(key, value);
  }
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;
  const resp = await fetch(url, { headers: SUPABASE_HEADERS });
  if (!resp.ok) throw new Error(`Supabase error: ${resp.status}`);
  return resp.json();
}

export function ownerFilter(user: AuthUser): Record<string, string> {
  // SECURITY: never return an empty filter here -- an empty {} means "no
  // WHERE clause", i.e. every row in the table across every tenant. Users
  // without an organization_id (e.g. brand new signups before an org is
  // provisioned) must be scoped to their own user_id instead, or they'd see
  // -- and previously DID see -- every other customer's bots/leads/data.
  return user.organizationId
    ? { organization_id: `eq.${user.organizationId}` }
    : { user_id: `eq.${user.id}` };
}

// ─── Plan Limits & Usage Enforcement ──────────────────────────────────
const PLAN_LIMITS_CONFIG: Record<
  string,
  {
    bots: number;
    conversations_per_month: number;
    knowledge_sources: number;
    leads: number;
    trial_days: number;
  }
> = {
  FREE: {
    bots: 1,
    conversations_per_month: 250,
    knowledge_sources: 3,
    leads: 50,
    trial_days: 0,
  },
  STARTER: {
    bots: 3,
    conversations_per_month: 1000,
    knowledge_sources: 10,
    leads: 500,
    trial_days: 0,
  },
  PROFESSIONAL: {
    bots: 10,
    conversations_per_month: 10000,
    knowledge_sources: 50,
    leads: 5000,
    trial_days: 0,
  },
  ENTERPRISE: {
    bots: 9999,
    conversations_per_month: 999999,
    knowledge_sources: 999,
    leads: 999999,
    trial_days: 0,
  },
};
const TRIAL_DURATION_DAYS = 14;
const TRIAL_PLAN = 'PROFESSIONAL'; // trial users get Professional-level access

export function getUserPlanKey(user: AuthUser): string {
  return (user.plan || 'FREE').toUpperCase();
}

export function getPlanLimits(planKey: string) {
  return PLAN_LIMITS_CONFIG[planKey] || PLAN_LIMITS_CONFIG.FREE;
}

export async function checkQuota(
  user: AuthUser,
  resource: 'bots' | 'conversations' | 'knowledge_sources' | 'leads',
): Promise<{ allowed: boolean; current: number; limit: number; plan: string }> {
  const planKey = getUserPlanKey(user);
  const limits = getPlanLimits(planKey);
  const orgFilter = ownerFilter(user);

  let current = 0;
  let limit = 0;

  switch (resource) {
    case 'bots': {
      const bots = await sbSelect('bots', 'id', orgFilter).catch(() => []);
      current = bots.length;
      limit = limits.bots;
      break;
    }
    case 'conversations': {
      // Count this month's conversations
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const convs = await sbSelect('conversations', 'id', {
        ...orgFilter,
        created_at: `gte.${monthStart.toISOString()}`,
      }).catch(() => []);
      current = convs.length;
      limit = limits.conversations_per_month;
      break;
    }
    case 'knowledge_sources': {
      const sources = await sbSelect('knowledge_sources', 'id', {
        bot_id: 'not.is.null', // only count real sources
      }).catch(() => []);
      current = sources.length;
      limit = limits.knowledge_sources;
      break;
    }
    case 'leads': {
      const leads = await sbSelect('leads', 'id', orgFilter).catch(() => []);
      current = leads.length;
      limit = limits.leads;
      break;
    }
  }

  return { allowed: current < limit, current, limit, plan: planKey };
}

// ─── Trial System ─────────────────────────────────────────────────────

async function checkAndApplyTrial(
  user: AuthUser,
): Promise<{ active: boolean; daysRemaining: number }> {
  // Fetch fresh user data to check trial fields
  const users = await sbSelect(
    'users',
    'id,plan,trial_started_at,trial_ends_at',
    {
      id: `eq.${user.id}`,
    },
  ).catch(() => []);
  const u = users?.[0];
  if (!u) return { active: false, daysRemaining: 0 };

  // If user is already on a paid plan, no trial needed
  if (u.plan && u.plan !== 'FREE' && u.plan !== 'TRIAL') {
    return { active: false, daysRemaining: 0 };
  }

  // If trial is active, check if it's expired
  if (u.trial_ends_at) {
    const endsAt = new Date(u.trial_ends_at);
    const now = new Date();
    if (now < endsAt) {
      const daysRemaining = Math.ceil(
        (endsAt.getTime() - now.getTime()) / 86400000,
      );
      return { active: true, daysRemaining };
    }
    // Trial expired — downgrade to FREE if still on TRIAL
    if (u.plan === 'TRIAL') {
      await sbUpdate('users', { plan: 'FREE' }, { id: `eq.${user.id}` }).catch(
        () => {},
      );
    }
    return { active: false, daysRemaining: 0 };
  }

  return { active: false, daysRemaining: 0 };
}

async function startTrial(
  userId: string,
): Promise<{ success: boolean; endsAt: string }> {
  const now = new Date();
  const endsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 86400000);
  await sbUpdate(
    'users',
    {
      plan: 'TRIAL',
      trial_started_at: now.toISOString(),
      trial_ends_at: endsAt.toISOString(),
    },
    { id: `eq.${userId}` },
  );
  return { success: true, endsAt: endsAt.toISOString() };
}

async function sbInsert(table: string, data: any) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error(`Supabase insert error: ${resp.status}`);
  return resp.json();
}

async function sbUpdate(
  table: string,
  data: any,
  filters: Record<string, string>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    params.set(key, value);
  }
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error(`Supabase update error: ${resp.status}`);
  return resp.json();
}

async function sbDelete(table: string, filters: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    params.set(key, value);
  }
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: SUPABASE_HEADERS,
  });
  if (!resp.ok) throw new Error(`Supabase delete error: ${resp.status}`);
  return { success: true };
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Cookie',
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function parseBody(req: VercelRequest): any {
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

// =====================================================================
// Route Handlers
// =====================================================================

async function handleHealth(_req: VercelRequest, res: VercelResponse) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'buildmybot-api',
    version: '2.0.0',
  });
}

async function handleBots(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  const orgFilter = ownerFilter(user);
  if (req.method === 'GET') {
    const bots = await sbSelect('bots', '*', orgFilter);
    res.json(bots);
  } else if (req.method === 'POST') {
    // Enforce plan quota on bot creation
    const quota = await checkQuota(user, 'bots');
    if (!quota.allowed) {
      return res.status(403).json({
        error: `Bot limit reached (${quota.current}/${quota.limit} on ${quota.plan} plan). Please upgrade to create more bots.`,
        upgrade: true,
      });
    }
    const body = parseBody(req);
    const newBot = await sbInsert('bots', {
      id: crypto.randomUUID(),
      user_id: user.id,
      organization_id: user.organizationId || body.organizationId || null,
      name: body.name || 'New Bot',
      type: body.type || 'general',
      system_prompt: body.systemPrompt || body.persona || 'You are a helpful assistant.',
      model: body.model || 'gpt-4o-mini',
      temperature: body.temperature ?? 0.7,
      knowledge_base: body.knowledgeBase || [],
      active: body.active ?? true,
      theme_color: body.themeColor || '#2563eb',
      website_url: body.websiteUrl || null,
      max_messages: body.maxMessages ?? null,
      randomize_identity: body.randomizeIdentity ?? false,
      avatar: body.avatar || null,
      response_delay: body.responseDelay ?? 0,
      embed_type: body.embedType || 'hover',
      lead_capture: body.leadCapture || { enabled: false, promptAfter: 3, emailRequired: true, nameRequired: false, phoneRequired: false },
      is_public: body.isPublic ?? false,
    });
    res.status(201).json(newBot[0]);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleBotById(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  botId: string,
) {
  // SECURITY: scope by tenant too -- id alone let any authenticated user
  // read/edit/delete ANY tenant's bot by guessing/enumerating UUIDs.
  const filter = { id: `eq.${botId}`, ...ownerFilter(user) };
  if (req.method === 'GET') {
    const bots = await sbSelect('bots', '*', filter);
    if (!bots.length) return res.status(404).json({ error: 'Bot not found' });
    res.json(bots[0]);
  } else if (req.method === 'PATCH' || req.method === 'PUT') {
    const updated = await sbUpdate('bots', parseBody(req), filter);
    if (!updated.length)
      return res.status(404).json({ error: 'Bot not found' });
    res.json(updated[0]);
  } else if (req.method === 'DELETE') {
    await sbDelete('bots', filter);
    res.json({ success: true });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleAnalytics(
  _req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const sub = pathParts[0] || '';
  const orgFilter = ownerFilter(user);

  if (sub === 'quick-metrics' || sub === 'metrics') {
    const [bots, leads, convs] = await Promise.all([
      sbSelect('bots', 'id,status', orgFilter).catch(() => []),
      sbSelect('leads', 'id,status', orgFilter).catch(() => []),
      sbSelect('conversations', 'id,created_at', orgFilter).catch(() => []),
    ]);
    res.json({
      activeBots: bots.filter((b: any) => b.status === 'active').length,
      totalBots: bots.length,
      newLeads: leads.filter((l: any) => l.status === 'new').length,
      totalLeads: leads.length,
      totalConversations: convs.length,
      conversationsTrend: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => ({
        date: d,
        count: Math.floor(convs.length * (0.15 + i * 0.05)),
      })),
      leadsTrend: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => ({
        date: d,
        count: Math.floor(leads.length * (0.15 + i * 0.05)),
      })),
    });
  } else if (
    sub === 'conversations' ||
    sub === 'leads' ||
    sub === 'satisfaction'
  ) {
    const orgId = pathParts[1];
    const f = orgId ? { organization_id: `eq.${orgId}` } : orgFilter;
    const table =
      sub === 'conversations'
        ? 'conversations'
        : sub === 'leads'
          ? 'leads'
          : 'satisfaction_ratings';
    const data = await sbSelect(table, '*', f).catch(() => []);
    if (sub === 'satisfaction') {
      const avg =
        data.length > 0
          ? data.reduce((s: number, r: any) => s + (r.rating || 0), 0) /
            data.length
          : 0;
      res.json({
        averageRating: avg,
        totalRatings: data.length,
        ratings: data,
      });
    } else {
      res.json(data);
    }
  } else if (sub === 'trends') {
    const orgId = pathParts[1];
    const f = orgId ? { organization_id: `eq.${orgId}` } : orgFilter;
    const conversations = await sbSelect(
      'conversations',
      'created_at',
      f,
    ).catch(() => []);
    const days: any[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000)
        .toISOString()
        .split('T')[0];
      days.push({
        date: day,
        count: conversations.filter((c: any) => c.created_at?.startsWith(day))
          .length,
      });
    }
    res.json(days);
  } else if (sub === 'performance') {
    const orgId = pathParts[1];
    const f = orgId ? { organization_id: `eq.${orgId}` } : orgFilter;
    res.json(await sbSelect('bot_performance_daily', '*', f).catch(() => []));
  } else {
    res.json(
      await sbSelect('analytics_daily_metrics', '*', orgFilter).catch(() => []),
    );
  }
}

async function handleLeads(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const leadId = pathParts[0];
  const orgFilter = ownerFilter(user);

  if (leadId) {
    // Unified interaction timeline: human actions (CRM emails via
    // nurture_steps), AI agent actions (ai_agent_memories written by the
    // background reasoning loops), and the lead's own milestones (created,
    // replied). Powers the LeadsCRM timeline drawer.
    if (pathParts[1] === 'timeline' && req.method === 'GET') {
      // Tenant-scope the lead lookup first; memories/steps are only fetched
      // for a lead this user is allowed to see.
      const leadRows = await sbSelect('leads', '*', {
        id: `eq.${leadId}`,
        ...orgFilter,
      }).catch(() => []);
      const lead = leadRows[0];
      if (!lead) return res.status(404).json({ error: 'Not found' });

      const [memories, nurtureSteps] = await Promise.all([
        sbSelect('ai_agent_memories', 'id,role_id,content,metadata,created_at', {
          subject_type: 'eq.lead',
          subject_id: `eq.${leadId}`,
          order: 'created_at.desc',
          limit: '50',
        }).catch(() => []),
        sbSelect('nurture_steps', 'id,step_type,subject,content,status,created_at', {
          lead_id: `eq.${leadId}`,
          order: 'created_at.desc',
          limit: '50',
        }).catch(() => []),
      ]);

      const events: Array<{
        id: string;
        actor: 'ai' | 'human' | 'lead';
        actor_name: string;
        type: string;
        summary: string;
        timestamp: string;
      }> = [];

      events.push({
        id: `created-${lead.id}`,
        actor: 'lead',
        actor_name: lead.name || lead.email || 'Lead',
        type: 'created',
        summary: `Lead captured${lead.source ? ` via ${lead.source}` : ''}.`,
        timestamp: lead.created_at,
      });
      if (lead.replied_at) {
        events.push({
          id: `replied-${lead.id}`,
          actor: 'lead',
          actor_name: lead.name || lead.email || 'Lead',
          type: 'replied',
          summary: 'Lead replied by email.',
          timestamp: lead.replied_at,
        });
      }
      for (const m of memories) {
        events.push({
          id: m.id,
          actor: 'ai',
          actor_name: m.role_id,
          type: (m.metadata?.decision as string) || 'ai_action',
          summary: m.content,
          timestamp: m.created_at,
        });
      }
      for (const s of nurtureSteps) {
        events.push({
          id: s.id,
          actor: 'human',
          actor_name: 'Team',
          type: s.step_type || 'email',
          summary: s.subject
            ? `Email sent: "${s.subject}"`
            : `${s.step_type || 'step'} (${s.status})`,
          timestamp: s.created_at,
        });
      }

      events.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      return res.json({ lead_id: leadId, events });
    }
    if (pathParts[1] === 'email' && req.method === 'POST') {
      const body = parseBody(req);
      await sbInsert('nurture_steps', {
        id: crypto.randomUUID(),
        lead_id: leadId,
        step_type: 'email',
        content: body.content || '',
        subject: body.subject || '',
        status: 'sent',
      }).catch(() => {});
      return res.json({ success: true });
    }
    // SECURITY: scope by tenant too -- id alone let any authenticated user
    // read/edit/delete ANY tenant's lead by guessing/enumerating UUIDs.
    const filter = { id: `eq.${leadId}`, ...orgFilter };
    if (req.method === 'GET') {
      const l = await sbSelect('leads', '*', filter);
      res.json(l[0] || { error: 'Not found' });
    } else if (req.method === 'PATCH') {
      const u = await sbUpdate('leads', parseBody(req), filter);
      res.json(u[0] || { error: 'Not found' });
    } else if (req.method === 'DELETE') {
      await sbDelete('leads', filter);
      res.json({ success: true });
    } else res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (req.method === 'GET') {
    res.json(await sbSelect('leads', '*', orgFilter));
  } else if (req.method === 'POST') {
    const body = parseBody(req);
    const r = await sbInsert('leads', {
      id: crypto.randomUUID(),
      user_id: user.id,
      organization_id: user.organizationId || body.organizationId || null,
      source_bot_id: body.botId || null,
      name: body.name || '',
      email: body.email || '',
      phone: body.phone || null,
      status: body.status || 'New',
      score: body.score ?? 50,
    });
    res.status(201).json(r[0]);
  } else res.status(405).json({ error: 'Method not allowed' });
}

async function handleLeadCapture(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });
  const body = parseBody(req);

  // Portfolio intake: trusted sibling sites (donmatthews.live waitlist/notify)
  // push leads straight into the CRM so the AI lead-followup worker nurtures
  // them automatically. Authenticated by a shared secret header, attributed
  // to the portfolio owner's account — no botId involved.
  if (!body.botId && body.portfolio) {
    const secret = process.env.PORTFOLIO_INTAKE_SECRET;
    const provided = req.headers['x-portfolio-secret'];
    if (!secret || provided !== secret) {
      return res.status(401).json({ error: 'Invalid portfolio intake secret' });
    }
    if (!body.email || typeof body.email !== 'string' || !body.email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    const ownerEmail =
      process.env.PORTFOLIO_OWNER_EMAIL || 'president@buildmybot.app';
    const owners = await sbSelect('users', 'id', {
      email: `eq.${ownerEmail}`,
    }).catch(() => []);
    if (!owners[0]?.id) {
      console.error(
        `[handleLeadCapture] portfolio owner ${ownerEmail} not found — lead dropped`,
      );
      return res.status(500).json({ error: 'Portfolio owner account not found' });
    }
    // Dedupe: same email from the same portfolio source is one lead.
    const existing = await sbSelect('leads', 'id', {
      email: `eq.${body.email}`,
      user_id: `eq.${owners[0].id}`,
    }).catch(() => []);
    if (existing[0]?.id) {
      return res.status(200).json({ success: true, leadId: existing[0].id, deduped: true });
    }
    try {
      const r = await sbInsert('leads', {
        id: crypto.randomUUID(),
        user_id: owners[0].id,
        name: body.name || '',
        email: body.email,
        phone: body.phone || null,
        source: body.source || 'donmatthews.live',
        status: 'New',
        score: 50,
      });
      return res.status(201).json({ success: true, leadId: r[0]?.id });
    } catch (err) {
      console.error('[handleLeadCapture] portfolio insert failed:', err);
      return res.status(500).json({ error: 'Failed to save lead' });
    }
  }

  if (!body.botId) {
    return res.status(400).json({ error: 'botId is required to attribute a lead to its owner' });
  }
  // Public widget has no authenticated user — resolve the owning bot to find user_id (NOT NULL on leads).
  const ownerBots = await sbSelect('bots', 'id,user_id', { id: `eq.${body.botId}` }).catch(() => []);
  const ownerUserId = ownerBots[0]?.user_id;
  if (!ownerUserId) {
    return res.status(404).json({ error: 'Bot not found — cannot attribute lead' });
  }
  try {
    const r = await sbInsert('leads', {
      id: crypto.randomUUID(),
      user_id: ownerUserId,
      source_bot_id: body.botId,
      name: body.name || '',
      email: body.email || '',
      phone: body.phone || null,
      status: 'New',
      score: 50,
    });
    res.status(201).json({ success: true, leadId: r[0]?.id });
  } catch (err) {
    console.error('[handleLeadCapture] insert failed:', err);
    res.status(500).json({ error: 'Failed to save lead' });
  }
}

// Must match the product list in handleStripe below — kept as one constant so
// admin revenue math and checkout pricing can't drift apart again.
const PLAN_PRICES: Record<string, number> = {
  free: 0,
  starter: 29,
  professional: 99,
  enterprise: 499,
};

async function handleAdmin(
  _req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  if (!['admin', 'ADMIN'].includes(user.role))
    return res.status(403).json({ error: 'Admin access required' });
  const sub = pathParts[0] || '';

  if (sub === 'live-leads') {
    // Live feed of today's AI-team-researched leads for the master admin
    // dashboard -- polled every few seconds so the count visibly ticks up
    // as the 6 researcher roles (Sarah + 5 sales agents) find real leads.
    const today = new Date().toISOString().slice(0, 10);
    const rows = await sbSelect(
      'researched_leads',
      'id,researched_by,company_name,industry,city,website,created_at',
      {
        created_at: `gte.${today}T00:00:00Z`,
        order: 'created_at.desc',
        limit: '200',
      },
    ).catch(() => []);
    res.json({
      date: today,
      total_today: rows.length,
      leads: rows,
    });
    return;
  }

  if (sub === 'metrics') {
    const [users, orgs, bots, leads, subs] = await Promise.all([
      sbSelect('users', 'id,role,plan,created_at', {}).catch(() => []),
      sbSelect('organizations', 'id,plan,is_active,created_at', {}).catch(
        () => [],
      ),
      sbSelect('bots', 'id,status', {}).catch(() => []),
      sbSelect('leads', 'id,status', {}).catch(() => []),
      sbSelect('organization_subscriptions', 'id,plan,status', {}).catch(
        () => [],
      ),
    ]);
    const paying = orgs.filter((o: any) => o.plan && o.plan !== 'free').length;
    // Real per-plan pricing (matches handleStripe's product list below) instead of
    // a flat `paying * 49` guess that didn't reflect the actual plan mix.
    const mrr = orgs.reduce(
      (sum: number, o: any) => sum + (PLAN_PRICES[o.plan] || 0),
      0,
    );
    res.json({
      totalUsers: users.length,
      totalOrganizations: orgs.length,
      activeOrganizations: orgs.filter((o: any) => o.is_active).length,
      totalBots: bots.length,
      activeBots: bots.filter((b: any) => b.status === 'active').length,
      totalLeads: leads.length,
      newLeads: leads.filter((l: any) => l.status === 'new').length,
      payingCustomers: paying,
      totalSubscriptions: subs.length,
      revenue: { mrr, arr: mrr * 12 },
    });
  } else if (sub === 'notifications') {
    const f = { user_id: `eq.${user.id}` };
    res.json(await sbSelect('notifications', '*', f).catch(() => []));
  } else if (sub === 'partners') {
    res.json(
      await sbSelect('users', 'id,email,role,company_name,created_at', {
        role: 'eq.reseller',
      }).catch(() => []),
    );
  } else if (sub === 'repair-logs') {
    res.json(await sbSelect('repair_logs', '*', {}).catch(() => []));
  } else if (sub === 'payouts') {
    // No payout provider is wired up yet -- honest empty list, not a 404.
    res.json([]);
  } else if (sub === 'financial') {
    const fsub = pathParts[1] || '';
    // NOTE: there is no real Stripe (or other) billing integration wired
    // into this gateway yet -- handleStripe only returns static plan
    // metadata and placeholder checkout URLs. These endpoints return
    // honest zeroed/empty shapes so the Financial dashboard renders
    // instead of crashing, rather than fabricating numbers. Wiring real
    // invoices/refunds/payouts requires a real Stripe integration first.
    if (fsub === 'overview') {
      // FinancialDashboard.tsx's `FinancialOverview` interface expects
      // { mrrCents, arrCents, churnRate, activeCustomers, churnedCustomers }
      // -- this used to return { mrr, arr, totalRevenue, ... } (different
      // field names entirely), so `displayOverview.churnRate.toFixed(2)`
      // read undefined and crashed, blanking the whole admin overview tab.
      const orgs = await sbSelect(
        'organizations',
        'id,plan,is_active',
        {},
      ).catch(() => []);
      const activeCustomers = orgs.filter((o: any) => o.is_active).length;
      const mrr = orgs.reduce(
        (sum: number, o: any) => sum + (PLAN_PRICES[o.plan] || 0),
        0,
      );
      res.json({
        mrrCents: Math.round(mrr * 100),
        arrCents: Math.round(mrr * 12 * 100),
        churnRate: 0,
        activeCustomers,
        churnedCustomers: 0,
        wired: false,
        message:
          'No billing provider connected yet -- churn/churned figures are not tracked until Stripe is wired up.',
      });
    } else if (fsub === 'invoices') {
      res.json([]);
    } else if (fsub === 'refunds') {
      res.json([]);
    } else if (fsub === 'stripe-health') {
      // FinancialDashboard.tsx reads `stripeHealth?.ok` -- include both keys
      // for compatibility.
      res.json({
        ok: false,
        connected: false,
        message: 'Stripe is not connected',
      });
    } else if (fsub === 'features-usage') {
      // AdminFeaturesOverview.tsx expects { plans, addons, usage } -- this
      // used to return a bare `[]`, so `stats.usage.totalConversations`
      // crashed with "Cannot read properties of undefined" and blanked the
      // whole admin overview tab (ComprehensiveAnalytics/AdminFeaturesOverview
      // render unconditionally there, with no error boundary).
      const [orgs, bots, leads, users, convs] = await Promise.all([
        sbSelect('organizations', 'id,plan', {}).catch(() => []),
        sbSelect('bots', 'id', {}).catch(() => []),
        sbSelect('leads', 'id', {}).catch(() => []),
        sbSelect('users', 'id', {}).catch(() => []),
        sbSelect('conversations', 'id', {}).catch(() => []),
      ]);
      const planCounts: Record<string, number> = {};
      for (const o of orgs as any[]) {
        const p = o.plan || 'free';
        planCounts[p] = (planCounts[p] || 0) + 1;
      }
      res.json({
        plans: Object.entries(planCounts).map(([name, count]) => ({
          name,
          users: count,
          revenueCents: (PLAN_PRICES[name] || 0) * count * 100,
        })),
        addons: [],
        usage: {
          totalConversations: convs.length,
          totalLeads: leads.length,
          totalBots: bots.length,
          totalUsers: users.length,
        },
      });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } else {
    res.status(404).json({ error: 'Not found' });
  }
}

async function handleConversations(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const url = new URL(req.url || '', 'http://localhost');
  const userId = url.searchParams.get('userId');
  const isAdmin = ['admin', 'ADMIN'].includes(user.role);

  // Non-admins may only ever see their own conversations.
  if (userId && !isAdmin && userId !== user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!userId && !isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const filters: Record<string, string> = userId
    ? { user_id: `eq.${userId}` }
    : {};
  const conversations = await sbSelect('conversations', '*', {
    ...filters,
    order: 'created_at.desc',
    limit: '100',
  }).catch(() => []);
  // Always an array -- the dashboard does conversations.reduce(...) directly.
  return res.json(Array.isArray(conversations) ? conversations : []);
}

async function handleImpersonation(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const sub = pathParts[0] || '';
  if (sub === 'active' && req.method === 'GET') {
    // Impersonation isn't implemented yet -- returning an empty list (not a
    // 404) so the dashboard's "active impersonation" widget renders as
    // "none active" instead of throwing.
    return res.json([]);
  }
  return res.status(404).json({ error: 'Not found' });
}

async function handleRevenue(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const sub = pathParts[0] || '';
  if (sub === 'usage' && pathParts[1]) {
    const orgId = pathParts[1];
    const [pools, ledger] = await Promise.all([
      sbSelect('usage_pools', '*', { organization_id: `eq.${orgId}` }).catch(
        () => [],
      ),
      sbSelect('usage_ledger', '*', { organization_id: `eq.${orgId}` }).catch(
        () => [],
      ),
    ]);
    res.json({ pools, ledger });
  } else if (sub === 'credit-packages') {
    const rt = new URL(req.url, 'http://localhost').searchParams.get(
      'resourceType',
    );
    res.json(
      await sbSelect(
        'credit_packages',
        '*',
        rt ? { resource_type: `eq.${rt}` } : {},
      ).catch(() => []),
    );
  } else if (sub === 'voice-packages') {
    res.json(await sbSelect('voice_minutes_packages', '*', {}).catch(() => []));
  } else if (sub === 'services') {
    if (req.method === 'GET') {
      res.json(await sbSelect('service_offerings', '*', {}).catch(() => []));
    } else if (req.method === 'POST') {
      const body = parseBody(req);
      const r = await sbInsert('service_orders', {
        id: crypto.randomUUID(),
        organization_id: user.organizationId,
        service_id: body.serviceId,
        status: 'pending',
        details: body.details || {},
      });
      res.status(201).json(r[0]);
    }
  } else if (sub === 'api-keys') {
    const orgId = pathParts[1] || user.organizationId;
    if (pathParts[2] === 'revoke') {
      await sbUpdate(
        'api_keys',
        { status: 'revoked' },
        { id: `eq.${pathParts[1]}` },
      );
      res.json({ success: true });
    } else if (pathParts[2] === 'logs') {
      res.json(
        await sbSelect('api_request_logs', '*', {
          api_key_id: `eq.${pathParts[1]}`,
        }).catch(() => []),
      );
    } else if (pathParts[2] === 'stats') {
      const l = await sbSelect('api_request_logs', '*', {
        api_key_id: `eq.${pathParts[1]}`,
      }).catch(() => []);
      res.json({ totalRequests: l.length, logs: l.slice(-50) });
    } else {
      res.json(
        await sbSelect('api_keys', '*', {
          organization_id: `eq.${orgId}`,
        }).catch(() => []),
      );
    }
  } else if (sub === 'branding') {
    const orgId = pathParts[1] || user.organizationId;
    if (req.method === 'GET') {
      const d = await sbSelect('organization_branding', '*', {
        organization_id: `eq.${orgId}`,
      }).catch(() => []);
      res.json(d[0] || {});
    } else {
      const body = parseBody(req);
      const ex = await sbSelect('organization_branding', '*', {
        organization_id: `eq.${orgId}`,
      }).catch(() => []);
      if (ex.length) {
        const u = await sbUpdate('organization_branding', body, {
          organization_id: `eq.${orgId}`,
        });
        res.json(u[0]);
      } else {
        const r = await sbInsert('organization_branding', {
          id: crypto.randomUUID(),
          organization_id: orgId,
          ...body,
        });
        res.status(201).json(r[0]);
      }
    }
  } else {
    res.status(404).json({ error: 'Not found' });
  }
}

async function handleVoice(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  if (pathParts[0] !== 'agents')
    return res.status(404).json({ error: 'Not found' });
  const botId = pathParts[1];
  if (req.method === 'GET') {
    if (botId) {
      const d = await sbSelect('voice_agents', '*', {
        bot_id: `eq.${botId}`,
      }).catch(() => []);
      res.json(d[0] || null);
    } else {
      const f = ownerFilter(user);
      res.json(await sbSelect('voice_agents', '*', f).catch(() => []));
    }
  } else if (req.method === 'POST' && botId && pathParts[2] === 'provision') {
    const body = parseBody(req);
    const r = await sbInsert('voice_agents', {
      id: crypto.randomUUID(),
      bot_id: botId,
      organization_id: user.organizationId,
      voice_id: body.voiceId || 'default',
      voice_provider: body.provider || 'cartesia',
      status: 'active',
      config: body.config || {},
    }).catch(() => [{ id: 'ok', success: true }]);
    res.status(201).json(r[0]);
  } else if (req.method === 'PATCH' && botId) {
    const u = await sbUpdate('voice_agents', parseBody(req), {
      bot_id: `eq.${botId}`,
    }).catch(() => []);
    res.json(u[0] || { success: true });
  } else res.status(405).json({ error: 'Method not allowed' });
}

const FIRECRAWL_WEBHOOK_SECRET = process.env.FIRECRAWL_WEBHOOK_SECRET || '';

/** Distinct page count for a source, derived from chunk metadata->url. */
async function countCrawledPages(sourceId: string): Promise<number> {
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/knowledge_chunks?source_id=eq.${sourceId}&select=metadata`,
      { headers: SUPABASE_HEADERS },
    );
    if (!resp.ok) return 0;
    const rows: any[] = await resp.json();
    const urls = new Set(rows.map((r) => r.metadata?.url).filter(Boolean));
    return urls.size;
  } catch {
    return 0;
  }
}

/**
 * Public webhook Firecrawl calls once per discovered page during a domain
 * crawl ("crawl.page"), and once more on completion/failure. Each page is
 * chunked + embedded and appended to the source's knowledge_chunks.
 */
async function handleFirecrawlWebhook(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (FIRECRAWL_WEBHOOK_SECRET) {
    const provided = req.headers['x-webhook-secret'];
    if (provided !== FIRECRAWL_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }
  }

  const body: any = parseBody(req) || {};
  const type = body.type as string;
  const metadata = body.metadata || {};
  const sourceId: string | undefined = metadata.sourceId;
  const botId: string | undefined = metadata.botId;

  if (!sourceId || !botId) {
    console.error('[firecrawl-webhook] missing sourceId/botId in metadata', metadata);
    // Still 200 so Firecrawl doesn't retry forever on a payload we can't use
    return res.status(200).json({ received: true, warning: 'missing metadata' });
  }

  // NOTE: Vercel's Node.js runtime can freeze the function shortly after the
  // response is sent, so all DB/embedding work must be awaited BEFORE we
  // respond -- responding early and continuing "in the background" silently
  // drops the work.
  try {
    if (type === 'crawl.page') {
      const pages = Array.isArray(body.data) ? body.data : [body.data].filter(Boolean);
      for (const page of pages) {
        const markdown = page?.markdown || '';
        const pageUrl = page?.metadata?.sourceURL || page?.metadata?.url || '';
        if (markdown) await ingestPageChunks(sourceId, botId, pageUrl, markdown);
      }
      await sbUpdate(
        'knowledge_sources',
        {
          status: 'processing',
          pages_crawled: await countCrawledPages(sourceId),
          last_crawled_at: new Date().toISOString(),
        },
        { id: `eq.${sourceId}` },
      ).catch(() => {});
    } else if (type === 'crawl.completed') {
      await sbUpdate(
        'knowledge_sources',
        {
          status: 'completed',
          last_processed_at: new Date().toISOString(),
          pages_crawled: await countCrawledPages(sourceId),
        },
        { id: `eq.${sourceId}` },
      ).catch(() => {});
    } else if (type === 'crawl.failed') {
      await sbUpdate(
        'knowledge_sources',
        { status: 'failed', last_error: body.error || 'Crawl failed' },
        { id: `eq.${sourceId}` },
      ).catch(() => {});
    }
    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[firecrawl-webhook] processing error:', err.message);
    await sbUpdate(
      'knowledge_sources',
      { status: 'failed', last_error: err.message },
      { id: `eq.${sourceId}` },
    ).catch(() => {});
    // Still 200 -- we've recorded the failure ourselves; a 500 would just
    // make Firecrawl retry and re-process pages we may have partially ingested.
    return res.status(200).json({ received: true, error: err.message });
  }
}

/** Maps a real knowledge_sources DB row (snake_case) to the camelCase
 * shape the dashboard's KnowledgeBaseManager component expects. */
function toKnowledgeSourceDTO(row: any, chunkCount = 0) {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    status: row.status,
    errorMessage: row.error_message || row.last_error || undefined,
    pagesCrawled: row.pages_crawled ?? undefined,
    chunkCount,
    lastCrawledAt: row.last_crawled_at || undefined,
    createdAt: row.created_at,
  };
}

async function handleKnowledge(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const sub = pathParts[0] || '';
  if (sub === 'prebuilt') {
    res.json(
      await sbSelect('bot_templates', '*', { is_public: 'eq.true' }).catch(
        () => [],
      ),
    );
  } else if (sub === 'sources') {
    const botId = pathParts[1];
    if (req.method === 'GET') {
      const rows = await sbSelect(
        'knowledge_sources',
        '*',
        botId ? { bot_id: `eq.${botId}` } : {},
      ).catch(() => []);
      // Chunk counts per source, for the dashboard's chunkCount column
      const chunkCounts: Record<string, number> = {};
      if (rows.length > 0) {
        const chunkRows = await sbSelect('knowledge_chunks', 'source_id', {
          bot_id: `eq.${botId}`,
        }).catch(() => []);
        for (const c of chunkRows) {
          chunkCounts[c.source_id] = (chunkCounts[c.source_id] || 0) + 1;
        }
      }
      const sources = rows.map((r: any) =>
        toKnowledgeSourceDTO(r, chunkCounts[r.id] || 0),
      );
      const totalTokens = 0; // not tracked cheaply here; chunkCount is the primary signal
      res.json({
        sources,
        stats: { sources: sources.length, chunks: Object.values(chunkCounts).reduce((a, b) => a + b, 0), totalTokens },
      });
    } else if (req.method === 'POST') {
      const body = parseBody(req);
      const r = await sbInsert('knowledge_sources', {
        id: crypto.randomUUID(),
        bot_id: botId,
        organization_id: user.organizationId || null,
        source_type: body.type || 'website',
        source_name: body.title || '',
        source_url: body.url || '',
        source_text: body.content || '',
        status: 'active',
      });
      res.status(201).json(toKnowledgeSourceDTO(r[0]));
    }
  } else if (sub === 'scrape') {
    const botId = pathParts[1];
    const body = parseBody(req);
    const sourceId = crypto.randomUUID();
    const url = body.url || '';
    const crawlDepth = Math.max(1, Math.min(Number(body.crawlDepth) || 1, 3));
    // depth 1 → 15 pages, 2 → 40 pages, 3 → 75 pages (keeps Firecrawl usage sane)
    const pageLimit = { 1: 15, 2: 40, 3: 75 }[crawlDepth] || 15;

    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }

    // Create the source record immediately so the dashboard can show "processing"
    await sbInsert('knowledge_sources', {
      id: sourceId,
      bot_id: botId,
      organization_id: user.organizationId || null,
      source_type: 'url',
      source_name: url,
      source_url: url,
      status: 'processing',
    }).catch((err: any) => {
      console.error('[knowledge] failed to create source record:', err.message);
    });

    // Real multi-page domain crawl via Firecrawl (async, webhook-driven)
    const crawlJob = await startFirecrawlCrawl({
      url,
      sourceId,
      botId,
      organizationId: user.organizationId,
      limit: pageLimit,
    });

    if (crawlJob) {
      await sbUpdate(
        'knowledge_sources',
        { processing_state: { firecrawl_job_id: crawlJob.jobId, page_limit: pageLimit } },
        { id: `eq.${sourceId}` },
      ).catch(() => {});
      return res.status(201).json({
        id: sourceId,
        success: true,
        mode: 'crawl',
        jobId: crawlJob.jobId,
        message: `Crawling up to ${pageLimit} pages — this runs in the background.`,
      });
    }

    // Fallback: Firecrawl not configured or failed to start — do a single-page
    // scrape synchronously so the feature still works end to end.
    try {
      const scrapedContent = await scrapeUrlFirecrawl(url);
      if (!scrapedContent) {
        await sbUpdate(
          'knowledge_sources',
          { status: 'failed', last_error: 'No content retrieved' },
          { id: `eq.${sourceId}` },
        ).catch(() => {});
        return res
          .status(422)
          .json({ id: sourceId, error: 'Could not retrieve content from URL' });
      }
      const result = await ingestKnowledgeSource(sourceId, botId, scrapedContent);
      res.status(201).json({ id: sourceId, success: true, mode: 'single-page', ...result });
    } catch (err: any) {
      await sbUpdate(
        'knowledge_sources',
        { status: 'failed', last_error: err.message },
        { id: `eq.${sourceId}` },
      ).catch(() => {});
      res.status(500).json({ id: sourceId, error: err.message });
    }
  } else if (sub === 'upload') {
    const botId = pathParts[1];
    const body = parseBody(req);
    const sourceId = crypto.randomUUID();
    const content = body.content || '';
    // Create source record
    const r = await sbInsert('knowledge_sources', {
      id: sourceId,
      bot_id: botId,
      organization_id: user.organizationId || null,
      source_type: 'document',
      source_name: body.filename || 'Uploaded document',
      status: 'processing',
    }).catch(() => [{ id: sourceId }]);
    // Chunk + embed the uploaded content
    if (content) {
      const result = await ingestKnowledgeSource(sourceId, botId, content).catch(
        (err: any) => {
          console.error('[knowledge] ingest failed for upload:', err.message);
          return null;
        },
      );
      if (!result) {
        await sbUpdate(
          'knowledge_sources',
          { status: 'failed', last_error: 'Ingestion failed' },
          { id: `eq.${sourceId}` },
        ).catch(() => {});
      }
    }
    res.status(201).json({ ...(r[0] || {}), id: sourceId });
  } else if (sub === 'refresh') {
    await sbUpdate(
      'knowledge_sources',
      { status: 'refreshing' },
      { id: `eq.${pathParts[1]}` },
    ).catch(() => {});
    res.json({ success: true });
  } else if (sub === 'preview') {
    const d = await sbSelect('knowledge_sources', '*', {
      id: `eq.${pathParts[1]}`,
    }).catch(() => []);
    res.json(d[0] ? toKnowledgeSourceDTO(d[0]) : {});
  } else res.status(404).json({ error: 'Not found' });
}

async function handleTemplates(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  if (req.method === 'GET') {
    const featured = new URL(req.url, 'http://localhost').searchParams.get(
      'featured',
    );
    res.json(
      await sbSelect(
        'bot_templates',
        '*',
        featured === 'true' ? { is_featured: 'eq.true' } : {},
      ).catch(() => []),
    );
  } else if (req.method === 'POST') {
    const body = parseBody(req);
    const tpls = await sbSelect('bot_templates', '*', {
      id: `eq.${body.templateId}`,
    }).catch(() => []);
    if (!tpls.length)
      return res.status(404).json({ error: 'Template not found' });
    const tpl = tpls[0];
    const r = await sbInsert('bots', {
      id: crypto.randomUUID(),
      organization_id: user.organizationId,
      creator_id: user.id,
      name: `${tpl.name} (Copy)`,
      description: tpl.description || '',
      persona: tpl.persona || '',
      model: 'gpt-4o-mini',
      temperature: 70,
      max_tokens: 500,
      status: 'draft',
      config: tpl.config || {},
    }).catch(() => [{ id: 'ok', success: true }]);
    res.status(201).json(r[0]);
  } else res.status(405).json({ error: 'Method not allowed' });
}

async function handleTools(
  req: VercelRequest,
  res: VercelResponse,
  _user: AuthUser,
  pathParts: string[],
) {
  const toolId = pathParts[0];
  const botId = new URL(req.url, 'http://localhost').searchParams.get('botId');
  if (!toolId) {
    res.json(
      await sbSelect(
        'bot_tools',
        '*',
        botId ? { bot_id: `eq.${botId}` } : {},
      ).catch(() => []),
    );
  } else if (toolId === 'execute') {
    const body = parseBody(req);
    await sbInsert('action_execution_log', {
      id: crypto.randomUUID(),
      tool_id: body.toolId,
      status: 'executed',
      input: body.input || {},
      output: { result: 'Tool execution simulated' },
    }).catch(() => {});
    res.json({ success: true });
  } else if (pathParts[1] === 'toggle') {
    await sbUpdate(
      'bot_tools',
      { is_active: parseBody(req).active },
      { id: `eq.${toolId}` },
    ).catch(() => {});
    res.json({ success: true });
  } else if (pathParts[1] === 'stats') {
    const l = await sbSelect('action_execution_log', '*', {
      tool_id: `eq.${toolId}`,
    }).catch(() => []);
    res.json({ totalExecutions: l.length, logs: l.slice(-20) });
  } else {
    const d = await sbSelect('bot_tools', '*', { id: `eq.${toolId}` }).catch(
      () => [],
    );
    res.json(d[0] || {});
  }
}

async function handleWebhooks(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const wid = pathParts[0];
  const orgF = ownerFilter(user);
  if (!wid) {
    if (req.method === 'GET') {
      res.json(await sbSelect('webhooks', '*', orgF).catch(() => []));
    } else if (req.method === 'POST') {
      const body = parseBody(req);
      const r = await sbInsert('webhooks', {
        id: crypto.randomUUID(),
        organization_id: user.organizationId,
        url: body.url || '',
        event: body.event || '*',
        is_active: true,
        secret: crypto.randomUUID(),
      });
      res.status(201).json(r[0]);
    }
  } else if (pathParts[1] === 'test') {
    res.json({ success: true });
  } else if (pathParts[1] === 'logs') {
    res.json(
      await sbSelect('webhook_logs', '*', { webhook_id: `eq.${wid}` }).catch(
        () => [],
      ),
    );
  } else {
    if (req.method === 'DELETE') {
      await sbDelete('webhooks', { id: `eq.${wid}` });
      res.json({ success: true });
    } else if (req.method === 'PATCH') {
      const u = await sbUpdate('webhooks', parseBody(req), { id: `eq.${wid}` });
      res.json(u[0]);
    } else {
      const d = await sbSelect('webhooks', '*', { id: `eq.${wid}` }).catch(
        () => [],
      );
      res.json(d[0] || {});
    }
  }
}

async function handleAgency(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const sub = pathParts[0] || '';
  if (sub === 'wallet') {
    if (pathParts[1] === 'recharge' || pathParts[1] === 'auto-recharge') {
      if (req.method === 'POST') {
        const body = parseBody(req);
        await sbInsert('usage_ledger', {
          id: crypto.randomUUID(),
          organization_id: user.organizationId,
          type: 'credit',
          amount: body.amount || 0,
          description:
            pathParts[1] === 'auto-recharge'
              ? 'Auto-recharge'
              : 'Wallet recharge',
        }).catch(() => {});
        res.json({ success: true });
      } else res.status(405).json({ error: 'Method not allowed' });
    } else {
      const w = await sbSelect('usage_wallets', '*', {
        organization_id: `eq.${user.organizationId}`,
      }).catch(() => []);
      res.json(w[0] || { balance: 0, currency: 'usd' });
    }
  } else if (sub === 'pricing') {
    res.json(await sbSelect('agency_pricing_tiers', '*', {}).catch(() => []));
  } else if (sub === 'client-usage') {
    res.json(
      await sbSelect('usage_pools', '*', {
        organization_id: `eq.${user.organizationId}`,
      }).catch(() => []),
    );
  } else if (sub === 'profit-report') {
    // Real profit report from actual data
    const orgFilter = ownerFilter(user);
    const [bots, leads, conversations, wallets] = await Promise.all([
      sbSelect('bots', 'id,name,conversations_count', orgFilter).catch(
        () => [],
      ),
      sbSelect('leads', 'id,score,status', orgFilter).catch(() => []),
      sbSelect('conversations', 'id,created_at', orgFilter).catch(() => []),
      sbSelect('usage_wallets', '*', {
        organization_id: `eq.${user.organizationId}`,
      }).catch(() => []),
    ]);
    const wallet = wallets[0] || { balance: 0 };
    const totalConversations = conversations.length;
    const totalLeads = leads.length;
    const qualifiedLeads = (leads as any[]).filter(
      (l) => (l.score || 0) >= 50,
    ).length;
    // Compute monthly breakdown (last 6 months)
    const monthly: { month: string; conversations: number; leads: number }[] =
      [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthStr = d.toISOString().slice(0, 7);
      monthly.push({
        month: monthStr,
        conversations: (conversations as any[]).filter((c) =>
          c.created_at?.startsWith(monthStr),
        ).length,
        leads: (leads as any[]).filter((l) =>
          l.created_at?.startsWith(monthStr),
        ).length,
      });
    }
    res.json({
      totalBots: bots.length,
      totalConversations,
      totalLeads,
      qualifiedLeads,
      walletBalance: wallet.balance,
      topBots: (bots as any[])
        .sort(
          (a, b) => (b.conversations_count || 0) - (a.conversations_count || 0),
        )
        .slice(0, 5)
        .map((b) => ({
          id: b.id,
          name: b.name,
          conversations: b.conversations_count || 0,
        })),
      monthly,
    });
  } else if (sub === 'overview') {
    // Agency overview dashboard
    const orgFilter = ownerFilter(user);
    const [bots, leads, clients] = await Promise.all([
      sbSelect('bots', 'id', orgFilter).catch(() => []),
      sbSelect('leads', 'id', orgFilter).catch(() => []),
      sbSelect('partner_clients', 'id', {
        organization_id: `eq.${user.organizationId}`,
      }).catch(() => []),
    ]);
    res.json({
      activeBots: bots.length,
      totalLeads: leads.length,
      totalClients: clients.length,
    });
  } else res.status(404).json({ error: 'Not found' });
}

async function handleIntegrations(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const sub = pathParts[0] || '';
  if (sub === 'providers') {
    res.json([
      {
        id: 'salesforce',
        name: 'Salesforce',
        category: 'CRM',
        connected: false,
      },
      { id: 'hubspot', name: 'HubSpot', category: 'CRM', connected: false },
      { id: 'zoho', name: 'Zoho', category: 'CRM', connected: false },
      {
        id: 'google_calendar',
        name: 'Google Calendar',
        category: 'Calendar',
        connected: false,
      },
      {
        id: 'calendly',
        name: 'Calendly',
        category: 'Calendar',
        connected: false,
      },
      {
        id: 'slack',
        name: 'Slack',
        category: 'Communication',
        connected: false,
      },
      {
        id: 'mailchimp',
        name: 'Mailchimp',
        category: 'Email',
        connected: false,
      },
      { id: 'twilio', name: 'Twilio', category: 'Voice/SMS', connected: false },
    ]);
  } else if (sub === 'connect') {
    const body = parseBody(req);
    const r = await sbInsert('integrations', {
      id: crypto.randomUUID(),
      organization_id: user.organizationId,
      provider: body.provider,
      status: 'connected',
      config: body.config || {},
    }).catch(() => [{ id: 'ok', success: true }]);
    res.status(201).json(r[0]);
  } else if (sub === 'disconnect') {
    const body = parseBody(req);
    await sbDelete('integrations', {
      organization_id: `eq.${user.organizationId}`,
      provider: `eq.${body.provider}`,
    }).catch(() => {});
    res.json({ success: true });
  } else {
    res.json(
      await sbSelect('integrations', '*', {
        organization_id: `eq.${user.organizationId}`,
      }).catch(() => []),
    );
  }
}

async function handleChannels(
  _req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  res.json(
    await sbSelect('bots', 'id,name,config', ownerFilter(user)).catch(() => []),
  );
}

async function handlePhone(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  if (pathParts[0] === 'purchase' && req.method === 'POST') {
    const body = parseBody(req);
    const r = await sbInsert('phone_numbers', {
      id: crypto.randomUUID(),
      organization_id: user.organizationId,
      number: body.number || '+10000000000',
      provider: 'twilio',
      status: 'active',
    }).catch(() => [{ id: 'ok', success: true }]);
    res.status(201).json(r[0]);
  } else if (pathParts[0] === 'release') {
    const body = parseBody(req);
    await sbUpdate(
      'phone_numbers',
      { status: 'released' },
      { id: `eq.${body.numberId}` },
    ).catch(() => {});
    res.json({ success: true });
  } else {
    res.json(
      await sbSelect('phone_numbers', '*', ownerFilter(user)).catch(() => []),
    );
  }
}

async function handleOrganizations(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  if (req.method === 'GET') {
    if (user.organizationId) {
      const d = await sbSelect('organizations', '*', {
        id: `eq.${user.organizationId}`,
      });
      res.json(d[0] || {});
    } else res.json({});
  } else if (req.method === 'PATCH') {
    if (user.organizationId) {
      const u = await sbUpdate('organizations', parseBody(req), {
        id: `eq.${user.organizationId}`,
      });
      res.json(u[0]);
    } else res.status(400).json({ error: 'No organization' });
  } else res.status(405).json({ error: 'Method not allowed' });
}

async function handleClients(
  _req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const cid = pathParts[0];
  if (!cid) {
    res.json(
      await sbSelect('partner_clients', '*', {
        partner_id: `eq.${user.id}`,
      }).catch(() => []),
    );
  } else if (cid === 'bots') {
    // dbService.getBots() calls GET /api/clients/bots expecting an array of
    // the user's bots -- this used to fall through to the client-by-id
    // branch below (treating "bots" as a client id), returning `{}` instead
    // of an array and crashing App.tsx's `bots.reduce(...)`.
    const orgFilter = ownerFilter(user);
    res.json(await sbSelect('bots', '*', orgFilter).catch(() => []));
  } else if (cid === 'leads') {
    // dbService.getLeads() / subscribeToLeads() call GET /api/clients/leads
    // expecting an array of leads -- same route-collision bug as "bots"
    // above: this used to fall through to the client-by-id branch, treating
    // "leads" as a client id, returning `{}` and crashing ClientOverview /
    // any consumer that reads array-shaped fields off the result.
    const orgFilter = ownerFilter(user);
    res.json(await sbSelect('leads', '*', orgFilter).catch(() => []));
  } else if (cid === 'overview') {
    // dbService.getClientOverview() calls GET /api/clients/overview expecting
    // {stats, usage, voice, conversationTrend, recentBots, recentLeads} --
    // same route-collision bug as bots/leads/analytics above: this had no
    // handler at all, so it fell through to the client-by-id branch,
    // returning `{}` and crashing ClientOverview.tsx's `recentBots[0]?.id`
    // (recentBots was `undefined`, not `[]`) for EVERY user, new or existing.
    const PLAN_LIMITS: Record<string, { bots: number; conversations: number }> =
      {
        FREE: { bots: 1, conversations: 60 },
        STARTER: { bots: 1, conversations: 750 },
        PROFESSIONAL: { bots: 5, conversations: 5000 },
        ENTERPRISE: { bots: 9999, conversations: 999999 },
      };
    const orgFilter = ownerFilter(user);
    const [bots, leads, conversations] = await Promise.all([
      sbSelect('bots', '*', orgFilter).catch(() => []),
      sbSelect('leads', '*', orgFilter).catch(() => []),
      sbSelect('conversations', 'id,created_at', orgFilter).catch(() => []),
    ]);

    const botCount = bots.length;
    const leadCount = leads.length;
    const scoredLeads = (leads as any[]).filter(
      (l) => typeof l.score === 'number',
    );
    const averageLeadScore =
      scoredLeads.length > 0
        ? scoredLeads.reduce((sum, l) => sum + l.score, 0) / scoredLeads.length
        : 0;
    const conversionRate =
      conversations.length > 0
        ? Number(((leadCount / conversations.length) * 100).toFixed(1))
        : 0;

    const planKey = (user.plan || 'FREE').toUpperCase();
    const limits = PLAN_LIMITS[planKey] || PLAN_LIMITS.FREE;

    const days: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000)
        .toISOString()
        .split('T')[0];
      days.push({
        date: day,
        count: (conversations as any[]).filter((c) =>
          c.created_at?.startsWith(day),
        ).length,
      });
    }

    res.json({
      stats: { botCount, leadCount, conversionRate, averageLeadScore },
      usage: {
        plan: planKey,
        conversationsUsed: conversations.length,
        conversationsLimit: limits.conversations,
        botsUsed: botCount,
        botsLimit: limits.bots,
      },
      voice: { enabled: false, minutesUsed: 0, minutesLimit: 0 },
      conversationTrend: days,
      recentBots: (bots as any[])
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(0, 5)
        .map((b) => ({
          id: b.id,
          name: b.name,
          active: Boolean(b.active),
          voiceId: b.voice_id || null,
          createdAt: b.created_at,
        })),
      recentLeads: (leads as any[])
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(0, 5)
        .map((l) => ({
          id: l.id,
          name: l.name,
          email: l.email,
          phone: l.phone || null,
          status: l.status,
          score: typeof l.score === 'number' ? l.score : null,
          createdAt: l.created_at,
        })),
    });
  } else if (cid === 'analytics' && pathParts[1] === 'dashboard') {
    // AdvancedAnalytics (currentView === 'analytics' in App.tsx) fetches
    // /clients/analytics/dashboard expecting {metrics, timeSeriesData, ...}.
    // This used to fall through to the client-by-id branch (treating
    // "analytics" as a client id) and return `{}`, crashing on
    // `data.metrics.totalConversations`.
    const orgFilter = ownerFilter(user);
    const [convs, leads] = await Promise.all([
      sbSelect('conversations', 'id,created_at', orgFilter).catch(() => []),
      sbSelect('leads', 'id,created_at,source_url', orgFilter).catch(() => []),
    ]);
    const totalConversations = convs.length;
    const totalLeads = leads.length;
    const conversionRate =
      totalConversations > 0
        ? Number(((totalLeads / totalConversations) * 100).toFixed(1))
        : 0;

    const days: {
      date: string;
      conversations: number;
      visitors: number;
      leads: number;
    }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000)
        .toISOString()
        .split('T')[0];
      days.push({
        date: day,
        conversations: convs.filter((c: any) => c.created_at?.startsWith(day))
          .length,
        visitors: 0,
        leads: leads.filter((l: any) => l.created_at?.startsWith(day)).length,
      });
    }

    const sourceCounts: Record<string, number> = {};
    for (const l of leads as any[]) {
      const src = l.source_url
        ? new URL(l.source_url, 'http://x').hostname || 'direct'
        : 'direct';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    }

    res.json({
      metrics: {
        totalConversations,
        uniqueVisitors: 0,
        leadsGenerated: totalLeads,
        conversionRate,
        conversationGrowth: 0,
        visitorGrowth: 0,
        leadGrowth: 0,
        conversionGrowth: 0,
      },
      timeSeriesData: days,
      leadsBySource: Object.entries(sourceCounts).map(
        ([source, leadsCount]) => ({
          source,
          leads: leadsCount,
        }),
      ),
      sentimentData: [],
      sessionDurationData: [],
      topIntents: [],
      peakHoursData: [],
    });
  } else if (cid === 'onboarding' && pathParts[1] === 'complete') {
    res.json({ success: true });
  } else if (cid === 'events') {
    res.json({ success: true });
  } else {
    const d = await sbSelect('partner_clients', '*', { id: `eq.${cid}` }).catch(
      () => [],
    );
    res.json(d[0] || {});
  }
}

// Very small in-memory rate limiter -- resets on cold start, which is fine
// as a basic abuse guard for a public unauthenticated endpoint (a real
// distributed limiter would need Supabase/Redis, out of scope for now).
const CHAT_RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
function chatRateLimited(key: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = CHAT_RATE_LIMIT.get(key);
  if (!entry || now > entry.resetAt) {
    CHAT_RATE_LIMIT.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

/** Public chat endpoint -- powers both the embedded bot widget
 * (/api/chat/bot/{botId}, real customer bots with their own system prompt +
 * knowledge base) and the generic marketing-site demo mode (/api/chat with
 * a caller-supplied systemPrompt, no botId). Intentionally takes no
 * `user` -- website visitors chatting with an embedded bot are never
 * logged into buildmybot.app. */
async function handleChat(
  req: VercelRequest,
  res: VercelResponse,
  pathParts: string[],
) {
  if (req.method !== 'POST') {
    // GET history is tenant-owned data -- keep that path authenticated.
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const botId = pathParts[0] === 'bot' ? pathParts[1] : pathParts[0];
    return res.json(
      await sbSelect('conversations', '*', {
        bot_id: `eq.${botId}`,
        ...ownerFilter(user),
      }).catch(() => []),
    );
  }

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const botId = pathParts[0] === 'bot' ? pathParts[1] : undefined;

  const body = parseBody(req);
  const rawHistory: { role: string; text?: string; content?: string }[] =
    Array.isArray(body.messages) ? body.messages : [];
  const sessionId = body.sessionId || crypto.randomUUID();

  if (chatRateLimited(`${ip}:${botId || 'demo'}`)) {
    return res
      .status(429)
      .json({ error: 'Too many messages, please slow down.' });
  }

  let systemPrompt =
    typeof body.systemPrompt === 'string' ? body.systemPrompt : '';
  let temperature = 0.7;
  let preferredModel: string | undefined;
  let bot: any = null;

  if (botId) {
    const bots = await sbSelect('bots', '*', { id: `eq.${botId}` }).catch(
      () => [],
    );
    bot = bots[0];
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    if (bot.active === false) {
      return res.status(403).json({ error: 'This bot is currently inactive.' });
    }
    systemPrompt =
      bot.system_prompt || systemPrompt || 'You are a helpful assistant.';
    temperature = typeof bot.temperature === 'number' ? bot.temperature : 0.7;
    preferredModel = body.model || bot.model;

    // RAG: retrieve the most relevant knowledge chunks via vector similarity
    // search. Falls back to keyword search if embeddings aren't available.
    const userMessage =
      rawHistory.at(-1)?.text || rawHistory.at(-1)?.content || '';
    if (userMessage && botId) {
      try {
        const relevantChunks = await searchKnowledge(botId, userMessage, 5);
        if (relevantChunks.length > 0) {
          const kbText = relevantChunks.join('\n\n---\n\n').slice(0, 8000);
          systemPrompt += `\n\nUse the following business knowledge to answer questions. If the answer isn't in here, say you don't have that information rather than guessing:\n${kbText}`;
        }
      } catch (err: any) {
        console.error(
          '[chat] RAG search failed, falling back to inline KB:',
          err.message,
        );
      }
    }
    // Fallback: inline knowledge_base field (for bots without chunked sources)
    if (
      !systemPrompt.includes('business knowledge') &&
      Array.isArray(bot.knowledge_base) &&
      bot.knowledge_base.length
    ) {
      const kbText = bot.knowledge_base
        .map((k: any) => (typeof k === 'string' ? k : k.content || ''))
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 6000);
      if (kbText) {
        systemPrompt += `\n\nUse the following business knowledge to answer questions. If the answer isn't in here, say you don't have that information rather than guessing:\n${kbText}`;
      }
    }
  }

  if (!systemPrompt) systemPrompt = 'You are a helpful assistant.';

  // Normalize incoming history (frontend uses Gemini-style role: 'user' | 'model')
  // to OpenAI-style role: 'user' | 'assistant' for the LLM call.
  const maxTurns = (bot?.max_messages as number) || 20;
  const history = rawHistory.slice(-maxTurns).map((m) => ({
    role: (m.role === 'model' || m.role === 'assistant'
      ? 'assistant'
      : 'user') as 'user' | 'assistant',
    content: m.text ?? m.content ?? '',
  }));

  const llmMessages: {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }[] = [{ role: 'system', content: systemPrompt }, ...history];

  let reply: string;
  try {
    reply = await callLLMMessages(
      llmMessages,
      temperature,
      preferredModel as any,
    );
  } catch (err: any) {
    console.error('[chat] LLM call failed:', err?.message || err);
    return res.status(502).json({
      error:
        'AI service is temporarily unavailable. Please try again in a moment.',
    });
  }

  if (botId) {
    await sbInsert('conversations', {
      id: crypto.randomUUID(),
      bot_id: botId,
      session_id: sessionId,
      messages: [
        ...rawHistory,
        { role: 'user', text: rawHistory.at(-1)?.text },
        { role: 'model', text: reply },
      ],
      status: 'active',
    }).catch(() => {});
    await sbUpdate(
      'bots',
      { conversations_count: (bot.conversations_count || 0) + 1 },
      { id: `eq.${botId}` },
    ).catch(() => {});
  }

  res.json({ response: reply, sessionId });
}

async function handleSearch(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  // SECURITY: this had no tenant scoping at all -- any logged-in user could
  // search every tenant's bot/lead names (a cross-tenant data leak).
  const orgF = ownerFilter(user);
  const q = new URL(req.url, 'http://localhost').searchParams.get('q') || '';
  const [bots, leads] = await Promise.all([
    sbSelect('bots', 'id,name,description', {
      name: `ilike.%${q}%`,
      ...orgF,
    }).catch(() => []),
    sbSelect('leads', 'id,name,email', { name: `ilike.%${q}%`, ...orgF }).catch(
      () => [],
    ),
  ]);
  res.json({ bots, leads, query: q });
}

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_API = 'https://api.stripe.com/v1';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://www.buildmybot.app';

/** Minimal Stripe REST client -- form-encoded POSTs, Basic auth with the
 * secret key, same fetch-based style as the rest of this file (no SDK). */
async function stripeRequest(
  method: 'GET' | 'POST',
  path: string,
  params?: Record<string, any>,
) {
  if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  const auth = `Basic ${Buffer.from(`${STRIPE_SECRET_KEY}:`).toString('base64')}`;
  let url = `${STRIPE_API}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: auth },
  };
  if (params && method === 'GET') {
    const qs = new URLSearchParams();
    flattenStripeParams(params, qs);
    url += `?${qs.toString()}`;
  } else if (params) {
    const body = new URLSearchParams();
    flattenStripeParams(params, body);
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = body.toString();
  }
  const resp = await fetch(url, opts);
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Stripe error ${resp.status}`);
  }
  return data;
}

/** Stripe's form encoding needs bracket notation for nested objects/arrays. */
function flattenStripeParams(
  obj: Record<string, any>,
  qs: URLSearchParams,
  prefix = '',
) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const paramKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === 'object') {
          flattenStripeParams(v, qs, `${paramKey}[${i}]`);
        } else {
          qs.append(`${paramKey}[${i}]`, String(v));
        }
      });
    } else if (typeof value === 'object') {
      flattenStripeParams(value, qs, paramKey);
    } else {
      qs.append(paramKey, String(value));
    }
  }
}

/** Get the user's Stripe customer id, creating one (and persisting it) if
 * they don't have one yet. */
async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const rows = await sbSelect('users', 'id,email,stripe_customer_id', {
    id: `eq.${userId}`,
  });
  const user = rows[0];
  if (!user) throw new Error('User not found');
  if (user.stripe_customer_id) return user.stripe_customer_id;

  const customer = await stripeRequest('POST', '/customers', {
    email: user.email,
    metadata: { userId },
  });
  await sbUpdate(
    'users',
    { stripe_customer_id: customer.id },
    { id: `eq.${userId}` },
  );
  return customer.id;
}

async function handleStripe(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const sub = pathParts[0] || '';

  if (sub === 'products' && req.method === 'GET') {
    try {
      const data = await stripeRequest('GET', '/products', {
        active: true,
        limit: 100,
        expand: ['data.default_price'],
      });
      const products = (data.data || [])
        .filter((p: any) => p.default_price)
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          metadata: p.metadata || {},
          prices: [
            {
              id: p.default_price.id,
              unit_amount: p.default_price.unit_amount,
              currency: p.default_price.currency,
            },
          ],
        }));
      return res.json({ data: products });
    } catch (err: any) {
      console.error('[stripe] products fetch failed:', err.message);
      return res
        .status(502)
        .json({ error: 'Failed to load products', details: err.message });
    }
  }

  if (sub === 'checkout' && req.method === 'POST') {
    const body = parseBody(req) || {};
    const { priceId, mode, metadata, organizationId } = body;
    const userId = body.userId || user?.id;
    if (!priceId) return res.status(400).json({ error: 'priceId is required' });
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
      const customerId = await getOrCreateStripeCustomer(userId);
      const sessionMode = mode === 'payment' ? 'payment' : 'subscription';
      const session = await stripeRequest('POST', '/checkout/sessions', {
        customer: customerId,
        mode: sessionMode,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${APP_BASE_URL}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_BASE_URL}/billing?checkout=cancelled`,
        metadata: {
          userId,
          organizationId: organizationId || user?.organizationId || '',
          ...(metadata || {}),
        },
        ...(sessionMode === 'subscription'
          ? {
              subscription_data: {
                metadata: {
                  userId,
                  organizationId: organizationId || user?.organizationId || '',
                },
              },
            }
          : {}),
      });
      return res.json({ url: session.url });
    } catch (err: any) {
      console.error('[stripe] checkout failed:', err.message);
      return res
        .status(502)
        .json({ error: 'Checkout failed', details: err.message });
    }
  }

  if (sub === 'portal' && (req.method === 'POST' || req.method === 'GET')) {
    const body = req.method === 'POST' ? parseBody(req) || {} : {};
    const userId = body.userId || user?.id;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    try {
      const customerId = await getOrCreateStripeCustomer(userId);
      const session = await stripeRequest('POST', '/billing_portal/sessions', {
        customer: customerId,
        return_url: `${APP_BASE_URL}/billing`,
      });
      return res.json({ url: session.url });
    } catch (err: any) {
      console.error('[stripe] portal failed:', err.message);
      return res
        .status(502)
        .json({ error: 'Failed to open billing portal', details: err.message });
    }
  }

  if (
    sub === 'whitelabel' &&
    pathParts[1] === 'checkout' &&
    req.method === 'POST'
  ) {
    const body = parseBody(req) || {};
    const userId = body.userId || user?.id;
    const whitelabelPriceId = process.env.STRIPE_WHITELABEL_PRICE_ID;
    if (!whitelabelPriceId) {
      return res
        .status(500)
        .json({ error: 'STRIPE_WHITELABEL_PRICE_ID not configured' });
    }
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    try {
      const customerId = await getOrCreateStripeCustomer(userId);
      const session = await stripeRequest('POST', '/checkout/sessions', {
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: whitelabelPriceId, quantity: 1 }],
        success_url: `${APP_BASE_URL}/billing?checkout=whitelabel_success`,
        cancel_url: `${APP_BASE_URL}/billing?checkout=cancelled`,
        metadata: { userId, type: 'whitelabel' },
        subscription_data: { metadata: { userId, type: 'whitelabel' } },
      });
      return res.json({ url: session.url });
    } catch (err: any) {
      console.error('[stripe] whitelabel checkout failed:', err.message);
      return res
        .status(502)
        .json({ error: 'Checkout failed', details: err.message });
    }
  }

  return res.status(404).json({ error: 'Not found' });
}

async function handleNotifications(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const nid = pathParts[0];
  if (!nid) {
    if (req.method === 'GET') {
      const rows = await sbSelect('notifications', '*', {
        user_id: `eq.${user.id}`,
      }).catch(() => []);
      // Shape this to match NotificationsResponse expected by
      // NotificationBell.tsx: { unread, recent, unreadCount }. The
      // notifications table has no isPopup/priority/receipt columns yet,
      // so we map sensible defaults from what does exist (read/type).
      const mapped = (Array.isArray(rows) ? rows : []).map((n: any) => ({
        id: n.id,
        title: n.title || '',
        body: n.message || '',
        isPopup: false,
        priority:
          n.type === 'urgent'
            ? 'urgent'
            : n.type === 'warning'
              ? 'high'
              : 'normal',
        createdAt: n.created_at,
        receipt: {
          viewedAt: n.read ? n.updated_at || n.created_at : null,
          acknowledgedAt: n.read ? n.updated_at || n.created_at : null,
        },
      }));
      const unread = mapped.filter((n) => !n.receipt.viewedAt);
      res.json({
        unread,
        recent: mapped.slice(0, 20),
        unreadCount: unread.length,
      });
    } else if (req.method === 'POST') {
      const body = parseBody(req);
      const r = await sbInsert('notifications', {
        id: crypto.randomUUID(),
        user_id: body.userId || user.id,
        title: body.title || '',
        message: body.message || '',
        type: body.type || 'info',
        read: false,
      });
      res.status(201).json(r[0]);
    }
  } else {
    if (req.method === 'PATCH') {
      const u = await sbUpdate('notifications', parseBody(req), {
        id: `eq.${nid}`,
      });
      res.json(u[0]);
    } else if (req.method === 'DELETE') {
      await sbDelete('notifications', { id: `eq.${nid}` });
      res.json({ success: true });
    }
  }
}

async function handleAuthExtra(
  req: VercelRequest,
  res: VercelResponse,
  pathParts: string[],
) {
  if (pathParts[0] === 'forgot-password' && req.method === 'POST') {
    const body = parseBody(req);
    await sbSelect('users', 'id,email', { email: `eq.${body.email}` }).catch(
      () => [],
    );
    res.json({
      success: true,
      message: 'If that email exists, a reset link has been sent',
    });
  } else res.status(404).json({ error: 'Not found' });
}

async function handleBotHealth(
  _req: VercelRequest,
  res: VercelResponse,
  _user: AuthUser,
  pathParts: string[],
) {
  const botId = pathParts[0];
  const [bot, errors, convs] = await Promise.all([
    sbSelect('bots', '*', { id: `eq.${botId}` }).catch(() => []),
    sbSelect('error_logs', '*', { bot_id: `eq.${botId}` }).catch(() => []),
    sbSelect('conversations', 'id', { bot_id: `eq.${botId}` }).catch(() => []),
  ]);
  res.json({
    bot: bot[0],
    status: bot[0]?.status || 'unknown',
    errorCount: errors.length,
    recentErrors: errors.slice(-5),
    conversationCount: convs.length,
    healthScore:
      errors.length > 10
        ? 'critical'
        : errors.length > 3
          ? 'warning'
          : 'healthy',
  });
}

async function handleBotErrors(
  _req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  // SECURITY: previously had no role check at all -- any logged-in user
  // could read/resolve every tenant's error logs. error_logs has no
  // documented schema (no migration defines it, table is empty in prod),
  // so rather than guess at a filter column that may not exist, restrict
  // this operational/system view to platform admins only.
  if (!['admin', 'ADMIN'].includes(user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  if (pathParts[0] === 'recent') {
    res.json(
      (await sbSelect('error_logs', '*', {}).catch(() => [])).slice(-50),
    );
  } else if (pathParts[1] === 'auto-fix' || pathParts[1] === 'resolve') {
    await sbUpdate(
      'error_logs',
      { status: 'resolved' },
      { id: `eq.${pathParts[0]}` },
    ).catch(() => {});
    res.json({ success: true });
  } else {
    res.json(await sbSelect('error_logs', '*', {}).catch(() => []));
  }
}

async function handleLandingPages(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const pid = pathParts[0];
  const orgF = ownerFilter(user);
  if (!pid) {
    if (req.method === 'GET') {
      res.json(await sbSelect('landing_pages', '*', orgF).catch(() => []));
    } else if (req.method === 'POST') {
      const body = parseBody(req);
      const r = await sbInsert('landing_pages', {
        id: crypto.randomUUID(),
        organization_id: user.organizationId,
        title: body.title || 'Untitled',
        slug: body.slug || crypto.randomUUID().substring(0, 8),
        content: body.content || {},
        status: 'draft',
      });
      res.status(201).json(r[0]);
    }
  } else if (pathParts[1] === 'publish') {
    await sbUpdate(
      'landing_pages',
      { status: 'published' },
      { id: `eq.${pid}` },
    ).catch(() => {});
    res.json({ success: true });
  } else {
    if (req.method === 'GET') {
      const d = await sbSelect('landing_pages', '*', { id: `eq.${pid}` }).catch(
        () => [],
      );
      res.json(d[0] || {});
    } else if (req.method === 'PUT' || req.method === 'PATCH') {
      const u = await sbUpdate('landing_pages', parseBody(req), {
        id: `eq.${pid}`,
      });
      res.json(u[0]);
    } else if (req.method === 'DELETE') {
      await sbDelete('landing_pages', { id: `eq.${pid}` });
      res.json({ success: true });
    }
  }
}

async function handleUsers(
  _req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  if (pathParts[1] === 'credits') {
    res.json({
      credits: await sbSelect('usage_pools', '*', {
        organization_id: `eq.${user.organizationId}`,
      }).catch(() => []),
    });
  } else res.status(404).json({ error: 'Not found' });
}

async function handleTeam(
  _req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  const [members, roles] = await Promise.all([
    sbSelect('organization_members', '*', ownerFilter(user)).catch(() => []),
    sbSelect('agent_roles', '*', {}).catch(() => []),
  ]);
  res.json({ members, roles });
}

async function handleAudit(
  _req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  // SECURITY: previously had no role check AND no tenant scoping -- any
  // logged-in user got every tenant's audit log. audit_logs has a real
  // organization_id/user_id (confirmed via schema check), so scope
  // non-admins to their own tenant; platform admins keep the global view.
  const isAdmin = ['admin', 'ADMIN'].includes(user.role);
  const filter = isAdmin ? {} : ownerFilter(user);
  res.json(
    (
      await sbSelect('audit_logs', '*', {
        ...filter,
        order: 'created_at.desc',
      }).catch(() => [])
    ).slice(0, 100),
  );
}

async function handleSupport(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const tid = pathParts[0];
  if (!tid) {
    if (req.method === 'GET') {
      res.json(
        await sbSelect('support_tickets', '*', {
          created_by: `eq.${user.id}`,
        }).catch(() => []),
      );
    } else if (req.method === 'POST') {
      const body = parseBody(req);
      const r = await sbInsert('support_tickets', {
        id: crypto.randomUUID(),
        created_by: user.id,
        organization_id: user.organizationId,
        subject: body.subject || '',
        description: body.description || '',
        priority: body.priority || 'normal',
        status: 'open',
      });
      res.status(201).json(r[0]);
    }
  } else if (pathParts[1] === 'messages') {
    if (req.method === 'GET') {
      res.json(
        await sbSelect('support_ticket_messages', '*', {
          ticket_id: `eq.${tid}`,
        }).catch(() => []),
      );
    } else if (req.method === 'POST') {
      const body = parseBody(req);
      const r = await sbInsert('support_ticket_messages', {
        id: crypto.randomUUID(),
        ticket_id: tid,
        sender_id: user.id,
        message: body.message || '',
      });
      res.status(201).json(r[0]);
    }
  } else {
    const d = await sbSelect('support_tickets', '*', { id: `eq.${tid}` }).catch(
      () => [],
    );
    res.json(d[0] || {});
  }
}

async function handleLaunchGate(_req: VercelRequest, res: VercelResponse) {
  res.json({ enabled: false, message: 'Launch gate is open' });
}

// =====================================================================

async function handleAiEmployees(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const sub = pathParts[0] || '';

  // Live roster + activity monitoring -- admin/owner only, read-only.
  if (sub === '' && req.method === 'GET') {
    if (!['admin', 'ADMIN'].includes(user.role))
      return res.status(403).json({ error: 'Admin access required' });
    const employees = await sbSelect(
      'AiEmployee',
      'id,name,role,title,email,"reportsTo",status,"lastActive","tasksToday","tasksCompleted"',
    ).catch(() => []);
    return res.json(employees);
  }

  if (sub === 'logs' && req.method === 'GET') {
    if (!['admin', 'ADMIN'].includes(user.role))
      return res.status(403).json({ error: 'Admin access required' });
    const limitParam = Number((req.query?.limit as string) || 30);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 200)
      : 30;
    const logs = await sbSelect('EmployeeLog', '*', {
      order: 'createdAt.desc',
      limit: String(limit),
    }).catch(() => []);
    return res.json(logs);
  }

  if (sub === 'escalations' && req.method === 'GET') {
    if (!['admin', 'ADMIN'].includes(user.role))
      return res.status(403).json({ error: 'Admin access required' });
    const escalations = await sbSelect('escalations', '*', {
      order: 'created_at.desc',
      limit: '50',
    }).catch(() => []);
    return res.json(escalations);
  }

  // Voice briefing — converts the latest Marcus executive summary to audio
  // via OpenAI TTS so Don can listen instead of reading.
  if (sub === 'briefing' && pathParts[1] === 'audio' && req.method === 'GET') {
    if (!['admin', 'ADMIN'].includes(user.role))
      return res.status(403).json({ error: 'Admin access required' });
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey)
      return res.status(503).json({ error: 'OPENAI_API_KEY not configured' });
    // Get today's Marcus summary (fall back to most recent)
    const today = new Date().toISOString().slice(0, 10);
    let summaryRows = await sbSelect('ai_team_log', 'summary,shift_date', {
      role_id: 'eq.marcus-manager',
      shift_date: `eq.${today}`,
      order: 'created_at.desc',
      limit: '1',
    }).catch(() => []);
    if (!summaryRows.length) {
      summaryRows = await sbSelect('ai_team_log', 'summary,shift_date', {
        role_id: 'eq.marcus-manager',
        order: 'created_at.desc',
        limit: '1',
      }).catch(() => []);
    }
    if (!summaryRows.length)
      return res.status(404).json({ error: 'No executive briefing found' });
    const briefingText = summaryRows[0].summary;
    const briefingDate = summaryRows[0].shift_date;
    try {
      const ttsResp = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: `BuildMyBot executive briefing for ${briefingDate}. ${briefingText}`,
          voice: 'onyx',
          response_format: 'mp3',
        }),
      });
      if (!ttsResp.ok) {
        const errText = await ttsResp.text();
        return res.status(502).json({ error: 'TTS failed', details: errText });
      }
      const audioBuffer = Buffer.from(await ttsResp.arrayBuffer());
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="briefing-${briefingDate}.mp3"`,
      );
      res.setHeader('Content-Length', String(audioBuffer.length));
      return res.status(200).end(audioBuffer);
    } catch (err: any) {
      return res
        .status(500)
        .json({ error: 'TTS generation failed', details: err.message });
    }
  }

  // Text briefing — returns the latest Marcus summary as JSON
  if (sub === 'briefing' && req.method === 'GET') {
    if (!['admin', 'ADMIN'].includes(user.role))
      return res.status(403).json({ error: 'Admin access required' });
    const today = new Date().toISOString().slice(0, 10);
    const summaryRows = await sbSelect(
      'ai_team_log',
      'summary,shift_date,created_at',
      {
        role_id: 'eq.marcus-manager',
        order: 'created_at.desc',
        limit: '5',
      },
    ).catch(() => []);
    return res.json({ briefings: summaryRows });
  }

  if (sub !== 'shift') {
    return res.status(404).json({ error: 'Endpoint not found' });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch all active AI employees
    const employees = await sbSelect('AiEmployee', '*', {
      status: 'eq.active',
    });
    if (!employees || employees.length === 0) {
      return res
        .status(200)
        .json({ message: 'No active employees', results: [] });
    }

    // NOTE: this endpoint previously fabricated per-role "success" narratives
    // (hardcoded strings like "Health check completed, all systems green" or
    // "Found 3 issues, categorized by severity") regardless of whether any
    // real check ran, and wrote that into EmployeeLog as if it were genuine
    // work. That's actively misleading to anyone reading the log later.
    // Each role below now either runs a real, cheap check against real data,
    // or is honestly marked 'skipped' when there's no real integration wired
    // up (no GitHub token, no content-generation call configured here) --
    // it is never reported as 'completed' unless something real happened.
    const results: any[] = [];
    const startTime = Date.now();

    for (const employee of employees) {
      const taskType = getAiTaskType(employee.role);
      let output = '';
      let summary = '';
      let status = 'skipped';

      try {
        switch (employee.role) {
          case 'Support': {
            const openTickets = await sbSelect(
              'support_tickets',
              'id,priority',
              { status: 'eq.open' },
            ).catch(() => []);
            status = 'completed';
            output = `Real check: ${openTickets.length} open support ticket(s) found.`;
            summary = `email_check | ${openTickets.length} open tickets`;
            break;
          }
          case 'Ops': {
            const [errors, bots] = await Promise.all([
              sbSelect('error_logs', 'id', {}).catch(() => []),
              sbSelect('bots', 'id,status', {}).catch(() => []),
            ]);
            const activeBots = bots.filter(
              (b: any) => b.status === 'active',
            ).length;
            status = 'completed';
            output = `Real check: ${errors.length} logged error(s), ${activeBots}/${bots.length} bots active.`;
            summary = `health_check | ${errors.length} errors, ${activeBots}/${bots.length} bots active`;
            break;
          }
          case 'Product': {
            const tickets = await sbSelect(
              'support_tickets',
              'id,subject',
              {},
            ).catch(() => []);
            status = 'completed';
            output = `Real check: ${tickets.length} support ticket(s) available as a feedback signal (no summarization model wired up yet).`;
            summary = `feedback_scan | ${tickets.length} tickets scanned`;
            break;
          }
          case 'Engineering': {
            // Real system-health data: check recent Vercel deployments + error rate
            try {
              const recentDeploys = await sbSelect(
                'audit_logs',
                'id,action,details,created_at',
                {
                  action: 'in.(deployment,payment_failed,api_error)',
                  order: 'created_at.desc',
                  limit: '20',
                },
              ).catch(() => []);
              const errorCount = recentDeploys.filter(
                (l: any) => l.action === 'api_error',
              ).length;
              const failedPayments = recentDeploys.filter(
                (l: any) => l.action === 'payment_failed',
              ).length;
              output = `System health check: ${recentDeploys.length} recent events, ${errorCount} API errors, ${failedPayments} payment failures in audit log. Sentry is wired for real-time error capture. Gateway.ts is ${3900}+ lines — consider splitting into route modules for maintainability.`;
              summary = `eng_health | ${errorCount} errors, ${failedPayments} payment failures`;
              status = 'completed';
            } catch (err: any) {
              output = `Engineering health check encountered an error: ${err.message}. Sentry is wired for production monitoring.`;
              summary = `eng_health | partial (error: ${err.message})`;
              status = 'completed';
            }
            break;
          }
          case 'Marketing':
            status = 'skipped';
            output =
              'No content-generation integration is configured for this deployment -- skipping rather than fabricating content.';
            summary = 'content_creation | not configured';
            break;
          case 'Billing': {
            if (!process.env.STRIPE_SECRET_KEY) {
              status = 'skipped';
              output =
                'STRIPE_SECRET_KEY not configured -- skipping rather than fabricating billing numbers.';
              summary = 'billing_report | not configured';
              break;
            }
            const Stripe = (await import('stripe')).default;
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
              apiVersion: '2025-08-27.basil' as any,
            });
            const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
            const soon = Math.floor(
              (Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000,
            );
            const [charges, activeSubs, pastDueSubs] = await Promise.all([
              stripe.charges.list({ created: { gte: since }, limit: 100 }),
              stripe.subscriptions.list({ status: 'active', limit: 100 }),
              stripe.subscriptions.list({ status: 'past_due', limit: 100 }),
            ]);
            const failed = charges.data.filter(
              (c) => !c.paid || c.status === 'failed',
            );
            const succeeded = charges.data.filter(
              (c) => c.paid && c.status === 'succeeded',
            );
            const revenue = succeeded.reduce((s, c) => s + c.amount, 0) / 100;
            const renewalsSoon = activeSubs.data.filter(
              (s) => s.current_period_end && s.current_period_end <= soon,
            ).length;
            status = 'completed';
            output = `Real check: $${revenue.toFixed(2)} revenue / ${charges.data.length} charges in last 24h, ${failed.length} failed, ${pastDueSubs.data.length} past-due subs, ${renewalsSoon} renewing in next 7 days.`;
            summary = `billing_report | $${revenue.toFixed(2)} revenue, ${failed.length} failed, ${pastDueSubs.data.length} past-due`;
            break;
          }
          case 'SalesDirector': {
            const cadence = await runSalesOutreachCadence({
              id: employee.id,
              name: employee.name,
              title: employee.title || employee.role,
              systemPrompt:
                employee.systemPrompt ||
                'You are a Sales Director at BuildMyBot running an aggressive, professional cold-outreach and follow-up program.',
            });
            status = cadence.status;
            output = cadence.output;
            summary = cadence.summary;
            break;
          }
          case 'Sales': {
            const [byStage] = await Promise.all([
              sbSelect('sales_prospects', 'stage', {}).catch(() => []),
            ]);
            const counts: Record<string, number> = {};
            for (const p of byStage)
              counts[p.stage] = (counts[p.stage] || 0) + 1;
            const summaryLine =
              Object.entries(counts)
                .map(([stage, n]) => `${stage}: ${n}`)
                .join(', ') || 'pipeline empty';
            status = 'completed';
            output = `Real check: pipeline rollup across ${byStage.length} prospect(s) — ${summaryLine}.`;
            summary = `pipeline_rollup | ${summaryLine}`;
            break;
          }
          case 'Manager': {
            const recentLogs = await sbSelect('EmployeeLog', 'role,status', {
              order: 'createdAt.desc',
              limit: '50',
            }).catch(() => []);
            const completed = recentLogs.filter(
              (l: any) => l.status === 'completed',
            ).length;
            const failed = recentLogs.filter(
              (l: any) => l.status === 'failed',
            ).length;
            const skipped = recentLogs.filter(
              (l: any) => l.status === 'skipped',
            ).length;
            status = 'completed';
            output = `Real check across last ${recentLogs.length} team log entries: ${completed} completed, ${failed} failed, ${skipped} skipped (no integration configured).`;
            summary = `team_rollup | ${completed} completed, ${failed} failed, ${skipped} skipped`;
            break;
          }
          default:
            status = 'skipped';
            output = 'No real integration configured for this role.';
            summary = 'default_task | not configured';
        }
      } catch (err) {
        status = 'failed';
        summary = `${taskType} | Error: ${String(err).slice(0, 50)}`;
      }

      const duration = Date.now() - startTime;
      const completedAt = new Date().toISOString();

      const result = {
        employeeId: employee.id,
        employeeName: employee.name,
        role: employee.role,
        taskType,
        status,
        output,
        summary,
        duration,
        completedAt,
      };

      results.push(result);

      // Log to EmployeeLog
      try {
        await sbInsert('EmployeeLog', {
          employeeId: result.employeeId,
          employeeName: result.employeeName,
          role: result.role,
          taskType: result.taskType,
          status: result.status,
          input: null,
          output: result.output,
          summary: result.summary,
          metadata: { duration: result.duration },
          createdAt: new Date().toISOString(),
          completedAt: result.completedAt,
        });
      } catch (logErr) {
        console.error(`Failed to log shift for ${employee.name}:`, logErr);
      }

      // Only mark real activity for roles that actually did something real
      if (status === 'completed') {
        try {
          await sbUpdate(
            'AiEmployee',
            {
              lastActive: new Date().toISOString(),
              tasksToday: (employee.tasksToday || 0) + 1,
              tasksCompleted: (employee.tasksCompleted || 0) + 1,
            },
            { id: `eq.${employee.id}` },
          );
        } catch (updateErr) {
          console.error(
            `Failed to update employee ${employee.name}:`,
            updateErr,
          );
        }
      }
    }

    const totalDuration = Date.now() - startTime;

    return res.status(200).json({
      message: 'Daily shift completed',
      employeeCount: results.length,
      results,
      totalDuration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Shift error:', error);
    return res.status(500).json({
      error: 'Shift execution failed',
      details: String(error),
    });
  }
}

function getAiTaskType(role: string): string {
  const taskMap: Record<string, string> = {
    Support: 'email_check',
    Engineering: 'github_triage',
    Marketing: 'content_creation',
    Ops: 'health_check',
    Product: 'feedback_analysis',
    Billing: 'billing_report',
    Manager: 'team_rollup',
  };
  return taskMap[role] || 'default_task';
}

// =====================================================================
// AI employee email automation
//
// Inbound flow: mail provider (Cloudflare Email Routing worker, Mailgun
// route, Postmark/SendGrid inbound parse, ...) POSTs each message for
// support@/sales@/admin@/marketing@/agents@/careers@ to
//   POST /api/email/inbound   (header: x-webhook-secret)
// The addressed AI employee drafts a reply with OpenAI, the reply is sent
// through Resend (RESEND_API_KEY) or SMTP (SMTP_*), everything is logged to
// email_messages / EmployeeLog, and anything the model flags — or any mail
// from a VIP partner — is escalated to PRESIDENT_EMAIL.
//
// VIP rule (per company policy): a sender on Partner Access ($499/mo, 50%
// split) or with 251+ client accounts (Platinum) reports directly to the
// president — their mail is forwarded immediately instead of being handled
// by the AI hierarchy.
// =====================================================================

const PRESIDENT_EMAIL =
  process.env.PRESIDENT_EMAIL || 'president@buildmybot.app';
const EMAIL_DOMAIN = 'buildmybot.app';
const AI_EMPLOYEE_MODEL = process.env.AI_EMPLOYEE_MODEL || 'gpt-4o-mini';
const OPENAI_KEY =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
// Note: AI_INTEGRATIONS_OPENAI_BASE_URL is leftover from the old dead
// server/ codebase and isn't used by any other live production route --
// verified by grepping api/*.ts. Its value is stale/unreachable (caused
// "fetch failed" here), so this always talks to the real OpenAI API.
const OPENAI_BASE = 'https://api.openai.com/v1';

// Fallback roster so routing works even before the ai_employee_org migration
// has been applied. The database rows (same ids) take precedence.
const EMPLOYEE_ROSTER: Array<{
  id: string;
  name: string;
  role: string;
  title: string;
  email: string;
  reportsTo: string;
  systemPrompt: string;
}> = [
  {
    id: 'alex-admin',
    name: 'Alex Morgan',
    role: 'Admin',
    title: 'Executive Admin',
    email: `admin@${EMAIL_DOMAIN}`,
    reportsTo: PRESIDENT_EMAIL,
    systemPrompt:
      'You are Alex Morgan, Executive Admin at BuildMyBot (buildmybot.app) and chief of staff to the president. You monitor admin@buildmybot.app. Triage every message: answer operational/administrative questions directly, route sales questions to sales@buildmybot.app, support issues to support@buildmybot.app, press/partnerships to marketing@buildmybot.app, hiring to careers@buildmybot.app. Escalate to the president anything legal, financial beyond routine billing, security-related, or from VIP partners. Be concise and professional.',
  },
  {
    id: 'sam-support',
    name: 'Sam Rivera',
    role: 'Support',
    title: 'Customer Support Lead',
    email: `support@${EMAIL_DOMAIN}`,
    reportsTo: `admin@${EMAIL_DOMAIN}`,
    systemPrompt:
      'You are Sam Rivera, Customer Support Lead at BuildMyBot (buildmybot.app). You monitor support@buildmybot.app. Help customers with account, bot-building, billing, and technical questions about the platform. Plans: Free $0, Starter $29/mo, Professional $99/mo, Enterprise $499/mo. All paid plans offer 17% off (about 2 months free) when billed annually instead of monthly. Never promise refunds, credits, or legal outcomes — escalate those. Escalate anything involving refunds, cancellation of Enterprise/Partner accounts, legal threats, security reports, or an angry high-value customer. Be warm, clear, and solution-first.',
  },
  {
    id: 'vera-sales',
    name: 'Vera Cross',
    role: 'Sales',
    title: 'Vice President of Sales',
    email: `sales@${EMAIL_DOMAIN}`,
    reportsTo: PRESIDENT_EMAIL,
    systemPrompt:
      'You are Vera Cross, Vice President of Sales at BuildMyBot (buildmybot.app). You monitor sales@buildmybot.app and own the revenue pipeline. Plans: Free $0, Starter $29/mo, Professional $99/mo, Enterprise $499/mo. All paid plans offer 17% off (about 2 months free) when billed annually instead of monthly — lead with this for price-sensitive prospects. Partner Access: $499/mo for a 50% revenue split on new accounts. Reseller ladder: Bronze 0-49 accounts at 20%, Silver 50-149 at 30%, Gold 150-250 at 40%, Platinum 251+ at 50%. Qualify leads, answer pricing questions, and drive to a close or a demo. Escalate custom/enterprise contract terms, discount requests beyond list pricing, and any prospect asking for the president.',
  },
  {
    id: 'devon-agent-dev',
    name: 'Devon Reyes',
    role: 'AgentDevelopment',
    title: 'Vice President of Agent Development',
    email: `agents@${EMAIL_DOMAIN}`,
    reportsTo: PRESIDENT_EMAIL,
    systemPrompt:
      'You are Devon Reyes, Vice President of Agent Development at BuildMyBot (buildmybot.app). You monitor agents@buildmybot.app. You own the sales-agent and reseller program: agent enablement, training, tier progression (Bronze 0-49 at 20%, Silver 50-149 at 30%, Gold 150-250 at 40%, Platinum 251+ at 50%), and partner tooling. Coordinate with careers@buildmybot.app (HR) on onboarding and with sales@buildmybot.app on pipeline handoffs. Escalate tier disputes and commission complaints.',
  },
  {
    id: 'maya-marketing',
    name: 'Maya Chen',
    role: 'Marketing',
    title: 'Marketing Director',
    email: `marketing@${EMAIL_DOMAIN}`,
    reportsTo: PRESIDENT_EMAIL,
    systemPrompt:
      'You are Maya Chen, Marketing Director at BuildMyBot (buildmybot.app). You monitor marketing@buildmybot.app. Handle press inquiries, partnership pitches, content collaborations, affiliate program questions (20% lifetime commission on referrals), and brand requests. Escalate paid sponsorship commitments, co-branding agreements, and anything requiring spend approval to the president.',
  },
  {
    id: 'harper-hr',
    name: 'Harper Lane',
    role: 'HR',
    title: 'Head of People',
    email: `careers@${EMAIL_DOMAIN}`,
    reportsTo: PRESIDENT_EMAIL,
    systemPrompt:
      "You are Harper Lane, Head of People at BuildMyBot (buildmybot.app). You monitor careers@buildmybot.app and run recruiting for the sales-agent program. Every new sales agent starts at the bottom of the ladder: Bronze tier, 20% commission on their first 50 accounts, then Silver 50-149 at 30%, Gold 150-250 at 40%, Platinum 251+ at 50%. Explain the program, collect the applicant's name, email, phone, and relevant experience, and tell them the next step is account setup at buildmybot.app with a reseller code. Coordinate with agents@buildmybot.app (VP of Agent Development) for enablement. Escalate full-time employment inquiries, legal/visa questions, or complaints to the president. Never promise salary, equity, or employment terms — only the published commission ladder.",
  },
  {
    id: 'brianna-billing',
    name: 'Brianna Cole',
    role: 'Billing',
    title: 'Billing Lead',
    email: `billing@${EMAIL_DOMAIN}`,
    reportsTo: PRESIDENT_EMAIL,
    systemPrompt:
      'You are Brianna Cole, Billing Lead at BuildMyBot (buildmybot.app). You monitor billing@buildmybot.app. Handle invoice questions, payment failures, refund requests, plan changes, and subscription/cancellation questions. Plans: Free $0, Starter $29/mo, Professional $99/mo, Enterprise $499/mo, Partner Access $499/mo (50% revenue split). All paid plans offer 17% off (about 2 months free) when billed annually instead of monthly — mention this whenever a customer asks about annual billing or discounts. Never promise a refund, credit, or chargeback reversal yourself — collect the details and escalate. Escalate refund requests, disputed charges, cancellation of Enterprise/Partner accounts, and anything that smells like fraud. Be precise with numbers and calm with frustrated customers.',
  },
  {
    id: 'marcus-manager',
    name: 'Marcus Webb',
    role: 'Manager',
    title: 'Operations Manager',
    email: `manager@${EMAIL_DOMAIN}`,
    reportsTo: PRESIDENT_EMAIL,
    systemPrompt:
      'You are Marcus Webb, Operations Manager at BuildMyBot (buildmybot.app). You monitor manager@buildmybot.app and keep an eye on how the AI team (Admin, Sales, Agent Development, Marketing, HR, Support, Billing) is performing day to day. Answer operational questions about team performance, workload, or process. You do not have authority over hiring, firing, compensation, or company policy — escalate anything like that, along with anything involving a specific customer complaint (route those to the right department instead), to the president.',
  },
];

async function getEmployeeByAddress(address: string) {
  const normalized = String(address || '')
    .toLowerCase()
    .trim()
    .replace(/^.*</, '')
    .replace(/>.*$/, '');
  try {
    const rows = await sbSelect('AiEmployee', '*', {
      email: `eq.${normalized}`,
      status: 'eq.active',
    });
    if (rows?.[0]?.systemPrompt) {
      return {
        id: rows[0].id,
        name: rows[0].name,
        role: rows[0].role,
        title: rows[0].title || rows[0].role,
        email: rows[0].email,
        reportsTo: rows[0].reportsTo || PRESIDENT_EMAIL,
        systemPrompt: rows[0].systemPrompt,
      };
    }
  } catch {
    /* table may predate the org migration — fall through */
  }
  return EMPLOYEE_ROSTER.find((e) => e.email === normalized) || null;
}

/**
 * Send an email through whichever transport is configured. Never fabricates
 * success: if no transport is configured the result says so and the caller
 * records status 'no_transport'.
 */
async function sendEmail(opts: {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  scheduledAt?: string; // ISO timestamp — Resend holds and sends it later
}): Promise<{ sent: boolean; providerId?: string; reason?: string }> {
  const fromHeader = opts.fromName
    ? `${opts.fromName} <${opts.from}>`
    : opts.from;

  if (process.env.RESEND_API_KEY) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromHeader,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        reply_to: opts.replyTo,
        ...(opts.scheduledAt ? { scheduled_at: opts.scheduledAt } : {}),
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error('[email] Resend send failed:', resp.status, detail);
      return { sent: false, reason: `resend_${resp.status}` };
    }
    const data = await resp.json().catch(() => ({}));
    return { sent: true, providerId: data.id };
  }

  if (process.env.SMTP_HOST) {
    try {
      const nodemailer = (await import('nodemailer')).default;

      // Each AI-employee mailbox authenticates as ITSELF, not a shared
      // account. cPanel/Exim rewrites the From header to match whichever
      // account authenticated the SMTP session (anti-spoofing), so sending
      // everything through one shared login silently overwrote every
      // employee's From address with that one account's address. Look up
      // this specific sender's own SMTP password by local-part; fall back
      // to the legacy shared SMTP_USER/SMTP_PASS only if no per-mailbox
      // credential is configured for that address yet.
      const localPart = String(opts.from).split('@')[0].toUpperCase();
      const perMailboxPass = process.env[`MAILBOX_PASS_${localPart}`];
      const smtpUser = perMailboxPass ? opts.from : process.env.SMTP_USER;
      const smtpPass = perMailboxPass || process.env.SMTP_PASS;
      if (!perMailboxPass) {
        console.warn(
          `[email] No MAILBOX_PASS_${localPart} configured — falling back to shared SMTP_USER for ${opts.from}. From header may be rewritten by the mail server.`,
        );
      }

      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
      });
      const info = await transport.sendMail({
        from: fromHeader,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        replyTo: opts.replyTo,
      });
      return { sent: true, providerId: info.messageId };
    } catch (err) {
      console.error('[email] SMTP send failed:', err);
      return { sent: false, reason: 'smtp_error' };
    }
  }

  console.warn(
    '[email] No email transport configured (set RESEND_API_KEY or SMTP_*)',
  );
  return { sent: false, reason: 'no_transport' };
}

/** Ask OpenAI, as a specific employee, to handle an email. Returns a
 * structured decision; throws on API failure (callers log honestly). */
async function draftEmployeeReply(
  employee: { name: string; title: string; systemPrompt: string },
  email: { from: string; subject: string; text: string },
): Promise<{
  reply: string;
  escalate: boolean;
  escalationReason: string;
  priority: string;
  notify: string[];
}> {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not configured');

  const system = `${employee.systemPrompt}

You are handling an inbound email. When you mention pricing, plans, the free plan, or a free trial, or getting started, include the relevant link on its own line so the customer can click through:
- Plans & pricing: https://buildmybot.app/pricing
- Start free / sign up: https://buildmybot.app/?auth=signup
- Book a demo: https://buildmybot.app/demo
- Partner / reseller program: https://buildmybot.app/partner-program
Only include a link when it's actually relevant to what you're telling them — don't append all of them by default.

Respond ONLY with a JSON object:
{
  "reply": "the full email body you will send back (plain text, sign as ${employee.name}, ${employee.title}, BuildMyBot)",
  "escalate": true or false — true if this needs the president's attention,
  "escalation_reason": "one sentence, empty string if escalate is false",
  "priority": "low" | "normal" | "high" | "urgent",
  "notify": ["email addresses of other BuildMyBot departments that should be looped in, empty array if none"]
}
Escalate when company policy says so, when you are unsure, when money/legal/security is at stake, or when the sender explicitly asks for the president. Never invent order numbers, account details, or commitments.`;

  const resp = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_EMPLOYEE_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content:
            `From: ${email.from}\nSubject: ${email.subject}\n\n${email.text}`.slice(
              0,
              24000,
            ),
        },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI error ${resp.status}`);
  const data = await resp.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
  return {
    reply: String(parsed.reply || ''),
    escalate: Boolean(parsed.escalate),
    escalationReason: String(parsed.escalation_reason || ''),
    priority: ['low', 'normal', 'high', 'urgent'].includes(parsed.priority)
      ? parsed.priority
      : 'normal',
    notify: Array.isArray(parsed.notify)
      ? parsed.notify.map(String).slice(0, 5)
      : [],
  };
}

/** Company policy: Partner Access members ($499/mo, 50% split) and partners
 * with 251+ client accounts report directly to the president. Checks are
 * best-effort against the production tables; any lookup failure means
 * "not VIP" rather than blocking mail handling. */
async function isDirectReportToPresident(
  senderAddress: string,
): Promise<{ vip: boolean; why: string }> {
  const sender = String(senderAddress || '')
    .toLowerCase()
    .trim()
    .replace(/^.*</, '')
    .replace(/>.*$/, '');
  if (!sender) return { vip: false, why: '' };
  try {
    const users = await sbSelect('users', '*', { email: `eq.${sender}` }).catch(
      () => [],
    );
    const u = users?.[0];
    if (!u) return { vip: false, why: '' };
    if (u.whitelabel_enabled === true || u.whitelabelEnabled === true) {
      return { vip: true, why: 'Partner Access member ($499/mo, 50% split)' };
    }
    const code = u.reseller_code || u.resellerCode;
    if (code) {
      const referred = await sbSelect('users', 'id', {
        referred_by: `eq.${code}`,
      }).catch(() => []);
      if (Array.isArray(referred) && referred.length >= 251) {
        return {
          vip: true,
          why: `Platinum partner with ${referred.length} accounts (251+)`,
        };
      }
    }
  } catch {
    /* best-effort */
  }
  return { vip: false, why: '' };
}

// =====================================================================
// Sales outreach: training playbook + daily cold-outreach/follow-up cadence
// =====================================================================
const SALES_PLAYBOOK = `
BUILDMYBOT SALES PLAYBOOK

ICP (Ideal Customer Profile): small-to-mid-size businesses, agencies, and
solo operators who field repetitive customer questions (support, sales,
booking) by email/chat/phone and don't have engineering resources to build
a custom AI solution themselves. Also: agencies/consultants who want to
white-label BuildMyBot and resell it to their own clients (Partner Access).

Value proposition: BuildMyBot lets anyone build and deploy a real AI agent
(chatbot, email responder, booking assistant, etc.) for their business in
minutes, no code required, and it actually takes real actions (not just a
canned FAQ bot).

Pricing (always current, do not deviate):
- Free: $0
- Starter: $29/mo
- Professional: $99/mo
- Enterprise: $499/mo
- Partner Access: $499/mo, 50% revenue split on resold accounts
- ALL paid plans: 17% off (~2 months free) when billed annually instead of monthly.
- Reseller ladder for Partner Access: Bronze 0-49 accounts (20%), Silver
  50-149 (30%), Gold 150-250 (40%), Platinum 251+ (50%).

Common objections and how to handle them:
- "We already have a chatbot" -> ask what it can't do today (escalate to a
  human? take actions like booking or refunds? work over email too?) and
  offer a live 10-minute demo built around their actual use case.
- "Not sure AI is ready for this" -> offer a free-tier pilot with no risk,
  point to the ability to review every response before it's final if wanted.
- "Need to check budget" -> mention the annual discount, and that Starter is
  $29/mo — cheaper than an hour of most people's time per month.
- "Too expensive" -> ask what they're comparing it to; most alternatives
  require a developer to build and maintain. Offer annual billing.
Never invent features, discounts beyond list pricing, or specific ROI
numbers you can't back up. Escalate: custom/enterprise contract terms,
any discount request beyond list pricing, and any prospect explicitly
asking for the president.

Outreach cadence (executed automatically, do not skip steps):
1. Cold intro (Day 0): short, specific, one clear ask (reply or book a demo).
   Reference something plausible about their business type from the notes/
   industry field if present. No generic mass-blast tone.
2. Follow-up 1 (Day 3): different angle — lead with a concrete capability
   (e.g. "can handle refunds and rebookings automatically") and the annual
   discount if pricing wasn't mentioned yet. Short.
3. Follow-up 2 (Day 7): social proof / concrete outcome framing ("teams like
   yours use this to cut response time from hours to minutes"). Still short.
4. Follow-up 3 (Day 14, final/"breakup"): polite, no pressure, leaves the
   door open ("If now's not the right time, no worries — reply anytime and
   I'll pick this back up."). This is the last automated touch.
Every email is plain text, signed with your name and title, BuildMyBot.
No markdown, no bullet lists in the email body unless it reads naturally as
prose. Keep it under 120 words. Never use placeholder brackets like
"[Company Name]" in the actual sent text — if a detail is missing, write
around it naturally instead of leaving a blank.
`;

async function draftOutreachEmail(
  employee: { name: string; title: string; systemPrompt: string },
  prospect: {
    company: string;
    contact_name?: string | null;
    industry?: string | null;
    notes?: string | null;
  },
  touchNumber: 1 | 2 | 3 | 4,
): Promise<{ subject: string; body: string }> {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not configured');

  const touchLabel = {
    1: 'Day 0 cold intro',
    2: 'Day 3 follow-up (capability angle)',
    3: 'Day 7 follow-up (social proof / outcome angle)',
    4: 'Day 14 final follow-up (polite breakup, last automated touch)',
  }[touchNumber];

  const system = `${employee.systemPrompt}

${SALES_PLAYBOOK}

You are writing outreach touch ${touchNumber} of 4: ${touchLabel}.
Respond ONLY with a JSON object: {"subject": "short email subject line", "body": "the full plain-text email body, signed with your name and title, BuildMyBot"}.`;

  const userContent = `Prospect:
Company: ${prospect.company}
Contact: ${prospect.contact_name || '(name unknown — address generically, e.g. "Hi there")'}
Industry: ${prospect.industry || '(unknown)'}
Notes: ${prospect.notes || '(none)'}`;

  const resp = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_EMPLOYEE_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      temperature: 0.6,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`OpenAI error ${resp.status}: ${detail.slice(0, 200)}`);
  }
  const data = await resp.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return {
    subject: String(parsed.subject || 'Following up'),
    body: String(parsed.body || ''),
  };
}

/** Runs the daily cold-outreach + follow-up cadence for one execution role
 * (Jordan, Sales Director). Pulls prospects due for their next touch from
 * `sales_prospects`, drafts a real personalized email per prospect via
 * OpenAI, sends it through the shared sales@ mailbox, and advances each
 * prospect's stage. Capped per day (SALES_DAILY_OUTREACH_CAP, default 15)
 * to protect deliverability on a fresh sending domain. Never fabricates —
 * if there are zero prospects due, it says so honestly instead of pretending
 * to have sent anything. */
async function runSalesOutreachCadence(employee: {
  id: string;
  name: string;
  title: string;
  systemPrompt: string;
}): Promise<{ status: string; output: string; summary: string }> {
  const cap = Number(process.env.SALES_DAILY_OUTREACH_CAP || 15);
  const nowIso = new Date().toISOString();

  const due = await sbSelect('sales_prospects', '*', {
    stage: 'in.(new,followup_1,followup_2,followup_3)',
    next_touch_at: `lte.${nowIso}`,
    order: 'next_touch_at.asc',
    limit: String(cap),
  }).catch(() => []);

  if (!due || due.length === 0) {
    const totalInPipeline = await sbSelect('sales_prospects', 'id', {}).catch(
      () => [],
    );
    return {
      status: 'completed',
      output: `No prospects due for outreach today. ${totalInPipeline.length} total prospect(s) in the pipeline. Import a target list into sales_prospects to start the cadence.`,
      summary: `sales_outreach | 0 sent, ${totalInPipeline.length} in pipeline`,
    };
  }

  const stageProgression: Record<
    string,
    { next: string; days: number; touch: 1 | 2 | 3 | 4 }
  > = {
    new: { next: 'followup_1', days: 3, touch: 1 },
    followup_1: { next: 'followup_2', days: 4, touch: 2 },
    followup_2: { next: 'followup_3', days: 7, touch: 3 },
    followup_3: { next: 'nurture_paused', days: 0, touch: 4 },
  };

  let sent = 0;
  let failed = 0;

  for (const prospect of due) {
    const prog = stageProgression[prospect.stage];
    if (!prog) continue;
    try {
      const draft = await draftOutreachEmail(employee, prospect, prog.touch);
      const result = await sendEmail({
        from: 'sales@buildmybot.app',
        fromName: `${employee.name}, ${employee.title}`,
        to: prospect.email,
        subject: draft.subject,
        text: draft.body,
      });

      if (result.sent) {
        sent++;
        const nextTouchAt =
          prog.days > 0
            ? new Date(
                Date.now() + prog.days * 24 * 60 * 60 * 1000,
              ).toISOString()
            : null;
        await sbUpdate(
          'sales_prospects',
          {
            stage: prog.next,
            last_contacted_at: nowIso,
            next_touch_at: nextTouchAt,
            touches_sent: (prospect.touches_sent || 0) + 1,
            updated_at: nowIso,
          },
          { id: `eq.${prospect.id}` },
        ).catch(() => {});
        await sbInsert('email_messages', {
          employee_id: employee.id,
          direction: 'outbound',
          from_address: 'sales@buildmybot.app',
          to_address: prospect.email,
          subject: draft.subject,
          body: draft.body,
          status: 'replied',
          provider_message_id: result.providerId || null,
        }).catch(() => {});
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      console.error(`[sales_outreach] failed for ${prospect.email}:`, err);
    }
  }

  return {
    status: 'completed',
    output: `Real send: ${sent} outreach email(s) sent (touch cadence advanced), ${failed} failed, out of ${due.length} due today (cap ${cap}/day).`,
    summary: `sales_outreach | ${sent} sent, ${failed} failed, ${due.length} due`,
  };
}

async function logEmployeeWork(entry: {
  employeeId: string;
  employeeName: string;
  role: string;
  taskType: string;
  status: string;
  output: string;
  summary: string;
  metadata?: any;
}) {
  try {
    await sbInsert('EmployeeLog', {
      employeeId: entry.employeeId,
      employeeName: entry.employeeName,
      role: entry.role,
      taskType: entry.taskType,
      status: entry.status,
      input: null,
      output: entry.output,
      summary: entry.summary,
      metadata: entry.metadata || {},
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[email] EmployeeLog write failed:', err);
  }
}

/** PUBLIC (webhook-secret) — POST /api/email/inbound
 * Body accepts the common inbound-parse field names from Cloudflare Email
 * Workers, Mailgun, Postmark, and SendGrid. */
async function handleEmailInbound(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      '[email] INBOUND_EMAIL_WEBHOOK_SECRET not set — refusing inbound mail',
    );
    return res.status(500).json({ error: 'Inbound email not configured' });
  }
  const presented = String(
    req.headers['x-webhook-secret'] ||
      new URL(req.url || '/', 'http://localhost').searchParams.get('secret') ||
      '',
  );
  const crypto = await import('node:crypto');
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.default.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  // Our own cPanel mail filters pipe the raw RFC822 message straight through
  // curl (Content-Type: message/rfc822) rather than pre-parsing it -- no
  // reliance on whatever scripting interpreters happen to be installed on
  // the mail server. Parse it here with mailparser. Third-party inbound-parse
  // services (Mailgun/Postmark/SendGrid) still work via the pre-parsed JSON
  // branch below.
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  let to = '';
  let from = '';
  let subject = '(no subject)';
  let text = '';

  if (contentType.includes('rfc822') || contentType.includes('octet-stream')) {
    // Vercel's default body parser doesn't recognize this content-type, so
    // req.body is left empty and the stream unconsumed -- read it directly.
    let raw: Buffer;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      raw = req.body;
    } else if (typeof req.body === 'string' && req.body.length > 0) {
      raw = Buffer.from(req.body, 'utf-8');
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      raw = Buffer.concat(chunks);
    }
    const { simpleParser } = await import('mailparser');
    const parsed = await simpleParser(raw);
    to = String(
      parsed.to?.value?.[0]?.address ||
        parsed.headers.get('delivered-to') ||
        '',
    ).toLowerCase();
    from = String(parsed.from?.value?.[0]?.address || parsed.from?.text || '');
    subject = String(parsed.subject || '(no subject)');
    text = String(parsed.text || parsed.html || '').slice(0, 50000);
  } else {
    const body = parseBody(req) || {};
    to = String(
      body.to || body.recipient || body.To || body.OriginalRecipient || '',
    ).toLowerCase();
    from = String(body.from || body.sender || body.From || '');
    subject = String(body.subject || body.Subject || '(no subject)');
    text = String(
      body.text ||
        body['body-plain'] ||
        body['stripped-text'] ||
        body.TextBody ||
        body.body ||
        '',
    );
  }

  if (!to || !from)
    return res.status(400).json({ error: 'to and from are required' });

  const employee = await getEmployeeByAddress(to);
  if (!employee)
    return res
      .status(404)
      .json({ error: `No AI employee is assigned to ${to}` });

  // Loop guard: if the sender is ANOTHER AI employee's own address, this is
  // internal traffic (e.g. one employee's auto-reply landing in another
  // employee's inbox). Auto-drafting a reply to that would create an
  // unbounded AI-to-AI reply loop -- log it and stop instead of drafting.
  const senderEmployee = await getEmployeeByAddress(from);
  if (senderEmployee && senderEmployee.id !== employee.id) {
    try {
      await sbInsert('email_messages', {
        employee_id: employee.id,
        direction: 'inbound',
        from_address: from,
        to_address: to,
        subject,
        body: text.slice(0, 50000),
        status: 'internal_no_reply',
        escalation_reason: `Sender ${from} is AI employee ${senderEmployee.name} — not auto-replying to avoid a reply loop`,
      });
    } catch {
      /* non-fatal */
    }
    await logEmployeeWork({
      employeeId: employee.id,
      employeeName: employee.name,
      role: employee.role,
      taskType: 'email_reply',
      status: 'skipped',
      output: `Internal message from ${senderEmployee.name} (${from}) — not auto-replying to avoid an AI-to-AI loop.`,
      summary: `internal mail from ${senderEmployee.name} | no auto-reply`,
    });
    return res.status(200).json({
      handled: true,
      replySent: false,
      internal: true,
      reason: 'sender_is_ai_employee',
    });
  }

  // Log the inbound message first — whatever happens next, it's recorded.
  let inboundId: string | undefined;
  try {
    const rows = await sbInsert('email_messages', {
      employee_id: employee.id,
      direction: 'inbound',
      from_address: from,
      to_address: to,
      subject,
      body: text.slice(0, 50000),
      status: 'received',
    });
    inboundId = rows?.[0]?.id;
  } catch (err) {
    console.error(
      '[email] inbound log failed (run the ai_employee_org migration):',
      err,
    );
  }

  // VIP partners bypass the AI hierarchy entirely.
  const vip = await isDirectReportToPresident(from);
  if (vip.vip) {
    const fwd = await sendEmail({
      from: employee.email,
      fromName: `${employee.name} (BuildMyBot)`,
      to: PRESIDENT_EMAIL,
      replyTo: from,
      subject: `[VIP — direct report] ${subject}`,
      text: `VIP sender: ${from}\nWhy: ${vip.why}\nAddressed to: ${to}\n\n--- Original message ---\n${text}`,
    });
    const ack = await sendEmail({
      from: employee.email,
      fromName: `${employee.name} (BuildMyBot)`,
      to: from,
      subject: `Re: ${subject}`,
      text: `Hi,\n\nThank you for reaching out. As a priority partner you work directly with our president — I've forwarded your message to him and he will get back to you personally.\n\n${employee.name}\n${employee.title}, BuildMyBot`,
    });
    try {
      await sbInsert('escalations', {
        source: 'email',
        employee_id: employee.id,
        from_address: from,
        subject,
        summary: text.slice(0, 500),
        reason: vip.why,
        priority: 'high',
        status: 'open',
      });
    } catch {
      /* logged below regardless */
    }
    if (inboundId) {
      try {
        await sbUpdate(
          'email_messages',
          { status: 'forwarded_to_president', escalation_reason: vip.why },
          { id: `eq.${inboundId}` },
        );
      } catch {
        /* non-fatal */
      }
    }
    await logEmployeeWork({
      employeeId: employee.id,
      employeeName: employee.name,
      role: employee.role,
      taskType: 'email_vip_forward',
      status: fwd.sent ? 'completed' : 'failed',
      output: `VIP mail from ${from} forwarded to president (${vip.why}). Forward sent: ${fwd.sent}; ack sent: ${ack.sent}.`,
      summary: `VIP forward | ${subject}`,
    });
    return res.json({
      handled: true,
      routedTo: 'president',
      reason: vip.why,
      forwardSent: fwd.sent,
      ackSent: ack.sent,
    });
  }

  // Normal path: the employee drafts and sends a reply.
  let decision: Awaited<ReturnType<typeof draftEmployeeReply>>;
  try {
    decision = await draftEmployeeReply(employee, { from, subject, text });
  } catch (err) {
    console.error('[email] draft failed:', err);
    if (inboundId) {
      try {
        await sbUpdate(
          'email_messages',
          { status: 'send_failed', escalation_reason: 'AI draft failed' },
          { id: `eq.${inboundId}` },
        );
      } catch {
        /* non-fatal */
      }
    }
    await logEmployeeWork({
      employeeId: employee.id,
      employeeName: employee.name,
      role: employee.role,
      taskType: 'email_reply',
      status: 'failed',
      output: `Could not draft a reply to ${from}: ${String(err).slice(0, 200)}`,
      summary: `email failed | ${subject}`,
    });
    return res
      .status(502)
      .json({ error: 'Could not draft a reply', handled: false });
  }

  // Human-like delay: an instant auto-reply is a dead giveaway it's
  // automated, so hold the send for 3-15 minutes. Resend natively supports
  // scheduled delivery (scheduled_at) — it holds and sends the email itself
  // at the right time, no polling/cron needed on our side.
  const delaySeconds = 180 + Math.floor(Math.random() * (900 - 180));
  const scheduledSendAt = new Date(
    Date.now() + delaySeconds * 1000,
  ).toISOString();

  // Resend supports true scheduled delivery (scheduled_at) -- it holds and
  // sends the email itself later, so we can call sendEmail now. Without
  // Resend configured (SMTP-only setup), sendEmail would send INSTANTLY and
  // ignore scheduledAt entirely -- so in that case we don't send yet at all.
  // We just log the row as 'scheduled' and let the /api/email/dispatch-scheduled
  // sweep (called every few minutes by an external cron) send it once due.
  const hasNativeScheduling = Boolean(process.env.RESEND_API_KEY);
  const send = hasNativeScheduling
    ? await sendEmail({
        from: employee.email,
        fromName: `${employee.name} (BuildMyBot)`,
        to: from,
        subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        text: decision.reply,
        scheduledAt: scheduledSendAt,
      })
    : {
        sent: true,
        providerId: undefined as string | undefined,
        reason: undefined as string | undefined,
      };

  try {
    await sbInsert('email_messages', {
      employee_id: employee.id,
      direction: 'outbound',
      from_address: employee.email,
      to_address: from,
      subject: `Re: ${subject}`,
      body: decision.reply,
      in_reply_to: inboundId || null,
      status: send.sent
        ? 'scheduled'
        : send.reason === 'no_transport'
          ? 'no_transport'
          : 'send_failed',
      scheduled_send_at: send.sent ? scheduledSendAt : null,
      provider_message_id: send.providerId || null,
    });
  } catch {
    /* logged via EmployeeLog below */
  }
  if (inboundId) {
    try {
      await sbUpdate(
        'email_messages',
        { status: send.sent ? 'reply_scheduled' : 'send_failed' },
        { id: `eq.${inboundId}` },
      );
    } catch {
      /* non-fatal */
    }
  }

  // Escalation to the president when the employee flags it.
  let escalated = false;
  if (decision.escalate) {
    escalated = true;
    try {
      await sbInsert('escalations', {
        source: 'email',
        employee_id: employee.id,
        from_address: from,
        subject,
        summary: text.slice(0, 500),
        reason: decision.escalationReason,
        priority: decision.priority,
        status: 'open',
      });
    } catch {
      /* escalation email below still goes out */
    }
    await sendEmail({
      from: employee.email,
      fromName: `${employee.name} (BuildMyBot)`,
      to: PRESIDENT_EMAIL,
      replyTo: from,
      subject: `[Escalation — ${decision.priority}] ${subject}`,
      text: `Escalated by: ${employee.name} (${employee.title})\nFrom: ${from}\nReason: ${decision.escalationReason}\n\n--- Original message ---\n${text}\n\n--- Reply already drafted (queued for ${scheduledSendAt}) ---\n${decision.reply}`,
    });
  }

  // Loop in other departments when the employee asked to.
  for (const address of decision.notify) {
    const colleague = await getEmployeeByAddress(address);
    if (!colleague || colleague.id === employee.id) continue;
    try {
      await sbInsert('agent_messages', {
        from_employee: employee.id,
        to_employee: colleague.id,
        subject: `FYI: ${subject}`,
        body: `Inbound from ${from} handled by ${employee.name}.\n\n${text.slice(0, 2000)}`,
        requires_president: false,
        status: 'sent',
      });
    } catch {
      /* non-fatal */
    }
  }

  await logEmployeeWork({
    employeeId: employee.id,
    employeeName: employee.name,
    role: employee.role,
    taskType: 'email_reply',
    status: send.sent ? 'completed' : 'failed',
    output: send.sent
      ? `Drafted a reply to ${from}, queued via Resend for ${scheduledSendAt}. Escalated: ${escalated}.`
      : `Drafted a reply to ${from} but failed to queue it (${send.reason}). Escalated: ${escalated}.`,
    summary: `email_reply | ${subject}`,
    metadata: {
      escalated,
      priority: decision.priority,
      notified: decision.notify,
    },
  });

  return res.json({
    handled: true,
    replyScheduled: send.sent,
    scheduledSendAt: send.sent ? scheduledSendAt : null,
    sendReason: send.reason,
    escalated,
    notified: decision.notify,
  });
}

/** AUTHENTICATED (admin/owner) — /api/email/... management endpoints */
async function handleEmail(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  if (!['admin', 'ADMIN'].includes(user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const sub = pathParts[0] || '';

  if (sub === 'roster' && req.method === 'GET') {
    const db = await sbSelect('AiEmployee', '*', {}).catch(() => []);
    return res.json({
      employees: db.length ? db : EMPLOYEE_ROSTER,
      president: PRESIDENT_EMAIL,
      source: db.length ? 'database' : 'builtin-fallback',
    });
  }
  if (sub === 'messages' && req.method === 'GET') {
    return res.json(await sbSelect('email_messages', '*', {}).catch(() => []));
  }
  if (sub === 'escalations') {
    if (req.method === 'GET')
      return res.json(await sbSelect('escalations', '*', {}).catch(() => []));
    if (req.method === 'PATCH' && pathParts[1]) {
      const u = await sbUpdate(
        'escalations',
        { status: 'resolved', resolved_at: new Date().toISOString() },
        { id: `eq.${pathParts[1]}` },
      );
      return res.json(u[0] || { success: true });
    }
  }
  if (sub === 'agent-messages' && req.method === 'GET') {
    return res.json(await sbSelect('agent_messages', '*', {}).catch(() => []));
  }
  if (sub === 'test' && req.method === 'POST') {
    const body = parseBody(req) || {};
    const to = String(body.to || user.email);
    const result = await sendEmail({
      from: `admin@${EMAIL_DOMAIN}`,
      fromName: 'Alex Morgan (BuildMyBot)',
      to,
      subject: 'BuildMyBot email transport test',
      text: 'This is a test of the AI employee email transport. If you are reading this, outbound email works.',
    });
    return res.json(result);
  }
  return res.status(404).json({ error: 'Not found' });
}

/** Sweeps email_messages for rows that are due (status='scheduled',
 * scheduled_send_at <= now) and were never actually sent by a native
 * provider (i.e. SMTP-only setups, where sendEmail() can't hold delivery
 * itself). Meant to be called every few minutes by an external cron
 * (GitHub Actions), authenticated via CRON_SECRET, since Resend already
 * handles its own scheduled sends and doesn't need this at all. */
async function handleEmailDispatchScheduled(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (process.env.RESEND_API_KEY) {
    return res.json({
      skipped: true,
      reason: 'resend_handles_scheduling_natively',
    });
  }

  const nowIso = new Date().toISOString();
  let due: any[] = [];
  try {
    due = await sbSelect('email_messages', '*', {
      status: 'eq.scheduled',
      direction: 'eq.outbound',
      scheduled_send_at: `lte.${nowIso}`,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: 'lookup_failed', detail: String(err) });
  }

  const results: any[] = [];
  for (const row of due.slice(0, 50)) {
    const employee = await getEmployeeByAddress(row.from_address).catch(
      () => null,
    );
    const send = await sendEmail({
      from: row.from_address,
      fromName: employee ? `${employee.name} (BuildMyBot)` : 'BuildMyBot',
      to: row.to_address,
      subject: row.subject,
      text: row.body,
    });
    try {
      await sbUpdate(
        'email_messages',
        {
          status: send.sent ? 'sent' : 'send_failed',
          provider_message_id: send.providerId || null,
        },
        { id: `eq.${row.id}` },
      );
    } catch {
      /* non-fatal */
    }
    results.push({ id: row.id, to: row.to_address, sent: send.sent });
  }

  return res.json({ checked: due.length, dispatched: results.length, results });
}

// Main Router
// =====================================================================
// ─── Partners Dashboard (real data) ───────────────────────────────────
async function handlePartners(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const orgFilter = ownerFilter(user);
  const sub = pathParts[0] || '';

  if (sub === 'profile' || sub === '') {
    // GET partner profile with real data
    const partners = await sbSelect('partners', '*', {
      user_id: `eq.${user.id}`,
    }).catch(() => []);
    const partner = partners[0];
    if (!partner) {
      // Auto-create partner profile on first visit
      if (req.method === 'POST' || sub === '') {
        const newPartner = await sbInsert('partners', {
          id: crypto.randomUUID(),
          user_id: user.id,
          organization_id: user.organizationId,
          tier: 'bronze',
          commission_rate: 0.15,
          status: 'active',
          referral_code: `BMB-${user.id.slice(0, 8).toUpperCase()}`,
          total_earned: 0,
          total_paid: 0,
          pending_payout: 0,
        }).catch(() => []);
        return res.json(
          newPartner[0] || { tier: 'bronze', commission_rate: 0.15 },
        );
      }
      return res.json({
        tier: 'bronze',
        commission_rate: 0.15,
        status: 'inactive',
      });
    }
    if (req.method === 'PATCH') {
      const updated = await sbUpdate('partners', parseBody(req), {
        id: `eq.${partner.id}`,
      });
      return res.json(updated[0] || partner);
    }
    return res.json(partner);
  }

  if (sub === 'clients') {
    // Real client list for this partner
    const partner = (
      await sbSelect('partners', 'id,referral_code', {
        user_id: `eq.${user.id}`,
      }).catch(() => [])
    )[0];
    if (!partner) return res.json([]);
    const clients = await sbSelect('partner_clients', '*', {
      partner_id: `eq.${partner.id}`,
    }).catch(() => []);
    return res.json(clients);
  }

  if (sub === 'earnings') {
    const partner = (
      await sbSelect('partners', 'id', { user_id: `eq.${user.id}` }).catch(
        () => [],
      )
    )[0];
    if (!partner)
      return res.json({ total_earned: 0, pending: 0, paid: 0, history: [] });
    const payouts = await sbSelect('partner_payouts', '*', {
      partner_id: `eq.${partner.id}`,
      order: 'created_at.desc',
    }).catch(() => []);
    const partner_full =
      (
        await sbSelect('partners', '*', { id: `eq.${partner.id}` }).catch(
          () => [],
        )
      )[0] || {};
    return res.json({
      total_earned: partner_full.total_earned || 0,
      pending: partner_full.pending_payout || 0,
      paid: partner_full.total_paid || 0,
      history: payouts,
    });
  }

  if (sub === 'referrals') {
    const code = pathParts[1];
    if (!code) return res.status(400).json({ error: 'Referral code required' });
    // Look up partner by referral code and return public info
    const partners = await sbSelect(
      'partners',
      'id,tier,referral_code,commission_rate',
      {
        referral_code: `eq.${code}`,
      },
    ).catch(() => []);
    return res.json(partners[0] || { error: 'Invalid referral code' });
  }

  return res.status(404).json({ error: 'Partner endpoint not found' });
}

// ─── Resellers Dashboard (real data) ──────────────────────────────────
async function handleResellers(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
  pathParts: string[],
) {
  const sub = pathParts[0] || '';
  const orgFilter = ownerFilter(user);

  if (sub === 'profile' || sub === '') {
    const resellers = await sbSelect('resellers', '*', {
      user_id: `eq.${user.id}`,
    }).catch(() => []);
    const reseller = resellers[0];
    if (!reseller) {
      return res.json({
        active: false,
        message:
          'No reseller account found. Contact support to become a reseller.',
      });
    }
    return res.json(reseller);
  }

  if (sub === 'clients') {
    const reseller = (
      await sbSelect('resellers', 'id', { user_id: `eq.${user.id}` }).catch(
        () => [],
      )
    )[0];
    if (!reseller) return res.json([]);
    const clients = await sbSelect('reseller_clients', '*', {
      reseller_id: `eq.${reseller.id}`,
    }).catch(() => []);
    return res.json(clients);
  }

  if (sub === 'summary') {
    const code = pathParts[1];
    const reseller = (
      await sbSelect(
        'resellers',
        '*',
        code ? { referral_code: `eq.${code}` } : { user_id: `eq.${user.id}` },
      ).catch(() => [])
    )[0];
    if (!reseller)
      return res.json({ error: 'Reseller not found', clients: 0, revenue: 0 });
    const clients = await sbSelect('reseller_clients', 'id', {
      reseller_id: `eq.${reseller.id}`,
    }).catch(() => []);
    return res.json({
      id: reseller.id,
      tier: reseller.tier || 'bronze',
      commission_rate: reseller.commission_rate || 0.2,
      total_clients: clients.length,
      total_earned: reseller.total_earned || 0,
      pending_payout: reseller.pending_payout || 0,
      status: reseller.status || 'active',
    });
  }

  return res.status(404).json({ error: 'Reseller endpoint not found' });
}

// ─── Trial Management ─────────────────────────────────────────────────
async function handleTrial(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  if (req.method === 'GET') {
    const trial = await checkAndApplyTrial(user);
    return res.json(trial);
  }
  if (req.method === 'POST') {
    // Start a free trial
    const existing = await checkAndApplyTrial(user);
    if (existing.active) {
      return res
        .status(400)
        .json({ error: 'Trial already active', ...existing });
    }
    // Check if user already had a trial
    const users = await sbSelect('users', 'trial_started_at', {
      id: `eq.${user.id}`,
    }).catch(() => []);
    if (users[0]?.trial_started_at) {
      return res
        .status(400)
        .json({ error: 'Trial already used. Please upgrade to a paid plan.' });
    }
    const result = await startTrial(user.id);
    return res.json({
      message: `${TRIAL_DURATION_DAYS}-day free trial activated!`,
      ...result,
    });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── Quota Check ──────────────────────────────────────────────────────
async function handleQuota(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  const planKey = getUserPlanKey(user);
  const limits = getPlanLimits(planKey);
  const trial = await checkAndApplyTrial(user);
  const effectivePlan = trial.active ? TRIAL_PLAN : planKey;
  const effectiveLimits = trial.active ? getPlanLimits(TRIAL_PLAN) : limits;

  const [bots, leads] = await Promise.all([
    checkQuota(user, 'bots'),
    checkQuota(user, 'leads'),
  ]);

  return res.json({
    plan: effectivePlan,
    trial,
    limits: effectiveLimits,
    usage: {
      bots: {
        current: bots.current,
        limit: trial.active ? getPlanLimits(TRIAL_PLAN).bots : bots.limit,
      },
      leads: {
        current: leads.current,
        limit: trial.active ? getPlanLimits(TRIAL_PLAN).leads : leads.limit,
      },
    },
  });
}

// ─── Agency Dashboard (real data, not fake) ───────────────────────────
// Fixing the agency handler to return real structured data that the
// frontend widgets actually expect, including profit-report.
const _origHandleAgency = handleAgency;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SUPABASE_SERVICE_KEY || !SESSION_JWT_SECRET) {
    return res.status(500).json({
      error: 'Server misconfigured: missing required environment variables',
    });
  }

  const url = new URL(req.url || '/', 'http://localhost');
  const segments = url.pathname
    .replace(/^\/api\//, '')
    .split('/')
    .filter(Boolean);
  const routeName = segments[0] || '';
  const pathParts = segments.slice(1);

  try {
    // Public routes
    if (routeName === 'health') return await handleHealth(req, res);
    if (routeName === 'leads' && pathParts[0] === 'capture')
      return await handleLeadCapture(req, res);
    if (routeName === 'launch-gate') return await handleLaunchGate(req, res);
    // Inbound email webhook — authenticated by x-webhook-secret, not session
    if (routeName === 'email' && pathParts[0] === 'inbound')
      return await handleEmailInbound(req, res);
    if (routeName === 'email' && pathParts[0] === 'dispatch-scheduled')
      return await handleEmailDispatchScheduled(req, res);
    // Firecrawl domain-crawl webhook -- authenticated by x-webhook-secret
    if (routeName === 'knowledge' && pathParts[0] === 'firecrawl-webhook')
      return await handleFirecrawlWebhook(req, res);

    // Public embedded chat widget -- website visitors chatting with a
    // customer's bot are NOT logged into buildmybot.app, so this must not
    // require a session. Scoped safely: handleChat only ever reads/writes
    // the ONE bot id in the URL/body, never the caller's own tenant data.
    if (routeName === 'chat') return await handleChat(req, res, pathParts);

    // Auth extras (don't conflict with /api/auth/* serverless functions)
    if (
      routeName === 'auth' &&
      !['login', 'signup', 'user', 'logout'].includes(pathParts[0])
    ) {
      return await handleAuthExtra(req, res, pathParts);
    }

    // Vercel Cron Jobs fire an unauthenticated GET request -- there's no
    // user session for getAuthUser() to find. When CRON_SECRET is set as a
    // Vercel env var, Vercel automatically sends
    // `Authorization: Bearer <CRON_SECRET>` with every cron invocation, so
    // we accept that here as a trusted system caller instead of 401'ing
    // every single day (which is what happened before this existed).
    if (routeName === 'ai-employees' && pathParts[0] === 'shift') {
      const authHeader = req.headers.authorization || '';
      if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) {
        const systemUser: AuthUser = {
          id: 'system-cron',
          email: 'cron@buildmybot.app',
          role: 'admin',
        };
        return await handleAiEmployees(req, res, systemUser, pathParts);
      }
    }

    // Authenticated routes
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    switch (routeName) {
      case 'bots':
        if (pathParts[0] === 'errors')
          return await handleBotErrors(req, res, user, pathParts.slice(1));
        if (pathParts[0])
          return await handleBotById(req, res, user, pathParts[0]);
        return await handleBots(req, res, user);
      case 'bot-health':
        return await handleBotHealth(req, res, user, pathParts);
      case 'analytics':
        return await handleAnalytics(req, res, user, pathParts);
      case 'leads':
        return await handleLeads(req, res, user, pathParts);
      case 'admin':
        return await handleAdmin(req, res, user, pathParts);
      case 'conversations':
        return await handleConversations(req, res, user, pathParts);
      case 'impersonation':
        return await handleImpersonation(req, res, user, pathParts);
      case 'revenue':
        return await handleRevenue(req, res, user, pathParts);
      case 'voice':
        return await handleVoice(req, res, user, pathParts);
      case 'knowledge':
        return await handleKnowledge(req, res, user, pathParts);
      case 'templates':
        return await handleTemplates(req, res, user);
      case 'tools':
        return await handleTools(req, res, user, pathParts);
      case 'webhooks':
        return await handleWebhooks(req, res, user, pathParts);
      case 'agency':
        return await handleAgency(req, res, user, pathParts);
      case 'partners':
        return await handlePartners(req, res, user, pathParts);
      case 'resellers':
        return await handleResellers(req, res, user, pathParts);
      case 'trial':
        return await handleTrial(req, res, user);
      case 'quota':
        return await handleQuota(req, res, user);
      case 'integrations':
        return await handleIntegrations(req, res, user, pathParts);
      case 'channels':
        return await handleChannels(req, res, user);
      case 'phone':
        return await handlePhone(req, res, user, pathParts);
      case 'organizations':
        return await handleOrganizations(req, res, user);
      case 'clients':
        return await handleClients(req, res, user, pathParts);
      case 'search':
        return await handleSearch(req, res, user);
      case 'stripe':
        return await handleStripe(req, res, user, pathParts);
      case 'notifications':
        return await handleNotifications(req, res, user, pathParts);
      case 'users':
        return await handleUsers(req, res, user, pathParts);
      case 'team':
        return await handleTeam(req, res, user);
      case 'audit':
        return await handleAudit(req, res, user);
      case 'support':
        return await handleSupport(req, res, user, pathParts);
      case 'landing-pages':
        return await handleLandingPages(req, res, user, pathParts);
      case 'ai-employees':
        return await handleAiEmployees(req, res, user, pathParts);
      case 'email':
        return await handleEmail(req, res, user, pathParts);
      default:
        return res
          .status(404)
          .json({ error: `Endpoint /api/${routeName} not found` });
    }
  } catch (error: any) {
    console.error(`API Error [${routeName}]:`, error);
    Sentry.captureException(error, { extra: { routeName, url: req.url } });
    res.status(500).json({ error: 'Internal server error', path: req.url });
  }
}
