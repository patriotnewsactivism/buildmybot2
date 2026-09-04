/**
 * Voice Agent Integration Tests
 * Tests all voice-related functionality including:
 * - Voice Preview API (TTS generation)
 * - Twilio Webhook Handlers
 * - Voice Agent Provisioning
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock environment variables
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.CARTESIA_API_KEY = 'test-cartesia-key';
process.env.TWILIO_ACCOUNT_SID = 'test-twilio-sid';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.TWILIO_PHONE_NUMBER = '+1234567890';
process.env.APP_BASE_URL = 'https://test.buildmybot.app';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-supabase-key';
process.env.SESSION_JWT_SECRET = 'test-session-secret';

process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

// Mock fetch for external API calls
global.fetch = vi.fn();

// Snapshot of the env every test starts from — individual tests delete
// provider keys to exercise fallbacks and used to leak that state into
// later tests (which is one reason this suite could not be a CI gate).
const ENV_SNAPSHOT = { ...process.env };

let ipCounter = 0;

// Helper to create mock request/response
function createMockRequest(
  method = 'POST',
  body: any = {},
  headers: Record<string, string> = {},
  url = '/api/voice/preview',
): VercelRequest {
  ipCounter += 1;
  return {
    method,
    body,
    // Each request gets a distinct client IP so per-IP rate limiting in
    // the handlers cannot make one test fail because of another.
    headers: { 'x-forwarded-for': `198.51.100.${ipCounter % 250}`, ...headers },
    url,
    cookies: {},
  } as unknown as VercelRequest;
}

interface MockResponse {
  res: VercelResponse;
  /** Live values — read AFTER the handler runs. */
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: any;
}

// NOTE: the previous version returned plain destructured values, which
// snapshotted status/mock.body at 200/null BEFORE the handler ran, so every
// assertion silently tested the initial state. Getters keep them live.
function createMockResponse(): MockResponse {
  const state = {
    status: 200,
    headers: {} as Record<string, string>,
    body: null as any,
  };

  const res = {
    status: vi.fn((code: number) => {
      state.status = code;
      return res;
    }),
    json: vi.fn((data: any) => {
      state.body = data;
      return res;
    }),
    send: vi.fn((data: any) => {
      state.body = data;
      return res;
    }),
    setHeader: vi.fn((key: string, value: string) => {
      state.headers[key] = value;
      return res;
    }),
    end: vi.fn((data?: any) => {
      if (data !== undefined) state.body = data;
      return res;
    }),
  } as unknown as VercelResponse;

  return {
    res,
    get status() {
      return state.status;
    },
    get headers() {
      return state.headers;
    },
    get body() {
      return state.body;
    },
  };
}

/** Signs a session token exactly like api/auth/login.ts does. */
async function signSession(userId: string): Promise<string> {
  const crypto = await import('node:crypto');
  const payload = {
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', process.env.SESSION_JWT_SECRET as string)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

const TEST_USER = {
  id: 'test-user',
  email: 'test@example.com',
  role: 'OWNER',
  organization_id: 'test-org',
  plan: 'PROFESSIONAL',
  status: 'Active',
};

/**
 * Routes Supabase REST calls: the user lookup performed by getAuthUser is
 * answered from TEST_USER, everything else is served from a queue of
 * per-test responses. The old suite tried `vi.spyOn(any, 'getAuthUser')`,
 * which never patched anything, so every provisioning test 401'd.
 */
function mockSupabase(queue: any[][]) {
  const pending = [...queue];
  global.fetch = vi.fn(async (url: any) => {
    const href = String(url);
    if (href.includes('/rest/v1/users')) {
      return {
        ok: true,
        status: 200,
        json: async () => [TEST_USER],
        text: async () => JSON.stringify([TEST_USER]),
      } as any;
    }
    const next = pending.length ? pending.shift() : [];
    return {
      ok: true,
      status: 200,
      json: async () => next,
      text: async () => JSON.stringify(next),
    } as any;
  }) as any;
}

async function authedRequest(
  method: string,
  body: any,
  url: string,
): Promise<VercelRequest> {
  const token = await signSession(TEST_USER.id);
  return createMockRequest(
    method,
    body,
    { cookie: `bmb_session=${token}` },
    url,
  );
}

describe('Voice Agent Features', () => {
  // Warm the handler modules once. Importing the gateway (Sentry, Supabase
  // client, Twilio SDK) can take several seconds on a cold worker, which
  // used to blow the default 5s per-test timeout under parallel CI load.
  beforeAll(async () => {
    await Promise.all([
      import('../api/gateway.js'),
      import('../api/voice/preview.js'),
      import('../api/twilio/webhooks.js'),
    ]);
  }, 60_000);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    // Restore env + a fresh fetch mock for every test.
    for (const key of Object.keys(process.env)) {
      if (!(key in ENV_SNAPSHOT)) Reflect.deleteProperty(process.env, key);
    }
    Object.assign(process.env, ENV_SNAPSHOT);
    global.fetch = vi.fn();
    // Handlers read config at import time in places; drop the module
    // registry so per-test env changes are actually observed.
    vi.resetModules();
  });

  describe('Voice Preview API', () => {
    it('should return 405 for non-POST methods', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest('GET', {}, {}, '/api/voice/preview');

      // Import the handler dynamically
      const { default: handler } = await import('../api/voice/preview.js');

      await handler(req, res);

      expect(mock.status).toBe(405);
    });

    it('should return 400 for missing text', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest('POST', {}, {}, '/api/voice/preview');

      const { default: handler } = await import('../api/voice/preview.js');

      await handler(req, res);

      expect(mock.status).toBe(400);
      expect(mock.body.error).toContain('Text required');
    });

    it('should return 400 for text that is too long', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const longText = 'a'.repeat(5001);
      const req = createMockRequest(
        'POST',
        { text: longText },
        {},
        '/api/voice/preview',
      );

      const { default: handler } = await import('../api/voice/preview.js');

      await handler(req, res);

      expect(mock.status).toBe(400);
      expect(mock.body.error).toContain('Text too long');
    });

    it('should return 400 for invalid speed', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest(
        'POST',
        { text: 'Hello', speed: 3.0 },
        {},
        '/api/voice/preview',
      );

      const { default: handler } = await import('../api/voice/preview.js');

      await handler(req, res);

      expect(mock.status).toBe(400);
      expect(mock.body.error).toContain('Speed must be between');
    });

    it('should return 429 for rate limited requests', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest(
        'POST',
        { text: 'Hello' },
        {},
        '/api/voice/preview',
      );

      const { default: handler } = await import('../api/voice/preview.js');

      // First request should work (mock fetch to return success)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      // Make multiple requests to trigger rate limit
      for (let i = 0; i < 35; i++) {
        await handler(req, res);
      }

      expect(mock.status).toBe(429);
      expect(mock.body.error).toContain('Too many requests');
    });

    it('should return 400 for unsupported provider', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest(
        'POST',
        { text: 'Hello', provider: 'invalid-provider' },
        {},
        '/api/voice/preview',
      );

      const { default: handler } = await import('../api/voice/preview.js');

      await handler(req, res);

      expect(mock.status).toBe(400);
      expect(mock.body.error).toContain('Unsupported provider');
    });

    it('should use OpenAI provider when configured', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest(
        'POST',
        { text: 'Hello World', provider: 'openai' },
        {},
        '/api/voice/preview',
      );

      // Mock OpenAI TTS response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      const { default: handler } = await import('../api/voice/preview.js');

      await handler(req, res);

      expect(mock.status).toBe(200);
      expect(mock.headers['Content-Type']).toBe('audio/mpeg');
      expect(mock.headers['X-TTS-Provider']).toBe('openai');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/speech',
        expect.any(Object),
      );
    });

    it('should use Cartesia provider when configured', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest(
        'POST',
        { text: 'Hello World', provider: 'cartesia' },
        {},
        '/api/voice/preview',
      );

      // Mock Cartesia TTS response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      const { default: handler } = await import('../api/voice/preview.js');

      await handler(req, res);

      expect(mock.status).toBe(200);
      expect(mock.headers['Content-Type']).toBe('audio/mpeg');
      expect(mock.headers['X-TTS-Provider']).toBe('cartesia');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cartesia.ai/v1/tts',
        expect.any(Object),
      );
    });

    it('should fallback to available provider when preferred is not configured', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest(
        'POST',
        { text: 'Hello World', provider: 'cartesia' },
        {},
        '/api/voice/preview',
      );

      // Temporarily remove Cartesia key to force fallback
      const originalCartesiaKey = process.env.CARTESIA_API_KEY;
      Reflect.deleteProperty(process.env, 'CARTESIA_API_KEY');

      // Mock OpenAI TTS response (fallback)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      const { default: handler } = await import('../api/voice/preview.js');

      await handler(req, res);

      expect(mock.status).toBe(200);
      expect(mock.headers['X-TTS-Provider']).toBe('openai'); // Should fallback to OpenAI

      // Restore original key
      process.env.CARTESIA_API_KEY = originalCartesiaKey;
    });

    it('should return 500 when no providers are configured', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest(
        'POST',
        { text: 'Hello World' },
        {},
        '/api/voice/preview',
      );

      // Temporarily remove all provider keys
      const originalOpenaiKey = process.env.OPENAI_API_KEY;
      const originalCartesiaKey = process.env.CARTESIA_API_KEY;
      Reflect.deleteProperty(process.env, 'OPENAI_API_KEY');
      Reflect.deleteProperty(process.env, 'CARTESIA_API_KEY');

      const { default: handler } = await import('../api/voice/preview.js');

      await handler(req, res);

      expect(mock.status).toBe(500);
      expect(mock.body.error).toContain('No TTS provider configured');

      // Restore original keys
      process.env.OPENAI_API_KEY = originalOpenaiKey;
      process.env.CARTESIA_API_KEY = originalCartesiaKey;
    });
  });

  describe('Twilio Webhook Handlers', () => {
    it('should return 405 for non-POST methods in voice-handler', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest('GET', {}, {}, '/api/twilio/voice-handler');

      const { voiceHandler } = await import('../api/twilio/webhooks.js');

      await voiceHandler(req, res);

      expect(mock.status).toBe(405);
    });

    it('should return 403 for invalid Twilio requests', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest(
        'POST',
        {},
        {},
        '/api/twilio/voice-handler',
      );

      const { voiceHandler } = await import('../api/twilio/webhooks.js');

      await voiceHandler(req, res);

      expect(mock.status).toBe(403);
      expect(mock.body.error).toContain('Invalid Twilio request');
    }, 30_000);

    it('should return TwiML for valid voice-handler requests', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest(
        'POST',
        { CallSid: 'test-call-sid' },
        {},
        '/api/twilio/voice-handler?leadId=test-lead&objective=Test+call',
      );

      // Mock the OpenRouter chat completion the handler actually calls.
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              choices: [
                { message: { content: 'Hello, this is a test greeting' } },
              ],
            }),
          ),
        json: () =>
          Promise.resolve({
            choices: [
              { message: { content: 'Hello, this is a test greeting' } },
            ],
          }),
      });

      const { voiceHandler } = await import('../api/twilio/webhooks.js');

      await voiceHandler(req, res);

      expect(mock.status).toBe(200);
      expect(mock.headers['Content-Type']).toBe('text/xml');
      expect(mock.body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(mock.body).toContain('<Response>');
      expect(mock.body).toContain('<Say voice="Polly.Joanna">');
      expect(mock.body).toContain('<Gather');
    });

    it('should return TwiML for voice-respond with speech input', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest(
        'POST',
        { SpeechResult: 'Hello, I have a question' },
        {},
        '/api/twilio/voice-respond?leadId=test-lead&turn=1',
      );

      // Mock the OpenRouter chat completion the handler actually calls.
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              choices: [{ message: { content: 'That is a great question!' } }],
            }),
          ),
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'That is a great question!' } }],
          }),
      });

      const { voiceRespond } = await import('../api/twilio/webhooks.js');

      await voiceRespond(req, res);

      expect(mock.status).toBe(200);
      expect(mock.headers['Content-Type']).toBe('text/xml');
      expect(mock.body).toContain('<Say voice="Polly.Joanna">');
      expect(mock.body).toContain('That is a great question!');
    });

    it('should end conversation after 10 turns', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest(
        'POST',
        { SpeechResult: 'Hello' },
        {},
        '/api/twilio/voice-respond?leadId=test-lead&turn=10',
      );

      const { voiceRespond } = await import('../api/twilio/webhooks.js');

      await voiceRespond(req, res);

      expect(mock.status).toBe(200);
      expect(mock.body).toContain('<Hangup/>');
      expect(mock.body).toContain('Thank you so much for your time');
    });

    it('should end conversation for empty speech result', async () => {
      const mock = createMockResponse();
      const res = mock.res;
      const req = createMockRequest(
        'POST',
        { SpeechResult: '' },
        {},
        '/api/twilio/voice-respond?leadId=test-lead&turn=1',
      );

      const { voiceRespond } = await import('../api/twilio/webhooks.js');

      await voiceRespond(req, res);

      expect(mock.status).toBe(200);
      expect(mock.body).toContain('<Hangup/>');
    });
  });

  describe('Voice Agent Provisioning', () => {
    it('rejects unauthenticated provisioning', async () => {
      const mock = createMockResponse();
      mockSupabase([]);
      const req = createMockRequest(
        'POST',
        { voiceId: 'test-voice' },
        {},
        '/api/voice/agents/test-bot/provision',
      );
      const { default: handler } = await import('../api/gateway.js');
      await handler(req, mock.res);
      expect(mock.status).toBe(401);
    }, 30_000);

    it('should return 404 for non-existent bot', async () => {
      const mock = createMockResponse();
      mockSupabase([[]]); // bot lookup -> not found
      const req = await authedRequest(
        'POST',
        { voiceId: 'test-voice' },
        '/api/voice/agents/non-existent-bot/provision',
      );
      const { default: handler } = await import('../api/gateway.js');
      await handler(req, mock.res);
      expect(mock.status).toBe(404);
      expect(mock.body.error).toContain('Bot not found');
    });

    it('should return 400 for missing voiceId', async () => {
      const mock = createMockResponse();
      mockSupabase([[{ id: 'test-bot', organization_id: 'test-org' }]]);
      const req = await authedRequest(
        'POST',
        {},
        '/api/voice/agents/test-bot/provision',
      );
      const { default: handler } = await import('../api/gateway.js');
      await handler(req, mock.res);
      expect(mock.status).toBe(400);
      expect(mock.body.error).toContain('voiceId is required');
    });

    it('should return 400 for invalid provider', async () => {
      const mock = createMockResponse();
      mockSupabase([[{ id: 'test-bot', organization_id: 'test-org' }]]);
      const req = await authedRequest(
        'POST',
        { voiceId: 'test-voice', provider: 'invalid-provider' },
        '/api/voice/agents/test-bot/provision',
      );
      const { default: handler } = await import('../api/gateway.js');
      await handler(req, mock.res);
      expect(mock.status).toBe(400);
      expect(mock.body.error).toContain('Invalid provider');
    });
  });
});
