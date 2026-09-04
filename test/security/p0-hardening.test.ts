/**
 * P0 security hardening regression tests.
 *
 * Each block maps to one of the required acceptance tests:
 *   1. Tenant B cannot access/change/delete ANY Tenant A resource.
 *   2. OWNER gets 403 on platform-admin routes.
 *   3. No payment = no voice entitlement and no wallet credit.
 *   4. Duplicate Stripe events = exactly one financial effect.
 *   5. localhost / private / metadata SSRF attempts are blocked.
 *
 * Style follows test/api/gateway.test.ts: call the real exported handler with
 * mocked env + a mocked Supabase REST fetch, so the assertions exercise the
 * production code path rather than a re-implementation of it.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_SECRET = 'test-session-secret';

process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SESSION_JWT_SECRET = SESSION_SECRET;
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

const gateway = await import('../../api/gateway.ts');
const stripeWebhookHandler = (await import('../../api/stripe-webhook.ts'))
  .default;
const handler = gateway.default;
const { isPlatformAdmin, isTenantOwner } = await import(
  '../../api/security/authz.ts'
);
const { assertSafeOutboundUrl, isBlockedIp, SsrfBlockedError } = await import(
  '../../api/security/ssrf.ts'
);

// ── harness ────────────────────────────────────────────────────────────
function mockRes(): any {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as any,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
      return this;
    },
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(p: unknown) {
      this.body = p;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

function mockReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'GET',
    url: '/api/health',
    headers: {},
    body: {},
    ...overrides,
  } as VercelRequest;
}

async function signToken(payload: Record<string, unknown>): Promise<string> {
  const crypto = await import('node:crypto');
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

/** Tenant A owns bot-a / lead-a / webhook-a; tenant B is the attacker. */
const TENANT_A_ROW = {
  id: 'user-a',
  email: 'a@tenant-a.com',
  role: 'OWNER',
  organization_id: 'org-a',
  plan: 'PROFESSIONAL',
  status: 'Active',
};
const TENANT_B_ROW = {
  id: 'user-b',
  email: 'b@tenant-b.com',
  role: 'OWNER',
  organization_id: 'org-b',
  plan: 'PROFESSIONAL',
  status: 'Active',
};

interface Call {
  url: string;
  method: string;
  body?: string;
}

/**
 * A tiny fake of Supabase's REST API that ACTUALLY APPLIES the filters in the
 * query string. That is the whole point: a handler that forgets to scope by
 * tenant will get tenant A's row back here, exactly as it would in prod.
 */
function mockSupabase(rows: Record<string, any[]>, sessionUser: any) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: any = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ url: String(url), method, body: init.body });
    const u = new URL(String(url));
    const table = u.pathname.replace('/rest/v1/', '');
    let data = [...(rows[table] || [])];

    // users lookups during getAuthUser must return the session user
    if (table === 'users' && u.searchParams.get('id')?.startsWith('eq.')) {
      const id = u.searchParams.get('id')!.slice(3);
      data = id === sessionUser.id ? [sessionUser] : [];
      return { ok: true, status: 200, json: async () => data };
    }

    for (const [key, raw] of u.searchParams.entries()) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(key)) continue;
      if (raw.startsWith('eq.')) {
        const want = raw.slice(3);
        data = data.filter((r) => String(r[key]) === want);
      } else if (raw.startsWith('in.')) {
        const set = new Set(
          raw.slice(3).replace(/^\(|\)$/g, '').split(',').filter(Boolean),
        );
        data = data.filter((r) => set.has(String(r[key])));
      } else if (raw === 'is.null') {
        data = data.filter((r) => r[key] == null);
      }
    }
    return { ok: true, status: 200, json: async () => data };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

const DB = {
  bots: [
    {
      id: 'bot-a',
      user_id: 'user-a',
      organization_id: 'org-a',
      name: 'Tenant A bot',
      system_prompt: 'secret prompt',
    },
  ],
  leads: [
    {
      id: 'lead-a',
      user_id: 'user-a',
      organization_id: 'org-a',
      email: 'private@tenant-a.com',
    },
  ],
  webhooks: [
    {
      id: 'wh-a',
      organization_id: 'org-a',
      url: 'https://tenant-a.example.com/hook',
      secret: 'tenant-a-signing-secret',
    },
  ],
  bot_tools: [{ id: 'tool-a', bot_id: 'bot-a', name: 'Tenant A tool' }],
  knowledge_sources: [
    { id: 'ks-a', bot_id: 'bot-a', source_name: 'Tenant A KB', status: 'ready' },
  ],
  landing_pages: [
    { id: 'lp-a', organization_id: 'org-a', title: 'Tenant A page' },
  ],
  support_tickets: [
    { id: 'tkt-a', user_id: 'user-a', organization_id: 'org-a', subject: 'A' },
  ],
  api_keys: [{ id: 'key-a', organization_id: 'org-a', status: 'active' }],
  voice_agents: [
    { id: 'va-a', bot_id: 'bot-a', organization_id: 'org-a', minutes_limit: 100 },
  ],
  usage_pools: [{ id: 'pool-a', organization_id: 'org-a', total_credits: 500 }],
  usage_ledger: [],
  organization_branding: [{ organization_id: 'org-a', primary_color: '#a' }],
  conversations: [],
  partner_clients: [{ id: 'pc-a', partner_id: 'user-a', name: 'A client' }],
  notifications: [{ id: 'ntf-a', created_by: 'user-a', title: 'A' }],
};

async function asTenantB(
  url: string,
  method = 'GET',
  body: any = {},
): Promise<any> {
  const token = await signToken({
    sub: 'user-b',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  mockSupabase(DB, TENANT_B_ROW);
  const req = mockReq({
    url,
    method,
    body,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  const res = mockRes();
  await handler(req, res);
  return res;
}

afterEach(() => vi.unstubAllGlobals());

// ── 1. cross-tenant IDOR ───────────────────────────────────────────────
describe('Tenant B cannot access, change or delete Tenant A resources', () => {
  const readCases: [string, string][] = [
    ['bot', '/api/bots/bot-a'],
    ['lead', '/api/leads/lead-a'],
    ['lead timeline', '/api/leads/lead-a/timeline'],
    ['webhook (incl. signing secret)', '/api/webhooks/wh-a'],
    ['webhook logs', '/api/webhooks/wh-a/logs'],
    ['tool', '/api/tools/tool-a'],
    ['tool stats', '/api/tools/tool-a/stats'],
    ['knowledge sources by bot', '/api/knowledge/sources/bot-a'],
    ['knowledge preview', '/api/knowledge/preview/ks-a'],
    ['landing page', '/api/landing-pages/lp-a'],
    ['support ticket', '/api/support/tkt-a'],
    ['support ticket messages', '/api/support/tkt-a/messages'],
    ['bot health', '/api/bot-health/bot-a'],
    ['voice agent', '/api/voice/agents/bot-a'],
    ['partner client', '/api/clients/pc-a'],
    ['api keys of another org', '/api/revenue/api-keys/org-a'],
    ['api key logs', '/api/revenue/api-keys/key-a/logs'],
    ['branding of another org', '/api/revenue/branding/org-a'],
    ['usage/credits of another org', '/api/revenue/usage/org-a'],
    ['analytics of another org', '/api/analytics/leads/org-a'],
  ];

  for (const [label, url] of readCases) {
    it(`denies reading Tenant A's ${label}`, async () => {
      const res = await asTenantB(url);
      expect([403, 404]).toContain(res.statusCode);
      const serialized = JSON.stringify(res.body ?? {});
      expect(serialized).not.toContain('tenant-a-signing-secret');
      expect(serialized).not.toContain('private@tenant-a.com');
      expect(serialized).not.toContain('secret prompt');
      expect(serialized).not.toContain('Tenant A');
    });
  }

  const writeCases: [string, string, string, any][] = [
    ['update a bot', '/api/bots/bot-a', 'PATCH', { name: 'pwned' }],
    ['delete a bot', '/api/bots/bot-a', 'DELETE', {}],
    ['update a lead', '/api/leads/lead-a', 'PATCH', { status: 'pwned' }],
    ['delete a lead', '/api/leads/lead-a', 'DELETE', {}],
    ['log CRM email on a lead', '/api/leads/lead-a/email', 'POST', { subject: 'x' }],
    ['repoint a webhook', '/api/webhooks/wh-a', 'PATCH', { url: 'https://evil.example.com' }],
    ['delete a webhook', '/api/webhooks/wh-a', 'DELETE', {}],
    ['trigger a webhook test', '/api/webhooks/wh-a/test', 'POST', {}],
    ['toggle a tool', '/api/tools/tool-a/toggle', 'POST', { active: false }],
    ['refresh a knowledge source', '/api/knowledge/refresh/ks-a', 'POST', {}],
    ['add a knowledge source to another bot', '/api/knowledge/sources/bot-a', 'POST', { title: 'x' }],
    ['scrape into another tenant bot', '/api/knowledge/scrape/bot-a', 'POST', { url: 'https://example.com' }],
    ['publish a landing page', '/api/landing-pages/lp-a/publish', 'POST', {}],
    ['delete a landing page', '/api/landing-pages/lp-a', 'DELETE', {}],
    ['post into a support thread', '/api/support/tkt-a/messages', 'POST', { message: 'x' }],
    ['revoke an API key', '/api/revenue/api-keys/key-a/revoke', 'POST', {}],
    ['overwrite branding', '/api/revenue/branding/org-a', 'POST', { primary_color: '#evil' }],
    ['patch a voice agent', '/api/voice/agents/bot-a', 'PATCH', { greeting: 'pwned' }],
    ['delete a voice agent', '/api/voice/agents/bot-a', 'DELETE', {}],
    ['delete a notification', '/api/notifications/ntf-a', 'DELETE', {}],
  ];

  for (const [label, url, method, body] of writeCases) {
    it(`denies attempting to ${label} in Tenant A`, async () => {
      const { calls } = (() => {
        const token = signToken({
          sub: 'user-b',
          exp: Math.floor(Date.now() / 1000) + 3600,
        });
        return { token, calls: [] as Call[] };
      })();
      void calls;
      const res = await asTenantB(url, method, body);
      expect([403, 404]).toContain(res.statusCode);
    });
  }

  it('never writes a mutation to a Tenant A row when Tenant B asks', async () => {
    const token = await signToken({
      sub: 'user-b',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const { calls } = mockSupabase(DB, TENANT_B_ROW);
    const req = mockReq({
      url: '/api/bots/bot-a',
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    await handler(req, mockRes());
    const destructive = calls.filter(
      (c) => c.method === 'DELETE' || c.method === 'PATCH',
    );
    for (const call of destructive) {
      // Any mutation that did go out must have been scoped to org-b.
      expect(call.url).toMatch(/org-b|user-b/);
    }
  });

  it('a tenant cannot plant a row inside another organization via body.organizationId', async () => {
    const token = await signToken({
      sub: 'user-b',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const { calls } = mockSupabase({ ...DB, bots: [] }, TENANT_B_ROW);
    const req = mockReq({
      url: '/api/bots',
      method: 'POST',
      body: { name: 'x', organizationId: 'org-a' },
      headers: { authorization: `Bearer ${token}` },
    });
    await handler(req, mockRes());
    const insert = calls.find(
      (c) => c.method === 'POST' && c.url.includes('/rest/v1/bots'),
    );
    if (insert?.body) {
      expect(JSON.parse(insert.body).organization_id).toBe('org-b');
    }
  });
});

// ── 2. OWNER is not a platform admin ───────────────────────────────────
describe('OWNER is a customer role, never a platform admin', () => {
  it('classifies roles correctly', () => {
    expect(isPlatformAdmin({ role: 'OWNER' })).toBe(false);
    expect(isPlatformAdmin({ role: 'owner' })).toBe(false);
    expect(isPlatformAdmin({ role: 'Owner' })).toBe(false);
    expect(isPlatformAdmin({ role: 'user' })).toBe(false);
    expect(isPlatformAdmin({ role: 'reseller' })).toBe(false);
    expect(isPlatformAdmin({ role: 'ADMIN' })).toBe(true);
    expect(isPlatformAdmin({ role: 'admin' })).toBe(true);
    expect(isPlatformAdmin({ role: 'MasterAdmin' })).toBe(true);
    expect(isPlatformAdmin({ role: 'MASTER_ADMIN' })).toBe(true);
    // OWNER still owns their own tenant.
    expect(isTenantOwner({ role: 'OWNER' })).toBe(true);
  });

  const adminRoutes = [
    '/api/admin/users',
    '/api/admin/stats',
    '/api/bots/errors/recent',
    '/api/ai-employees',
    '/api/email/roster',
  ];

  for (const url of adminRoutes) {
    it(`returns 403 for an OWNER on ${url}`, async () => {
      const res = await asTenantB(url);
      expect(res.statusCode).toBe(403);
    });
  }

  it('a real ADMIN is still allowed through the same gate', async () => {
    const token = await signToken({
      sub: 'staff-1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    mockSupabase(DB, {
      id: 'staff-1',
      email: 'staff@buildmybot.app',
      role: 'ADMIN',
      organization_id: null,
      plan: 'ENTERPRISE',
      status: 'Active',
    });
    const req = mockReq({
      url: '/api/admin/users',
      headers: { authorization: `Bearer ${token}` },
    });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).not.toBe(403);
  });
});

// ── 3. no payment = no entitlement / no credit ─────────────────────────
describe('No payment means no entitlement and no wallet credit', () => {
  it('POST /api/phone/voice-plan no longer grants a voice plan (402)', async () => {
    const token = await signToken({
      sub: 'user-b',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const { calls } = mockSupabase(DB, TENANT_B_ROW);
    const req = mockReq({
      url: '/api/phone/voice-plan',
      method: 'POST',
      body: { voicePlan: 'VOICE_STANDARD' },
      headers: { authorization: `Bearer ${token}` },
    });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(402);
    // and crucially: users.voice_plan was never written
    const wrote = calls.some(
      (c) => c.method === 'PATCH' && (c.body || '').includes('voice_plan'),
    );
    expect(wrote).toBe(false);
  });

  it('POST /api/agency/wallet/recharge no longer mints credit (402)', async () => {
    const token = await signToken({
      sub: 'user-b',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const { calls } = mockSupabase(DB, TENANT_B_ROW);
    const req = mockReq({
      url: '/api/agency/wallet/recharge',
      method: 'POST',
      body: { amount: 1000000 },
      headers: { authorization: `Bearer ${token}` },
    });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(402);
    const credited = calls.some(
      (c) => c.method === 'POST' && c.url.includes('usage_ledger'),
    );
    expect(credited).toBe(false);
  });

  it('auto-recharge is disabled on the same terms', async () => {
    const res = await asTenantB('/api/agency/wallet/auto-recharge', 'POST', {
      amount: 500,
    });
    expect(res.statusCode).toBe(402);
  });

  it('Stripe checkout ignores a client-supplied userId/organizationId', async () => {
    const token = await signToken({
      sub: 'user-b',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const stripeCalls: Call[] = [];
    const base = mockSupabase(DB, TENANT_B_ROW).fetchMock;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any = {}) => {
        if (String(url).startsWith('https://api.stripe.com')) {
          stripeCalls.push({
            url: String(url),
            method: init.method || 'GET',
            body: init.body,
          });
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'cus_fake',
              url: 'https://checkout.stripe.com/x',
            }),
          };
        }
        return base(url, init);
      }),
    );
    const req = mockReq({
      url: '/api/stripe/checkout',
      method: 'POST',
      body: {
        priceId: 'price_123',
        userId: 'user-a', // attacker: charge/attribute to another account
        organizationId: 'org-a',
        metadata: { minutes: '999999', credits: '999999' },
      },
      headers: { authorization: `Bearer ${token}` },
    });
    await handler(req, mockRes());
    const sessionCall = stripeCalls.find((c) =>
      c.url.includes('/checkout/sessions'),
    );
    expect(sessionCall).toBeTruthy();
    const params = new URLSearchParams(String(sessionCall!.body));
    expect(params.get('metadata[userId]')).toBe('user-b');
    expect(params.get('metadata[organizationId]')).toBe('org-b');
    // injected quantity metadata must not have survived
    expect(params.get('metadata[minutes]')).toBeNull();
    expect(params.get('metadata[credits]')).toBeNull();
  });
});

// ── 4. Stripe webhook: signature, raw body, idempotency ────────────────
describe('Stripe webhook: verified, raw-body safe and exactly-once', () => {
  const WEBHOOK_SECRET = 'whsec_test_secret';

  async function postEvent(
    event: any,
    opts: { signed?: boolean; claimed?: Set<string> } = {},
  ) {
    const crypto = await import('node:crypto');
    const raw = Buffer.from(JSON.stringify(event));
    const ts = Math.floor(Date.now() / 1000);
    const sig =
      opts.signed === false
        ? 'v1=deadbeef'
        : `v1=${crypto
            .createHmac('sha256', WEBHOOK_SECRET)
            .update(`${ts}.${raw.toString('utf8')}`, 'utf8')
            .digest('hex')}`;

    const claimed = opts.claimed ?? new Set<string>();
    const effects: Call[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any = {}) => {
        const method = (init.method || 'GET').toUpperCase();
        const s = String(url);
        if (s.includes('stripe_webhook_events') && method === 'POST') {
          const id = JSON.parse(init.body).event_id;
          if (claimed.has(id)) {
            return {
              ok: false,
              status: 409,
              text: async () => 'duplicate key value violates unique constraint',
              json: async () => ({}),
            };
          }
          claimed.add(id);
          return { ok: true, status: 201, json: async () => [{ event_id: id }] };
        }
        if (!s.includes('stripe_webhook_events') && method !== 'GET') {
          effects.push({ url: s, method, body: init.body });
        }
        return { ok: true, status: 200, json: async () => [], text: async () => '' };
      }),
    );

    const req: any = {
      method: 'POST',
      headers: { 'stripe-signature': `t=${ts},${sig}` },
      // Cloud Run/Express hands the handler the captured raw bytes:
      rawBody: raw,
    };
    const res = mockRes();
    await stripeWebhookHandler(req, res);
    return { res, effects, claimed };
  }

  const paidCheckout = {
    id: 'evt_paid_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_1',
        mode: 'payment',
        payment_status: 'paid',
        metadata: {
          type: 'voice_minutes',
          organizationId: 'org-a',
          minutes: '500',
        },
      },
    },
  };

  it('rejects an event with an invalid signature', async () => {
    const { res, effects } = await postEvent(paidCheckout, { signed: false });
    expect(res.statusCode).toBe(400);
    expect(effects).toHaveLength(0);
  });

  it('rejects when the raw body was not preserved (Cloud Run regression guard)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })),
    );
    const req: any = {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=x' },
      body: {}, // parsed object, no raw bytes
      complete: true,
    };
    const res = mockRes();
    await stripeWebhookHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('applies a valid event exactly once, and ignores the retry', async () => {
    const claimed = new Set<string>();
    const first = await postEvent(paidCheckout, { claimed });
    expect(first.res.statusCode).toBe(200);
    const firstEffects = first.effects.length;
    expect(firstEffects).toBeGreaterThan(0); // credit was applied once

    const second = await postEvent(paidCheckout, { claimed });
    expect(second.res.statusCode).toBe(200);
    expect(second.res.body).toMatchObject({ duplicate: true });
    expect(second.effects).toHaveLength(0); // no second financial effect
  });

  it('does not credit an unpaid checkout session', async () => {
    const { res, effects } = await postEvent({
      ...paidCheckout,
      id: 'evt_unpaid_1',
      data: {
        object: {
          ...paidCheckout.data.object,
          payment_status: 'unpaid',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(effects).toHaveLength(0);
  });
});

// ── 5. SSRF ────────────────────────────────────────────────────────────
describe('SSRF protection on customer-controlled outbound URLs', () => {
  const blockedUrls = [
    'http://localhost/admin',
    'http://localhost:8080/',
    'http://127.0.0.1/',
    'http://127.0.0.1:5432/',
    'http://[::1]/',
    'http://0.0.0.0/',
    'http://10.0.0.5/internal',
    'http://172.16.4.4/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://metadata/computeMetadata/v1/',
    'http://db.internal/',
    'file:///etc/passwd',
    'gopher://127.0.0.1:6379/_INFO',
    'http://user:pass@example.com/',
  ];

  for (const url of blockedUrls) {
    it(`blocks ${url}`, async () => {
      await expect(assertSafeOutboundUrl(url)).rejects.toBeInstanceOf(
        SsrfBlockedError,
      );
    });
  }

  it('classifies private ranges correctly', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('10.255.255.255')).toBe(true);
    expect(isBlockedIp('172.31.0.1')).toBe(true);
    expect(isBlockedIp('172.32.0.1')).toBe(false);
    expect(isBlockedIp('192.168.0.1')).toBe(true);
    expect(isBlockedIp('100.64.0.1')).toBe(true);
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIp('fd00::1')).toBe(true);
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('93.184.216.34')).toBe(false);
  });

  it('allows a normal public URL', async () => {
    const parsed = await assertSafeOutboundUrl('https://example.com/page');
    expect(parsed.hostname).toBe('example.com');
  });

  it('the knowledge scrape endpoint rejects an SSRF target before fetching', async () => {
    const token = await signToken({
      sub: 'user-b',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const botsForB = {
      ...DB,
      bots: [{ id: 'bot-b', user_id: 'user-b', organization_id: 'org-b' }],
    };
    const { calls } = mockSupabase(botsForB, TENANT_B_ROW);
    const req = mockReq({
      url: '/api/knowledge/scrape/bot-b',
      method: 'POST',
      body: { url: 'http://169.254.169.254/computeMetadata/v1/' },
      headers: { authorization: `Bearer ${token}` },
    });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(String(res.body?.error)).toMatch(/Blocked URL/);
    // nothing was persisted and nothing was fetched from the metadata service
    expect(calls.some((c) => c.url.includes('169.254'))).toBe(false);
  });

  it('creating a webhook pointed at an internal address is rejected', async () => {
    const token = await signToken({
      sub: 'user-b',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    mockSupabase(DB, TENANT_B_ROW);
    const req = mockReq({
      url: '/api/webhooks',
      method: 'POST',
      body: { url: 'http://127.0.0.1:9200/_cluster/health' },
      headers: { authorization: `Bearer ${token}` },
    });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(String(res.body?.error)).toMatch(/Blocked URL/);
  });
});
