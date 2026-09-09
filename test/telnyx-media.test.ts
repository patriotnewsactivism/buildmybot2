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
import {
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
it('routes to the sales AI specialist with a saved handoff summary', async () => {
  const { phone, gemini } = await connect();
  await gemini.deliver(
    'message',
    JSON.stringify({
      setupComplete: {},
      toolCall: {
        functionCalls: [
          {
            id: 'tool1',
            name: 'route_department',
            args: {
              department: 'sales',
              summary: 'Interested in a voice agent for a plumbing business',
            },
          },
        ],
      },
    }),
  );
  const result = gemini.sent.find((m: any) => m.toolResponse).toolResponse
    .functionResponses[0].response;
  expect(result.success).toBe(true);
  expect(result.specialist).toBe('Vera Cross');
  expect(result.instructions).toContain('sales specialist');
  await phone.deliver('close', undefined);
});
