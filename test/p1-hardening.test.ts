/**
 * P1 production-hardening regression tests.
 *
 * Covers the behaviours that were previously faked or missing:
 * rate limiting, single-use expiring auth tokens, CORS allowlisting,
 * SSRF-guarded outbound calls, honest analytics aggregation and
 * integration verification.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TOKEN_TTL_MS, hashToken } from '../api/lib/auth-tokens.js';
import { verifyIntegration } from '../api/lib/integration-verify.js';
import { assertPublicUrl, isPrivateAddress } from '../api/lib/outbound.js';
import {
  RATE_LIMITS,
  consume,
  enforceRateLimit,
  resetRateLimits,
} from '../api/lib/rate-limit.js';
import {
  helmetOptions,
  isAllowedOrigin,
  isPublicEmbedPath,
} from '../api/lib/security.js';

function mockRes() {
  const state = {
    status: 200,
    body: null as any,
    headers: {} as Record<string, string>,
  };
  const res: any = {
    status: (code: number) => {
      state.status = code;
      return res;
    },
    json: (data: any) => {
      state.body = data;
      return res;
    },
    setHeader: (k: string, v: string) => {
      state.headers[k] = v;
    },
    end: () => res,
  };
  return { res, state };
}

const req = (ip = '203.0.113.9') => ({
  headers: { 'x-forwarded-for': ip },
  socket: { remoteAddress: ip },
});

describe('rate limiting', () => {
  beforeEach(() => resetRateLimits());

  it('allows requests up to the limit and blocks the next one', () => {
    const rule = { bucket: 'test:bucket', max: 3, windowMs: 60_000 };
    expect(consume(rule, 'a').allowed).toBe(true);
    expect(consume(rule, 'a').allowed).toBe(true);
    expect(consume(rule, 'a').allowed).toBe(true);
    const blocked = consume(rule, 'a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks identities independently', () => {
    const rule = { bucket: 'test:iso', max: 1, windowMs: 60_000 };
    expect(consume(rule, 'tenant-a').allowed).toBe(true);
    expect(consume(rule, 'tenant-a').allowed).toBe(false);
    expect(consume(rule, 'tenant-b').allowed).toBe(true);
  });

  it('writes a 429 with Retry-After once the login limit is exhausted', () => {
    let blockedAt = -1;
    for (let i = 0; i < RATE_LIMITS.login.max + 1; i++) {
      const { res, state } = mockRes();
      const stop = enforceRateLimit(req(), res, RATE_LIMITS.login);
      if (stop) {
        blockedAt = i;
        expect(state.status).toBe(429);
        expect(state.headers['Retry-After']).toBeDefined();
        break;
      }
    }
    expect(blockedAt).toBe(RATE_LIMITS.login.max);
  });

  it('covers every endpoint class the P1 brief requires', () => {
    for (const key of [
      'login',
      'signup',
      'forgotPassword',
      'resetPassword',
      'publicAi',
      'crawl',
      'phoneProvision',
    ]) {
      expect(RATE_LIMITS[key]?.max).toBeGreaterThan(0);
      expect(RATE_LIMITS[key]?.windowMs).toBeGreaterThan(0);
    }
  });
});

describe('auth tokens', () => {
  it('never stores the raw token', () => {
    const raw = 'super-secret-token';
    const hashed = hashToken(raw);
    expect(hashed).not.toContain(raw);
    expect(hashed).toHaveLength(64);
    expect(hashToken(raw)).toBe(hashed);
  });

  it('expires reset tokens within an hour and verification within a day', () => {
    expect(TOKEN_TTL_MS.password_reset).toBe(60 * 60_000);
    expect(TOKEN_TTL_MS.email_verification).toBe(24 * 60 * 60_000);
  });
});

describe('CORS + security headers', () => {
  it('allows the production origins only', () => {
    expect(isAllowedOrigin('https://buildmybot.app')).toBe(true);
    expect(isAllowedOrigin('https://www.buildmybot.app')).toBe(true);
    expect(isAllowedOrigin('https://evil.example.com')).toBe(false);
    expect(isAllowedOrigin(undefined)).toBe(false);
  });

  it('only treats anonymous widget endpoints as wildcard-CORS routes', () => {
    expect(isPublicEmbedPath('/api/chat/abc')).toBe(true);
    expect(isPublicEmbedPath('/embed.js')).toBe(true);
    expect(isPublicEmbedPath('/api/bots')).toBe(false);
    expect(isPublicEmbedPath('/api/admin/users')).toBe(false);
  });

  it('sets a CSP that blocks objects and foreign form posts', () => {
    const directives = helmetOptions().contentSecurityPolicy.directives as any;
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['form-action']).toEqual(["'self'"]);
    expect(directives['base-uri']).toEqual(["'self'"]);
  });
});

describe('SSRF guard for customer-controlled URLs', () => {
  it('classifies private ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.5',
      '169.254.169.254',
      '::1',
      'fd00::1',
    ]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
  });

  it('blocks localhost, metadata and non-http schemes', async () => {
    expect((await assertPublicUrl('http://127.0.0.1/x')).ok).toBe(false);
    expect(
      (await assertPublicUrl('http://169.254.169.254/latest/meta-data')).ok,
    ).toBe(false);
    expect((await assertPublicUrl('http://metadata.google.internal/')).ok).toBe(
      false,
    );
    expect((await assertPublicUrl('file:///etc/passwd')).ok).toBe(false);
    expect((await assertPublicUrl('gopher://example.com')).ok).toBe(false);
    expect((await assertPublicUrl('http://user:pass@example.com')).ok).toBe(
      false,
    );
  });
});

describe('integration verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses to mark unknown providers connected', async () => {
    const result = await verifyIntegration('not-a-provider', {});
    expect(result.verified).toBe(false);
  });

  it('reports failure when the provider rejects the credentials', async () => {
    global.fetch = vi.fn(
      async () => new Response('{"error":"unauthorized"}', { status: 401 }),
    ) as any;
    const result = await verifyIntegration('hubspot', { apiKey: 'bad' });
    expect(result.verified).toBe(false);
    expect(result.status).toBe(401);
  });

  it('treats Slack ok:false as a failure even on HTTP 200', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response('{"ok":false,"error":"invalid_auth"}', { status: 200 }),
    ) as any;
    const result = await verifyIntegration('slack', { accessToken: 'bad' });
    expect(result.verified).toBe(false);
  });

  it('accepts a genuinely successful verification', async () => {
    global.fetch = vi.fn(
      async () => new Response('{"ok":true,"team":"Acme"}', { status: 200 }),
    ) as any;
    const result = await verifyIntegration('slack', { accessToken: 'good' });
    expect(result.verified).toBe(true);
    expect(result.account).toBe('Acme');
  });
});

describe('analytics aggregates are real', () => {
  it('buckets rows by actual timestamps instead of synthesising a ramp', async () => {
    const { bucketByDay } = await import('../api/lib/analytics.js');
    const today = new Date().toISOString().slice(0, 10);
    const rows = [
      { created_at: `${today}T10:00:00Z` },
      { created_at: `${today}T11:00:00Z` },
      { created_at: '2020-01-01T00:00:00Z' },
    ];
    const series = bucketByDay(rows, 7);
    expect(series).toHaveLength(7);
    expect(series[series.length - 1]).toEqual({ date: today, count: 2 });
    // Days with no data must report zero, not an interpolated fraction.
    expect(series.slice(0, 6).every((d: any) => d.count === 0)).toBe(true);
  });
});
