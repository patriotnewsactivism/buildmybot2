// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  process.env.TELNYX_API_KEY = 'test';
  process.env.GEMINI_API_KEY = 'test';
  return { sockets: [] as any[], fetch: vi.fn() };
});
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  class Socket extends EventEmitter {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 1;
    sent: any[] = [];
    constructor() {
      super();
      state.sockets.push(this);
    }
    send(value: string) {
      this.sent.push(JSON.parse(value));
    }
    close() {
      this.readyState = 3;
    }
    terminate() {
      this.readyState = 3;
    }
    ping() {}
    async deliver(name: string, data: unknown) {
      for (const fn of this.listeners(name)) await fn(data);
    }
  }
  return { default: Socket };
});
vi.mock('../api/rag.js', () => ({
  searchKnowledge: vi.fn().mockResolvedValue([]),
}));
vi.mock('../api/growth/milestones.js', () => ({ recordMilestone: vi.fn() }));
import Socket from 'ws';
import { CORPORATE } from '../api/phone/corporate-config';
import { createTelnyxStreamToken } from '../api/phone/tenant-telnyx-token';
import { CORPORATE_TRANSFER_HOLD_MS } from '../api/voice/ringback-tone';
import {
  ECHO_BARGE_IN_RMS_THRESHOLD,
  computeMuLawRms,
  handleTelnyxMediaConnection,
  promptInitialGreeting,
  setupGeminiSession,
} from '../api/voice/telnyx-live';
const context = {
  botId: CORPORATE.botId,
  logId: '42',
  callControlId: 'call1',
  callerNumber: '+12025550123',
  calledNumber: CORPORATE.number,
  botName: 'BuildMyBot',
  systemPrompt: 'Business facts',
  userId: CORPORATE.ownerId,
  organizationId: null,
  phoneConfig: {},
};
beforeEach(() => {
  vi.useFakeTimers();
  state.sockets.length = 0;
  vi.stubGlobal('fetch', state.fetch);
  state.fetch.mockImplementation(async (url: string) => {
    let rows: unknown[] = [];
    if (url.includes('/bots?'))
      rows = [
        {
          id: CORPORATE.botId,
          name: 'BuildMyBot',
          user_id: CORPORATE.ownerId,
          system_prompt: 'Corporate sales',
        },
      ];
    if (url.includes('/call_logs?'))
      rows = [
        {
          id: 42,
          user_id: CORPORATE.ownerId,
          caller_number: '+12025550123',
          called_number: CORPORATE.number,
          direction: 'inbound',
          metadata: {},
        },
      ];
    if (url.includes('/voice_agents?'))
      rows = [
        {
          greeting: 'BuildMyBot AI receptionist',
          transfer_enabled: false,
          max_call_duration: 600,
        },
      ];
    return new Response(JSON.stringify(rows));
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('uses Gemini 3.1 realtime input, automatic barge-in, and department routing', () => {
  const socket = new Socket('wss://mock') as any;
  setupGeminiSession(socket, context);
  promptInitialGreeting(socket);
  expect(socket.sent[0].setup.model).toBe(
    'models/gemini-3.1-flash-live-preview',
  );
  expect(socket.sent[0].setup.realtimeInputConfig.activityHandling).toBe(
    'START_OF_ACTIVITY_INTERRUPTS',
  );
  expect(
    socket.sent[0].setup.tools[0].functionDeclarations.some(
      (t: any) => t.name === 'route_department',
    ),
  ).toBe(true);
  expect(socket.sent[1].realtimeInput.text).toBeTruthy();
  expect(socket.sent[1].clientContent).toBeUndefined();
});
async function connect() {
  const phone = new Socket('wss://mock') as any;
  handleTelnyxMediaConnection(phone, {} as never);
  await phone.deliver(
    'message',
    JSON.stringify({
      event: 'start',
      start: {
        call_control_id: 'call1',
        client_state: createTelnyxStreamToken({
          callControlId: 'call1',
          botId: CORPORATE.botId,
          logId: '42',
        }),
        media_format: { encoding: 'PCMU', sample_rate: 8000 },
      },
    }),
  );
  const gemini = state.sockets[1];
  await gemini.deliver('open', undefined);
  return { phone, gemini };
}
it('buffers early caller audio until Gemini setup and excludes outbound echo', async () => {
  const { phone, gemini } = await connect();
  const payload = Buffer.alloc(160, 255).toString('base64');
  await phone.deliver(
    'message',
    JSON.stringify({ event: 'media', media: { track: 'inbound', payload } }),
  );
  expect(gemini.sent.filter((m: any) => m.realtimeInput?.audio)).toHaveLength(
    0,
  );
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));
  // Initial inbound greets and flushes buffered audio immediately upon Gemini setup.
  expect(gemini.sent.filter((m: any) => m.realtimeInput?.audio)).toHaveLength(
    1,
  );
  await phone.deliver(
    'message',
    JSON.stringify({ event: 'media', media: { track: 'outbound', payload } }),
  );
  expect(gemini.sent.filter((m: any) => m.realtimeInput?.audio)).toHaveLength(
    1,
  );
  await phone.deliver('close', undefined);
});
it('clears carrier playback on interruption and does not enqueue stale audio', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));
  await gemini.deliver(
    'message',
    JSON.stringify({
      serverContent: {
        interrupted: true,
        modelTurn: {
          parts: [
            { inlineData: { data: Buffer.alloc(960).toString('base64') } },
          ],
        },
      },
    }),
  );
  expect(phone.sent).toContainEqual({ event: 'clear' });
  await vi.advanceTimersByTimeAsync(40);
  expect(phone.sent.filter((m: any) => m.event === 'media')).toHaveLength(0);
  await phone.deliver('close', undefined);
});
async function route(gemini: any, department: string, id = 'route1') {
  await gemini.deliver(
    'message',
    JSON.stringify({
      toolCall: {
        functionCalls: [
          {
            id,
            name: 'route_department',
            args: {
              department,
              summary: 'Jordan at Acme Plumbing needs after-hours bookings',
              callerName: 'Jordan',
              company: 'Acme Plumbing',
              reason: 'after-hours bookings',
            },
          },
        ],
      },
    }),
  );
}
async function afterTransferHold() {
  await vi.advanceTimersByTimeAsync(CORPORATE_TRANSFER_HOLD_MS);
}
async function ready(gemini: any) {
  await gemini.deliver('open', undefined);
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));
}
it('opens a distinct sales session with its own voice and shared context', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver(
    'message',
    JSON.stringify({
      setupComplete: {},
      serverContent: { inputTranscription: { text: 'My name is Jordan.' } },
    }),
  );
  await route(gemini, 'sales');
  expect(state.sockets).toHaveLength(3);
  const sales = state.sockets[2];
  expect(gemini.readyState).toBe(1); // Source remains available until setup succeeds.
  await ready(sales);
  expect(
    sales.sent[0].setup.generationConfig.speechConfig.voiceConfig
      .prebuiltVoiceConfig.voiceName,
  ).toBe('Puck');
  expect(sales.sent[0].setup.systemInstruction.parts[0].text).toContain(
    'Marcus',
  );
  // Destination must not greet until transfer hold music finishes.
  expect(sales.sent.some((m: any) => m.realtimeInput?.text)).toBe(false);
  expect(gemini.readyState).toBe(3);
  expect(phone.sent).toContainEqual({ event: 'clear' });
  await vi.advanceTimersByTimeAsync(40);
  expect(phone.sent.some((m: any) => m.event === 'media')).toBe(true);
  await afterTransferHold();
  expect(sales.sent[1].realtimeInput.text).toContain('Jordan');
  expect(sales.sent[1].realtimeInput.text).toContain('Acme Plumbing');
  expect(sales.sent[1].realtimeInput.text).toContain('My name is Jordan.');
  expect(sales.sent[1].realtimeInput.text).toMatch(/hold/i);
  // Intentionally closed source events cannot finalize or speak over Sales.
  await gemini.deliver('close', undefined);
  await gemini.deliver(
    'message',
    JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [
            { inlineData: { data: Buffer.alloc(960).toString('base64') } },
          ],
        },
      },
    }),
  );
  await vi.advanceTimersByTimeAsync(40);
  expect(sales.readyState).toBe(1);
  await phone.deliver('close', undefined);
});
it('changes identity and voice again for Support and Manager', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));
  let source = gemini;
  for (const [department, voice, name] of [
    ['sales', 'Puck', 'Marcus'],
    ['support', 'Kore', 'Sophie'],
    ['manager', 'Charon', 'Daniel'],
  ]) {
    await route(source, department);
    const destination = state.sockets.at(-1);
    await ready(destination);
    expect(
      destination.sent[0].setup.generationConfig.speechConfig.voiceConfig
        .prebuiltVoiceConfig.voiceName,
    ).toBe(voice);
    expect(destination.sent[0].setup.systemInstruction.parts[0].text).toContain(
      name,
    );
    expect(source.readyState).toBe(3);
    await afterTransferHold();
    source = destination;
  }
  await phone.deliver('close', undefined);
});
it('rejects self, unknown and duplicate handoffs without opening another socket', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));
  await route(gemini, 'receptionist', 'self');
  await route(gemini, 'bogus', 'unknown');
  expect(state.sockets).toHaveLength(2);
  expect(
    gemini.sent
      .filter((m: any) => m.toolResponse)
      .every(
        (m: any) =>
          m.toolResponse.functionResponses[0].response.success === false,
      ),
  ).toBe(true);
  await route(gemini, 'sales', 'duplicate');
  await route(gemini, 'support', 'duplicate');
  expect(state.sockets).toHaveLength(3);
  await phone.deliver('close', undefined);
});
it('returns control to the source after timeout and buffers caller audio during handoff', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));
  await route(gemini, 'support');
  const destination = state.sockets[2];
  await phone.deliver(
    'message',
    JSON.stringify({
      event: 'media',
      media: {
        track: 'inbound',
        payload: Buffer.alloc(160, 255).toString('base64'),
      },
    }),
  );
  expect(gemini.sent.filter((m: any) => m.realtimeInput?.audio)).toHaveLength(
    0,
  );
  await vi.advanceTimersByTimeAsync(10001);
  expect(destination.readyState).toBe(3);
  expect(gemini.readyState).toBe(1);
  expect(
    gemini.sent.find((m: any) => m.toolResponse).toolResponse
      .functionResponses[0].response.success,
  ).toBe(false);
  expect(gemini.sent.filter((m: any) => m.realtimeInput?.audio)).toHaveLength(
    1,
  );
  await phone.deliver('close', undefined);
});
it('recovers from destination errors without reporting a successful handoff', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));
  await route(gemini, 'manager');
  await state.sockets[2].deliver(
    'message',
    JSON.stringify({ error: { message: 'Voice unavailable' } }),
  );
  expect(gemini.readyState).toBe(1);
  expect(
    gemini.sent.find((m: any) => m.toolResponse).toolResponse
      .functionResponses[0].response.success,
  ).toBe(false);
  await phone.deliver('close', undefined);
});
it('closes every agent and timer if the caller hangs up mid-handoff', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));
  await route(gemini, 'sales');
  await phone.deliver('stop', undefined);
  await phone.deliver('message', JSON.stringify({ event: 'stop' }));
  expect(state.sockets.slice(1).every((s) => s.readyState === 3)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('allows a new session of the same department to reuse a provider tool ID', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));
  let source = gemini;
  for (const department of ['sales', 'receptionist', 'sales']) {
    const count = state.sockets.length;
    await route(source, department, 'reused-id');
    expect(state.sockets).toHaveLength(count + 1);
    source = state.sockets.at(-1);
    await ready(source);
    await afterTransferHold();
  }
  await phone.deliver('close', undefined);
});

it('plays connect ringback until Gemini greeting audio is ready', async () => {
  const { phone } = await connect();
  await vi.advanceTimersByTimeAsync(40);
  expect(phone.sent.filter((m: any) => m.event === 'media').length).toBeGreaterThan(
    0,
  );
});

it('greets immediately upon corporate connection without pickup silence', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));
  expect(
    gemini.sent.some(
      (m: any) =>
        String(m.realtimeInput?.text || '').includes(
          'phone connection is ready',
        ) && String(m.realtimeInput?.text || '').includes('Avery'),
    ),
  ).toBe(true);
  await phone.deliver('close', undefined);
});

it('uses balanced VAD timing for distant phone pickup', () => {
  const socket = new Socket('wss://mock') as any;
  setupGeminiSession(socket, context);
  const vad =
    socket.sent[0].setup.realtimeInputConfig.automaticActivityDetection;
  expect(vad.startOfSpeechSensitivity).toBe('START_SENSITIVITY_HIGH');
  expect(vad.endOfSpeechSensitivity).toBe('END_SENSITIVITY_LOW');
  expect(vad.prefixPaddingMs).toBe(140);
  expect(vad.silenceDurationMs).toBe(500);
});

it('rejects receptionist handoff without intake fields', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));
  await gemini.deliver(
    'message',
    JSON.stringify({
      toolCall: {
        functionCalls: [
          {
            id: 'no-intake',
            name: 'route_department',
            args: {
              department: 'sales',
              summary: 'Caller wants pricing',
            },
          },
        ],
      },
    }),
  );
  expect(state.sockets).toHaveLength(2);
  const response = gemini.sent.find((m: any) => m.toolResponse)?.toolResponse
    .functionResponses[0].response;
  expect(response.success).toBe(false);
  expect(String(response.reason)).toMatch(/Intake incomplete/i);
  await phone.deliver('close', undefined);
});

it('plays hold music on department handoff before destination greets', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));
  await route(gemini, 'sales');
  const sales = state.sockets[2];
  await ready(sales);
  expect(sales.sent.some((m: any) => m.realtimeInput?.text)).toBe(false);
  await vi.advanceTimersByTimeAsync(40);
  const mediaBefore = phone.sent.filter((m: any) => m.event === 'media').length;
  expect(mediaBefore).toBeGreaterThan(0);
  await afterTransferHold();
  expect(sales.sent.some((m: any) => m.realtimeInput?.text)).toBe(true);
  await phone.deliver('close', undefined);
});

it('mutes all inbound while the agent is speaking, including loud earpiece echo', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));

  await gemini.deliver(
    'message',
    JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [
            { inlineData: { data: Buffer.alloc(960).toString('base64') } },
          ],
        },
      },
    }),
  );

  const audioBefore = gemini.sent.filter(
    (m: any) => m.realtimeInput?.audio,
  ).length;

  const echoPayload = Buffer.alloc(160, 255).toString('base64');
  expect(computeMuLawRms(echoPayload)).toBe(0);
  await phone.deliver(
    'message',
    JSON.stringify({
      event: 'media',
      media: { track: 'inbound', payload: echoPayload },
    }),
  );

  const loudPayload = Buffer.alloc(160, 0x80).toString('base64');
  expect(computeMuLawRms(loudPayload)).toBeGreaterThan(
    ECHO_BARGE_IN_RMS_THRESHOLD,
  );
  await phone.deliver(
    'message',
    JSON.stringify({
      event: 'media',
      media: { track: 'inbound', payload: loudPayload },
    }),
  );

  expect(gemini.sent.filter((m: any) => m.realtimeInput?.audio)).toHaveLength(
    audioBefore,
  );

  await phone.deliver('close', undefined);
});

it('paces exactly one 20ms Telnyx frame per tick even when Gemini dumps a burst', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));
  const mediaBefore = phone.sent.filter((m: any) => m.event === 'media').length;
  await gemini.deliver(
    'message',
    JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [
            { inlineData: { data: Buffer.alloc(960 * 8).toString('base64') } },
          ],
        },
      },
    }),
  );
  await vi.advanceTimersByTimeAsync(20);
  expect(
    phone.sent.filter((m: any) => m.event === 'media').length,
  ).toBe(mediaBefore + 1);
  await vi.advanceTimersByTimeAsync(20);
  expect(
    phone.sent.filter((m: any) => m.event === 'media').length,
  ).toBe(mediaBefore + 2);
  await phone.deliver('close', undefined);
});

it('clears Telnyx playback before a new agent utterance', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver('message', JSON.stringify({ setupComplete: {} }));
  await gemini.deliver(
    'message',
    JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [
            { inlineData: { data: Buffer.alloc(960).toString('base64') } },
          ],
        },
      },
    }),
  );
  expect(phone.sent.filter((m: any) => m.event === 'clear').length).toBeGreaterThan(
    0,
  );
  await phone.deliver('close', undefined);
});
