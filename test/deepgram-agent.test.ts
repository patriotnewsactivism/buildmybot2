// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  process.env.TELNYX_API_KEY = 'test';
  process.env.DEEPGRAM_API_KEY = 'dg-test';
  process.env.VOICE_ENGINE = 'deepgram';
  process.env.APP_BASE_URL = 'https://www.buildmybot.app';
  return {
    sockets: [] as any[],
    fetch: vi.fn(),
  };
});

vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  class Socket extends EventEmitter {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 1;
    sent: any[] = [];
    sentRaw: Array<string | Buffer> = [];
    constructor(_url?: string, _opts?: unknown) {
      super();
      state.sockets.push(this);
    }
    send(value: string | Buffer) {
      this.sentRaw.push(value);
      if (typeof value === 'string') {
        try {
          this.sent.push(JSON.parse(value));
        } catch {
          this.sent.push(value);
        }
      } else {
        this.sent.push(value);
      }
    }
    close() {
      this.readyState = 3;
    }
    terminate() {
      this.readyState = 3;
    }
    ping() {}
    async deliver(name: string, data: unknown, isBinary = false) {
      for (const fn of this.listeners(name)) {
        if (name === 'message') await fn(data, isBinary);
        else await fn(data);
      }
    }
  }
  return { default: Socket };
});

vi.mock('../api/lib/telephony-provider.js', () => ({
  sendSms: vi.fn().mockResolvedValue({ id: 'msg_1', status: 'queued' }),
  transferCall: vi.fn().mockResolvedValue(undefined),
}));

import Socket from 'ws';
import { sendSms, transferCall } from '../api/lib/telephony-provider.js';
import { createTelnyxStreamToken } from '../api/phone/tenant-telnyx-token';
import {
  DeepgramVoiceSession,
  FLUX_EOT_THRESHOLD,
  FLUX_EOT_TIMEOUT_MS,
  SPEAKING_HANGOVER_MS,
  isDeepgramVoiceEnabled,
  parseJsonArguments,
} from '../api/voice/deepgram-agent';
import { executeServerTool } from '../api/voice/deepgram-tools';
import { MediaDiagnostics } from '../api/voice/media-diagnostics';

beforeEach(() => {
  vi.useFakeTimers();
  state.sockets.length = 0;
  process.env.DEEPGRAM_API_KEY = 'dg-test';
  process.env.VOICE_ENGINE = 'deepgram';
  vi.stubGlobal('fetch', state.fetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('enables Deepgram only when VOICE_ENGINE=deepgram and key is set', () => {
  expect(isDeepgramVoiceEnabled()).toBe(true);
  process.env.VOICE_ENGINE = 'gemini';
  expect(isDeepgramVoiceEnabled()).toBe(false);
  process.env.VOICE_ENGINE = 'deepgram';
  process.env.DEEPGRAM_API_KEY = '';
  expect(isDeepgramVoiceEnabled()).toBe(false);
});

it('parses function arguments as JSON objects only', () => {
  expect(parseJsonArguments('{"plan_key":"starter"}')).toEqual({
    plan_key: 'starter',
  });
  expect(parseJsonArguments(undefined)).toEqual({});
  expect(() => parseJsonArguments('["x"]')).toThrow(/JSON object/);
});

it('quotes plans and texts checkout links via tools', async () => {
  const quote = await executeServerTool(
    'quote_discounted_plan',
    { plan_key: 'starter', discount_percent: 20 },
    { callControlId: 'call1', callerNumber: '+12025550123' },
  );
  expect(quote.ok).toBe(true);
  expect(quote.promotional_monthly_price).toBe(23);

  const checkout = await executeServerTool(
    'send_checkout_link',
    { plan_key: 'starter' },
    {
      callControlId: 'call1',
      callerNumber: '+12025550123',
      calledNumber: '+18005550199',
    },
  );
  expect(checkout.ok).toBe(true);
  expect(sendSms).toHaveBeenCalled();
});

it('bridges Telnyx start/media through Welcome→Settings→SettingsApplied', async () => {
  const telnyx = new Socket('wss://telnyx') as any;
  const session = new DeepgramVoiceSession(telnyx, 'call1');
  await session.start();

  const deepgram = state.sockets[1] as any;
  expect(deepgram).toBeTruthy();

  const token = createTelnyxStreamToken({
    callControlId: 'call1',
    botId: 'bot1',
    logId: '42',
  });

  await telnyx.deliver(
    'message',
    JSON.stringify({
      event: 'start',
      start: {
        call_control_id: 'call1',
        client_state: token,
        media_format: {
          encoding: 'PCMU',
          sample_rate: 8000,
          channels: 1,
        },
      },
    }),
  );

  // Early inbound audio is buffered until SettingsApplied.
  const early = Buffer.alloc(160, 0x7f);
  await telnyx.deliver(
    'message',
    JSON.stringify({
      event: 'media',
      media: {
        track: 'inbound',
        payload: early.toString('base64'),
      },
    }),
  );

  await deepgram.deliver(
    'message',
    Buffer.from(JSON.stringify({ type: 'Welcome' })),
    false,
  );

  const settings = deepgram.sent.find((m: any) => m?.type === 'Settings');
  expect(settings).toBeTruthy();
  expect(settings.audio.input.encoding).toBe('mulaw');
  expect(settings.audio.input.sample_rate).toBe(8000);
  expect(settings.agent.listen.provider.model).toBe('flux-general-en');
  expect(settings.agent.listen.provider.eot_threshold).toBe(FLUX_EOT_THRESHOLD);
  expect(settings.agent.listen.provider.eot_timeout_ms).toBe(
    FLUX_EOT_TIMEOUT_MS,
  );
  expect(FLUX_EOT_THRESHOLD).toBe(0.8);
  expect(FLUX_EOT_TIMEOUT_MS).toBe(5000);
  expect(
    settings.agent.think.functions.some((f: any) => f.defer_until_eot),
  ).toBe(true);

  await deepgram.deliver(
    'message',
    Buffer.from(JSON.stringify({ type: 'SettingsApplied' })),
    false,
  );

  // Greeting window: drop pre-ready inbound and keep muting until TTS hangover.
  expect(deepgram.sentRaw.filter((v: any) => Buffer.isBuffer(v)).length).toBe(0);

  await telnyx.deliver(
    'message',
    JSON.stringify({
      event: 'media',
      media: {
        track: 'inbound_track',
        payload: Buffer.alloc(160, 0x11).toString('base64'),
      },
    }),
  );
  expect(deepgram.sentRaw.filter((v: any) => Buffer.isBuffer(v)).length).toBe(0);

  await deepgram.deliver(
    'message',
    Buffer.from(JSON.stringify({ type: 'AgentAudioDone' })),
    false,
  );
  await vi.advanceTimersByTimeAsync(SPEAKING_HANGOVER_MS);

  await telnyx.deliver(
    'message',
    JSON.stringify({
      event: 'media',
      media: {
        track: 'inbound_track',
        payload: Buffer.alloc(160, 0x33).toString('base64'),
      },
    }),
  );
  expect(
    deepgram.sentRaw.filter((v: any) => Buffer.isBuffer(v)).length,
  ).toBeGreaterThanOrEqual(1);

  // Outbound binary from Deepgram is paced as Telnyx media frames.
  await deepgram.deliver('message', Buffer.alloc(320, 0x22), true);
  await vi.advanceTimersByTimeAsync(40);
  const mediaOut = telnyx.sent.filter((m: any) => m?.event === 'media');
  expect(mediaOut.length).toBeGreaterThanOrEqual(2);

  await telnyx.deliver('message', JSON.stringify({ event: 'stop' }));
  expect(session.getDiagnosticsSnapshot().inboundFrames).toBeGreaterThan(0);
});

it('clears Telnyx playback on barge-in and ignores text frames as audio', async () => {
  const telnyx = new Socket('wss://telnyx') as any;
  const session = new DeepgramVoiceSession(telnyx, 'call1');
  await session.start();
  const deepgram = state.sockets[1] as any;

  await deepgram.deliver(
    'message',
    Buffer.from(JSON.stringify({ type: 'Welcome' })),
    false,
  );
  await deepgram.deliver(
    'message',
    Buffer.from(JSON.stringify({ type: 'SettingsApplied' })),
    false,
  );

  // Echo during the greeting must not cut playback or start a second voice.
  await deepgram.deliver(
    'message',
    Buffer.from(JSON.stringify({ type: 'UserStartedSpeaking', timestamp: 1 })),
    false,
  );
  expect(telnyx.sent.some((m: any) => m?.event === 'clear')).toBe(false);
  expect(session.getDiagnosticsSnapshot().bargeIns).toBe(0);

  await deepgram.deliver(
    'message',
    Buffer.from(JSON.stringify({ type: 'AgentAudioDone' })),
    false,
  );
  await vi.advanceTimersByTimeAsync(SPEAKING_HANGOVER_MS);

  // Text frame delivered as Buffer but isBinary=false must NOT become audio.
  const beforeOut = telnyx.sent.length;
  await deepgram.deliver(
    'message',
    Buffer.from(JSON.stringify({ type: 'UserStartedSpeaking', timestamp: 2 })),
    false,
  );
  expect(telnyx.sent.some((m: any) => m?.event === 'clear')).toBe(true);
  expect(
    telnyx.sent.slice(beforeOut).filter((m: any) => m?.event === 'media')
      .length,
  ).toBe(0);

  expect(session.getDiagnosticsSnapshot().bargeIns).toBe(1);
});

it('executes FunctionCallRequest and suppresses cancelled responses', async () => {
  const telnyx = new Socket('wss://telnyx') as any;
  const session = new DeepgramVoiceSession(telnyx, 'call1', {
    callerNumber: '+12025550123',
    calledNumber: '+18005550199',
  });
  await session.start();
  const deepgram = state.sockets[1] as any;

  await deepgram.deliver(
    'message',
    Buffer.from(JSON.stringify({ type: 'Welcome' })),
    false,
  );
  await deepgram.deliver(
    'message',
    Buffer.from(JSON.stringify({ type: 'SettingsApplied' })),
    false,
  );

  await deepgram.deliver(
    'message',
    Buffer.from(
      JSON.stringify({
        type: 'FunctionCallRequest',
        functions: [
          {
            id: 'fn_ok',
            name: 'quote_discounted_plan',
            arguments: JSON.stringify({ plan_key: 'starter' }),
          },
        ],
      }),
    ),
    false,
  );

  await vi.advanceTimersByTimeAsync(0);
  const okResponse = deepgram.sent.find(
    (m: any) => m?.type === 'FunctionCallResponse' && m.id === 'fn_ok',
  );
  expect(okResponse).toBeTruthy();
  expect(JSON.parse(okResponse.content).ok).toBe(true);

  // Cancel mid-flight irreversible tool.
  process.env.VOICE_OWNER_ESCALATION_NUMBER = '+15551234567';
  let releaseTransfer: () => void = () => {};
  vi.mocked(transferCall).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        releaseTransfer = () => resolve();
      }),
  );

  void deepgram.deliver(
    'message',
    Buffer.from(
      JSON.stringify({
        type: 'FunctionCallRequest',
        functions: [
          {
            id: 'fn_cancel',
            name: 'transfer_to_owner',
            arguments: JSON.stringify({ reason: 'urgent' }),
          },
        ],
      }),
    ),
    false,
  );
  await vi.advanceTimersByTimeAsync(0);

  await deepgram.deliver(
    'message',
    Buffer.from(
      JSON.stringify({
        type: 'FunctionCallCancelled',
        functions: [{ id: 'fn_cancel', name: 'transfer_to_owner' }],
      }),
    ),
    false,
  );
  releaseTransfer();
  await vi.advanceTimersByTimeAsync(0);

  // transferCall may still run; FunctionCallResponse for cancelled id is suppressed.
  const cancelledResponse = deepgram.sent.find(
    (m: any) => m?.type === 'FunctionCallResponse' && m.id === 'fn_cancel',
  );
  expect(cancelledResponse).toBeUndefined();
  expect(session.getDiagnosticsSnapshot().functionCancels).toBe(1);
  expect(transferCall).toHaveBeenCalled();
});

it('records structured media diagnostics rates', () => {
  const diag = new MediaDiagnostics();
  diag.markSettingsApplied();
  diag.recordInbound(160);
  diag.recordOutbound(160);
  diag.bargeIns = 2;
  const snap = diag.snapshot();
  expect(snap.msToSettingsApplied).toBeGreaterThanOrEqual(0);
  expect(snap.inboundFrames).toBe(1);
  expect(snap.outboundFrames).toBe(1);
  expect(snap.inboundFrameRateHz).toBeGreaterThan(0);
});
