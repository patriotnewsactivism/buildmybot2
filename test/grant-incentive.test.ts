import { afterEach, describe, expect, it, vi } from 'vitest';

const rememberMemory = vi.fn(async () => undefined);
const sendSms = vi.fn(async () => ({ id: 'sms_123', status: 'queued' }));

vi.mock('../api/ai-team/lib.js', () => ({
  rememberMemory,
}));

vi.mock('../api/lib/telephony-provider.js', () => ({
  sendSms,
}));

describe('grant_incentive vertical slice', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('A/B/C: grants only after gates, writes CRM timeline, sends Telnyx SMS once', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/organizations?')) {
        return new Response(
          JSON.stringify([{ settings: {} }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/call_logs?') && (!init || init.method === 'GET' || !init.method)) {
        return new Response(
          JSON.stringify([
            {
              lead_id: 'lead_abc',
              metadata: { incentiveGrants: [] },
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/call_logs?') && init?.method === 'PATCH') {
        return new Response(JSON.stringify([{ ok: true }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/leads?') && init?.method === 'PATCH') {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

    const { executeGrantIncentive } = await import(
      '../api/voice/grant-incentive.js'
    );

    const context = {
      botId: 'bot_1',
      logId: 'log_1',
      callControlId: 'call_1',
      callerNumber: '+15551234567',
      calledNumber: '+15557654321',
      userId: 'user_1',
      organizationId: 'org_1',
      department: 'manager' as const,
      team: { manager: { name: 'Daniel' } },
    };

    const refused = await executeGrantIncentive(context, {
      offerCode: 'VALUE_10',
      objectionTag: 'price',
      valuePitchAttempted: false,
      reason: 'Should refuse',
    });
    expect(refused.success).toBe(false);
    expect(sendSms).not.toHaveBeenCalled();
    expect(rememberMemory).not.toHaveBeenCalled();

    const granted = await executeGrantIncentive(context, {
      offerCode: 'VALUE_10',
      objectionTag: 'price',
      valuePitchAttempted: true,
      reason: 'Defended value; price remains the blocker',
    });

    expect(granted.success).toBe(true);
    expect(granted.offerCode).toBe('VALUE_10');
    expect(granted.timelineWritten).toBe(true);
    expect(granted.smsSent).toBe(true);
    expect(rememberMemory).toHaveBeenCalledTimes(1);
    expect(rememberMemory.mock.calls[0][0]).toMatchObject({
      roleId: 'voice-support-manager',
      subjectType: 'lead',
      subjectId: 'lead_abc',
      organizationId: 'org_1',
    });
    expect(String(rememberMemory.mock.calls[0][0].content)).toContain(
      'VALUE_10',
    );
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendSms.mock.calls[0][0]).toMatchObject({
      to: '+15551234567',
      from: '+15557654321',
    });
    expect(String(sendSms.mock.calls[0][0].text)).toContain('VALUE_10');
  });
});
