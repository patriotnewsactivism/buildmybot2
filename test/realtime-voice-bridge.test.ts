import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SESSION_JWT_SECRET = 'test-session-secret';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-auth-token';
process.env.TWILIO_ACCOUNT_SID = '';
process.env.APP_BASE_URL = 'https://buildmybot.app';

let createTwilioStreamToken: typeof import(
  '../api/voice/twilio-live.ts',
).createTwilioStreamToken;
let muLaw8kToPcm16k: typeof import(
  '../api/voice/twilio-live.ts',
).muLaw8kToPcm16k;
let pcm24kToMuLaw8k: typeof import(
  '../api/voice/twilio-live.ts',
).pcm24kToMuLaw8k;
let inboundVoiceHandler: typeof import(
  '../api/twilio/inbound.ts',
).inboundVoiceHandler;

beforeAll(async () => {
  const bridge = await import('../api/voice/twilio-live.ts');
  createTwilioStreamToken = bridge.createTwilioStreamToken;
  muLaw8kToPcm16k = bridge.muLaw8kToPcm16k;
  pcm24kToMuLaw8k = bridge.pcm24kToMuLaw8k;
  ({ inboundVoiceHandler } = await import('../api/twilio/inbound.ts'));
});

function mockRes(): VercelResponse & {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
} {
  const res: any = {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

describe('Twilio <-> Gemini Live audio bridge', () => {
  it('signs stream sessions deterministically and binds the signature to the call', () => {
    const a = createTwilioStreamToken({
      callSid: 'CA111',
      botId: 'bot-1',
      logId: 'log-1',
    });
    const b = createTwilioStreamToken({
      callSid: 'CA111',
      botId: 'bot-1',
      logId: 'log-1',
    });
    const differentCall = createTwilioStreamToken({
      callSid: 'CA222',
      botId: 'bot-1',
      logId: 'log-1',
    });

    expect(a).toBe(b);
    expect(a).not.toBe(differentCall);
    expect(a.length).toBeGreaterThan(20);
  });

  it('upsamples one Twilio mu-law sample into two 16 kHz PCM16 samples', () => {
    const converted = Buffer.from(
      muLaw8kToPcm16k(Buffer.from([0xff]).toString('base64')),
      'base64',
    );
    expect(converted.byteLength).toBe(4);
  });

  it('downsamples three 24 kHz PCM16 samples into one Twilio mu-law sample', () => {
    const pcm = Buffer.alloc(6);
    const converted = Buffer.from(
      pcm24kToMuLaw8k(pcm.toString('base64')),
      'base64',
    );
    expect(converted.byteLength).toBe(1);
  });
});

describe('inbound realtime call routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.GEMINI_API_KEY = '';
  });

  it('returns bidirectional Connect/Stream TwiML when Gemini Live is configured', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const value = String(url);
        if (value.includes('/rest/v1/phone_numbers')) {
          return Promise.resolve({
            ok: true,
            text: async () => JSON.stringify([{ id: 'pn-1', bot_id: 'bot-1' }]),
          });
        }
        if (value.includes('/rest/v1/bots')) {
          return Promise.resolve({
            ok: true,
            text: async () =>
              JSON.stringify([
                { id: 'bot-1', name: 'Riverside Dental', system_prompt: null },
              ]),
          });
        }
        if (value.includes('/rest/v1/call_logs') && init?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            text: async () => JSON.stringify([{ id: 'log-1' }]),
          });
        }
        return Promise.resolve({ ok: true, text: async () => '[]' });
      }),
    );

    const req = {
      method: 'POST',
      url: '/api/twilio/inbound-voice-handler',
      headers: {},
      body: {
        CallSid: 'CA111',
        AccountSid: 'AC111',
        From: '+15550001111',
        To: '+15550002222',
      },
    } as unknown as VercelRequest;
    const res = mockRes();

    await inboundVoiceHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/xml');
    expect(String(res.body)).toContain('<Connect>');
    expect(String(res.body)).toContain(
      '<Stream url="wss://buildmybot.app/api/voice/twilio-media">',
    );
    expect(String(res.body)).toContain('name="botId" value="bot-1"');
    expect(String(res.body)).toContain('name="logId" value="log-1"');
    expect(String(res.body)).toContain('name="token"');
    expect(String(res.body)).not.toContain('<Gather');
  });

  it('keeps the speech Gather path as an outage fallback', async () => {
    process.env.GEMINI_API_KEY = '';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const value = String(url);
        if (value.includes('/rest/v1/phone_numbers')) {
          return Promise.resolve({
            ok: true,
            text: async () => JSON.stringify([{ id: 'pn-1', bot_id: 'bot-1' }]),
          });
        }
        if (value.includes('/rest/v1/bots')) {
          return Promise.resolve({
            ok: true,
            text: async () =>
              JSON.stringify([
                { id: 'bot-1', name: 'Riverside Dental', system_prompt: null },
              ]),
          });
        }
        if (value.includes('/rest/v1/call_logs') && init?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            text: async () => JSON.stringify([{ id: 'log-1' }]),
          });
        }
        return Promise.resolve({ ok: true, text: async () => '[]' });
      }),
    );

    const req = {
      method: 'POST',
      url: '/api/twilio/inbound-voice-handler',
      headers: {},
      body: {
        CallSid: 'CA111',
        AccountSid: 'AC111',
        From: '+15550001111',
        To: '+15550002222',
      },
    } as unknown as VercelRequest;
    const res = mockRes();

    await inboundVoiceHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(String(res.body)).toContain('<Gather input="speech"');
    expect(String(res.body)).not.toContain('<Connect>');
  });
});
