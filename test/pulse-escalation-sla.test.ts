/**
 * Covers the escalation-SLA sweep added 2026-07-24 to api/cron/_pulse.ts
 * (step 5): an escalations or requires_president agent_messages row that
 * sits open past ESCALATION_SLA_HOURS gets exactly one reminder, deduped
 * via a context.pulse_reminded flag — mirroring the existing stale-critical
 * error_logs sweep (step 4).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-supabase-key';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.ESCALATION_SLA_HOURS = '4';
process.env.DISCORD_WEBHOOK_URL = undefined;
process.env.SLACK_WEBHOOK_URL = undefined;

function createMockResponse(): {
  res: VercelResponse;
  get status(): number;
  get body(): any;
} {
  let status = 200;
  let body: any = null;
  const res = {
    status: vi.fn((code: number) => {
      status = code;
      return res;
    }),
    json: vi.fn((data: any) => {
      body = data;
      return res;
    }),
    end: vi.fn(() => res),
  } as unknown as VercelResponse;
  return {
    res,
    get status() {
      return status;
    },
    get body() {
      return body;
    },
  };
}

describe('pulse escalation-SLA sweep', () => {
  const patchCalls: { url: string; body: any }[] = [];

  beforeEach(() => {
    vi.resetModules();
    patchCalls.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reminds once on a stale open escalation and marks it pulse_reminded', async () => {
    const staleEscalation = {
      id: 'esc-1',
      source: 'email',
      subject: 'Enterprise pricing question',
      summary: null,
      reason: null,
      priority: 'high',
      context: {},
      created_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
    };

    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'PATCH') {
        patchCalls.push({ url: u, body: JSON.parse(String(init.body)) });
        return { ok: true, status: 204, text: async () => '' } as any;
      }
      if (u.includes('/rest/v1/escalations')) {
        return {
          ok: true,
          text: async () => JSON.stringify([staleEscalation]),
        } as any;
      }
      // Every other table read (leads, agent_messages, researched_leads,
      // error_logs) — nothing waiting, steps 1-4 are no-ops.
      return { ok: true, text: async () => '[]' } as any;
    }) as any;

    const { pulseHandler } = await import('../api/cron/_pulse.js');
    const req = {
      headers: { authorization: 'Bearer test-cron-secret' },
    } as unknown as VercelRequest;
    const helper = createMockResponse();

    await pulseHandler(req, helper.res);

    expect(helper.status).toBe(200);
    expect(helper.body.actions).toContain('reminded stale escalation esc-1');

    const escalationPatch = patchCalls.find((c) =>
      c.url.includes('/rest/v1/escalations'),
    );
    expect(escalationPatch).toBeDefined();
    expect(escalationPatch?.body.context.pulse_reminded).toBe(true);
  });

  it('does not re-remind an escalation already flagged pulse_reminded', async () => {
    const alreadyReminded = {
      id: 'esc-2',
      source: 'email',
      subject: 'Old escalation',
      summary: null,
      reason: null,
      priority: 'normal',
      context: { pulse_reminded: true },
      created_at: new Date(Date.now() - 10 * 3600_000).toISOString(),
    };

    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'PATCH') {
        patchCalls.push({ url: u, body: JSON.parse(String(init.body)) });
        return { ok: true, status: 204, text: async () => '' } as any;
      }
      if (u.includes('/rest/v1/escalations')) {
        return {
          ok: true,
          text: async () => JSON.stringify([alreadyReminded]),
        } as any;
      }
      return { ok: true, text: async () => '[]' } as any;
    }) as any;

    const { pulseHandler } = await import('../api/cron/_pulse.js');
    const req = {
      headers: { authorization: 'Bearer test-cron-secret' },
    } as unknown as VercelRequest;
    const helper = createMockResponse();

    await pulseHandler(req, helper.res);

    expect(helper.body.actions).not.toContain(
      'reminded stale escalation esc-2',
    );
    expect(
      patchCalls.find((c) => c.url.includes('/rest/v1/escalations')),
    ).toBeUndefined();
  });
});
