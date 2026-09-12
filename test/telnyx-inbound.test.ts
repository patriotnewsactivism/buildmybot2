// @vitest-environment node
import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  process.env.TELNYX_API_KEY = 'test';
  process.env.GEMINI_API_KEY = 'test';
  return {
    answer: vi.fn(),
    speak: vi.fn(),
    startRecording: vi.fn().mockResolvedValue({ recordingId: 'rec_123' }),
    fetch: vi.fn(),
  };
});
vi.mock('../api/lib/telephony-provider.js', () => ({
  answerCall: mocks.answer,
  speakText: mocks.speak,
  startRecording: mocks.startRecording,
  stopRecording: vi.fn(),
  hangupCall: vi.fn(),
  telnyxRequest: vi.fn(),
}));
vi.mock('../api/phone/corporate-sms.js', () => ({
  receiveCorporateSms: vi.fn(),
}));
import handler from '../api/phone/tenant-telnyx';
const keys = generateKeyPairSync('ed25519');
const publicBytes = keys.publicKey
  .export({ type: 'spki', format: 'der' })
  .subarray(-32);
function req(
  direction = 'incoming',
  eventType = 'call.initiated',
  customPayload: Record<string, unknown> = {},
) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const raw = Buffer.from(
    JSON.stringify({
      data: {
        id: 'event',
        event_type: eventType,
        occurred_at: new Date().toISOString(),
        payload: {
          direction,
          call_control_id: 'call1',
          from: '+12025550123',
          to: '+13466460065',
          ...customPayload,
        },
      },
    }),
  );
  return {
    method: 'POST',
    body: raw,
    headers: {
      'telnyx-timestamp': timestamp,
      'telnyx-signature-ed25519': sign(
        null,
        Buffer.concat([Buffer.from(`${timestamp}|`), raw]),
        keys.privateKey,
      ).toString('base64'),
    },
  } as never;
}
function res() {
  const r = {
    code: 200,
    status(n: number) {
      r.code = n;
      return r;
    },
    json: vi.fn(),
    setHeader: vi.fn(),
  };
  return r;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  process.env.TELNYX_PUBLIC_KEY = publicBytes.toString('base64');
});
it('persists required voice_agent_id before starting live streaming and starts dual-channel recording', async () => {
  mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => {
    let rows: unknown[] = [];
    if (url.includes('/phone_numbers?'))
      rows = [{ user_id: 'owner', voice_agent_id: 'voice1' }];
    if (url.includes('/voice_agents?'))
      rows = [{ id: 'voice1', bot_id: 'bot1', greeting: 'Hi' }];
    if (url.includes('/bots?')) rows = [{ id: 'bot1', name: 'BuildMyBot' }];
    if (url.includes('/call_logs?') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      if (!body.voice_agent_id)
        return new Response(JSON.stringify({ error: 'not null' }), {
          status: 400,
        });
      rows = [{ id: 42 }];
    }
    return new Response(JSON.stringify(rows));
  });
  await handler(req(), res() as never);
  expect(mocks.answer).toHaveBeenCalledWith(
    'call1',
    expect.objectContaining({
      bidirectional: true,
      streamUrl:
        'wss://buildmybot2-web-production.up.railway.app/api/voice/telnyx-media',
    }),
  );
  expect(mocks.startRecording).toHaveBeenCalledWith(
    'call1',
    expect.objectContaining({
      channels: 'dual',
      format: 'mp3',
      playBeep: false,
    }),
  );
  expect(mocks.speak).not.toHaveBeenCalled();
  const insert = mocks.fetch.mock.calls.find(
    ([u, i]) => u.includes('/call_logs?') && i.method === 'POST',
  );
  expect(JSON.parse(insert?.[1].body).voice_agent_id).toBe('voice1');
});
it('answers with media streaming when only Deepgram is configured', async () => {
  const previousGemini = process.env.GEMINI_API_KEY;
  const previousEngine = process.env.VOICE_ENGINE;
  process.env.GEMINI_API_KEY = '';
  process.env.DEEPGRAM_API_KEY = 'dg-test';
  process.env.VOICE_ENGINE = 'deepgram';
  mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => {
    let rows: unknown[] = [];
    if (url.includes('/phone_numbers?'))
      rows = [{ user_id: 'owner', voice_agent_id: 'voice1' }];
    if (url.includes('/voice_agents?'))
      rows = [{ id: 'voice1', bot_id: 'bot1', greeting: 'Hi' }];
    if (url.includes('/bots?')) rows = [{ id: 'bot1', name: 'BuildMyBot' }];
    if (url.includes('/call_logs?') && init?.method === 'POST') {
      rows = [{ id: 42 }];
    }
    return new Response(JSON.stringify(rows));
  });
  await handler(req(), res() as never);
  expect(mocks.answer).toHaveBeenCalledWith(
    'call1',
    expect.objectContaining({ bidirectional: true }),
  );
  process.env.GEMINI_API_KEY = previousGemini;
  process.env.VOICE_ENGINE = previousEngine;
});
it('saves recording_url to call_logs on call.recording.saved event', async () => {
  let patchBody: unknown = null;
  mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.includes('/call_logs?') && init?.method === 'PATCH') {
      patchBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify([{ id: 42, lead_id: 'lead-99' }]));
    }
    if (url.includes('/leads?') && init?.method === 'PATCH') {
      return new Response(JSON.stringify([{ id: 'lead-99' }]));
    }
    return new Response(JSON.stringify([]));
  });

  const recordingEvent = req('incoming', 'call.recording.saved', {
    call_control_id: 'call1',
    public_recording_urls: {
      mp3: 'https://storage.telnyx.com/recordings/call1.mp3',
    },
  });

  await handler(recordingEvent, res() as never);

  expect(patchBody).toEqual({
    recording_url: 'https://storage.telnyx.com/recordings/call1.mp3',
  });
});
it('ignores outgoing initiation events instead of answering the callee as an inbound caller', async () => {
  await handler(req('outgoing'), res() as never);
  expect(mocks.answer).not.toHaveBeenCalled();
  expect(mocks.startRecording).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it('rejects unsigned webhooks', async () => {
  const response = res();
  await handler(
    { method: 'POST', body: Buffer.from('{}'), headers: {} } as never,
    response as never,
  );
  expect(response.code).toBe(401);
  expect(mocks.answer).not.toHaveBeenCalled();
});
