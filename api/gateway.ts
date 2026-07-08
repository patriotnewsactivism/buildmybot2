import type { VercelRequest, VercelResponse } from '@vercel/node';

// =====================================================================
// BuildMyBot API Gateway — Vercel Serverless Catch-All
// Replaces the dead Render Express backend
// Uses Supabase REST API for data, JWT cookies for auth
// =====================================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://evkjlnbpntimbxklnhoz.supabase.co';
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
  const orgFilter = user.organizationId
    ? { organization_id: `eq.${user.organizationId}` }
    : {};
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
      persona: body.persona || '',
      identity: body.identity || '',
      tone: body.tone || 'professional',
      behavior: body.behavior || '',
      model: body.model || 'gpt-4o-mini',
      temperature: body.temperature ?? 70,
      max_tokens: body.maxTokens ?? 500,
      voice_enabled: body.voiceEnabled ?? false,
      voice_id: body.voiceId || null,
      status: body.status || 'draft',
      crm_config: body.crmConfig || {},
      marketing_config: body.marketingConfig || {},
      config: body.config || {},
    });
    res.status(201).json(newBot[0]);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleBotById(
  req: VercelRequest,
  res: VercelResponse,
  _user: AuthUser,
  botId: string,
) {
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
  const orgFilter = user.organizationId
    ? { organization_id: `eq.${user.organizationId}` }
    : {};

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
  const orgFilter = user.organizationId
    ? { organization_id: `eq.${user.organizationId}` }
    : {};

  if (leadId) {
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
    const filter = { id: `eq.${leadId}` };
    if (req.method === 'GET') {
      const l = await sbSelect('leads', '*', filter);
      res.json(l[0] || { error: 'Not found' });
    } else if (req.method === 'PATCH') {
      const u = await sbUpdate('leads', parseBody(req), filter);
      res.json(u[0]);
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
      organization_id: user.organizationId || body.organizationId,
      bot_id: body.botId || null,
      name: body.name || '',
      email: body.email || '',
      phone: body.phone || '',
      status: body.status || 'new',
      score: body.score || 0,
      source: body.source || 'website',
      notes: body.notes || '',
      metadata: body.metadata || {},
    });
    res.status(201).json(r[0]);
  } else res.status(405).json({ error: 'Method not allowed' });
}

async function handleLeadCapture(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });
  const body = parseBody(req);
  const r = await sbInsert('leads', {
    id: crypto.randomUUID(),
    organization_id: body.organizationId || null,
    bot_id: body.botId || null,
    name: body.name || '',
    email: body.email || '',
    phone: body.phone || '',
    status: 'new',
    score: 50,
    source: body.source || 'chat_widget',
    notes: body.message || '',
    metadata: { conversationId: body.conversationId, page: body.page },
  }).catch(() => [{ id: 'ok', success: true }]);
  res.status(201).json({ success: true, leadId: r[0]?.id });
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
  if (!['admin', 'ADMIN', 'owner', 'OWNER'].includes(user.role))
    return res.status(403).json({ error: 'Admin access required' });
  const sub = pathParts[0] || '';

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
      const orgs = await sbSelect('organizations', 'id,plan,is_active', {}).catch(
        () => [],
      );
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
        message: 'No billing provider connected yet -- churn/churned figures are not tracked until Stripe is wired up.',
      });
    } else if (fsub === 'invoices') {
      res.json([]);
    } else if (fsub === 'refunds') {
      res.json([]);
    } else if (fsub === 'stripe-health') {
      // FinancialDashboard.tsx reads `stripeHealth?.ok` -- include both keys
      // for compatibility.
      res.json({ ok: false, connected: false, message: 'Stripe is not connected' });
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
  const isAdmin = ['admin', 'ADMIN', 'owner', 'OWNER'].includes(user.role);

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
      const f = user.organizationId
        ? { organization_id: `eq.${user.organizationId}` }
        : {};
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

async function handleKnowledge(
  req: VercelRequest,
  res: VercelResponse,
  _user: AuthUser,
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
      res.json(
        await sbSelect(
          'knowledge_sources',
          '*',
          botId ? { bot_id: `eq.${botId}` } : {},
        ).catch(() => []),
      );
    } else if (req.method === 'POST') {
      const body = parseBody(req);
      const r = await sbInsert('knowledge_sources', {
        id: crypto.randomUUID(),
        bot_id: botId,
        type: body.type || 'website',
        title: body.title || '',
        url: body.url || '',
        content: body.content || '',
        status: 'active',
      });
      res.status(201).json(r[0]);
    }
  } else if (sub === 'scrape') {
    const botId = pathParts[1];
    const body = parseBody(req);
    const r = await sbInsert('knowledge_sources', {
      id: crypto.randomUUID(),
      bot_id: botId,
      type: 'website',
      title: body.url || 'Scraped content',
      url: body.url || '',
      content: '',
      status: 'scraping',
    }).catch(() => [{ id: 'ok', success: true }]);
    res.status(201).json(r[0]);
  } else if (sub === 'upload') {
    const botId = pathParts[1];
    const body = parseBody(req);
    const r = await sbInsert('knowledge_sources', {
      id: crypto.randomUUID(),
      bot_id: botId,
      type: 'file',
      title: body.filename || 'Uploaded document',
      content: body.content || '',
      status: 'active',
    }).catch(() => [{ id: 'ok', success: true }]);
    res.status(201).json(r[0]);
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
    res.json(d[0] || {});
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
      name: tpl.name + ' (Copy)',
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
  const orgF = user.organizationId
    ? { organization_id: `eq.${user.organizationId}` }
    : {};
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
    await sbSelect(
      'bots',
      'id,name,config',
      user.organizationId
        ? { organization_id: `eq.${user.organizationId}` }
        : {},
    ).catch(() => []),
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
      await sbSelect(
        'phone_numbers',
        '*',
        user.organizationId
          ? { organization_id: `eq.${user.organizationId}` }
          : {},
      ).catch(() => []),
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
    const orgFilter = user.organizationId
      ? { organization_id: `eq.${user.organizationId}` }
      : {};
    res.json(await sbSelect('bots', '*', orgFilter).catch(() => []));
  } else if (cid === 'leads') {
    // dbService.getLeads() / subscribeToLeads() call GET /api/clients/leads
    // expecting an array of leads -- same route-collision bug as "bots"
    // above: this used to fall through to the client-by-id branch, treating
    // "leads" as a client id, returning `{}` and crashing ClientOverview /
    // any consumer that reads array-shaped fields off the result.
    const orgFilter = user.organizationId
      ? { organization_id: `eq.${user.organizationId}` }
      : {};
    res.json(await sbSelect('leads', '*', orgFilter).catch(() => []));
  } else if (cid === 'analytics' && pathParts[1] === 'dashboard') {
    // AdvancedAnalytics (currentView === 'analytics' in App.tsx) fetches
    // /clients/analytics/dashboard expecting {metrics, timeSeriesData, ...}.
    // This used to fall through to the client-by-id branch (treating
    // "analytics" as a client id) and return `{}`, crashing on
    // `data.metrics.totalConversations`.
    const orgFilter = user.organizationId
      ? { organization_id: `eq.${user.organizationId}` }
      : {};
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

    const days: { date: string; conversations: number; visitors: number; leads: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      days.push({
        date: day,
        conversations: convs.filter((c: any) => c.created_at?.startsWith(day)).length,
        visitors: 0,
        leads: leads.filter((l: any) => l.created_at?.startsWith(day)).length,
      });
    }

    const sourceCounts: Record<string, number> = {};
    for (const l of leads as any[]) {
      const src = l.source_url ? new URL(l.source_url, 'http://x').hostname || 'direct' : 'direct';
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
      leadsBySource: Object.entries(sourceCounts).map(([source, leadsCount]) => ({
        source,
        leads: leadsCount,
      })),
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

async function handleChat(
  req: VercelRequest,
  res: VercelResponse,
  _user: AuthUser,
  pathParts: string[],
) {
  const botId = pathParts[0];
  if (req.method === 'POST') {
    const body = parseBody(req);
    const c = await sbInsert('conversations', {
      id: crypto.randomUUID(),
      bot_id: botId,
      session_id: body.sessionId || crypto.randomUUID(),
      messages: body.messages || [],
      status: 'active',
    }).catch(() => [{ id: 'ok' }]);
    res.json({ conversationId: c[0]?.id, response: 'Chat endpoint active' });
  } else {
    res.json(
      await sbSelect('conversations', '*', { bot_id: `eq.${botId}` }).catch(
        () => [],
      ),
    );
  }
}

async function handleSearch(
  req: VercelRequest,
  res: VercelResponse,
  _user: AuthUser,
) {
  const q = new URL(req.url, 'http://localhost').searchParams.get('q') || '';
  const [bots, leads] = await Promise.all([
    sbSelect('bots', 'id,name,description', { name: `ilike.%${q}%` }).catch(
      () => [],
    ),
    sbSelect('leads', 'id,name,email', { name: `ilike.%${q}%` }).catch(
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
  const auth = 'Basic ' + Buffer.from(`${STRIPE_SECRET_KEY}:`).toString('base64');
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
      return res.status(502).json({ error: 'Failed to load products', details: err.message });
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
          ? { subscription_data: { metadata: { userId, organizationId: organizationId || user?.organizationId || '' } } }
          : {}),
      });
      return res.json({ url: session.url });
    } catch (err: any) {
      console.error('[stripe] checkout failed:', err.message);
      return res.status(502).json({ error: 'Checkout failed', details: err.message });
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
      return res.status(502).json({ error: 'Failed to open billing portal', details: err.message });
    }
  }

  if (sub === 'whitelabel' && pathParts[1] === 'checkout' && req.method === 'POST') {
    const body = parseBody(req) || {};
    const userId = body.userId || user?.id;
    const whitelabelPriceId = process.env.STRIPE_WHITELABEL_PRICE_ID;
    if (!whitelabelPriceId) {
      return res.status(500).json({ error: 'STRIPE_WHITELABEL_PRICE_ID not configured' });
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
      return res.status(502).json({ error: 'Checkout failed', details: err.message });
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
        priority: n.type === 'urgent' ? 'urgent' : n.type === 'warning' ? 'high' : 'normal',
        createdAt: n.created_at,
        receipt: {
          viewedAt: n.read ? n.updated_at || n.created_at : null,
          acknowledgedAt: n.read ? n.updated_at || n.created_at : null,
        },
      }));
      const unread = mapped.filter((n) => !n.receipt.viewedAt);
      res.json({ unread, recent: mapped.slice(0, 20), unreadCount: unread.length });
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
  _user: AuthUser,
  pathParts: string[],
) {
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
  const orgF = user.organizationId
    ? { organization_id: `eq.${user.organizationId}` }
    : {};
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
    sbSelect(
      'organization_members',
      '*',
      user.organizationId
        ? { organization_id: `eq.${user.organizationId}` }
        : {},
    ).catch(() => []),
    sbSelect('agent_roles', '*', {}).catch(() => []),
  ]);
  res.json({ members, roles });
}

async function handleAudit(
  _req: VercelRequest,
  res: VercelResponse,
  _user: AuthUser,
) {
  res.json((await sbSelect('audit_logs', '*', {}).catch(() => [])).slice(-100));
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
    if (!['admin', 'ADMIN', 'owner', 'OWNER'].includes(user.role))
      return res.status(403).json({ error: 'Admin access required' });
    const employees = await sbSelect(
      'AiEmployee',
      'id,name,role,title,email,"reportsTo",status,"lastActive","tasksToday","tasksCompleted"',
    ).catch(() => []);
    return res.json(employees);
  }

  if (sub === 'logs' && req.method === 'GET') {
    if (!['admin', 'ADMIN', 'owner', 'OWNER'].includes(user.role))
      return res.status(403).json({ error: 'Admin access required' });
    const limitParam = Number((req.query?.limit as string) || 30);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 200)
      : 30;
    const logs = await sbSelect(
      'EmployeeLog',
      '*',
      { order: 'createdAt.desc', limit: String(limit) },
    ).catch(() => []);
    return res.json(logs);
  }

  if (sub === 'escalations' && req.method === 'GET') {
    if (!['admin', 'ADMIN', 'owner', 'OWNER'].includes(user.role))
      return res.status(403).json({ error: 'Admin access required' });
    const escalations = await sbSelect(
      'escalations',
      '*',
      { order: 'created_at.desc', limit: '50' },
    ).catch(() => []);
    return res.json(escalations);
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
      status: `eq.active`,
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
          case 'Engineering':
            status = 'skipped';
            output =
              'No GitHub integration is configured for this deployment -- skipping rather than fabricating a triage result.';
            summary = `github_triage | not configured`;
            break;
          case 'Marketing':
            status = 'skipped';
            output =
              'No content-generation integration is configured for this deployment -- skipping rather than fabricating content.';
            summary = `content_creation | not configured`;
            break;
          case 'Billing': {
            if (!process.env.STRIPE_SECRET_KEY) {
              status = 'skipped';
              output = 'STRIPE_SECRET_KEY not configured -- skipping rather than fabricating billing numbers.';
              summary = `billing_report | not configured`;
              break;
            }
            const Stripe = (await import('stripe')).default;
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-08-27.basil' as any });
            const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
            const soon = Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000);
            const [charges, activeSubs, pastDueSubs] = await Promise.all([
              stripe.charges.list({ created: { gte: since }, limit: 100 }),
              stripe.subscriptions.list({ status: 'active', limit: 100 }),
              stripe.subscriptions.list({ status: 'past_due', limit: 100 }),
            ]);
            const failed = charges.data.filter((c) => !c.paid || c.status === 'failed');
            const succeeded = charges.data.filter((c) => c.paid && c.status === 'succeeded');
            const revenue = succeeded.reduce((s, c) => s + c.amount, 0) / 100;
            const renewalsSoon = activeSubs.data.filter(
              (s) => s.current_period_end && s.current_period_end <= soon,
            ).length;
            status = 'completed';
            output = `Real check: $${revenue.toFixed(2)} revenue / ${charges.data.length} charges in last 24h, ${failed.length} failed, ${pastDueSubs.data.length} past-due subs, ${renewalsSoon} renewing in next 7 days.`;
            summary = `billing_report | $${revenue.toFixed(2)} revenue, ${failed.length} failed, ${pastDueSubs.data.length} past-due`;
            break;
          }
          case 'Manager': {
            const recentLogs = await sbSelect('EmployeeLog', 'role,status', {
              order: 'createdAt.desc',
              limit: '50',
            }).catch(() => []);
            const completed = recentLogs.filter((l: any) => l.status === 'completed').length;
            const failed = recentLogs.filter((l: any) => l.status === 'failed').length;
            const skipped = recentLogs.filter((l: any) => l.status === 'skipped').length;
            status = 'completed';
            output = `Real check across last ${recentLogs.length} team log entries: ${completed} completed, ${failed} failed, ${skipped} skipped (no integration configured).`;
            summary = `team_rollup | ${completed} completed, ${failed} failed, ${skipped} skipped`;
            break;
          }
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
const OPENAI_BASE =
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1';

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
      'You are Sam Rivera, Customer Support Lead at BuildMyBot (buildmybot.app). You monitor support@buildmybot.app. Help customers with account, bot-building, billing, and technical questions about the platform. Plans: Free $0, Starter $29/mo, Professional $99/mo, Enterprise $499/mo. Never promise refunds, credits, or legal outcomes — escalate those. Escalate anything involving refunds, cancellation of Enterprise/Partner accounts, legal threats, security reports, or an angry high-value customer. Be warm, clear, and solution-first.',
  },
  {
    id: 'vera-sales',
    name: 'Vera Cross',
    role: 'Sales',
    title: 'Vice President of Sales',
    email: `sales@${EMAIL_DOMAIN}`,
    reportsTo: PRESIDENT_EMAIL,
    systemPrompt:
      'You are Vera Cross, Vice President of Sales at BuildMyBot (buildmybot.app). You monitor sales@buildmybot.app and own the revenue pipeline. Plans: Free $0, Starter $29/mo, Professional $99/mo, Enterprise $499/mo. Partner Access: $499/mo for a 50% revenue split on new accounts. Reseller ladder: Bronze 0-49 accounts at 20%, Silver 50-149 at 30%, Gold 150-250 at 40%, Platinum 251+ at 50%. Qualify leads, answer pricing questions, and drive to a close or a demo. Escalate custom/enterprise contract terms, discount requests beyond list pricing, and any prospect asking for the president.',
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
      'You are Brianna Cole, Billing Lead at BuildMyBot (buildmybot.app). You monitor billing@buildmybot.app. Handle invoice questions, payment failures, refund requests, plan changes, and subscription/cancellation questions. Plans: Free $0, Starter $29/mo, Professional $99/mo, Enterprise $499/mo, Partner Access $499/mo (50% revenue split). Never promise a refund, credit, or chargeback reversal yourself — collect the details and escalate. Escalate refund requests, disputed charges, cancellation of Enterprise/Partner accounts, and anything that smells like fraud. Be precise with numbers and calm with frustrated customers.',
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
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
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

You are handling an inbound email. Respond ONLY with a JSON object:
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
  const crypto = await import('crypto');
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
    const raw: Buffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(String(req.body || ''), 'utf-8');
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

  const send = await sendEmail({
    from: employee.email,
    fromName: `${employee.name} (BuildMyBot)`,
    to: from,
    subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
    text: decision.reply,
  });

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
        ? 'replied'
        : send.reason === 'no_transport'
          ? 'no_transport'
          : 'send_failed',
      provider_message_id: send.providerId || null,
    });
  } catch {
    /* logged via EmployeeLog below */
  }
  if (inboundId) {
    try {
      await sbUpdate(
        'email_messages',
        { status: send.sent ? 'replied' : 'send_failed' },
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
      text: `Escalated by: ${employee.name} (${employee.title})\nFrom: ${from}\nReason: ${decision.escalationReason}\n\n--- Original message ---\n${text}\n\n--- Reply already sent ---\n${decision.reply}`,
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
      ? `Replied to ${from}. Escalated: ${escalated}.`
      : `Drafted a reply to ${from} but sending failed (${send.reason}). Escalated: ${escalated}.`,
    summary: `email_reply | ${subject}`,
    metadata: {
      escalated,
      priority: decision.priority,
      notified: decision.notify,
    },
  });

  return res.json({
    handled: true,
    replySent: send.sent,
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
  if (!['admin', 'ADMIN', 'owner', 'OWNER'].includes(user.role)) {
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

// Main Router
// =====================================================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SUPABASE_SERVICE_KEY || !SESSION_JWT_SECRET) {
    return res
      .status(500)
      .json({
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
      case 'chat':
        return await handleChat(req, res, user, pathParts);
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
    res.status(500).json({ error: 'Internal server error', path: req.url });
  }
}
