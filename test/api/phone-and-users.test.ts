/**
 * Covers two fixes added 2026-07-24:
 *   - PUT /api/users/:id (handleUsers) previously had no update handling at
 *     all and silently 404'd — every "Save Configuration" click (phone/voice
 *     setup among others) never actually persisted anything.
 *   - POST /api/phone/purchase and GET /api/phone/available were stubs
 *     (fake number, no real search) — now do real Twilio calls and
 *     auto-link a voice-agent bot so the purchased number has somewhere to
 *     route inbound calls with a real knowledge base.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_SECRET = 'test-session-secret';

process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SESSION_JWT_SECRET = SESSION_SECRET;
process.env.TWILIO_ACCOUNT_SID = 'test-twilio-sid';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.TWILIO_PHONE_NUMBER = '+15551234567';
process.env.SALES_AUTOMATION_DRY_RUN = 'true';

const gateway = await import('../../api/gateway.ts');
const handler = gateway.default;

function mockRes(): VercelResponse & { statusCode: number; body: any } {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as any,
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
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
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

const AUTH_USER_ROW = {
  id: 'user-1',
  email: 'owner@example.com',
  role: 'user',
  organization_id: 'org-1',
  plan: 'FREE',
  status: 'Active',
};

describe('PUT /api/users/:id — profile save', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('persists phoneConfig -> phone_config for the authenticated user themselves', async () => {
    const token = await signToken({ sub: 'user-1' });
    const patchCalls: any[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/rest/v1/users') && init?.method === 'PATCH') {
          const patchBody = JSON.parse(String(init.body));
          patchCalls.push(patchBody);
          return Promise.resolve({
            ok: true,
            json: async () => [{ id: 'user-1', ...patchBody }],
          });
        }
        if (u.includes('/rest/v1/users')) {
          return Promise.resolve({
            ok: true,
            json: async () => [AUTH_USER_ROW],
          });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      }),
    );

    const req = {
      method: 'PUT',
      url: '/api/users/user-1',
      headers: { cookie: `bmb_session=${token}` },
      body: {
        phoneConfig: { enabled: true, voiceId: 'eve', introMessage: 'Hi!' },
      },
    } as unknown as VercelRequest;
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(patchCalls.length).toBe(1);
    expect(patchCalls[0].phone_config).toEqual({
      enabled: true,
      voiceId: 'eve',
      introMessage: 'Hi!',
    });
  });

  it('rejects updating a different user id when not an admin', async () => {
    const token = await signToken({ sub: 'user-1' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/rest/v1/users')) {
          return Promise.resolve({
            ok: true,
            json: async () => [AUTH_USER_ROW],
          });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      }),
    );

    const req = {
      method: 'PUT',
      url: '/api/users/someone-else',
      headers: { cookie: `bmb_session=${token}` },
      body: { phoneConfig: { enabled: true } },
    } as unknown as VercelRequest;
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/phone/purchase — real Twilio provisioning', () => {
  beforeEach(() => {
    vi.doMock('twilio', () => {
      function MockTwilio() {
        return {
          incomingPhoneNumbers: Object.assign(
            vi.fn().mockReturnValue({ remove: vi.fn() }),
            {
              create: vi.fn().mockResolvedValue({
                phoneNumber: '+15557654321',
                sid: 'PNxxxxxxxxxxxx',
                friendlyName: 'BuildMyBot Phone Agent',
              }),
            },
          ),
        };
      }
      return { default: vi.fn(MockTwilio) };
    });
  });

  afterEach(() => {
    vi.doUnmock('twilio');
    vi.unstubAllGlobals();
  });

  it('purchases a real number via Twilio and links an auto-created voice bot', async () => {
    const token = await signToken({ sub: 'user-1' });
    const insertedBots: any[] = [];
    const insertedNumbers: any[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/rest/v1/users')) {
          return Promise.resolve({
            ok: true,
            json: async () => [AUTH_USER_ROW],
          });
        }
        if (u.includes('/rest/v1/bots') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body));
          insertedBots.push(body);
          return Promise.resolve({ ok: true, json: async () => [body] });
        }
        if (u.includes('/rest/v1/bots')) {
          // findOrCreateVoiceBot's existence check — none yet.
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (u.includes('/rest/v1/phone_numbers') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body));
          insertedNumbers.push(body);
          return Promise.resolve({ ok: true, json: async () => [body] });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      }),
    );

    const req = {
      method: 'POST',
      url: '/api/phone/purchase',
      headers: { cookie: `bmb_session=${token}` },
      body: { phoneNumber: '+15557654321' },
    } as unknown as VercelRequest;
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.phoneNumber).toBe('+15557654321');
    expect(res.body.sid).toBe('PNxxxxxxxxxxxx');
    expect(insertedBots.length).toBe(1);
    expect(insertedBots[0].type).toBe('voice');
    expect(insertedNumbers.length).toBe(1);
    expect(insertedNumbers[0].bot_id).toBe(insertedBots[0].id);
    expect(insertedNumbers[0].number).toBe('+15557654321');
  });
});
