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

describe('GET /api/phone/voice-bot and /api/phone/calls', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('voice-bot returns the existing voice bot without creating a duplicate', async () => {
    const token = await signToken({ sub: 'user-1' });
    const botInserts: any[] = [];

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
          botInserts.push(JSON.parse(String(init.body)));
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (u.includes('/rest/v1/bots')) {
          return Promise.resolve({
            ok: true,
            json: async () => [{ id: 'existing-voice-bot' }],
          });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      }),
    );

    const req = {
      method: 'GET',
      url: '/api/phone/voice-bot',
      headers: { cookie: `bmb_session=${token}` },
      body: {},
    } as unknown as VercelRequest;
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.botId).toBe('existing-voice-bot');
    expect(botInserts.length).toBe(0);
  });

  it('calls returns call_logs scoped to the user’s own voice bots', async () => {
    const token = await signToken({ sub: 'user-1' });
    let callLogsUrl: string | null = null;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('/rest/v1/users')) {
          return Promise.resolve({
            ok: true,
            json: async () => [AUTH_USER_ROW],
          });
        }
        if (u.includes('/rest/v1/bots')) {
          return Promise.resolve({
            ok: true,
            json: async () => [{ id: 'voice-bot-1' }],
          });
        }
        if (u.includes('/rest/v1/call_logs')) {
          callLogsUrl = u;
          return Promise.resolve({
            ok: true,
            json: async () => [
              {
                id: 'call-1',
                caller_number: '+15550001111',
                status: 'completed',
              },
            ],
          });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      }),
    );

    const req = {
      method: 'GET',
      url: '/api/phone/calls',
      headers: { cookie: `bmb_session=${token}` },
      body: {},
    } as unknown as VercelRequest;
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([
      { id: 'call-1', caller_number: '+15550001111', status: 'completed' },
    ]);
    expect(callLogsUrl).toContain('bot_id=in.%28voice-bot-1%29');
  });
});

describe('Standalone voice plans — purchasable independent of chatbot plan', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('blocks purchase with 402 + available plans when the user has no bundled or standalone minutes', async () => {
    const token = await signToken({ sub: 'user-1' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('/rest/v1/users')) {
          // FREE plan (0 bundled minutes), no voice_plan set.
          return Promise.resolve({
            ok: true,
            json: async () => [AUTH_USER_ROW],
          });
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

    expect(res.statusCode).toBe(402);
    expect(res.body.voicePlanRequired).toBe(true);
    expect(res.body.voicePlans.VOICE_BASIC.minutes).toBe(150);
  });

  it('refuses to grant a standalone voice plan without a verified payment (402)', async () => {
    // P0 BILLING FIX: this endpoint used to write users.voice_plan directly,
    // so any authenticated user could self-grant a paid voice plan (and its
    // minutes) for free. Entitlements now come only from a verified Stripe
    // event (api/stripe-webhook.ts). The route must therefore never PATCH
    // users.voice_plan, and must tell the caller to go through checkout.
    const token = await signToken({ sub: 'user-1' });
    let savedVoicePlan: string | null = null;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/rest/v1/users') && init?.method === 'PATCH') {
          savedVoicePlan = JSON.parse(String(init.body)).voice_plan;
          return Promise.resolve({ ok: true, json: async () => [{}] });
        }
        if (u.includes('/rest/v1/users')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              { ...AUTH_USER_ROW, voice_plan: savedVoicePlan },
            ],
          });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      }),
    );

    const selectReq = {
      method: 'POST',
      url: '/api/phone/voice-plan',
      headers: { cookie: `bmb_session=${token}` },
      body: { voicePlan: 'VOICE_BASIC' },
    } as unknown as VercelRequest;
    const selectRes = mockRes();
    await handler(selectReq, selectRes);

    expect(selectRes.statusCode).toBe(402);
    expect(selectRes.body.code).toBe('PAYMENT_REQUIRED');
    expect(savedVoicePlan).toBeNull();

    // ...and the entitlement really is absent afterwards.
    const req = {
      method: 'GET',
      url: '/api/phone/voice-plans',
      headers: { cookie: `bmb_session=${token}` },
      body: {},
    } as unknown as VercelRequest;
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.currentVoicePlan).toBeNull();
  });

  it('still rejects an unknown voice plan key with 400', async () => {
    const token = await signToken({ sub: 'user-1' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [AUTH_USER_ROW] }),
    );
    const req = {
      method: 'POST',
      url: '/api/phone/voice-plan',
      headers: { cookie: `bmb_session=${token}` },
      body: { voicePlan: 'NOT_A_PLAN' },
    } as unknown as VercelRequest;
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
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
          // Executive plan bundles phone minutes, so this test exercises
          // the purchase path unblocked (voice-plan gating has its own
          // describe block below).
          return Promise.resolve({
            ok: true,
            json: async () => [{ ...AUTH_USER_ROW, plan: 'EXECUTIVE' }],
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
