/**
 * Safety-gate tests added 2026-07-24 after discovering the GitHub Actions
 * schedules for pulse/lead-followups/sales-outreach kept firing real
 * outbound emails and Twilio calls despite an intended pause the night
 * before (the pause only touched vercel.json, not the workflows actually
 * triggering these paths — see .github/workflows/*.yml comments).
 *
 * Covers the two new safety primitives in api/ai-team/lib.ts:
 *   - salesAutomationDryRun(): fail-safe default TRUE, only 'false' (the
 *     literal string) disables it.
 *   - aiTeamKilled(): global emergency stop, only 'true' enables it.
 * And the belt-and-suspenders dry-run gate inside
 * api/twilio/service.ts initiateOutboundCall(), which must never reach
 * the real Twilio SDK while dry-run is active.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-supabase-key';
process.env.TWILIO_ACCOUNT_SID = 'test-twilio-sid';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.TWILIO_PHONE_NUMBER = '+15551234567';

describe('salesAutomationDryRun / aiTeamKilled', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env.SALES_AUTOMATION_DRY_RUN =
      ORIGINAL_ENV.SALES_AUTOMATION_DRY_RUN;
    process.env.AI_TEAM_KILL_SWITCH = ORIGINAL_ENV.AI_TEAM_KILL_SWITCH;
    vi.resetModules();
  });

  it('defaults to dry-run TRUE when the env var is unset', async () => {
    process.env.SALES_AUTOMATION_DRY_RUN = undefined;
    vi.resetModules();
    const { salesAutomationDryRun } = await import('../api/ai-team/lib.js');
    expect(salesAutomationDryRun()).toBe(true);
  });

  it('stays dry-run TRUE for any value that is not (case-insensitively) "false"', async () => {
    process.env.SALES_AUTOMATION_DRY_RUN = 'no';
    vi.resetModules();
    const { salesAutomationDryRun } = await import('../api/ai-team/lib.js');
    expect(salesAutomationDryRun()).toBe(true);
  });

  it('only goes live when set to "false" (case-insensitive)', async () => {
    process.env.SALES_AUTOMATION_DRY_RUN = 'FALSE';
    vi.resetModules();
    const { salesAutomationDryRun } = await import('../api/ai-team/lib.js');
    expect(salesAutomationDryRun()).toBe(false);
  });

  it('aiTeamKilled defaults to false and only trips on the literal string "true"', async () => {
    process.env.AI_TEAM_KILL_SWITCH = undefined;
    vi.resetModules();
    let { aiTeamKilled } = await import('../api/ai-team/lib.js');
    expect(aiTeamKilled()).toBe(false);

    process.env.AI_TEAM_KILL_SWITCH = 'true';
    vi.resetModules();
    ({ aiTeamKilled } = await import('../api/ai-team/lib.js'));
    expect(aiTeamKilled()).toBe(true);
  });
});

describe('initiateOutboundCall dry-run gate', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('twilio', () => {
      const calls = { create: vi.fn().mockResolvedValue({ sid: 'CAxxxx' }) };
      function MockTwilio() {
        return { calls };
      }
      return {
        default: vi.fn(MockTwilio),
        __mockCalls: calls,
      };
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'call-log-row-id' }],
    });
  });

  afterEach(() => {
    vi.doUnmock('twilio');
    vi.restoreAllMocks();
  });

  it('never calls the Twilio SDK while dry-run is active, even with Twilio fully configured', async () => {
    process.env.SALES_AUTOMATION_DRY_RUN = 'true';
    const { initiateOutboundCall } = await import('../api/twilio/service.js');
    const Twilio = (await import('twilio')).default as unknown as ReturnType<
      typeof vi.fn
    >;

    const result = await initiateOutboundCall({
      leadId: 'lead-1',
      phoneNumber: '+15559876543',
      objective: 'test call',
      agentRoleId: 'sales-outreach-agent',
      agentName: 'Jordan Blake',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('dry_run');
    expect(Twilio).not.toHaveBeenCalled();
  });

  it('places the real call once dry-run is explicitly disabled', async () => {
    process.env.SALES_AUTOMATION_DRY_RUN = 'false';
    const { initiateOutboundCall } = await import('../api/twilio/service.js');
    const twilioModule = (await import('twilio')) as unknown as {
      default: ReturnType<typeof vi.fn>;
      __mockCalls: { create: ReturnType<typeof vi.fn> };
    };

    const result = await initiateOutboundCall({
      leadId: 'lead-1',
      phoneNumber: '+15559876543',
      objective: 'test call',
      agentRoleId: 'sales-outreach-agent',
      agentName: 'Jordan Blake',
    });

    expect(twilioModule.default).toHaveBeenCalled();
    expect(twilioModule.__mockCalls.create).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});

describe('scheduled outbound work in dry-run mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('keeps the recurring pulse token-free and does not dispatch outbound workers', async () => {
    process.env.SALES_AUTOMATION_DRY_RUN = 'true';
    process.env.CRON_SECRET = 'test-cron-secret';
    const urls: string[] = [];
    global.fetch = vi.fn(async (url: string) => {
      urls.push(String(url));
      return { ok: true, text: async () => '[]' } as any;
    }) as any;

    const { pulseHandler } = await import('../api/cron/_pulse.js');
    let responseBody: any;
    const res = {
      status: vi.fn(() => res),
      json: vi.fn((body: any) => {
        responseBody = body;
        return res;
      }),
      end: vi.fn(() => res),
    } as any;

    await pulseHandler(
      { headers: { authorization: 'Bearer test-cron-secret' } } as any,
      res,
    );

    expect(responseBody.idle).toBe(true);
    expect(urls.some((url) => url.includes('/rest/v1/leads'))).toBe(false);
    expect(urls.some((url) => url.includes('/rest/v1/researched_leads'))).toBe(
      false,
    );
    expect(urls.some((url) => url.includes('/api/cron/lead-followups'))).toBe(
      false,
    );
    expect(urls.some((url) => url.includes('/api/cron/sales-outreach'))).toBe(
      false,
    );
  });
});
