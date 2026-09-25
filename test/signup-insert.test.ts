/**
 * Signup must create an account before users.email_verified exists.
 *
 * Production (2026-09-25) returned HTTP 500 because the insert always sent
 * email_verified, and PostgREST answered PGRST204: that column is only
 * defined in the pending auth-tokens migration. The lookup path also
 * ignored a failed users read and fell through into that insert.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest, ApiResponse } from '../api/lib/http-types.js';

process.env.SUPABASE_URL = 'https://signup-test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SESSION_JWT_SECRET = 'test-session-jwt-secret';

const { default: handler } = await import('../api/auth/signup.js');
const { resetRateLimits } = await import('../api/lib/rate-limit.js');
const {
  SIGNUP_USER_INSERT_COLUMNS,
  buildSignupUserInsert,
  omitColumn,
  postgrestMissingColumn,
} = await import('../api/auth/signup-insert.js');

const PGRST204 = {
  code: 'PGRST204',
  details: null,
  hint: null,
  message:
    "Could not find the 'email_verified' column of 'users' in the schema cache",
};

function httpResult(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => (typeof body === 'string' ? JSON.parse(text) : body),
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
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
  };
  return res as ApiResponse & typeof res;
}

function mockReq(
  body: Record<string, unknown>,
  ip = '203.0.113.20',
): ApiRequest {
  return {
    method: 'POST',
    body,
    headers: { 'x-forwarded-for': ip },
    socket: { remoteAddress: ip },
  } as unknown as ApiRequest;
}

interface RecordedCall {
  url: string;
  method: string;
  body?: string;
}

function installFetch(
  impl: (call: RecordedCall) => { status: number; body: unknown },
) {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call: RecordedCall = {
        url: String(url),
        method: init?.method || 'GET',
        body: typeof init?.body === 'string' ? init.body : undefined,
      };
      calls.push(call);
      const result = impl(call);
      return httpResult(result.status, result.body);
    }),
  );
  return calls;
}

function userPosts(calls: RecordedCall[]) {
  return calls
    .filter(
      (call) => call.method === 'POST' && call.url.includes('/rest/v1/users'),
    )
    .map((call) => JSON.parse(call.body || '{}') as Record<string, unknown>);
}

describe('signup insert shape', () => {
  it('writes an unverified customer row and lists every inserted column', () => {
    const row = buildSignupUserInsert({
      id: 'user-1',
      email: 'New.User@Example.com',
      passwordHash: 'hash',
      name: 'New',
      companyName: 'Example Co',
      referredBy: 'ref',
      createdAt: '2026-09-25T12:00:00.000Z',
    });
    expect(Object.keys(row)).toEqual([...SIGNUP_USER_INSERT_COLUMNS]);
    expect(row).toMatchObject({
      id: 'user-1',
      email: 'new.user@example.com',
      name: 'New',
      role: 'OWNER',
      plan: 'FREE',
      status: 'Active',
      company_name: 'Example Co',
      referred_by: 'ref',
      email_verified: false,
      referral_credits: 0,
      reseller_client_count: 0,
      whitelabel_enabled: false,
      created_at: '2026-09-25T12:00:00.000Z',
    });
  });

  it('recognizes only a PGRST204 miss for the named column', () => {
    expect(postgrestMissingColumn(400, JSON.stringify(PGRST204))).toBe(
      'email_verified',
    );
    expect(
      postgrestMissingColumn(
        400,
        JSON.stringify({
          code: 'PGRST204',
          message:
            "Could not find the 'referred_by' column of 'users' in the schema cache",
        }),
      ),
    ).toBe('referred_by');
    expect(
      postgrestMissingColumn(
        409,
        JSON.stringify({ code: '23505', message: 'duplicate' }),
      ),
    ).toBeNull();
    expect(postgrestMissingColumn(400, 'not-json')).toBeNull();
    expect(
      omitColumn({ email_verified: false, email: 'a@b.co' }, 'email_verified'),
    ).toEqual({
      email: 'a@b.co',
    });
  });
});

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('surfaces a failed existing-user lookup instead of inserting', async () => {
    const calls = installFetch((call) => {
      if (call.url.includes('/rest/v1/users')) {
        return { status: 500, body: { message: 'upstream down' } };
      }
      return { status: 500, body: { message: 'unexpected' } };
    });

    const res = mockRes();
    await handler(
      mockReq(
        { email: 'ada@example.com', password: 'secret123' },
        '203.0.113.21',
      ),
      res,
    );

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({
      error: 'Could not verify whether this email is already registered',
    });
    expect(userPosts(calls)).toHaveLength(0);
  });

  it('rejects a lookup body that is not a row list', async () => {
    installFetch(() => ({ status: 200, body: { message: 'not rows' } }));
    const res = mockRes();
    await handler(
      mockReq(
        { email: 'ada@example.com', password: 'secret123' },
        '203.0.113.22',
      ),
      res,
    );
    expect(res.statusCode).toBe(502);
  });

  it('inserts email_verified false and issues a verification token when the column exists', async () => {
    const calls = installFetch((call) => {
      if (call.method === 'GET' && call.url.includes('/rest/v1/users')) {
        return { status: 200, body: [] };
      }
      if (call.method === 'POST' && call.url.includes('/rest/v1/users')) {
        const row = JSON.parse(call.body || '{}') as Record<string, unknown>;
        return { status: 201, body: [row] };
      }
      if (call.url.includes('/rest/v1/auth_tokens')) {
        return { status: 201, body: [] };
      }
      return { status: 404, body: { message: 'unexpected' } };
    });

    const res = mockRes();
    await handler(
      mockReq(
        {
          email: 'Ada@Example.com',
          password: 'secret123',
          name: 'Ada',
          companyName: 'Analytical Engines',
        },
        '203.0.113.23',
      ),
      res,
    );

    const posts = userPosts(calls);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      email: 'ada@example.com',
      name: 'Ada',
      role: 'OWNER',
      plan: 'FREE',
      email_verified: false,
      company_name: 'Analytical Engines',
    });
    expect(posts[0].password_hash).toEqual(expect.any(String));

    const tokenPost = calls.find(
      (call) =>
        call.method === 'POST' && call.url.includes('/rest/v1/auth_tokens'),
    );
    expect(tokenPost).toBeDefined();
    expect(JSON.parse(tokenPost?.body || '{}')).toMatchObject({
      user_id: posts[0].id,
      type: 'email_verification',
    });

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      emailVerified: false,
      verificationSent: false,
      user: { email: 'ada@example.com', role: 'OWNER' },
    });
    expect(
      (res.body as { user: Record<string, unknown> }).user.password_hash,
    ).toBeUndefined();
    expect(res.headers['Set-Cookie']).toContain('bmb_session=');
  });

  it('retries once without email_verified on PGRST204 and still creates the account', async () => {
    const calls = installFetch((call) => {
      if (call.method === 'GET' && call.url.includes('/rest/v1/users')) {
        return { status: 200, body: [] };
      }
      if (call.method === 'POST' && call.url.includes('/rest/v1/users')) {
        const row = JSON.parse(call.body || '{}') as Record<string, unknown>;
        if ('email_verified' in row) return { status: 400, body: PGRST204 };
        return { status: 201, body: [{ ...row }] };
      }
      if (call.url.includes('/auth_tokens')) {
        return {
          status: 400,
          body: {
            code: 'PGRST205',
            message:
              "Could not find the table 'public.auth_tokens' in the schema cache",
          },
        };
      }
      return { status: 404, body: { message: 'unexpected' } };
    });

    const res = mockRes();
    await handler(
      mockReq(
        { email: 'grace@example.com', password: 'secret123' },
        '203.0.113.24',
      ),
      res,
    );

    const posts = userPosts(calls);
    expect(posts).toHaveLength(2);
    expect(posts[0].email_verified).toBe(false);
    expect(posts[1]).not.toHaveProperty('email_verified');
    expect(posts[1]).toMatchObject({
      email: 'grace@example.com',
      role: 'OWNER',
      plan: 'FREE',
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      emailVerified: false,
      verificationSent: false,
      message: 'Account created successfully. Please verify your email.',
    });
  });

  it('does not drop email_verified when a different column is missing', async () => {
    const calls = installFetch((call) => {
      if (call.method === 'GET' && call.url.includes('/rest/v1/users')) {
        return { status: 200, body: [] };
      }
      if (call.method === 'POST' && call.url.includes('/rest/v1/users')) {
        return {
          status: 400,
          body: {
            code: 'PGRST204',
            message:
              "Could not find the 'preferences' column of 'users' in the schema cache",
          },
        };
      }
      return { status: 404, body: {} };
    });

    const res = mockRes();
    await handler(
      mockReq(
        { email: 'grace@example.com', password: 'secret123' },
        '203.0.113.25',
      ),
      res,
    );

    expect(userPosts(calls)).toHaveLength(1);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to create account' });
  });

  it('returns 409 when the email is already registered and does not insert', async () => {
    const calls = installFetch((call) => {
      if (call.method === 'GET')
        return { status: 200, body: [{ id: 'existing' }] };
      return { status: 500, body: { message: 'should not insert' } };
    });
    const res = mockRes();
    await handler(
      mockReq(
        { email: 'ada@example.com', password: 'secret123' },
        '203.0.113.26',
      ),
      res,
    );
    expect(res.statusCode).toBe(409);
    expect(userPosts(calls)).toHaveLength(0);
  });
});
