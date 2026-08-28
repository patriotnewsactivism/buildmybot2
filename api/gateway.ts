import { Readable } from 'node:stream';
import * as Sentry from '@sentry/node';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import multer from 'multer';
import {
  PLAN_LIMITS,
  VOICE_PLANS,
  formatPricingForPrompt,
} from '../constants.js';
import { callLLMMessages, trackAnalyticsEvent } from './ai-team/lib.js';
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
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || 'buildmybot.app';

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

async function sendEmail(opts: {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text: string;
}) {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: opts.fromName ? `${opts.fromName} <${opts.from}>` : opts.from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
      }),
    });
  }
}

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
  return user.organizationId
    ? { organization_id: `eq.${user.organizationId}` }
    : { user_id: `eq.${user.id}` };
}

const TRIAL_DURATION_DAYS = 14;
const TRIAL_PLAN = 'PROFESSIONAL';

export function getUserPlanKey(user: AuthUser): string {
  return (user.plan || 'FREE').toUpperCase();
}

export function getPlanLimits(planKey: string) {
  return PLAN_LIMITS[planKey] || PLAN_LIMITS.FREE;
}

async function getPhoneMinutesLimit(user: AuthUser): Promise<number> {
  const bundled = getPlanLimits(getUserPlanKey(user)).phone_minutes;
  const rows = await sbSelect('users', 'voice_plan', {
    id: `eq.${user.id}`,
  }).catch(() => []);
  const voicePlanKey = rows?.[0]?.voice_plan;
  const standalone =
    voicePlanKey && voicePlanKey in VOICE_PLANS
      ? VOICE_PLANS[voicePlanKey as keyof typeof VOICE_PLANS].minutes
      : 0;
  return bundled + standalone;
}

export async function checkQuota(
  user: AuthUser,
  resource:
    | 'bots'
    | 'conversations'
    | 'knowledge_sources'
    | 'leads'
    | 'phone_minutes',
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
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const convs = await sbSelect('conversations', 'id', {
        ...orgFilter,
        timestamp: `gte.${monthStart.toISOString()}`,
      }).catch(() => []);
      current = convs.length;
      limit = limits.conversations_per_month;
      break;
    }
    case 'knowledge_sources': {
      const sources = await sbSelect('knowledge_sources', 'id', {
        bot_id: 'not.is.null',
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
    case 'phone_minutes': {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const bots = await sbSelect('bots', 'id', orgFilter).catch(() => []);
      const botIds = (bots || []).map((b: any) => b.id);
      if (botIds.length) {
        const calls = await sbSelect('call_logs', 'duration', {
          bot_id: `in.(${botIds.join(',')})`,
          started_at: `gte.${monthStart.toISOString()}`,
        }).catch(() => []);
        const totalSeconds = (calls || []).reduce(
          (sum: number, c: any) => sum + (c.duration || 0),
          0,
        );
        current = Math.ceil(totalSeconds / 60);
      }
      limit = await getPhoneMinutesLimit(user);
      break;
    }
  }

  return { allowed: current < limit, current, limit, plan: planKey };
}

async function checkAndApplyTrial(
  user: AuthUser,
): Promise<{ active: boolean; daysRemaining: number }> {
  const users = await sbSelect(
    'users',
    'id,plan,trial_started_at,trial_ends_at',
    {
      id: `eq.${user.id}`,
    },
  ).catch(() => []);
  const u = users?.[0];
  if (!u) return { active: false, daysRemaining: 0 };

  if (u.plan && u.plan !== 'FREE' && u.plan !== 'TRIAL') {
    return { active: false, daysRemaining: 0 };
  }

  if (u.trial_ends_at) {
    const endsAt = new Date(u.trial_ends_at);
    const now = new Date();
    if (now < endsAt) {
      const daysRemaining = Math.ceil(
        (endsAt.getTime() - now.getTime()) / 86400000,
      );
      return { active: true, daysRemaining };
    }
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

const multipartUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

async function parseMultipartFile(
  req: VercelRequest,
): Promise<Express.Multer.File | undefined> {
  let raw: Buffer;
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    raw = req.body;
  } else if (typeof req.body === 'string' && req.body.length > 0) {
    raw = Buffer.from(req.body, 'binary');
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    raw = Buffer.concat(chunks);
  }

  const fakeReq = Readable.from(raw) as any;
  fakeReq.headers = req.headers;
  fakeReq.method = req.method;

  return new Promise((resolve, reject) => {
    multipartUpload.single('file')(fakeReq, {} as any, (err: any) => {
      if (err) reject(err);
      else resolve(fakeReq.file);
    });
  });
}

async function extractTextFromFile(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<string> {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (mimetype === 'application/pdf' || ext === 'pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (ext === 'docx' || mimetype.includes('officedocument.wordprocessingml')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (ext === 'txt' || ext === 'md' || mimetype.startsWith('text/')) {
    return buffer.toString('utf-8');
  }
  throw new Error(`Unsupported file type: ${filename}`);
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
      system_prompt:
        body.systemPrompt || body.persona || 'You are a helpful assistant.',
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
      lead_capture: body.leadCapture || {
        enabled: false,
        promptAfter: 3,
        emailRequired: true,
        nameRequired: false,
        phoneRequired: false,
      },
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

async function handlePublicBotById(
  req: VercelRequest,
  res: VercelResponse,
  botId: string,
) {
  if (req.method !== 'GET')
    return res.status(405).json({ error: 'Method not allowed' });
  const bots = await sbSelect('bots', '*', {
    id: `eq.${botId}`,
    is_public: 'eq.true',
  });
  if (!bots.length || bots[0].active === false)
    return res.status(404).json({ error: 'Bot not found' });
  const b = bots[0];
  res.json({
    id: b.id,
    name: b.name,
    themeColor: b.theme_color,
    avatar: b.avatar,
    active: b.active,
    leadCapture: b.lead_capture,
    responseDelay: b.response_delay,
  });
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
      sbSelect('conversations', 'id,timestamp', orgFilter).catch(() => []),
    ]);
    res.json({
      activeBots: bots.filter((b: any) => b.active !== false).length,
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
    const conversations = await sbSelect('conversations', 'timestamp', f).catch(
      () => [],
    );
    const days: any[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000)
        .toISOString()
        .split('T')[0];
      days.push({
        date: day,
        count: conversations.filter((c: any) =>
          (c.timestamp || c.created_at)?.startsWith(day),
        ).length,
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
    if (pathParts[1] === 'timeline' && req.method === 'GET') {
      const leadRows = await sbSelect('leads', '*', {
        id: `eq.${leadId}`,
        ...orgFilter,
      }).catch(() => []);
      const lead = leadRows[0];
      if (!lead) return res.status(404).json({ error: 'Not found' });

      const [memories, nurtureSteps] = await Promise.all([
        sbSelect(
          'ai_agent_memories',
          'id,role_id,content,metadata,created_at',
          {
            subject_type: 'eq.lead',
            subject_id: `eq.${leadId}`,
            order: 'created_at.desc',
            limit: '50',
          },
        ).catch(() => []),
        sbSelect(
          'nurture_steps',
          'id,step_type,subject,content,status,created_at',
          {
            lead_id: `eq.${leadId}`,
            order: 'created_at.desc',
            limit: '50',
          },
        ).catch(() => []),
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
        summary: `Lead captured${lead.source_bot_id ? ` via bot ${lead.source_bot_id}` : ''}.`,
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

function scoreLeadIntent(conversationContext: string | undefined): number {
  if (!conversationContext || typeof conversationContext !== 'string') {
    return 50;
  }
  const text = conversationContext.toLowerCase();
  let score = 50;

  const highIntentSignals = [
    /\bpric(e|ing)\b/,
    /\bcost\b/,
    /\bbudget\b/,
    /\bquote\b/,
    /\bbuy\b/,
    /\bpurchase\b/,
    /\bsign\s*up\b/,
    /\bdemo\b/,
    /\bcontract\b/,
    /\bstart(ed)?\s*(today|now|asap)\b/,
    /\burgent(ly)?\b/,
    /\bimmediately\b/,
    /\bschedule\s*a?\s*call\b/,
    /\bwhen\s*can\s*(we|i)\s*start\b/,
    /\bready\s*to\s*(buy|move\s*forward|sign)\b/,
    /\bhow\s*much\b/,
    /\btake\s*my\s*(payment|money)\b/,
  ];
  const midIntentSignals = [
    /\binterested\b/,
    /\blearn\s*more\b/,
    /\bmore\s*info(rmation)?\b/,
    /\bcompare\b/,
    /\btrial\b/,
    /\bfeatures\b/,
  ];
  const lowIntentSignals = [
    /\bjust\s*(looking|browsing|curious)\b/,
    /\bnot\s*ready\b/,
    /\bmaybe\s*later\b/,
    /\bno\s*thanks\b/,
    /\bunsubscribe\b/,
  ];

  for (const re of highIntentSignals) if (re.test(text)) score += 8;
  for (const re of midIntentSignals) if (re.test(text)) score += 4;
  for (const re of lowIntentSignals) if (re.test(text)) score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

async function handleLeadCapture(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });
  const body = parseBody(req);

  if (!body.botId && body.portfolio) {
    const secret = process.env.PORTFOLIO_INTAKE_SECRET;
    const provided = req.headers['x-portfolio-secret'];
    if (!secret || provided !== secret) {
      return res.status(401).json({ error: 'Invalid portfolio intake secret' });
    }
    if (
      !body.email ||
      typeof body.email !== 'string' ||
      !body.email.includes('@')
    ) {
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
      return res
        .status(500)
        .json({ error: 'Portfolio owner account not found' });
    }
    const existing = await sbSelect('leads', 'id', {
      email: `eq.${body.email}`,
      user_id: `eq.${owners[0].id}`,
    }).catch(() => []);
    if (existing[0]?.id) {
      return res
        .status(200)
        .json({ success: true, leadId: existing[0].id, deduped: true });
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
      await trackAnalyticsEvent({
        eventType: 'lead_captured',
        userId: owners[0].id,
        eventData: { source: body.source || 'donmatthews.live' },
      });
      return res.status(201).json({ success: true, leadId: r[0]?.id });
    } catch (err) {
      console.error('[handleLeadCapture] portfolio insert failed:', err);
      return res.status(500).json({ error: 'Failed to save lead' });
    }
  }

  if (!body.botId) {
    return res
      .status(400)
      .json({ error: 'botId is required to attribute a lead to its owner' });
  }
  const ownerBots = await sbSelect('bots', 'id,user_id', {
    id: `eq.${body.botId}`,
  }).catch(() => []);
  const ownerUserId = ownerBots[0]?.user_id;
  if (!ownerUserId) {
    return res
      .status(404)
      .json({ error: 'Bot not found — cannot attribute lead' });
  }
  const score = scoreLeadIntent(body.conversationContext);

  try {
    const r = await sbInsert('leads', {
      id: crypto.randomUUID(),
      user_id: ownerUserId,
      source_bot_id: body.botId,
      name: body.name || '',
      email: body.email || '',
      phone: body.phone || null,
      status: 'New',
      score,
    });

    await trackAnalyticsEvent({
      eventType: 'lead_captured',
      botId: body.botId,
      userId: ownerUserId,
      eventData: { score },
    });

    if (score > 75) {
      sbSelect('users', 'email', { id: `eq.${ownerUserId}` })
        .then((owners: any[]) => {
          const ownerEmail = owners?.[0]?.email;
          if (!ownerEmail) return;
          return sendEmail({
            from: `alerts@${EMAIL_DOMAIN}`,
            fromName: 'BuildMyBot Hot Lead Alert',
            to: ownerEmail,
            subject: `🔥 Hot lead (score ${score}): ${body.name || body.email}`,
            text: `A high-intent lead just came in from your chatbot.\n\nName: ${body.name || 'Visitor'}\nEmail: ${body.email || 'n/a'}\nPhone: ${body.phone || 'n/a'}\nScore: ${score}/100\n\nRecent conversation:\n${body.conversationContext || '(none captured)'}\n\nView in your CRM: https://${EMAIL_DOMAIN}/leads`,
          });
        })
        .catch((err) =>
          console.error('[handleLeadCapture] hot-lead alert failed:', err),
        );
    }

    res.status(201).json({ success: true, leadId: r[0]?.id, score });
  } catch (err) {
    console.error('[handleLeadCapture] insert failed:', err);
    res.status(500).json({ error: 'Failed to save lead' });
  }
}

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
  if (!['admin', 'ADMIN', 'owner', 'OWNER'].includes(user.role))
    return res.status(403).json({ error: 'Admin access required' });
  const sub = pathParts[0] || '';

  if (sub === 'users') {
    if (pathParts[1] === 'bulk' && _req.method === 'POST') {
      const body = parseBody(_req);
      const userIds: string[] = Array.isArray(body.userIds) ? body.userIds : [];
      const action = String(body.action || '');
      if (!userIds.length)
        return res.status(400).json({ error: 'userIds required' });
      const patch =
        action === 'activate'
          ? { status: 'Active' }
          : action === 'suspend'
            ? { status: 'Suspended' }
            : action === 'delete'
              ? { deleted_at: new Date().toISOString() }
              : null;
      if (!patch)
        return res.status(400).json({ error: `Unknown action: ${action}` });
      await sbUpdate('users', patch, {
        id: `in.(${userIds.join(',')})`,
      }).catch(() => null);
      return res.json({ success: true, updated: userIds.length });
    }

    if (pathParts[1] === 'merge' && _req.method === 'POST') {
      const body = parseBody(_req);
      const { sourceUserId, targetUserId } = body;
      if (!sourceUserId || !targetUserId)
        return res
          .status(400)
          .json({ error: 'sourceUserId and targetUserId required' });
      await Promise.all([
        sbUpdate(
          'bots',
          { user_id: targetUserId },
          { user_id: `eq.${sourceUserId}` },
        ).catch(() => null),
        sbUpdate(
          'leads',
          { user_id: targetUserId },
          { user_id: `eq.${sourceUserId}` },
        ).catch(() => null),
      ]);
      await sbUpdate(
        'users',
        { deleted_at: new Date().toISOString() },
        { id: `eq.${sourceUserId}` },
      ).catch(() => null);
      return res.json({ success: true });
    }

    if (
      pathParts[1] &&
      (pathParts[2] === 'usage' || pathParts[2] === 'export')
    ) {
      const targetId = pathParts[1];
      const targetRows = await sbSelect('users', '*', {
        id: `eq.${targetId}`,
      }).catch(() => []);
      const target = targetRows[0];
      if (!target) return res.status(404).json({ error: 'User not found' });
      const f = target.organization_id
        ? { organization_id: `eq.${target.organization_id}` }
        : { user_id: `eq.${targetId}` };
      const [bots, leads, conversations] = await Promise.all([
        sbSelect('bots', 'id', f).catch(() => []),
        sbSelect('leads', 'id', f).catch(() => []),
        sbSelect('conversations', 'id', f).catch(() => []),
      ]);
      if (pathParts[2] === 'usage') {
        return res.json({
          botCount: bots.length,
          leadCount: leads.length,
          conversationCount: conversations.length,
          lastLoginAt: target.last_login_at || null,
        });
      }
      const { password_hash: _ph, ...safeUser } = target;
      return res.json({
        user: safeUser,
        counts: {
          bots: bots.length,
          leads: leads.length,
          conversations: conversations.length,
        },
        exportedAt: new Date().toISOString(),
      });
    }

    const url = new URL(_req.url || '/', 'http://localhost');
    const roleFilter = url.searchParams.get('role') || '';
    const statusFilter = url.searchParams.get('status') || '';
    const search = url.searchParams.get('search') || '';

    const filters: Record<string, string> = {
      deleted_at: 'is.null',
      order: 'created_at.desc',
      limit: '500',
    };
    if (roleFilter) filters.role = `ilike.${roleFilter}`;
    if (statusFilter) filters.status = `ilike.${statusFilter}`;
    if (search)
      filters.or = `(name.ilike.*${search}*,email.ilike.*${search}*,company_name.ilike.*${search}*)`;

    const rows = await sbSelect(
      'users',
      'id,name,email,company_name,role,plan,status,created_at,last_login_at',
      filters,
    ).catch(() => []);
    res.json(
      (rows as any[]).map((u) => ({
        id: u.id,
        name: u.name || u.email,
        email: u.email,
        companyName: u.company_name || null,
        role: u.role || 'user',
        plan: u.plan || 'FREE',
        status: u.status || 'Active',
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at || null,
      })),
    );
    return;
  }

  if (sub === 'live-leads') {
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
      sbSelect('organizations', 'id,plan,deleted_at,created_at', {}).catch(
        () => [],
      ),
      sbSelect('bots', 'id,active', {}).catch(() => []),
      sbSelect('leads', 'id,status', {}).catch(() => []),
      sbSelect('organization_subscriptions', 'id,plan,status', {}).catch(
        () => [],
      ),
    ]);
    const paying = orgs.filter((o: any) => o.plan && o.plan !== 'free').length;
    const mrr = orgs.reduce(
      (sum: number, o: any) => sum + (PLAN_PRICES[o.plan] || 0),
      0,
    );
    res.json({
      totalUsers: users.length,
      totalOrganizations: orgs.length,
      activeOrganizations: orgs.filter((o: any) => !o.deleted_at).length,
      totalBots: bots.length,
      activeBots: bots.filter((b: any) => b.active !== false).length,
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
    res.json([]);
  } else if (sub === 'financial') {
    const fsub = pathParts[1] || '';
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
    if (fsub === 'overview') {
      if (!stripeConfigured) {
        const orgs = await sbSelect(
          'organizations',
          'id,plan,deleted_at',
          {},
        ).catch(() => []);
        const activeCustomers = orgs.filter((o: any) => !o.deleted_at).length;
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
      } else {
        try {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: '2025-08-27.basil' as any,
          });
          const [activeSubs, trialingSubs, canceledSubs] = await Promise.all([
            stripe.subscriptions.list({ status: 'active', limit: 100 }),
            stripe.subscriptions.list({ status: 'trialing', limit: 100 }),
            stripe.subscriptions.list({ status: 'canceled', limit: 100 }),
          ]);
          const liveSubs = [...activeSubs.data, ...trialingSubs.data];
          const monthlyAmount = (sub: any): number =>
            (sub.items?.data || []).reduce((s: number, item: any) => {
              const unit = item.price?.unit_amount || 0;
              const qty = item.quantity || 1;
              const interval = item.price?.recurring?.interval;
              const perMonth =
                interval === 'year'
                  ? (unit * qty) / 12
                  : interval === 'week'
                    ? unit * qty * (52 / 12)
                    : unit * qty;
              return s + perMonth;
            }, 0);
          const mrrCents = Math.round(
            liveSubs.reduce((s, sub) => s + monthlyAmount(sub), 0),
          );
          const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
          const churnedRecent = canceledSubs.data.filter(
            (s: any) => (s.canceled_at || 0) >= thirtyDaysAgo,
          );
          const activeCustomers = new Set(
            liveSubs.map((s: any) => s.customer),
          ).size;
          const churnedCustomers = new Set(
            churnedRecent.map((s: any) => s.customer),
          ).size;
          const churnRate =
            activeCustomers + churnedCustomers > 0
              ? (churnedCustomers / (activeCustomers + churnedCustomers)) * 100
              : 0;
          res.json({
            mrrCents,
            arrCents: mrrCents * 12,
            churnRate: Math.round(churnRate * 100) / 100,
            activeCustomers,
            churnedCustomers,
            wired: true,
          });
        } catch (err: any) {
          console.error('[financial/overview] Stripe fetch failed:', err.message);
          res.json({
            mrrCents: 0,
            arrCents: 0,
            churnRate: 0,
            activeCustomers: 0,
            churnedCustomers: 0,
            wired: false,
            message: `Stripe fetch failed: ${err.message}`,
          });
        }
      }
    } else if (fsub === 'invoices') {
      if (!stripeConfigured) {
        res.json([]);
      } else {
        try {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: '2025-08-27.basil' as any,
          });
          const invoices = await stripe.invoices.list({ limit: 100 });
          res.json(
            invoices.data.map((inv: any) => ({
              id: inv.id,
              customer_email: inv.customer_email || '',
              amount_due: inv.amount_due,
              amount_paid: inv.amount_paid,
              status: inv.status,
              created: inv.created,
              due_date: inv.due_date,
            })),
          );
        } catch (err: any) {
          console.error('[financial/invoices] Stripe fetch failed:', err.message);
          res.json([]);
        }
      }
    } else if (fsub === 'refunds') {
      if (!stripeConfigured) {
        res.json([]);
      } else {
        try {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: '2025-08-27.basil' as any,
          });
          const refunds = await stripe.refunds.list({ limit: 100 });
          res.json(
            refunds.data.map((r: any) => ({
              id: r.id,
              amount: r.amount,
              status: r.status,
              reason: r.reason,
              created: r.created,
            })),
          );
        } catch (err: any) {
          console.error('[financial/refunds] Stripe fetch failed:', err.message);
          res.json([]);
        }
      }
    } else if (fsub === 'stripe-health') {
      if (!stripeConfigured) {
        res.json({
          ok: false,
          connected: false,
          message: 'Stripe is not connected',
        });
      } else {
        try {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: '2025-08-27.basil' as any,
          });
          await stripe.balance.retrieve();
          res.json({ ok: true, connected: true, message: 'Stripe connected' });
        } catch (err: any) {
          res.json({
            ok: false,
            connected: false,
            message: err.message || 'Stripe health check failed',
          });
        }
      }
    } else if (fsub === 'features-usage') {
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
  _pathParts: string[],
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const url = new URL(req.url || '', 'http://localhost');
  const userId = url.searchParams.get('userId');
  const isAdmin = ['admin', 'ADMIN', 'owner', 'OWNER'].includes(user.role);

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
  return res.json(Array.isArray(conversations) ? conversations : []);
}

async function handleImpersonation(
  req: VercelRequest,
  res: VercelResponse,
  _user: AuthUser,
  pathParts: string[],
) {
  const sub = pathParts[0] || '';
  if (sub === 'active' && req.method === 'GET') {
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
    try {
      if (botId) {
        const botCheck = await sbSelect('bots', 'id,organization_id', {
          id: `eq.${botId}`,
        }).catch(() => []);

        if (!botCheck.length) {
          return res.status(404).json({ error: 'Bot not found' });
        }

        const bot = botCheck[0];
        if (
          user.organizationId !== bot.organization_id &&
          user.role !== 'admin'
        ) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const d = await sbSelect('voice_agents', '*', {
          bot_id: `eq.${botId}`,
        }).catch(() => []);
        res.json(d[0] || null);
      } else {
        const f = ownerFilter(user);
        const agents = await sbSelect('voice_agents', '*', f).catch(() => []);
        res.json(agents);
      }
    } catch (err: any) {
      console.error('[voice] GET error:', err.message);
      res.status(500).json({ error: 'Failed to retrieve voice agents' });
    }
  } else if (req.method === 'POST' && botId && pathParts[2] === 'provision') {
    try {
      const body = parseBody(req);
      if (!body.voiceId) {
        return res.status(400).json({ error: 'voiceId is required' });
      }

      const validProviders = [
        'openai',
        'cartesia',
        'grok',
        'elevenlabs',
        'aws-polly',
        'google-tts',
      ];
      const provider = body.provider || 'cartesia';
      if (!validProviders.includes(provider)) {
        return res.status(400).json({
          error: `Invalid provider. Supported: ${validProviders.join(', ')}`,
        });
      }

      const botCheck = await sbSelect('bots', 'id,organization_id', {
        id: `eq.${botId}`,
      }).catch(() => []);

      if (!botCheck.length) {
        return res.status(404).json({ error: 'Bot not found' });
      }

      const bot = botCheck[0];
      if (
        user.organizationId !== bot.organization_id &&
        user.role !== 'admin'
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const existing = await sbSelect('voice_agents', 'id', {
        bot_id: `eq.${botId}`,
      }).catch(() => []);

      if (existing.length > 0) {
        return res.status(409).json({
          error: 'Voice agent already provisioned for this bot',
          existingAgentId: existing[0].id,
        });
      }

      const voiceAgentData = {
        id: crypto.randomUUID(),
        bot_id: botId,
        organization_id: user.organizationId,
        provider: provider,
        voice_id: body.voiceId,
        voice_name: body.voiceName || null,
        voice_model: body.voiceModel || null,
        language: body.language || 'en',
        system_prompt: body.systemPrompt || null,
        greeting: body.greeting || null,
        business_hours: body.businessHours || null,
        after_hours_message: body.afterHoursMessage || null,
        end_call_phrase: body.endCallPhrase || 'Goodbye!',
        end_call_phrases: body.endCallPhrases || [
          'goodbye',
          'bye',
          'end call',
          'hang up',
        ],
        transfer_enabled: body.transferEnabled || false,
        transfer_number: body.transferNumber || null,
        transfer_triggers: body.transferTriggers || null,
        lead_capture_enabled: body.leadCaptureEnabled || true,
        calendar_booking_url: body.calendarBookingUrl || null,
        max_call_duration: body.maxCallDuration || 30,
        record_calls: body.recordCalls !== false,
        escalation_rules: body.escalationRules || null,
        plan: body.plan || 'standard',
        minutes_used: 0,
        minutes_limit: body.minutesLimit || 1000,
        billing_cycle: new Date().toISOString(),
        is_active: true,
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const r = await sbInsert('voice_agents', voiceAgentData).catch((err) => {
        console.error('[voice] Insert error:', err);
        throw new Error('Failed to create voice agent');
      });

      res.status(201).json({
        success: true,
        voiceAgent: r[0],
        message: 'Voice agent provisioned successfully',
      });
    } catch (err: any) {
      console.error('[voice] Provision error:', err.message);
      res.status(500).json({
        error: 'Failed to provision voice agent',
        details: err.message,
      });
    }
  } else if (req.method === 'PATCH' && botId) {
    try {
      const body = parseBody(req);
      const existing = await sbSelect('voice_agents', '*', {
        bot_id: `eq.${botId}`,
      }).catch(() => []);

      if (!existing.length) {
        return res.status(404).json({ error: 'Voice agent not found' });
      }

      const agent = existing[0];
      if (
        user.organizationId !== agent.organization_id &&
        user.role !== 'admin'
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const updateData = {
        ...body,
        updated_at: new Date().toISOString(),
      };

      const u = await sbUpdate('voice_agents', updateData, {
        bot_id: `eq.${botId}`,
      }).catch((err) => {
        console.error('[voice] Update error:', err);
        throw new Error('Failed to update voice agent');
      });

      res.json({
        success: true,
        voiceAgent: u[0],
        message: 'Voice agent updated successfully',
      });
    } catch (err: any) {
      console.error('[voice] PATCH error:', err.message);
      res.status(500).json({
        error: 'Failed to update voice agent',
        details: err.message,
      });
    }
  } else if (req.method === 'DELETE' && botId) {
    try {
      const existing = await sbSelect('voice_agents', '*', {
        bot_id: `eq.${botId}`,
      }).catch(() => []);

      if (!existing.length) {
        return res.status(404).json({ error: 'Voice agent not found' });
      }

      const agent = existing[0];
      if (
        user.organizationId !== agent.organization_id &&
        user.role !== 'admin'
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await sbUpdate(
        'voice_agents',
        {
          is_active: false,
          enabled: false,
          updated_at: new Date().toISOString(),
        },
        {
          bot_id: `eq.${botId}`,
        },
      ).catch((err) => {
        console.error('[voice] Delete error:', err);
        throw new Error('Failed to deactivate voice agent');
      });

      res.json({
        success: true,
        message: 'Voice agent deactivated successfully',
      });
    } catch (err: any) {
      console.error('[voice] DELETE error:', err.message);
      res.status(500).json({
        error: 'Failed to deactivate voice agent',
        details: err.message,
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

const FIRECRAWL_WEBHOOK_SECRET = process.env.FIRECRAWL_WEBHOOK_SECRET || '';

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
    console.error(
      '[firecrawl-webhook] missing sourceId/botId in metadata',
      metadata,
    );
    return res
      .status(200)
      .json({ received: true, warning: 'missing metadata' });
  }

  try {
    if (type === 'crawl.page') {
      const pages = Array.isArray(body.data)
        ? body.data
        : [body.data].filter(Boolean);
      for (const page of pages) {
        const markdown = page?.markdown || '';
        const pageUrl = page?.metadata?.sourceURL || page?.metadata?.url || '';
        if (markdown)
          await ingestPageChunks(sourceId, botId, pageUrl, markdown);
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
    return res.status(200).json({ received: true, error: err.message });
  }
}

const KNOWLEDGE_STATUS_TO_DTO: Record<string, string> = {
  ready: 'completed',
  active: 'completed',
  refreshing: 'processing',
};

function toKnowledgeSourceDTO(row: any, chunkCount = 0) {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    status: KNOWLEDGE_STATUS_TO_DTO[row.status] || row.status,
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
      const totalTokens = 0;
      res.json({
        sources,
        stats: {
          sources: sources.length,
          chunks: Object.values(chunkCounts).reduce((a, b) => a + b, 0),
          totalTokens,
        },
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
    const pageLimit = { 1: 15, 2: 40, 3: 75 }[crawlDepth] || 15;

    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }

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
        {
          processing_state: {
            firecrawl_job_id: crawlJob.jobId,
            page_limit: pageLimit,
          },
        },
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
      const result = await ingestKnowledgeSource(
        sourceId,
        botId,
        scrapedContent,
      );
      res
        .status(201)
        .json({ id: sourceId, success: true, mode: 'single-page', ...result });
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
    const sourceId = crypto.randomUUID();

    let file: Express.Multer.File | undefined;
    try {
      file = await parseMultipartFile(req);
    } catch (err: any) {
      return res
        .status(400)
        .json({ error: `Failed to parse upload: ${err.message}` });
    }
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const r = await sbInsert('knowledge_sources', {
      id: sourceId,
      bot_id: botId,
      organization_id: user.organizationId || null,
      source_type: 'document',
      source_name: file.originalname || 'Uploaded document',
      status: 'processing',
    }).catch(() => [{ id: sourceId }]);

    try {
      const content = await extractTextFromFile(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      const result = await ingestKnowledgeSource(sourceId, botId, content);
      if (result.chunksCreated === 0) {
        await sbUpdate(
          'knowledge_sources',
          { status: 'failed', last_error: 'No extractable text in document' },
          { id: `eq.${sourceId}` },
        ).catch(() => {});
      }
    } catch (err: any) {
      console.error('[knowledge] ingest failed for upload:', err.message);
      await sbUpdate(
        'knowledge_sources',
        { status: 'failed', last_error: err.message },
        { id: `eq.${sourceId}` },
      ).catch(() => {});
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
  pathParts: string[] = [],
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
    const templateId =
      pathParts[1] === 'install' && pathParts[0]
        ? pathParts[0]
        : body.templateId;
    if (!templateId)
      return res.status(400).json({ error: 'templateId is required' });
    const tpls = await sbSelect('bot_templates', '*', {
      id: `eq.${templateId}`,
    }).catch(() => []);
    if (!tpls.length)
      return res.status(404).json({ error: 'Template not found' });
    const tpl = tpls[0];
    const customPrompt =
      (typeof body.systemPrompt === 'string' && body.systemPrompt.trim()) ||
      (typeof body.customPrompt === 'string' && body.customPrompt.trim()) ||
      (typeof body.persona === 'string' && body.persona.trim()) ||
      '';
    const systemPrompt =
      customPrompt ||
      tpl.system_prompt ||
      tpl.persona ||
      'You are a helpful assistant.';
    const r = await sbInsert('bots', {
      id: crypto.randomUUID(),
      user_id: user.id,
      organization_id: user.organizationId,
      creator_id: user.id,
      name: body.name || `${tpl.name} (Copy)`,
      description: body.description || tpl.description || '',
      persona: customPrompt || tpl.persona || '',
      system_prompt: systemPrompt,
      model: body.model || tpl.model || 'gpt-4o-mini',
      temperature:
        typeof body.temperature === 'number' ? body.temperature : 0.7,
      max_tokens: 500,
      status: 'draft',
      config: tpl.config || {},
    });
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
        organization_id: user.organizationId || null,
        user_id: user.id,
        url: body.url,
        events: body.events || [],
        is_active: body.isActive ?? true,
      });
      res.status(201).json(r[0]);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } else {
    const f = { id: `eq.${wid}`, ...orgF };
    if (req.method === 'PATCH') {
      const u = await sbUpdate('webhooks', parseBody(req), f);
      res.json(u[0] || { error: 'Not found' });
    } else if (req.method === 'DELETE') {
      await sbDelete('webhooks', f);
      res.json({ success: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname.replace(/^\/api\/?/, '');
  const parts = pathname.split('/').filter(Boolean);
  const resource = parts[0] || '';
  const restParts = parts.slice(1);

  if (resource === 'health') return handleHealth(req, res);
  if (resource === 'lead-capture') return handleLeadCapture(req, res);
  if (resource === 'knowledge' && restParts[0] === 'firecrawl-webhook') {
    return handleFirecrawlWebhook(req, res);
  }
  if (resource === 'bots' && restParts[0] === 'public' && restParts[1]) {
    return handlePublicBotById(req, res, restParts[1]);
  }

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  switch (resource) {
    case 'bots':
      if (restParts[0]) return handleBotById(req, res, user, restParts[0]);
      return handleBots(req, res, user);
    case 'analytics':
      return handleAnalytics(req, res, user, restParts);
    case 'leads':
      return handleLeads(req, res, user, restParts);
    case 'admin':
      return handleAdmin(req, res, user, restParts);
    case 'conversations':
      return handleConversations(req, res, user, restParts);
    case 'impersonation':
      return handleImpersonation(req, res, user, restParts);
    case 'revenue':
      return handleRevenue(req, res, user, restParts);
    case 'voice':
      return handleVoice(req, res, user, restParts);
    case 'knowledge':
      return handleKnowledge(req, res, user, restParts);
    case 'templates':
      return handleTemplates(req, res, user, restParts);
    case 'tools':
      return handleTools(req, res, user, restParts);
    case 'webhooks':
      return handleWebhooks(req, res, user, restParts);
    default:
      return res.status(404).json({ error: 'Endpoint not found' });
  }
}
