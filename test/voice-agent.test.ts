/**
 * Voice Agent Integration Tests
 * Tests all voice-related functionality including:
 * - Voice Preview API (TTS generation)
 * - Twilio Webhook Handlers
 * - Voice Agent Provisioning
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

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

// Helper to create mock request/response
function createMockRequest(
  method: string = 'POST',
  body: any = {},
  headers: Record<string, string> = {},
  url: string = '/api/voice/preview'
): VercelRequest {
  return {
    method,
    body,
    headers,
    url,
    cookies: {},
  } as unknown as VercelRequest;
}

function createMockResponse(): { res: VercelResponse; status: number; headers: Record<string, string>; body: any } {
  const headers: Record<string, string> = {};
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
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    end: vi.fn(() => res),
  } as unknown as VercelResponse;
  
  return { res, status, headers, body };
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
      const { res, status } = createMockResponse();
      const req = createMockRequest('GET', {}, {}, '/api/voice/preview');
      
      // Import the handler dynamically
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(status).toBe(405);
    });

    it('should return 400 for missing text', async () => {
      const { res, status, body } = createMockResponse();
      const req = createMockRequest('POST', {}, {}, '/api/voice/preview');
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(status).toBe(400);
      expect(body.error).toContain('Text required');
    });

    it('should return 400 for text that is too long', async () => {
      const { res, status, body } = createMockResponse();
      const longText = 'a'.repeat(5001);
      const req = createMockRequest('POST', { text: longText }, {}, '/api/voice/preview');
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(status).toBe(400);
      expect(body.error).toContain('Text too long');
    });

    it('should return 400 for invalid speed', async () => {
      const { res, status, body } = createMockResponse();
      const req = createMockRequest('POST', { text: 'Hello', speed: 3.0 }, {}, '/api/voice/preview');
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(status).toBe(400);
      expect(body.error).toContain('Speed must be between');
    });

    it('should return 429 for rate limited requests', async () => {
      const { res, status, body } = createMockResponse();
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
      
      expect(status).toBe(429);
      expect(body.error).toContain('Too many requests');
    });

    it('should return 400 for unsupported provider', async () => {
      const { res, status, body } = createMockResponse();
      const req = createMockRequest('POST', { text: 'Hello', provider: 'invalid-provider' }, {}, '/api/voice/preview');
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(status).toBe(400);
      expect(body.error).toContain('Unsupported provider');
    });

    it('should use OpenAI provider when configured', async () => {
      const { res, status, headers, body } = createMockResponse();
      const req = createMockRequest('POST', { text: 'Hello World', provider: 'openai' }, {}, '/api/voice/preview');
      
      // Mock OpenAI TTS response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(status).toBe(200);
      expect(headers['Content-Type']).toBe('audio/mpeg');
      expect(headers['X-TTS-Provider']).toBe('openai');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/speech',
        expect.any(Object)
      );
    });

    it('should use Cartesia provider when configured', async () => {
      const { res, status, headers, body } = createMockResponse();
      const req = createMockRequest('POST', { text: 'Hello World', provider: 'cartesia' }, {}, '/api/voice/preview');
      
      // Mock Cartesia TTS response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(status).toBe(200);
      expect(headers['Content-Type']).toBe('audio/mpeg');
      expect(headers['X-TTS-Provider']).toBe('cartesia');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cartesia.ai/v1/tts',
        expect.any(Object)
      );
    });

    it('should fallback to available provider when preferred is not configured', async () => {
      const { res, status, headers } = createMockResponse();
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
      
      expect(status).toBe(200);
      expect(headers['X-TTS-Provider']).toBe('openai'); // Should fallback to OpenAI
      
      // Restore original key
      process.env.CARTESIA_API_KEY = originalCartesiaKey;
    });

    it('should return 500 when no providers are configured', async () => {
      const { res, status, body } = createMockResponse();
      const req = createMockRequest('POST', { text: 'Hello World' }, {}, '/api/voice/preview');
      
      // Temporarily remove all provider keys
      const originalOpenaiKey = process.env.OPENAI_API_KEY;
      const originalCartesiaKey = process.env.CARTESIA_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.CARTESIA_API_KEY;
      
      const { default: handler } = await import('../api/voice/preview.js');
      
      await handler(req, res);
      
      expect(status).toBe(500);
      expect(body.error).toContain('No TTS provider configured');
      
      // Restore original keys
      process.env.OPENAI_API_KEY = originalOpenaiKey;
      process.env.CARTESIA_API_KEY = originalCartesiaKey;
    });
  });

  describe('Twilio Webhook Handlers', () => {
    it('should return 405 for non-POST methods in voice-handler', async () => {
      const { res, status } = createMockResponse();
      const req = createMockRequest('GET', {}, {}, '/api/twilio/voice-handler');
      
      const { voiceHandler } = await import('../api/twilio/webhooks.js');
      
      await voiceHandler(req, res);
      
      expect(status).toBe(405);
    });

    it('should return 403 for invalid Twilio requests', async () => {
      const { res, status, body } = createMockResponse();
      const req = createMockRequest('POST', {}, {}, '/api/twilio/voice-handler');
      
      const { voiceHandler } = await import('../api/twilio/webhooks.js');
      
      await voiceHandler(req, res);
      
      expect(status).toBe(403);
      expect(body.error).toContain('Invalid Twilio request');
    });

    it('should return TwiML for valid voice-handler requests', async () => {
      const { res, status, headers, body } = createMockResponse();
      const req = createMockRequest(
        'POST',
        { CallSid: 'test-call-sid' },
        {},
        '/api/twilio/voice-handler?leadId=test-lead&objective=Test+call'
      );
      
      // Mock LLM call for greeting generation
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Hello, this is a test greeting' } }],
        }),
      });
      
      const { voiceHandler } = await import('../api/twilio/webhooks.js');
      
      await voiceHandler(req, res);
      
      expect(status).toBe(200);
      expect(headers['Content-Type']).toBe('text/xml');
      expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(body).toContain('<Response>');
      expect(body).toContain('<Say voice="Polly.Joanna">');
      expect(body).toContain('<Gather');
    });

    it('should return TwiML for voice-respond with speech input', async () => {
      const { res, status, headers, body } = createMockResponse();
      const req = createMockRequest(
        'POST',
        { SpeechResult: 'Hello, I have a question' },
        {},
        '/api/twilio/voice-respond?leadId=test-lead&turn=1'
      );
      
      // Mock LLM call for response generation
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'That is a great question!' } }],
        }),
      });
      
      const { voiceRespond } = await import('../api/twilio/webhooks.js');
      
      await voiceRespond(req, res);
      
      expect(status).toBe(200);
      expect(headers['Content-Type']).toBe('text/xml');
      expect(body).toContain('<Say voice="Polly.Joanna">');
      expect(body).toContain('That is a great question!');
    });

    it('should end conversation after 10 turns', async () => {
      const { res, status, body } = createMockResponse();
      const req = createMockRequest(
        'POST',
        { SpeechResult: 'Hello' },
        {},
        '/api/twilio/voice-respond?leadId=test-lead&turn=10'
      );
      
      const { voiceRespond } = await import('../api/twilio/webhooks.js');
      
      await voiceRespond(req, res);
      
      expect(status).toBe(200);
      expect(body).toContain('<Hangup/>');
      expect(body).toContain('Thank you so much for your time');
    });

    it('should end conversation for empty speech result', async () => {
      const { res, status, body } = createMockResponse();
      const req = createMockRequest(
        'POST',
        { SpeechResult: '' },
        {},
        '/api/twilio/voice-respond?leadId=test-lead&turn=1'
      );
      
      const { voiceRespond } = await import('../api/twilio/webhooks.js');
      
      await voiceRespond(req, res);
      
      expect(status).toBe(200);
      expect(body).toContain('<Hangup/>');
    });
  });

  describe('Voice Agent Provisioning', () => {
    it('should return 404 for non-existent bot', async () => {
      const { res, status, body } = createMockResponse();
      const req = createMockRequest(
        'POST',
        { voiceId: 'test-voice' },
        {},
        '/api/voice/agents/non-existent-bot/provision'
      );
      
      // Mock user
      const user = { id: 'test-user', email: 'test@example.com', role: 'user', organizationId: 'test-org' };
      
      // Mock Supabase response for bot check
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]), // No bot found
      });
      
      const { default: handler } = await import('../api/gateway.js');
      
      // Mock getAuthUser to return our test user
      vi.spyOn(any, 'getAuthUser').mockResolvedValue(user);
      
      await handler(req, res);
      
      expect(status).toBe(404);
      expect(body.error).toContain('Bot not found');
    });

    it('should return 400 for missing voiceId', async () => {
      const { res, status, body } = createMockResponse();
      const req = createMockRequest(
        'POST',
        {}, // No voiceId
        {},
        '/api/voice/agents/test-bot/provision'
      );
      
      const user = { id: 'test-user', email: 'test@example.com', role: 'user', organizationId: 'test-org' };
      
      // Mock Supabase response for bot check
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: 'test-bot', organization_id: 'test-org' }]),
      });
      
      const { default: handler } = await import('../api/gateway.js');
      
      await handler(req, res);
      
      expect(status).toBe(400);
      expect(body.error).toContain('voiceId is required');
    });

    it('should return 400 for invalid provider', async () => {
      const { res, status, body } = createMockResponse();
      const req = createMockRequest(
        'POST',
        { voiceId: 'test-voice', provider: 'invalid-provider' },
        {},
        '/api/voice/agents/test-bot/provision'
      );
      
      const user = { id: 'test-user', email: 'test@example.com', role: 'user', organizationId: 'test-org' };
      
      // Mock Supabase response for bot check
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: 'test-bot', organization_id: 'test-org' }]),
      });
      
      const { default: handler } = await import('../api/gateway.js');
      
      await handler(req, res);
      
      expect(status).toBe(400);
      expect(body.error).toContain('Invalid provider');
    });

    it('should return 409 for existing voice agent', async () => {
      const { res, status, body } = createMockResponse();
      const req = createMockRequest(
        'POST',
        { voiceId: 'test-voice' },
        {},
        '/api/voice/agents/test-bot/provision'
      );
      
      const user = { id: 'test-user', email: 'test@example.com', role: 'user', organizationId: 'test-org' };
      
      // Mock Supabase responses
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ id: 'test-bot', organization_id: 'test-org' }]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ id: 'existing-agent' }]), // Existing agent found
        });
      
      const { default: handler } = await import('../api/gateway.js');
      
      await handler(req, res);
      
      expect(status).toBe(409);
      expect(body.error).toContain('Voice agent already provisioned');
    });

    it('should create voice agent successfully', async () => {
      const { res, status, body } = createMockResponse();
      const req = createMockRequest(
        'POST',
        { voiceId: 'test-voice', provider: 'cartesia' },
        {},
        '/api/voice/agents/test-bot/provision'
      );
      
      const user = { id: 'test-user', email: 'test@example.com', role: 'user', organizationId: 'test-org' };
      
      // Mock Supabase responses
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ id: 'test-bot', organization_id: 'test-org' }]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]), // No existing agent
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ id: 'new-agent', bot_id: 'test-bot' }]),
        });
      
      const { default: handler } = await import('../api/gateway.js');
      
      await handler(req, res);
      
      expect(status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.message).toContain('Voice agent provisioned successfully');
    });
  });
});
