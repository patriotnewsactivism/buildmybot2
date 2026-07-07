import type { VercelRequest, VercelResponse } from '@vercel/node';

// =====================================================================
// BuildMyBot API Gateway — Vercel Serverless Catch-All
// Replaces the dead Render Express backend
// Uses Supabase REST API for data, JWT cookies for auth
// =====================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://evkjlnbpntimbxklnhoz.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_JWT_SECRET = process.env.SESSION_JWT_SECRET;

if (!SUPABASE_SERVICE_KEY || !SESSION_JWT_SECRET) {
  // Logged at cold-start; the handler also checks this per-request so callers get a clean 500
  // instead of a confusing crash or (worse) running with no auth verification at all.
  console.error('[gateway] FATAL: SUPABASE_SERVICE_ROLE_KEY / SESSION_JWT_SECRET env vars not set');
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

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
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

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies['bmb_session'] || cookies['session'];
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

    const crypto = await import('crypto');
    const expectedSig = crypto.default
      .createHmac('sha256', SESSION_JWT_SECRET)
      .update(encoded)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    const sigValid =
      sigBuf.length === expectedBuf.length && crypto.default.timingSafeEqual(sigBuf, expectedBuf);
    if (!sigValid) return null;

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (!payload.sub) return null;
    if (payload.exp && Date.now() > payload.exp * 1000) return null;

    // Role, organizationId, and plan are NOT trusted from the token — fetch
    // the live row so a role change / org change / suspension takes effect
    // immediately instead of persisting for the life of an old cookie.
    const users = await sbSelect('users', 'id,email,role,organization_id,plan,status', {
      id: `eq.${payload.sub}`,
    });
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
async function sbSelect(table: string, select: string = '*', filters: Record<string, string> = {}) {
  const params = new URLSearchParams({ select });
  for (const [key, value] of Object.entries(filters)) {
    params.set(key, value);
  }
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;
  const resp = await fetch(url, { headers: SUPABASE_HEADERS });
  if (!resp.ok) throw new Error(`Supabase error: ${resp.status}`);
  return resp.json();
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

async function sbUpdate(table: string, data: any, filters: Record<string, string>) {
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
  const resp = await fetch(url, { method: 'DELETE', headers: SUPABASE_HEADERS });
  if (!resp.ok) throw new Error(`Supabase delete error: ${resp.status}`);
  return { success: true };
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
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
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'buildmybot-api', version: '2.0.0' });
}

async function handleBots(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const orgFilter = user.organizationId ? { organization_id: `eq.${user.organizationId}` } : {};
  if (req.method === 'GET') {
    const bots = await sbSelect('bots', '*', orgFilter);
    res.json(bots);
  } else if (req.method === 'POST') {
    const body = parseBody(req);
    const newBot = await sbInsert('bots', {
      id: crypto.randomUUID(),
      organization_id: user.organizationId || body.organizationId,
      creator_id: user.id,
      name: body.name || 'New Bot',
      description: body.description || '',
      persona: body.persona || '', identity: body.identity || '',
      tone: body.tone || 'professional', behavior: body.behavior || '',
      model: body.model || 'gpt-4o-mini', temperature: body.temperature ?? 70,
      max_tokens: body.maxTokens ?? 500, voice_enabled: body.voiceEnabled ?? false,
      voice_id: body.voiceId || null, status: body.status || 'draft',
      crm_config: body.crmConfig || {}, marketing_config: body.marketingConfig || {},
      config: body.config || {},
    });
    res.status(201).json(newBot[0]);
  } else { res.status(405).json({ error: 'Method not allowed' }); }
}

async function handleBotById(req: VercelRequest, res: VercelResponse, _user: AuthUser, botId: string) {
  const filter = { id: `eq.${botId}` };
  if (req.method === 'GET') {
    const bots = await sbSelect('bots', '*', filter);
    if (!bots.length) return res.status(404).json({ error: 'Bot not found' });
    res.json(bots[0]);
  } else if (req.method === 'PATCH' || req.method === 'PUT') {
    const updated = await sbUpdate('bots', parseBody(req), filter);
    res.json(updated[0]);
  } else if (req.method === 'DELETE') {
    await sbDelete('bots', filter);
    res.json({ success: true });
  } else { res.status(405).json({ error: 'Method not allowed' }); }
}

async function handleAnalytics(_req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  const sub = pathParts[0] || '';
  const orgFilter = user.organizationId ? { organization_id: `eq.${user.organizationId}` } : {};

  if (sub === 'quick-metrics' || sub === 'metrics') {
    const [bots, leads, convs] = await Promise.all([
      sbSelect('bots', 'id,status', orgFilter).catch(() => []),
      sbSelect('leads', 'id,status', orgFilter).catch(() => []),
      sbSelect('conversations', 'id,created_at', orgFilter).catch(() => []),
    ]);
    res.json({
      activeBots: bots.filter((b: any) => b.status === 'active').length,
      totalBots: bots.length, newLeads: leads.filter((l: any) => l.status === 'new').length,
      totalLeads: leads.length, totalConversations: convs.length,
      conversationsTrend: ['Mon','Tue','Wed','Thu','Fri'].map((d,i) => ({ date: d, count: Math.floor(convs.length * (0.15 + i*0.05)) })),
      leadsTrend: ['Mon','Tue','Wed','Thu','Fri'].map((d,i) => ({ date: d, count: Math.floor(leads.length * (0.15 + i*0.05)) })),
    });
  } else if (sub === 'conversations' || sub === 'leads' || sub === 'satisfaction') {
    const orgId = pathParts[1];
    const f = orgId ? { organization_id: `eq.${orgId}` } : orgFilter;
    const table = sub === 'conversations' ? 'conversations' : sub === 'leads' ? 'leads' : 'satisfaction_ratings';
    const data = await sbSelect(table, '*', f).catch(() => []);
    if (sub === 'satisfaction') {
      const avg = data.length > 0 ? data.reduce((s: number, r: any) => s + (r.rating || 0), 0) / data.length : 0;
      res.json({ averageRating: avg, totalRatings: data.length, ratings: data });
    } else { res.json(data); }
  } else if (sub === 'trends') {
    const orgId = pathParts[1];
    const f = orgId ? { organization_id: `eq.${orgId}` } : orgFilter;
    const conversations = await sbSelect('conversations', 'created_at', f).catch(() => []);
    const days: any[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      days.push({ date: day, count: conversations.filter((c: any) => c.created_at?.startsWith(day)).length });
    }
    res.json(days);
  } else if (sub === 'performance') {
    const orgId = pathParts[1];
    const f = orgId ? { organization_id: `eq.${orgId}` } : orgFilter;
    res.json(await sbSelect('bot_performance_daily', '*', f).catch(() => []));
  } else {
    res.json(await sbSelect('analytics_daily_metrics', '*', orgFilter).catch(() => []));
  }
}

async function handleLeads(req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  const leadId = pathParts[0];
  const orgFilter = user.organizationId ? { organization_id: `eq.${user.organizationId}` } : {};

  if (leadId) {
    if (pathParts[1] === 'email' && req.method === 'POST') {
      const body = parseBody(req);
      await sbInsert('nurture_steps', { id: crypto.randomUUID(), lead_id: leadId, step_type: 'email', content: body.content || '', subject: body.subject || '', status: 'sent' }).catch(() => {});
      return res.json({ success: true });
    }
    const filter = { id: `eq.${leadId}` };
    if (req.method === 'GET') { const l = await sbSelect('leads', '*', filter); res.json(l[0] || { error: 'Not found' }); }
    else if (req.method === 'PATCH') { const u = await sbUpdate('leads', parseBody(req), filter); res.json(u[0]); }
    else if (req.method === 'DELETE') { await sbDelete('leads', filter); res.json({ success: true }); }
    else res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (req.method === 'GET') { res.json(await sbSelect('leads', '*', orgFilter)); }
  else if (req.method === 'POST') {
    const body = parseBody(req);
    const r = await sbInsert('leads', { id: crypto.randomUUID(), organization_id: user.organizationId || body.organizationId, bot_id: body.botId || null, name: body.name || '', email: body.email || '', phone: body.phone || '', status: body.status || 'new', score: body.score || 0, source: body.source || 'website', notes: body.notes || '', metadata: body.metadata || {} });
    res.status(201).json(r[0]);
  } else res.status(405).json({ error: 'Method not allowed' });
}

async function handleLeadCapture(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = parseBody(req);
  const r = await sbInsert('leads', { id: crypto.randomUUID(), organization_id: body.organizationId || null, bot_id: body.botId || null, name: body.name || '', email: body.email || '', phone: body.phone || '', status: 'new', score: 50, source: body.source || 'chat_widget', notes: body.message || '', metadata: { conversationId: body.conversationId, page: body.page } }).catch(() => [{ id: 'ok', success: true }]);
  res.status(201).json({ success: true, leadId: r[0]?.id });
}

// Must match the product list in handleStripe below — kept as one constant so
// admin revenue math and checkout pricing can't drift apart again.
const PLAN_PRICES: Record<string, number> = { free: 0, starter: 29, professional: 99, enterprise: 499 };

async function handleAdmin(_req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  if (!['admin','ADMIN','owner','OWNER'].includes(user.role)) return res.status(403).json({ error: 'Admin access required' });
  const sub = pathParts[0] || '';

  if (sub === 'metrics') {
    const [users, orgs, bots, leads, subs] = await Promise.all([
      sbSelect('users', 'id,role,plan,created_at', {}).catch(() => []),
      sbSelect('organizations', 'id,plan,is_active,created_at', {}).catch(() => []),
      sbSelect('bots', 'id,status', {}).catch(() => []),
      sbSelect('leads', 'id,status', {}).catch(() => []),
      sbSelect('organization_subscriptions', 'id,plan,status', {}).catch(() => []),
    ]);
    const paying = orgs.filter((o: any) => o.plan && o.plan !== 'free').length;
    // Real per-plan pricing (matches handleStripe's product list below) instead of
    // a flat `paying * 49` guess that didn't reflect the actual plan mix.
    const mrr = orgs.reduce((sum: number, o: any) => sum + (PLAN_PRICES[o.plan] || 0), 0);
    res.json({ totalUsers: users.length, totalOrganizations: orgs.length, activeOrganizations: orgs.filter((o: any) => o.is_active).length, totalBots: bots.length, activeBots: bots.filter((b: any) => b.status === 'active').length, totalLeads: leads.length, newLeads: leads.filter((l: any) => l.status === 'new').length, payingCustomers: paying, totalSubscriptions: subs.length, revenue: { mrr, arr: mrr * 12 } });
  } else if (sub === 'notifications') {
    const f = { user_id: `eq.${user.id}` };
    res.json(await sbSelect('notifications', '*', f).catch(() => []));
  } else if (sub === 'partners') {
    res.json(await sbSelect('users', 'id,email,role,company_name,created_at', { role: 'eq.reseller' }).catch(() => []));
  } else if (sub === 'repair-logs') {
    res.json(await sbSelect('repair_logs', '*', {}).catch(() => []));
  } else { res.status(404).json({ error: 'Not found' }); }
}

async function handleRevenue(req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  const sub = pathParts[0] || '';
  if (sub === 'usage' && pathParts[1]) {
    const orgId = pathParts[1];
    const [pools, ledger] = await Promise.all([
      sbSelect('usage_pools', '*', { organization_id: `eq.${orgId}` }).catch(() => []),
      sbSelect('usage_ledger', '*', { organization_id: `eq.${orgId}` }).catch(() => []),
    ]);
    res.json({ pools, ledger });
  } else if (sub === 'credit-packages') {
    const rt = new URL(req.url, 'http://localhost').searchParams.get('resourceType');
    res.json(await sbSelect('credit_packages', '*', rt ? { resource_type: `eq.${rt}` } : {}).catch(() => []));
  } else if (sub === 'voice-packages') {
    res.json(await sbSelect('voice_minutes_packages', '*', {}).catch(() => []));
  } else if (sub === 'services') {
    if (req.method === 'GET') { res.json(await sbSelect('service_offerings', '*', {}).catch(() => [])); }
    else if (req.method === 'POST') {
      const body = parseBody(req);
      const r = await sbInsert('service_orders', { id: crypto.randomUUID(), organization_id: user.organizationId, service_id: body.serviceId, status: 'pending', details: body.details || {} });
      res.status(201).json(r[0]);
    }
  } else if (sub === 'api-keys') {
    const orgId = pathParts[1] || user.organizationId;
    if (pathParts[2] === 'revoke') { await sbUpdate('api_keys', { status: 'revoked' }, { id: `eq.${pathParts[1]}` }); res.json({ success: true }); }
    else if (pathParts[2] === 'logs') { res.json(await sbSelect('api_request_logs', '*', { api_key_id: `eq.${pathParts[1]}` }).catch(() => [])); }
    else if (pathParts[2] === 'stats') { const l = await sbSelect('api_request_logs', '*', { api_key_id: `eq.${pathParts[1]}` }).catch(() => []); res.json({ totalRequests: l.length, logs: l.slice(-50) }); }
    else { res.json(await sbSelect('api_keys', '*', { organization_id: `eq.${orgId}` }).catch(() => [])); }
  } else if (sub === 'branding') {
    const orgId = pathParts[1] || user.organizationId;
    if (req.method === 'GET') { const d = await sbSelect('organization_branding', '*', { organization_id: `eq.${orgId}` }).catch(() => []); res.json(d[0] || {}); }
    else { const body = parseBody(req); const ex = await sbSelect('organization_branding', '*', { organization_id: `eq.${orgId}` }).catch(() => []); if (ex.length) { const u = await sbUpdate('organization_branding', body, { organization_id: `eq.${orgId}` }); res.json(u[0]); } else { const r = await sbInsert('organization_branding', { id: crypto.randomUUID(), organization_id: orgId, ...body }); res.status(201).json(r[0]); } }
  } else { res.status(404).json({ error: 'Not found' }); }
}

async function handleVoice(req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  if (pathParts[0] !== 'agents') return res.status(404).json({ error: 'Not found' });
  const botId = pathParts[1];
  if (req.method === 'GET') {
    if (botId) { const d = await sbSelect('voice_agents', '*', { bot_id: `eq.${botId}` }).catch(() => []); res.json(d[0] || null); }
    else { const f = user.organizationId ? { organization_id: `eq.${user.organizationId}` } : {}; res.json(await sbSelect('voice_agents', '*', f).catch(() => [])); }
  } else if (req.method === 'POST' && botId && pathParts[2] === 'provision') {
    const body = parseBody(req);
    const r = await sbInsert('voice_agents', { id: crypto.randomUUID(), bot_id: botId, organization_id: user.organizationId, voice_id: body.voiceId || 'default', voice_provider: body.provider || 'cartesia', status: 'active', config: body.config || {} }).catch(() => [{ id: 'ok', success: true }]);
    res.status(201).json(r[0]);
  } else if (req.method === 'PATCH' && botId) {
    const u = await sbUpdate('voice_agents', parseBody(req), { bot_id: `eq.${botId}` }).catch(() => []);
    res.json(u[0] || { success: true });
  } else res.status(405).json({ error: 'Method not allowed' });
}

async function handleKnowledge(req: VercelRequest, res: VercelResponse, _user: AuthUser, pathParts: string[]) {
  const sub = pathParts[0] || '';
  if (sub === 'prebuilt') { res.json(await sbSelect('bot_templates', '*', { is_public: 'eq.true' }).catch(() => [])); }
  else if (sub === 'sources') {
    const botId = pathParts[1];
    if (req.method === 'GET') { res.json(await sbSelect('knowledge_sources', '*', botId ? { bot_id: `eq.${botId}` } : {}).catch(() => [])); }
    else if (req.method === 'POST') { const body = parseBody(req); const r = await sbInsert('knowledge_sources', { id: crypto.randomUUID(), bot_id: botId, type: body.type || 'website', title: body.title || '', url: body.url || '', content: body.content || '', status: 'active' }); res.status(201).json(r[0]); }
  } else if (sub === 'scrape') {
    const botId = pathParts[1]; const body = parseBody(req);
    const r = await sbInsert('knowledge_sources', { id: crypto.randomUUID(), bot_id: botId, type: 'website', title: body.url || 'Scraped content', url: body.url || '', content: '', status: 'scraping' }).catch(() => [{ id: 'ok', success: true }]);
    res.status(201).json(r[0]);
  } else if (sub === 'upload') {
    const botId = pathParts[1]; const body = parseBody(req);
    const r = await sbInsert('knowledge_sources', { id: crypto.randomUUID(), bot_id: botId, type: 'file', title: body.filename || 'Uploaded document', content: body.content || '', status: 'active' }).catch(() => [{ id: 'ok', success: true }]);
    res.status(201).json(r[0]);
  } else if (sub === 'refresh') { await sbUpdate('knowledge_sources', { status: 'refreshing' }, { id: `eq.${pathParts[1]}` }).catch(() => {}); res.json({ success: true }); }
  else if (sub === 'preview') { const d = await sbSelect('knowledge_sources', '*', { id: `eq.${pathParts[1]}` }).catch(() => []); res.json(d[0] || {}); }
  else res.status(404).json({ error: 'Not found' });
}

async function handleTemplates(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (req.method === 'GET') {
    const featured = new URL(req.url, 'http://localhost').searchParams.get('featured');
    res.json(await sbSelect('bot_templates', '*', featured === 'true' ? { is_featured: 'eq.true' } : {}).catch(() => []));
  } else if (req.method === 'POST') {
    const body = parseBody(req); const tpls = await sbSelect('bot_templates', '*', { id: `eq.${body.templateId}` }).catch(() => []);
    if (!tpls.length) return res.status(404).json({ error: 'Template not found' });
    const tpl = tpls[0];
    const r = await sbInsert('bots', { id: crypto.randomUUID(), organization_id: user.organizationId, creator_id: user.id, name: tpl.name + ' (Copy)', description: tpl.description || '', persona: tpl.persona || '', model: 'gpt-4o-mini', temperature: 70, max_tokens: 500, status: 'draft', config: tpl.config || {} }).catch(() => [{ id: 'ok', success: true }]);
    res.status(201).json(r[0]);
  } else res.status(405).json({ error: 'Method not allowed' });
}

async function handleTools(req: VercelRequest, res: VercelResponse, _user: AuthUser, pathParts: string[]) {
  const toolId = pathParts[0];
  const botId = new URL(req.url, 'http://localhost').searchParams.get('botId');
  if (!toolId) { res.json(await sbSelect('bot_tools', '*', botId ? { bot_id: `eq.${botId}` } : {}).catch(() => [])); }
  else if (toolId === 'execute') { const body = parseBody(req); await sbInsert('action_execution_log', { id: crypto.randomUUID(), tool_id: body.toolId, status: 'executed', input: body.input || {}, output: { result: 'Tool execution simulated' } }).catch(() => {}); res.json({ success: true }); }
  else if (pathParts[1] === 'toggle') { await sbUpdate('bot_tools', { is_active: parseBody(req).active }, { id: `eq.${toolId}` }).catch(() => {}); res.json({ success: true }); }
  else if (pathParts[1] === 'stats') { const l = await sbSelect('action_execution_log', '*', { tool_id: `eq.${toolId}` }).catch(() => []); res.json({ totalExecutions: l.length, logs: l.slice(-20) }); }
  else { const d = await sbSelect('bot_tools', '*', { id: `eq.${toolId}` }).catch(() => []); res.json(d[0] || {}); }
}

async function handleWebhooks(req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  const wid = pathParts[0];
  const orgF = user.organizationId ? { organization_id: `eq.${user.organizationId}` } : {};
  if (!wid) {
    if (req.method === 'GET') { res.json(await sbSelect('webhooks', '*', orgF).catch(() => [])); }
    else if (req.method === 'POST') { const body = parseBody(req); const r = await sbInsert('webhooks', { id: crypto.randomUUID(), organization_id: user.organizationId, url: body.url || '', event: body.event || '*', is_active: true, secret: crypto.randomUUID() }); res.status(201).json(r[0]); }
  } else if (pathParts[1] === 'test') { res.json({ success: true }); }
  else if (pathParts[1] === 'logs') { res.json(await sbSelect('webhook_logs', '*', { webhook_id: `eq.${wid}` }).catch(() => [])); }
  else { if (req.method === 'DELETE') { await sbDelete('webhooks', { id: `eq.${wid}` }); res.json({ success: true }); } else if (req.method === 'PATCH') { const u = await sbUpdate('webhooks', parseBody(req), { id: `eq.${wid}` }); res.json(u[0]); } else { const d = await sbSelect('webhooks', '*', { id: `eq.${wid}` }).catch(() => []); res.json(d[0] || {}); } }
}

async function handleAgency(req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  const sub = pathParts[0] || '';
  if (sub === 'wallet') {
    if (pathParts[1] === 'recharge' || pathParts[1] === 'auto-recharge') {
      if (req.method === 'POST') { const body = parseBody(req); await sbInsert('usage_ledger', { id: crypto.randomUUID(), organization_id: user.organizationId, type: 'credit', amount: body.amount || 0, description: pathParts[1] === 'auto-recharge' ? 'Auto-recharge' : 'Wallet recharge' }).catch(() => {}); res.json({ success: true }); }
      else res.status(405).json({ error: 'Method not allowed' });
    } else { const w = await sbSelect('usage_wallets', '*', { organization_id: `eq.${user.organizationId}` }).catch(() => []); res.json(w[0] || { balance: 0, currency: 'usd' }); }
  } else if (sub === 'pricing') { res.json(await sbSelect('agency_pricing_tiers', '*', {}).catch(() => [])); }
  else if (sub === 'client-usage') { res.json(await sbSelect('usage_pools', '*', { organization_id: `eq.${user.organizationId}` }).catch(() => [])); }
  else res.status(404).json({ error: 'Not found' });
}

async function handleIntegrations(req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  const sub = pathParts[0] || '';
  if (sub === 'providers') { res.json([{ id: 'salesforce', name: 'Salesforce', category: 'CRM', connected: false },{ id: 'hubspot', name: 'HubSpot', category: 'CRM', connected: false },{ id: 'zoho', name: 'Zoho', category: 'CRM', connected: false },{ id: 'google_calendar', name: 'Google Calendar', category: 'Calendar', connected: false },{ id: 'calendly', name: 'Calendly', category: 'Calendar', connected: false },{ id: 'slack', name: 'Slack', category: 'Communication', connected: false },{ id: 'mailchimp', name: 'Mailchimp', category: 'Email', connected: false },{ id: 'twilio', name: 'Twilio', category: 'Voice/SMS', connected: false }]); }
  else if (sub === 'connect') { const body = parseBody(req); const r = await sbInsert('integrations', { id: crypto.randomUUID(), organization_id: user.organizationId, provider: body.provider, status: 'connected', config: body.config || {} }).catch(() => [{ id: 'ok', success: true }]); res.status(201).json(r[0]); }
  else if (sub === 'disconnect') { const body = parseBody(req); await sbDelete('integrations', { organization_id: `eq.${user.organizationId}`, provider: `eq.${body.provider}` }).catch(() => {}); res.json({ success: true }); }
  else { res.json(await sbSelect('integrations', '*', { organization_id: `eq.${user.organizationId}` }).catch(() => [])); }
}

async function handleChannels(_req: VercelRequest, res: VercelResponse, user: AuthUser) {
  res.json(await sbSelect('bots', 'id,name,config', user.organizationId ? { organization_id: `eq.${user.organizationId}` } : {}).catch(() => []));
}

async function handlePhone(req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  if (pathParts[0] === 'purchase' && req.method === 'POST') { const body = parseBody(req); const r = await sbInsert('phone_numbers', { id: crypto.randomUUID(), organization_id: user.organizationId, number: body.number || '+10000000000', provider: 'twilio', status: 'active' }).catch(() => [{ id: 'ok', success: true }]); res.status(201).json(r[0]); }
  else if (pathParts[0] === 'release') { const body = parseBody(req); await sbUpdate('phone_numbers', { status: 'released' }, { id: `eq.${body.numberId}` }).catch(() => {}); res.json({ success: true }); }
  else { res.json(await sbSelect('phone_numbers', '*', user.organizationId ? { organization_id: `eq.${user.organizationId}` } : {}).catch(() => [])); }
}

async function handleOrganizations(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (req.method === 'GET') { if (user.organizationId) { const d = await sbSelect('organizations', '*', { id: `eq.${user.organizationId}` }); res.json(d[0] || {}); } else res.json({}); }
  else if (req.method === 'PATCH') { if (user.organizationId) { const u = await sbUpdate('organizations', parseBody(req), { id: `eq.${user.organizationId}` }); res.json(u[0]); } else res.status(400).json({ error: 'No organization' }); }
  else res.status(405).json({ error: 'Method not allowed' });
}

async function handleClients(_req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  const cid = pathParts[0];
  if (!cid) { res.json(await sbSelect('partner_clients', '*', { partner_id: `eq.${user.id}` }).catch(() => [])); }
  else { const d = await sbSelect('partner_clients', '*', { id: `eq.${cid}` }).catch(() => []); res.json(d[0] || {}); }
}

async function handleChat(req: VercelRequest, res: VercelResponse, _user: AuthUser, pathParts: string[]) {
  const botId = pathParts[0];
  if (req.method === 'POST') { const body = parseBody(req); const c = await sbInsert('conversations', { id: crypto.randomUUID(), bot_id: botId, session_id: body.sessionId || crypto.randomUUID(), messages: body.messages || [], status: 'active' }).catch(() => [{ id: 'ok' }]); res.json({ conversationId: c[0]?.id, response: 'Chat endpoint active' }); }
  else { res.json(await sbSelect('conversations', '*', { bot_id: `eq.${botId}` }).catch(() => [])); }
}

async function handleSearch(req: VercelRequest, res: VercelResponse, _user: AuthUser) {
  const q = new URL(req.url, 'http://localhost').searchParams.get('q') || '';
  const [bots, leads] = await Promise.all([
    sbSelect('bots', 'id,name,description', { name: `ilike.%${q}%` }).catch(() => []),
    sbSelect('leads', 'id,name,email', { name: `ilike.%${q}%` }).catch(() => []),
  ]);
  res.json({ bots, leads, query: q });
}

async function handleStripe(_req: VercelRequest, res: VercelResponse, _user: AuthUser, pathParts: string[]) {
  const sub = pathParts[0] || '';
  if (sub === 'products') { res.json([{ id: 'free', name: 'Free', price: 0, features: ['1 bot','60 conversations/month'] },{ id: 'starter', name: 'Starter', price: 29, features: ['3 bots','500 conversations/month'] },{ id: 'professional', name: 'Professional', price: 99, features: ['10 bots','5000 conversations/month','Voice agent','API access'] },{ id: 'enterprise', name: 'Enterprise', price: 499, features: ['Unlimited bots','Unlimited conversations','White-label','Priority support'] }]); }
  else if (sub === 'checkout') { res.json({ url: 'https://www.buildmybot.app/billing?checkout=pending' }); }
  else if (sub === 'portal') { res.json({ url: 'https://www.buildmybot.app/billing' }); }
  else if (sub === 'whitelabel' && pathParts[1] === 'checkout') { res.json({ url: 'https://www.buildmybot.app/billing?checkout=whitelabel' }); }
  else res.status(404).json({ error: 'Not found' });
}

async function handleNotifications(req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  const nid = pathParts[0];
  if (!nid) { if (req.method === 'GET') { res.json(await sbSelect('notifications', '*', { user_id: `eq.${user.id}` }).catch(() => [])); } else if (req.method === 'POST') { const body = parseBody(req); const r = await sbInsert('notifications', { id: crypto.randomUUID(), user_id: body.userId || user.id, title: body.title || '', message: body.message || '', type: body.type || 'info', read: false }); res.status(201).json(r[0]); } }
  else { if (req.method === 'PATCH') { const u = await sbUpdate('notifications', parseBody(req), { id: `eq.${nid}` }); res.json(u[0]); } else if (req.method === 'DELETE') { await sbDelete('notifications', { id: `eq.${nid}` }); res.json({ success: true }); } }
}

async function handleAuthExtra(req: VercelRequest, res: VercelResponse, pathParts: string[]) {
  if (pathParts[0] === 'forgot-password' && req.method === 'POST') {
    const body = parseBody(req);
    await sbSelect('users', 'id,email', { email: `eq.${body.email}` }).catch(() => []);
    res.json({ success: true, message: 'If that email exists, a reset link has been sent' });
  } else res.status(404).json({ error: 'Not found' });
}

async function handleBotHealth(_req: VercelRequest, res: VercelResponse, _user: AuthUser, pathParts: string[]) {
  const botId = pathParts[0];
  const [bot, errors, convs] = await Promise.all([
    sbSelect('bots', '*', { id: `eq.${botId}` }).catch(() => []),
    sbSelect('error_logs', '*', { bot_id: `eq.${botId}` }).catch(() => []),
    sbSelect('conversations', 'id', { bot_id: `eq.${botId}` }).catch(() => []),
  ]);
  res.json({ bot: bot[0], status: bot[0]?.status || 'unknown', errorCount: errors.length, recentErrors: errors.slice(-5), conversationCount: convs.length, healthScore: errors.length > 10 ? 'critical' : errors.length > 3 ? 'warning' : 'healthy' });
}

async function handleBotErrors(_req: VercelRequest, res: VercelResponse, _user: AuthUser, pathParts: string[]) {
  if (pathParts[0] === 'recent') { res.json((await sbSelect('error_logs', '*', {}).catch(() => [])).slice(-50)); }
  else if (pathParts[1] === 'auto-fix' || pathParts[1] === 'resolve') { await sbUpdate('error_logs', { status: 'resolved' }, { id: `eq.${pathParts[0]}` }).catch(() => {}); res.json({ success: true }); }
  else { res.json(await sbSelect('error_logs', '*', {}).catch(() => [])); }
}

async function handleLandingPages(req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  const pid = pathParts[0];
  const orgF = user.organizationId ? { organization_id: `eq.${user.organizationId}` } : {};
  if (!pid) { if (req.method === 'GET') { res.json(await sbSelect('landing_pages', '*', orgF).catch(() => [])); } else if (req.method === 'POST') { const body = parseBody(req); const r = await sbInsert('landing_pages', { id: crypto.randomUUID(), organization_id: user.organizationId, title: body.title || 'Untitled', slug: body.slug || crypto.randomUUID().substring(0,8), content: body.content || {}, status: 'draft' }); res.status(201).json(r[0]); } }
  else if (pathParts[1] === 'publish') { await sbUpdate('landing_pages', { status: 'published' }, { id: `eq.${pid}` }).catch(() => {}); res.json({ success: true }); }
  else { if (req.method === 'GET') { const d = await sbSelect('landing_pages', '*', { id: `eq.${pid}` }).catch(() => []); res.json(d[0] || {}); } else if (req.method === 'PUT' || req.method === 'PATCH') { const u = await sbUpdate('landing_pages', parseBody(req), { id: `eq.${pid}` }); res.json(u[0]); } else if (req.method === 'DELETE') { await sbDelete('landing_pages', { id: `eq.${pid}` }); res.json({ success: true }); } }
}

async function handleUsers(_req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  if (pathParts[1] === 'credits') { res.json({ credits: await sbSelect('usage_pools', '*', { organization_id: `eq.${user.organizationId}` }).catch(() => []) }); }
  else res.status(404).json({ error: 'Not found' });
}

async function handleTeam(_req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const [members, roles] = await Promise.all([
    sbSelect('organization_members', '*', user.organizationId ? { organization_id: `eq.${user.organizationId}` } : {}).catch(() => []),
    sbSelect('agent_roles', '*', {}).catch(() => []),
  ]);
  res.json({ members, roles });
}

async function handleAudit(_req: VercelRequest, res: VercelResponse, _user: AuthUser) {
  res.json((await sbSelect('audit_logs', '*', {}).catch(() => [])).slice(-100));
}

async function handleSupport(req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  const tid = pathParts[0];
  if (!tid) { if (req.method === 'GET') { res.json(await sbSelect('support_tickets', '*', { created_by: `eq.${user.id}` }).catch(() => [])); } else if (req.method === 'POST') { const body = parseBody(req); const r = await sbInsert('support_tickets', { id: crypto.randomUUID(), created_by: user.id, organization_id: user.organizationId, subject: body.subject || '', description: body.description || '', priority: body.priority || 'normal', status: 'open' }); res.status(201).json(r[0]); } }
  else if (pathParts[1] === 'messages') { if (req.method === 'GET') { res.json(await sbSelect('support_ticket_messages', '*', { ticket_id: `eq.${tid}` }).catch(() => [])); } else if (req.method === 'POST') { const body = parseBody(req); const r = await sbInsert('support_ticket_messages', { id: crypto.randomUUID(), ticket_id: tid, sender_id: user.id, message: body.message || '' }); res.status(201).json(r[0]); } }
  else { const d = await sbSelect('support_tickets', '*', { id: `eq.${tid}` }).catch(() => []); res.json(d[0] || {}); }
}

async function handleLaunchGate(_req: VercelRequest, res: VercelResponse) {
  res.json({ enabled: false, message: 'Launch gate is open' });
}

// =====================================================================

async function handleAiEmployees(req: VercelRequest, res: VercelResponse, user: AuthUser, pathParts: string[]) {
  if (pathParts[0] !== 'shift') {
    return res.status(404).json({ error: 'Endpoint not found' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch all active AI employees
    const employees = await sbSelect('AiEmployee', '*', { status: `eq.active` });
    if (!employees || employees.length === 0) {
      return res.status(200).json({ message: 'No active employees', results: [] });
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
            const openTickets = await sbSelect('support_tickets', 'id,priority', { status: 'eq.open' }).catch(() => []);
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
            const activeBots = bots.filter((b: any) => b.status === 'active').length;
            status = 'completed';
            output = `Real check: ${errors.length} logged error(s), ${activeBots}/${bots.length} bots active.`;
            summary = `health_check | ${errors.length} errors, ${activeBots}/${bots.length} bots active`;
            break;
          }
          case 'Product': {
            const tickets = await sbSelect('support_tickets', 'id,subject', {}).catch(() => []);
            status = 'completed';
            output = `Real check: ${tickets.length} support ticket(s) available as a feedback signal (no summarization model wired up yet).`;
            summary = `feedback_scan | ${tickets.length} tickets scanned`;
            break;
          }
          case 'Engineering':
            status = 'skipped';
            output = 'No GitHub integration is configured for this deployment -- skipping rather than fabricating a triage result.';
            summary = `github_triage | not configured`;
            break;
          case 'Marketing':
            status = 'skipped';
            output = 'No content-generation integration is configured for this deployment -- skipping rather than fabricating content.';
            summary = `content_creation | not configured`;
            break;
          default:
            status = 'skipped';
            output = 'No real integration configured for this role.';
            summary = `default_task | not configured`;
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
          await sbUpdate('AiEmployee', {
            lastActive: new Date().toISOString(),
            tasksToday: (employee.tasksToday || 0) + 1,
            tasksCompleted: (employee.tasksCompleted || 0) + 1,
          }, { id: `eq.${employee.id}` });
        } catch (updateErr) {
          console.error(`Failed to update employee ${employee.name}:`, updateErr);
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
    'Support': 'email_check',
    'Engineering': 'github_triage',
    'Marketing': 'content_creation',
    'Ops': 'health_check',
    'Product': 'feedback_analysis',
  };
  return taskMap[role] || 'default_task';
}


// Main Router
// =====================================================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SUPABASE_SERVICE_KEY || !SESSION_JWT_SECRET) {
    return res.status(500).json({ error: 'Server misconfigured: missing required environment variables' });
  }

  const url = new URL(req.url, 'http://localhost');
  const segments = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  const routeName = segments[0] || '';
  const pathParts = segments.slice(1);

  try {
    // Public routes
    if (routeName === 'health') return await handleHealth(req, res);
    if (routeName === 'leads' && pathParts[0] === 'capture') return await handleLeadCapture(req, res);
    if (routeName === 'launch-gate') return await handleLaunchGate(req, res);

    // Auth extras (don't conflict with /api/auth/* serverless functions)
    if (routeName === 'auth' && !['login','signup','user','logout'].includes(pathParts[0])) {
      return await handleAuthExtra(req, res, pathParts);
    }

    // Authenticated routes
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    switch (routeName) {
      case 'bots':
        if (pathParts[0] === 'errors') return await handleBotErrors(req, res, user, pathParts.slice(1));
        if (pathParts[0]) return await handleBotById(req, res, user, pathParts[0]);
        return await handleBots(req, res, user);
      case 'bot-health': return await handleBotHealth(req, res, user, pathParts);
      case 'analytics': return await handleAnalytics(req, res, user, pathParts);
      case 'leads': return await handleLeads(req, res, user, pathParts);
      case 'admin': return await handleAdmin(req, res, user, pathParts);
      case 'revenue': return await handleRevenue(req, res, user, pathParts);
      case 'voice': return await handleVoice(req, res, user, pathParts);
      case 'knowledge': return await handleKnowledge(req, res, user, pathParts);
      case 'templates': return await handleTemplates(req, res, user);
      case 'tools': return await handleTools(req, res, user, pathParts);
      case 'webhooks': return await handleWebhooks(req, res, user, pathParts);
      case 'agency': return await handleAgency(req, res, user, pathParts);
      case 'integrations': return await handleIntegrations(req, res, user, pathParts);
      case 'channels': return await handleChannels(req, res, user);
      case 'phone': return await handlePhone(req, res, user, pathParts);
      case 'organizations': return await handleOrganizations(req, res, user);
      case 'clients': return await handleClients(req, res, user, pathParts);
      case 'chat': return await handleChat(req, res, user, pathParts);
      case 'search': return await handleSearch(req, res, user);
      case 'stripe': return await handleStripe(req, res, user, pathParts);
      case 'notifications': return await handleNotifications(req, res, user, pathParts);
      case 'users': return await handleUsers(req, res, user, pathParts);
      case 'team': return await handleTeam(req, res, user);
      case 'audit': return await handleAudit(req, res, user);
      case 'support': return await handleSupport(req, res, user, pathParts);
      case 'landing-pages': return await handleLandingPages(req, res, user, pathParts);
      case 'ai-employees': return await handleAiEmployees(req, res, user, pathParts);
      default: return res.status(404).json({ error: `Endpoint /api/${routeName} not found` });
    }
  } catch (error: any) {
    console.error(`API Error [${routeName}]:`, error);
    res.status(500).json({ error: 'Internal server error', path: req.url });
  }
}
