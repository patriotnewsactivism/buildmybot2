/**
 * Covers two hardening fixes added 2026-07-24 to api/twilio:
 *   - webhooks.ts validateTwilioRequest() now fails CLOSED (rejects) when
 *     Twilio credentials are configured but the x-twilio-signature header
 *     is missing, instead of trusting a request merely because its body
 *     contains a "CallSid"-shaped field (a real spoofable gap).
 *   - service.ts initiateOutboundCall() enforces a per-day outbound call
 *     cap (SALES_CALL_DAILY_CAP) before ever reaching the Twilio SDK.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-supabase-key';
process.env.SALES_AUTOMATION_DRY_RUN = 'false';

function createMockRequest(
  body: unknown = {},
  headers: Record<string, string> = {},
  url = '/api/twilio/voice-handler',
): VercelRequest {
  return {
    method: 'POST',
    body,
    headers,
    url,
    cookies: {},
  } as unknown as VercelRequest;
}

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
    send: vi.fn((data: any) => {
      body = data;
      return res;
    }),
    setHeader: vi.fn(),
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

describe('validateTwilioRequest fail-closed behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.TWILIO_ACCOUNT_SID = 'test-twilio-sid';
    process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
    process.env.TWILIO_PHONE_NUMBER = '+15551234567';
  });

  afterEach(() => {
    vi.doUnmock('twilio');
    vi.restoreAllMocks();
  });

  it('rejects a request with Twilio-shaped fields but no signature header when credentials are configured', async () => {
    const { voiceHandler } = await import('../api/twilio/webhooks.js');
    const req = createMockRequest({ CallSid: 'spoofed-call-sid' }, {});
    const helper = createMockResponse();

    await voiceHandler(req, helper.res);

    expect(helper.status).toBe(403);
  });

  it('accepts a request with a valid Twilio signature', async () => {
    vi.doMock('twilio', () => {
      function MockTwilio() {
        return {};
      }
      MockTwilio.validateRequest = vi.fn().mockReturnValue(true);
      return { default: MockTwilio };
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hi there!' } }],
      }),
    });

    const { voiceHandler } = await import('../api/twilio/webhooks.js');
    const req = createMockRequest(
      { CallSid: 'real-call-sid' },
      { 'x-twilio-signature': 'valid-sig' },
      '/api/twilio/voice-handler?leadId=lead-1&objective=test',
    );
    const helper = createMockResponse();

    await voiceHandler(req, helper.res);

    expect(helper.status).toBe(200);
  });

  it('falls back to field-presence checking only when no Twilio credentials are configured at all', async () => {
    process.env.TWILIO_ACCOUNT_SID = '';
    process.env.TWILIO_AUTH_TOKEN = '';
    const { voiceHandler } = await import('../api/twilio/webhooks.js');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Hi!' } }] }),
    });
    const req = createMockRequest({ CallSid: 'dev-mode-sid' }, {});
    const helper = createMockResponse();

    await voiceHandler(req, helper.res);

    expect(helper.status).toBe(200);
  });
});

describe('initiateOutboundCall daily cap', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.TWILIO_ACCOUNT_SID = 'test-twilio-sid';
    process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
    process.env.TWILIO_PHONE_NUMBER = '+15551234567';
    process.env.SALES_CALL_DAILY_CAP = '2';
    vi.doMock('twilio', () => {
      const calls = { create: vi.fn().mockResolvedValue({ sid: 'CAxxxx' }) };
      return {
        default: vi.fn(function MockTwilio() {
          return { calls };
        }),
        __mockCalls: calls,
      };
    });
  });

  afterEach(() => {
    vi.doUnmock('twilio');
    vi.restoreAllMocks();
  });

  it('refuses to dial once the daily cap is reached, without touching the Twilio SDK', async () => {
    // Two rows already "today" >= cap of 2.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'a' }, { id: 'b' }],
    });

    const { initiateOutboundCall } = await import('../api/twilio/service.js');
    const twilioModule = (await import('twilio')) as unknown as {
      default: ReturnType<typeof vi.fn>;
    };

    const result = await initiateOutboundCall({
      leadId: 'lead-1',
      phoneNumber: '+15559876543',
      objective: 'test call',
      agentRoleId: 'sales-outreach-agent',
      agentName: 'Jordan Blake',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('daily_cap_reached');
    expect(twilioModule.default).not.toHaveBeenCalled();
  });
});
