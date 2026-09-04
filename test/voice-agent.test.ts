/**
 * Voice Agent Integration Tests
 * Tests all voice-related functionality including:
 * - Voice Preview API (TTS generation)
 * - Twilio Webhook Handlers
 * - Voice Agent Provisioning
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'node:crypto';

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

// Mock fetch for external API calls
global.fetch = vi.fn();

// The gateway is a very large module — importing it lazily inside a test blew
// the 5s per-test timeout for whichever test happened to be first.
const gatewayHandler = (await import('../api/gateway.js')).default;

let requestCounter = 0;

// Helper to create mock request/response
function createMockRequest(
  method: string = 'POST',
  body: any = {},
  headers: Record<string, string> = {},
  url: string = '/api/voice/preview'
): VercelRequest {
  // The preview handler's rate limiter is a module-level Map keyed by client
  // IP and survives between tests. Without a distinct IP per request the
  // "429 rate limited" test (35 calls) poisoned every later test in the file.
  return {
    method,
    body,
    headers: { 'x-forwarded-for': `10.0.0.${++requestCounter % 250}`, ...headers },
    url,
    cookies: {},
  } as unknown as VercelRequest;
}

type MockResponse = {
  res: VercelResponse;
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: any;
};

/**
 * NOTE: this used to return `{ res, status, headers, body }` by value, so the
 * destructured `status`/`body` in every test stayed frozen at their initial
 * `200` / `null` — the assertions could never fail and never really passed
 * either. They are getters now, so the tests observe what the handler actually
 * wrote.
 */
function createMockResponse(): MockResponse {
  const headers: Record<string, string> = {};
  const state = { status: 200, body: null as any };

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
      headers[key] = value;
      return res;
    }),
    end: vi.fn((data?: any) => {
      if (data !== undefined) state.body = data;
      return res;
    }),
  } as unknown as VercelResponse;

  return {
    res,
    headers,
    get status() {
      return state.status;
    },
    get body() {
      return state.body;
    },
  };
}

/**
 * A real Twilio request signature: base64(HMAC-SHA1(authToken, url + sorted
 * key/value pairs)). The webhook handlers validate against
 * `${APP_BASE_URL}${req.url}`, so tests must sign that exact URL.
 */
function twilioSignature(url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac('sha1', process.env.TWILIO_AUTH_TOKEN as string)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');
}

function signedTwilioRequest(
  path: string,
  body: Record<string, string>,
): VercelRequest {
  const url = `${process.env.APP_BASE_URL}${path}`;
  return createMockRequest('POST', body, {
    'x-twilio-signature': twilioSignature(url, body),
  }, path);
}

/** Session cookie in the gateway's own `base64url(payload).hmac` format. */
function sessionCookie(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', process.env.SESSION_JWT_SECRET as string)
    .update(encoded)
    .digest('base64url');
  return `bmb_session=${encoded}.${sig}`;
}

const TEST_USER_ROW = {
  id: 'test-user',
  email: 'test@example.com',
  role: 'OWNER',
  organization_id: 'test-org',
  plan: 'PROFESSIONAL',
};

/**
 * URL-aware Supabase mock. The previous sequential `mockResolvedValueOnce`
 * chains silently mis-fed the handler once authentication started making its
 * own `users` lookup, so every provisioning test 401'd.
 */
function mockSupabase(routes: {
  bots?: any[];
  voice_agents?: any[];
  insert?: any[];
  user?: any;
}) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    const json = (data: any) => Promise.resolve({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(data),
      json: async () => data,
    });
    if (u.includes('/rest/v1/users')) return json([routes.user ?? TEST_USER_ROW]);
    if (u.includes('/rest/v1/voice_agents')) {
      if (init?.method === 'POST') return json(routes.insert ?? [{ id: 'new-agent', bot_id: 'test-bot' }]);
      return json(routes.voice_agents ?? []);
    }
    if (u.includes('/rest/v1/bots')) return json(routes.bots ?? []);
    return json([]);
  });
}

describe('Voice Agent Features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Voice Preview API', () => {
    it('should return 405 for non-POST methods', async () => {
      const rsp = createMockResponse();
      const res = rsp.res;
      const req = createMockRequest('GET', {}, {}, '/api/voice/preview');
      
      // Import the handler dynamically
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(rsp.status).toBe(405);
    });

    it('should return 400 for missing text', async () => {
      const rsp = createMockResponse();
      const res = rsp.res;
      const req = createMockRequest('POST', {}, {}, '/api/voice/preview');
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(rsp.status).toBe(400);
      expect(rsp.body.error).toContain('Text required');
    });

    it('should return 400 for text that is too long', async () => {
      const rsp = createMockResponse();
      const res = rsp.res;
      const longText = 'a'.repeat(5001);
      const req = createMockRequest('POST', { text: longText }, {}, '/api/voice/preview');
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(rsp.status).toBe(400);
      expect(rsp.body.error).toContain('Text too long');
    });

    it('should return 400 for invalid speed', async () => {
      const rsp = createMockResponse();
      const res = rsp.res;
      const req = createMockRequest('POST', { text: 'Hello', speed: 3.0 }, {}, '/api/voice/preview');
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(rsp.status).toBe(400);
      expect(rsp.body.error).toContain('Speed must be between');
    });

    it('should return 429 for rate limited requests', async () => {
      const rsp = createMockResponse();
      const res = rsp.res;
      const req = createMockRequest('POST', { text: 'Hello' }, {}, '/api/voice/preview');
      
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
      
      expect(rsp.status).toBe(429);
      expect(rsp.body.error).toContain('Too many requests');
    });

    it('should return 400 for unsupported provider', async () => {
      const rsp = createMockResponse();
      const res = rsp.res;
      const req = createMockRequest('POST', { text: 'Hello', provider: 'invalid-provider' }, {}, '/api/voice/preview');
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(rsp.status).toBe(400);
      expect(rsp.body.error).toContain('Unsupported provider');
    });

    it('should use OpenAI provider when configured', async () => {
      const rsp = createMockResponse();
      const res = rsp.res;
      const req = createMockRequest('POST', { text: 'Hello World', provider: 'openai' }, {}, '/api/voice/preview');
      
      // Mock OpenAI TTS response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(rsp.status).toBe(200);
      expect(rsp.headers['Content-Type']).toBe('audio/mpeg');
      expect(rsp.headers['X-TTS-Provider']).toBe('openai');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/speech',
        expect.any(Object)
      );
    });

    it('should use Cartesia provider when configured', async () => {
      const rsp = createMockResponse();
      const res = rsp.res;
      const req = createMockRequest('POST', { text: 'Hello World', provider: 'cartesia' }, {}, '/api/voice/preview');
      
      // Mock Cartesia TTS response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(rsp.status).toBe(200);
      expect(rsp.headers['Content-Type']).toBe('audio/mpeg');
      expect(rsp.headers['X-TTS-Provider']).toBe('cartesia');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cartesia.ai/v1/tts',
        expect.any(Object)
      );
    });

    it('should fallback to available provider when preferred is not configured', async () => {
      const rsp = createMockResponse();
      const res = rsp.res;
      const req = createMockRequest('POST', { text: 'Hello World', provider: 'cartesia' }, {}, '/api/voice/preview');
      
      // Temporarily remove Cartesia key to force fallback
      const originalCartesiaKey = process.env.CARTESIA_API_KEY;
      delete process.env.CARTESIA_API_KEY;
      
      // Mock OpenAI TTS response (fallback)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(rsp.status).toBe(200);
      expect(rsp.headers['X-TTS-Provider']).toBe('openai'); // Should fallback to OpenAI
      
      // Restore original key
      process.env.CARTESIA_API_KEY = originalCartesiaKey;
    });

    it('should return 500 when no providers are configured', async () => {
      const rsp = createMockResponse();
      const res = rsp.res;
      const req = createMockRequest('POST', { text: 'Hello World' }, {}, '/api/voice/preview');
      
      // Temporarily remove all provider keys
      const originalOpenaiKey = process.env.OPENAI_API_KEY;
      const originalCartesiaKey = process.env.CARTESIA_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.CARTESIA_API_KEY;
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(rsp.status).toBe(500);
      expect(rsp.body.error).toContain('No TTS provider configured');
      
      // Restore original keys
      process.env.OPENAI_API_KEY = originalOpenaiKey;
      process.env.CARTESIA_API_KEY = originalCartesiaKey;
    });
  });

  describe('Twilio Webhook Handlers', () => {
    it('should return 405 for non-POST methods in voice-handler', async () => {
      const rsp = createMockResponse();
      const res = rsp.res;
      const req = createMockRequest('GET', {}, {}, '/api/twilio/voice-handler');
      
      const { voiceHandler } = await import('../api/twilio/webhooks.js');
      
      await voiceHandler(req, res);
      
      expect(rsp.status).toBe(405);
    });

    it('should return 403 for unsigned/spoofed Twilio requests', async () => {
      const rsp = createMockResponse();
      const res = rsp.res;
      const req = createMockRequest('POST', {}, {}, '/api/twilio/voice-handler');
      
      const { voiceHandler } = await import('../api/twilio/webhooks.js');
      
      await voiceHandler(req, res);
      
      expect(rsp.status).toBe(403);
      expect(rsp.body.error).toContain('Invalid Twilio request');
    });

    it('should return TwiML for valid voice-handler requests', async () => {
      const rsp = createMockResponse();
      const res = rsp.res;
      const req = signedTwilioRequest(
        '/api/twilio/voice-handler?leadId=test-lead&objective=Test+call',
        { CallSid: 'test-call-sid' },
      );
      
      // The greeting comes from callLLM, not a raw fetch — mocking
      // global.fetch left a real outbound LLM call in the test path, which
      // intermittently blew the 5s timeout under a full-suite run.
      vi.resetModules();
      vi.doMock('../api/ai-team/lib.js', () => ({
        callLLM: vi.fn().mockResolvedValue('Hello, this is a test greeting'),
      }));

      const { voiceHandler } = await import('../api/twilio/webhooks.js');
      await voiceHandler(req, res);
      vi.doUnmock('../api/ai-team/lib.js');

      expect(rsp.body).toContain('Hello, this is a test greeting');
      
      expect(rsp.status).toBe(200);
      expect(rsp.headers['Content-Type']).toBe('text/xml');
      expect(rsp.body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(rsp.body).toContain('<Response>');
      expect(rsp.body).toContain('<Say voice="Polly.Joanna">');
      expect(rsp.body).toContain('<Gather');
    }, 20_000);

    it('should return TwiML for voice-respond with speech input', async () => {
      const rsp = createMockResponse();
      const req = signedTwilioRequest(
        '/api/twilio/voice-respond?leadId=test-lead&turn=1',
        { SpeechResult: 'Hello, I have a question' },
      );

      // voiceRespond generates its reply through callLLM (api/ai-team/lib),
      // not a raw fetch — mocking global.fetch never reached it, so the
      // handler always fell back to its canned answer and the assertion
      // could not test anything.
      vi.resetModules();
      vi.doMock('../api/ai-team/lib.js', () => ({
        callLLM: vi.fn().mockResolvedValue('That is a great question!'),
      }));

      const { voiceRespond } = await import('../api/twilio/webhooks.js');
      await voiceRespond(req, rsp.res);
      vi.doUnmock('../api/ai-team/lib.js');

      expect(rsp.status).toBe(200);
      expect(rsp.headers['Content-Type']).toBe('text/xml');
      expect(rsp.body).toContain('<Say voice=');
      expect(rsp.body).toContain('That is a great question!');
      expect(rsp.body).toContain('<Gather');
    }, 20_000);

    it('falls back to a safe canned reply when the LLM fails', async () => {
      const rsp = createMockResponse();
      const req = signedTwilioRequest(
        '/api/twilio/voice-respond?leadId=test-lead&turn=1',
        { SpeechResult: 'Hello' },
      );

      vi.resetModules();
      vi.doMock('../api/ai-team/lib.js', () => ({
        callLLM: vi.fn().mockRejectedValue(new Error('LLM down')),
      }));

      const { voiceRespond } = await import('../api/twilio/webhooks.js');
      await voiceRespond(req, rsp.res);
      vi.doUnmock('../api/ai-team/lib.js');

      expect(rsp.status).toBe(200);
      expect(rsp.body).toContain('<Response>');
      expect(rsp.body).toContain('follow up with you by email');
    }, 20_000);

    it('should end the conversation once the turn cap is exceeded', async () => {
      const rsp = createMockResponse();
      // The handler caps the call at 10 answered turns; the Gather action
      // increments `turn`, so the 11th request is the one that hangs up.
      const req = signedTwilioRequest(
        '/api/twilio/voice-respond?leadId=test-lead&turn=11',
        { SpeechResult: 'Hello' },
      );

      const { voiceRespond } = await import('../api/twilio/webhooks.js');
      await voiceRespond(req, rsp.res);

      expect(rsp.status).toBe(200);
      expect(rsp.body).toContain('<Hangup/>');
      expect(rsp.body).toContain('Thank you so much for your time');
      expect(rsp.body).not.toContain('<Gather');
    });

    it('should end conversation for empty speech result', async () => {
      const rsp = createMockResponse();
      const res = rsp.res;
      const req = signedTwilioRequest(
        '/api/twilio/voice-respond?leadId=test-lead&turn=1',
        { SpeechResult: '' },
      );
      
      const { voiceRespond } = await import('../api/twilio/webhooks.js');
      
      await voiceRespond(req, res);
      
      expect(rsp.status).toBe(200);
      expect(rsp.body).toContain('<Hangup/>');
    });
  });

  describe('Voice Agent Provisioning', () => {
    // These routes live behind the gateway's session auth, so every case
    // needs a signed session cookie; without one the handler correctly 401s.
    const cookie = () =>
      sessionCookie({ sub: 'test-user', userId: 'test-user' });

    function provisionRequest(path: string, body: any): VercelRequest {
      return createMockRequest('POST', body, { cookie: cookie() }, path);
    }

    it('should return 401 without a session', async () => {
      const rsp = createMockResponse();
      vi.stubGlobal('fetch', mockSupabase({}));
      const req = createMockRequest(
        'POST',
        { voiceId: 'test-voice' },
        {},
        '/api/voice/agents/test-bot/provision',
      );

      await gatewayHandler(req, rsp.res);

      expect(rsp.status).toBe(401);
    });

    it('should return 404 for non-existent bot', async () => {
      const rsp = createMockResponse();
      vi.stubGlobal('fetch', mockSupabase({ bots: [] }));
      const req = provisionRequest(
        '/api/voice/agents/non-existent-bot/provision',
        { voiceId: 'test-voice' },
      );

      await gatewayHandler(req, rsp.res);

      expect(rsp.status).toBe(404);
      expect(rsp.body.error).toContain('Bot not found');
    });

    it("should return 404 for another tenant's bot", async () => {
      const rsp = createMockResponse();
      // The bot exists, but belongs to another organization — the scoped
      // lookup filters it out, so the caller must not learn it exists.
      vi.stubGlobal('fetch', mockSupabase({ bots: [] }));
      const req = provisionRequest(
        '/api/voice/agents/other-tenant-bot/provision',
        { voiceId: 'test-voice' },
      );

      await gatewayHandler(req, rsp.res);

      expect(rsp.status).toBe(404);
    });

    it('should return 400 for missing voiceId', async () => {
      const rsp = createMockResponse();
      vi.stubGlobal('fetch', mockSupabase({
        bots: [{ id: 'test-bot', organization_id: 'test-org', user_id: 'test-user' }],
      }));
      const req = provisionRequest('/api/voice/agents/test-bot/provision', {});

      await gatewayHandler(req, rsp.res);

      expect(rsp.status).toBe(400);
      expect(rsp.body.error).toContain('voiceId is required');
    });

    it('should return 400 for invalid provider', async () => {
      const rsp = createMockResponse();
      vi.stubGlobal('fetch', mockSupabase({
        bots: [{ id: 'test-bot', organization_id: 'test-org', user_id: 'test-user' }],
      }));
      const req = provisionRequest('/api/voice/agents/test-bot/provision', {
        voiceId: 'test-voice',
        provider: 'invalid-provider',
      });

      await gatewayHandler(req, rsp.res);

      expect(rsp.status).toBe(400);
      expect(rsp.body.error).toContain('Invalid provider');
    });

    it('should return 409 for existing voice agent', async () => {
      const rsp = createMockResponse();
      vi.stubGlobal('fetch', mockSupabase({
        bots: [{ id: 'test-bot', organization_id: 'test-org', user_id: 'test-user' }],
        voice_agents: [{ id: 'existing-agent' }],
      }));
      const req = provisionRequest('/api/voice/agents/test-bot/provision', {
        voiceId: 'test-voice',
      });

      await gatewayHandler(req, rsp.res);

      expect(rsp.status).toBe(409);
      expect(rsp.body.error).toContain('Voice agent already provisioned');
    });

    it('should create voice agent successfully', async () => {
      const rsp = createMockResponse();
      const fetchMock = mockSupabase({
        bots: [{ id: 'test-bot', organization_id: 'test-org', user_id: 'test-user' }],
        voice_agents: [],
      });
      vi.stubGlobal('fetch', fetchMock);
      const req = provisionRequest('/api/voice/agents/test-bot/provision', {
        voiceId: 'test-voice',
        provider: 'cartesia',
      });

      await gatewayHandler(req, rsp.res);

      expect(rsp.status).toBe(201);
      expect(rsp.body.success).toBe(true);
      expect(rsp.body.message).toContain('Voice agent provisioned successfully');
    });

    it('ignores a client-supplied organizationId and minutes_limit', async () => {
      // Regression guard for the P0 billing fix: the insert must use the
      // caller's own org and a server-derived minutes limit.
      const rsp = createMockResponse();
      const fetchMock = mockSupabase({
        bots: [{ id: 'test-bot', organization_id: 'test-org', user_id: 'test-user' }],
        voice_agents: [],
      });
      vi.stubGlobal('fetch', fetchMock);
      const req = provisionRequest('/api/voice/agents/test-bot/provision', {
        voiceId: 'test-voice',
        organizationId: 'victim-org',
        organization_id: 'victim-org',
        minutes_limit: 999999,
        plan: 'ENTERPRISE',
      });

      await gatewayHandler(req, rsp.res);

      expect(rsp.status).toBe(201);
      const insertCall = fetchMock.mock.calls.find(
        ([url, init]: any[]) =>
          String(url).includes('/rest/v1/voice_agents') && init?.method === 'POST',
      );
      expect(insertCall).toBeTruthy();
      const inserted = JSON.parse(String(insertCall![1].body));
      expect(inserted.organization_id).toBe('test-org');
      expect(inserted.minutes_limit).not.toBe(999999);
    });
  });
});
