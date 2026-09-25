import type { ApiRequest, ApiResponse } from '../../api/lib/http-types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SESSION_JWT_SECRET = 'test-session-secret-min-32-characters!';
process.env.APEX_LEAD_INGEST_TOKEN = '';

const { default: apexLeads, tokenMatches } = await import(
  '../../api/integrations/apex-leads.ts'
);

const TOKEN = 'apex-ingest-test-token';

type Row = Record<string, unknown>;

function mockRes(): ApiResponse & { statusCode: number; body: unknown } {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
    setHeader() {
      return this;
    },
  };
  return res;
}

function mockReq(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    method: 'POST',
    url: '/api/integrations/apex/leads',
    headers: { authorization: `Bearer ${TOKEN}` },
    body: {},
    ...overrides,
  } as ApiRequest;
}

function unquote(raw: string): string {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  return raw;
}

function parseList(inner: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  let escape = false;
  for (const ch of inner) {
    if (escape) {
      current += ch;
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === ',' && !quoted) {
      values.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.length > 0) values.push(current);
  return values;
}

function matchesFilter(actual: unknown, filter: string | null): boolean {
  if (!filter) return true;
  const value = actual == null ? null : String(actual);
  if (filter === 'is.null') return value == null;
  if (filter.startsWith('eq.')) return value === unquote(filter.slice(3));
  if (filter.startsWith('ilike.')) {
    return (value || '').toLowerCase() === unquote(filter.slice(6)).toLowerCase();
  }
  if (filter.startsWith('in.(') && filter.endsWith(')')) {
    const options = parseList(filter.slice(4, -1));
    return value != null && options.includes(value);
  }
  return true;
}

function jsonResponse(status: number, data: unknown) {
  const text = JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  };
}

function installFetch(options?: { schemaMissing?: boolean; users?: Row[]; leads?: Row[] }) {
  const state = {
    orgs: [{ id: 'org-1', owner_id: 'user-1' }] as Row[],
    users: options?.users ?? [
      {
        id: 'user-1',
        email: 'owner@example.com',
        organization_id: 'org-1',
        role: 'OWNER',
        status: 'Active',
      },
    ],
    leads: [...(options?.leads ?? [])] as Row[],
  };
  const calls: Array<{ method: string; url: string; body: Row | null }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = new URL(String(input));
      const method = (init?.method || 'GET').toUpperCase();
      const body = init?.body ? (JSON.parse(init.body) as Row) : null;
      calls.push({ method, url: `${url.pathname}${url.search}`, body });
      const table = url.pathname.split('/').filter(Boolean).pop();
      if (table === 'leads' && options?.schemaMissing) {
        return jsonResponse(400, {
          code: 'PGRST204',
          message:
            "Could not find the 'external_id' column of 'leads' in the schema cache",
        });
      }
      if (method === 'GET' && table === 'organizations') {
        return jsonResponse(
          200,
          state.orgs.filter((org) => matchesFilter(org.id, url.searchParams.get('id'))),
        );
      }
      if (method === 'GET' && table === 'users') {
        return jsonResponse(
          200,
          state.users.filter((user) => {
            return (
              matchesFilter(user.id, url.searchParams.get('id')) &&
              matchesFilter(user.email, url.searchParams.get('email')) &&
              matchesFilter(user.organization_id, url.searchParams.get('organization_id'))
            );
          }),
        );
      }
      if (table === 'leads' && method === 'GET') {
        let rows = state.leads.filter((lead) => {
          return (
            matchesFilter(lead.id, url.searchParams.get('id')) &&
            matchesFilter(lead.source, url.searchParams.get('source')) &&
            matchesFilter(lead.external_id, url.searchParams.get('external_id')) &&
            matchesFilter(lead.user_id, url.searchParams.get('user_id')) &&
            matchesFilter(lead.organization_id, url.searchParams.get('organization_id'))
          );
        });
        const since = url.searchParams.get('or');
        if (since) {
          const quoted = since.match(/"([^"]+)"/);
          const cutoff = quoted ? Date.parse(quoted[1]) : Number.NaN;
          if (!Number.isNaN(cutoff)) {
            rows = rows.filter((lead) => {
              const created = Date.parse(String(lead.created_at || ''));
              const updated = Date.parse(String(lead.updated_at || ''));
              return created >= cutoff || updated >= cutoff;
            });
          }
        }
        if (url.searchParams.get('order') === 'created_at.desc') {
          rows = [...rows].sort(
            (a, b) =>
              Date.parse(String(b.created_at || '')) - Date.parse(String(a.created_at || '')),
          );
        }
        const limit = Number(url.searchParams.get('limit') || rows.length);
        return jsonResponse(200, rows.slice(0, limit));
      }
      if (table === 'leads' && method === 'POST' && body) {
        state.leads.push({ ...body });
        return jsonResponse(200, [body]);
      }
      if (table === 'leads' && method === 'PATCH' && body) {
        const matched = state.leads.filter(
          (lead) =>
            matchesFilter(lead.id, url.searchParams.get('id')) &&
            matchesFilter(lead.source, url.searchParams.get('source')) &&
            matchesFilter(lead.external_id, url.searchParams.get('external_id')) &&
            matchesFilter(lead.organization_id, url.searchParams.get('organization_id')),
        );
        for (const lead of matched) Object.assign(lead, body);
        return jsonResponse(200, matched);
      }
      return jsonResponse(404, { message: 'not found' });
    }),
  );
  return { calls, state };
}

function lead(externalId: string, extra: Row = {}) {
  return {
    externalId,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    company: 'Analytical Engines',
    ...extra,
  };
}

describe('apex lead ingest auth', () => {
  beforeEach(() => {
    process.env.APEX_LEAD_INGEST_TOKEN = TOKEN;
  });

  afterEach(() => {
    process.env.APEX_LEAD_INGEST_TOKEN = '';
    vi.unstubAllGlobals();
  });

  it('compares tokens without throwing when lengths differ', () => {
    expect(tokenMatches('short', 'a-much-longer-token')).toBe(false);
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
  });

  it('returns 503 ingest_disabled when the env is unset, even with a bearer token', async () => {
    delete process.env.APEX_LEAD_INGEST_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = mockRes();
    await apexLeads(
      mockReq({
        body: { orgId: 'org-1', dryRun: false, leads: [lead('ext-1')] },
      }),
      res,
    );
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'ingest_disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 503 ingest_disabled when the env is blank', async () => {
    process.env.APEX_LEAD_INGEST_TOKEN = '   ';
    const res = mockRes();
    await apexLeads(mockReq(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'ingest_disabled' });
  });

  it('returns 401 for a missing token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = mockRes();
    await apexLeads(mockReq({ headers: {} }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 401 for a wrong token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = mockRes();
    await apexLeads(
      mockReq({ headers: { authorization: 'Bearer not-the-token' } }),
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is registered on the API gateway', async () => {
    delete process.env.APEX_LEAD_INGEST_TOKEN;
    const gateway = await import('../../api/gateway.ts');
    const res = mockRes();
    await gateway.default(
      mockReq({
        headers: {},
        body: { leads: [] },
      }),
      res,
    );
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'ingest_disabled' });
  });
});

describe('apex lead ingest contract', () => {
  beforeEach(() => {
    process.env.APEX_LEAD_INGEST_TOKEN = TOKEN;
  });

  afterEach(() => {
    process.env.APEX_LEAD_INGEST_TOKEN = '';
    vi.unstubAllGlobals();
  });

  it('rejects an unresolved tenant and a batch over 200', async () => {
    const { calls } = installFetch();
    const missing = mockRes();
    await apexLeads(
      mockReq({
        body: { orgId: 'missing-org', dryRun: true, leads: [lead('ext-1')] },
      }),
      missing,
    );
    expect(missing.statusCode).toBe(400);
    expect(missing.body).toEqual({ error: 'tenant_unresolved' });

    const tooMany = mockRes();
    await apexLeads(
      mockReq({
        body: {
          orgId: 'org-1',
          leads: Array.from({ length: 201 }, (_, index) => lead(`ext-${index}`)),
        },
      }),
      tooMany,
    );
    expect(tooMany.statusCode).toBe(413);
    expect(tooMany.body).toEqual({ error: 'too_many_leads' });
    expect(calls.some((call) => call.method !== 'GET')).toBe(false);
  });

  it('validates each lead and does not write on dryRun (the default)', async () => {
    const { calls } = installFetch();
    const res = mockRes();
    await apexLeads(
      mockReq({
        body: {
          orgId: 'org-1',
          leads: [
            lead('ext-ok'),
            { externalId: 'ext-no-contact', name: 'No Contact' },
            { name: 'Missing id', email: 'x@example.com' },
            { externalId: 'ext-bad-email', email: 'not-an-email' },
            lead('ext-phone', { email: undefined, phone: '(555) 123-4567' }),
          ],
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      dryRun: true,
      accepted: 2,
      updated: 0,
      duplicates: 0,
      rejected: [
        { externalId: 'ext-no-contact', reason: 'contact_required' },
        { reason: 'external_id_required' },
        { externalId: 'ext-bad-email', reason: 'invalid_email' },
      ],
    });
    expect(calls.some((call) => call.method !== 'GET')).toBe(false);
    expect(calls.some((call) => call.url.includes('/rest/v1/leads'))).toBe(true);
  });

  it('does not write when dryRun is omitted and reports an update without a PATCH', async () => {
    const { calls } = installFetch({
      leads: [
        {
          id: 'lead-1',
          external_id: 'ext-1',
          name: 'Ada',
          email: 'ada@example.com',
          phone: null,
          company: null,
          status: 'New',
          source: 'apex',
          notes: null,
          metadata: {
            apex: {
              company: null,
              title: null,
              website: null,
              tags: [],
              source: null,
            },
          },
          user_id: 'user-1',
          organization_id: 'org-1',
          created_at: '2026-09-24T00:00:00.000Z',
          updated_at: '2026-09-24T00:00:00.000Z',
        },
      ],
    });
    const res = mockRes();
    await apexLeads(
      mockReq({
        body: {
          ownerEmail: 'owner@example.com',
          leads: [
            {
              externalId: 'ext-1',
              name: 'Ada Lovelace',
              email: 'ada@example.com',
            },
          ],
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ dryRun: true, accepted: 0, updated: 1, duplicates: 0 });
    expect(calls.some((call) => call.method === 'PATCH' || call.method === 'POST')).toBe(
      false,
    );
  });

  it('inserts once and treats an identical resend as a duplicate', async () => {
    const { calls, state } = installFetch();
    const first = mockRes();
    await apexLeads(
      mockReq({
        body: {
          orgId: 'org-1',
          ownerEmail: 'owner@example.com',
          dryRun: false,
          leads: [lead('ext-1', { phone: '+1 555 121 2678', tags: ['demo'] })],
        },
      }),
      first,
    );
    expect(first.statusCode).toBe(200);
    expect(first.body).toMatchObject({
      dryRun: false,
      accepted: 1,
      updated: 0,
      duplicates: 0,
      rejected: [],
    });
    expect(calls.filter((call) => call.method === 'POST' && call.url.includes('/leads'))).toHaveLength(
      1,
    );
    const stored = state.leads[0];
    expect(stored.source).toBe('apex');
    expect(stored.external_id).toBe('ext-1');
    expect(stored.organization_id).toBe('org-1');
    expect(stored.user_id).toBe('user-1');
    expect(stored.email).toBe('ada@example.com');
    expect(stored.phone).toBe('+15551212678');
    expect(stored.status).toBe('New');

    const second = mockRes();
    await apexLeads(
      mockReq({
        body: {
          orgId: 'org-1',
          dryRun: false,
          leads: [lead('ext-1', { phone: '+15551212678', tags: ['demo'] })],
        },
      }),
      second,
    );
    expect(second.body).toMatchObject({
      dryRun: false,
      accepted: 0,
      updated: 0,
      duplicates: 1,
      rejected: [],
    });
    expect(state.leads).toHaveLength(1);
    expect(calls.filter((call) => call.method === 'POST' && call.url.includes('/leads'))).toHaveLength(
      1,
    );
  });

  it('treats a repeated externalId in one batch as a duplicate', async () => {
    const { calls, state } = installFetch();
    const res = mockRes();
    await apexLeads(
      mockReq({
        body: {
          orgId: 'org-1',
          dryRun: false,
          leads: [lead('ext-batch'), lead('ext-batch')],
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      dryRun: false,
      accepted: 1,
      updated: 0,
      duplicates: 1,
      rejected: [],
    });
    expect(state.leads).toHaveLength(1);
    expect(
      calls.filter((call) => call.method === 'POST' && call.url.includes('/leads')),
    ).toHaveLength(1);
  });

  it('updates an existing apex lead instead of inserting another row', async () => {
    const { calls, state } = installFetch({
      leads: [
        {
          id: 'lead-1',
          external_id: 'ext-1',
          name: 'Ada',
          email: 'ada@example.com',
          phone: null,
          company: 'Old Co',
          status: 'Contacted',
          source: 'apex',
          notes: 'keep',
          metadata: {
            apex: { company: 'Old Co', title: null, website: null, tags: [], source: null },
          },
          user_id: 'user-1',
          organization_id: 'org-1',
          created_at: '2026-09-24T00:00:00.000Z',
          updated_at: '2026-09-24T00:00:00.000Z',
        },
      ],
    });
    const res = mockRes();
    await apexLeads(
      mockReq({
        body: {
          orgId: 'org-1',
          dryRun: false,
          leads: [lead('ext-1', { notes: 'keep', company: 'New Co' })],
        },
      }),
      res,
    );
    expect(res.body).toMatchObject({ accepted: 0, updated: 1, duplicates: 0 });
    expect(state.leads).toHaveLength(1);
    expect(state.leads[0].company).toBe('New Co');
    expect(state.leads[0].status).toBe('Contacted');
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(1);
  });

  it('returns 503 schema_not_ready and does not write when external_id is missing', async () => {
    const { calls } = installFetch({ schemaMissing: true });
    const res = mockRes();
    await apexLeads(
      mockReq({
        body: { orgId: 'org-1', dryRun: false, leads: [lead('ext-1')] },
      }),
      res,
    );
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ error: 'schema_not_ready' });
    expect(String((res.body as { reason: string }).reason)).toContain('external_id');
    expect(calls.some((call) => call.method === 'POST' || call.method === 'PATCH')).toBe(
      false,
    );
  });

  it('lists the tenant leads newest first', async () => {
    const { calls } = installFetch({
      leads: [
        {
          id: 'older',
          external_id: null,
          name: 'Older',
          email: 'older@example.com',
          phone: '',
          company: '',
          status: 'New',
          source: 'chat',
          notes: null,
          metadata: {},
          user_id: 'user-1',
          organization_id: 'org-1',
          created_at: '2026-09-20T00:00:00.000Z',
          updated_at: '2026-09-20T00:00:00.000Z',
        },
        {
          id: 'newer',
          external_id: 'ext-9',
          name: 'Newer',
          email: 'newer@example.com',
          phone: '+15551212',
          company: 'New Co',
          status: 'Qualified',
          source: 'apex',
          notes: null,
          metadata: { apex: { company: 'New Co' } },
          user_id: 'user-1',
          organization_id: 'org-1',
          created_at: '2026-09-24T00:00:00.000Z',
          updated_at: '2026-09-24T00:00:00.000Z',
        },
      ],
    });
    const res = mockRes();
    await apexLeads(
      mockReq({
        method: 'GET',
        url: '/api/integrations/apex/leads?ownerEmail=owner@example.com&since=2026-09-23T00:00:00.000Z&limit=10',
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      leads: [
        {
          id: 'newer',
          externalId: 'ext-9',
          name: 'Newer',
          email: 'newer@example.com',
          phone: '+15551212',
          company: 'New Co',
          status: 'Qualified',
          source: 'apex',
          createdAt: '2026-09-24T00:00:00.000Z',
          updatedAt: '2026-09-24T00:00:00.000Z',
        },
      ],
    });
    const listCall = calls.find(
      (call) => call.method === 'GET' && call.url.includes('order=created_at.desc'),
    );
    expect(listCall?.url).toContain('limit=10');
    expect(decodeURIComponent(listCall?.url || '')).toContain('2026-09-23T00:00:00.000Z');
  });

  it('rejects an out-of-range GET limit', async () => {
    installFetch();
    const res = mockRes();
    await apexLeads(
      mockReq({
        method: 'GET',
        url: '/api/integrations/apex/leads?orgId=org-1&limit=201',
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_limit' });
  });
});
