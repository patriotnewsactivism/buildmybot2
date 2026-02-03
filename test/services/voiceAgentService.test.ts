import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { VoiceAgentService } from '../../server/services/VoiceAgentService';

// Mock dependencies
vi.mock('ws');
vi.mock('openai');
vi.mock('../../server/env', () => ({
  env: {
    OPENAI_API_KEY: 'test-openai-key',
    CARTESIA_API_KEY: 'test-cartesia-key',
  },
}));

// Use vi.hoisted to define the mock before imports
const mockDb = vi.hoisted(() => ({
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi
    .fn()
    .mockResolvedValue([{ id: 'bot-123', systemPrompt: 'Test Prompt' }]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue(true),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
}));

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

describe('VoiceAgentService', () => {
  let service: VoiceAgentService;
  let mockTwilioWs: any;
  let mockOpenAIWs: any;
  let mockCartesiaWs: any;

  // Helpers to simulate events on specific sockets
  let twilioHandlers: Record<string, Function> = {};
  let openaiHandlers: Record<string, Function> = {};
  let cartesiaHandlers: Record<string, Function> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    twilioHandlers = {};
    openaiHandlers = {};
    cartesiaHandlers = {};

    const createMockWs = (handlers: Record<string, Function>) => ({
      on: vi.fn((event, handler) => {
        handlers[event] = handler;
      }),
      send: vi.fn(),
      close: vi.fn(),
      readyState: WebSocket.OPEN,
    });

    mockTwilioWs = createMockWs(twilioHandlers);
    mockOpenAIWs = createMockWs(openaiHandlers);
    mockCartesiaWs = createMockWs(cartesiaHandlers);

    (WebSocket as unknown as any).mockImplementation((url: string) => {
      if (url?.includes('openai.com')) return mockOpenAIWs;
      if (url?.includes('cartesia.ai')) return mockCartesiaWs;
      return createMockWs({}); // Fallback
    });

    service = new VoiceAgentService();
  });

  it('should handle full voice flow', async () => {
    // 1. Connection
    await service.handleConnection(mockTwilioWs);

    // 2. Start Event
    const startMsg = JSON.stringify({
      event: 'start',
      start: {
        streamSid: 'stream-123',
        customParameters: {
          userId: 'user-123',
          voiceId: 'voice-abc',
          introMessage: 'Hello',
        },
      },
    });

    await twilioHandlers.message(startMsg);

    // Assert Connections Opened
    expect(mockDb.select).toHaveBeenCalled(); // Bot fetch
    expect(mockDb.insert).toHaveBeenCalled(); // Conversation create

    // Simulate OpenAI and Cartesia 'open' events to finalize setup
    if (openaiHandlers.open) openaiHandlers.open();
    if (cartesiaHandlers.open) cartesiaHandlers.open();

    // Verify Session Update sent to OpenAI
    expect(mockOpenAIWs.send).toHaveBeenCalledWith(
      expect.stringContaining('session.update'),
    );

    // 3. Media Input (User speaks)
    const mediaMsg = JSON.stringify({
      event: 'media',
      media: { payload: 'base64-audio' },
    });
    await twilioHandlers.message(mediaMsg);

    // Verify audio forwarded to OpenAI
    expect(mockOpenAIWs.send).toHaveBeenCalledWith(
      expect.stringContaining('input_audio_buffer.append'),
    );

    // 4. OpenAI generates text (Assistant speaks)
    const openaiResponse = JSON.stringify({
      type: 'response.text.delta',
      delta: 'Hello world',
    });
    await openaiHandlers.message(Buffer.from(openaiResponse));

    // Verify text sent to Cartesia
    expect(mockCartesiaWs.send).toHaveBeenCalledWith(
      expect.stringContaining('"transcript":"Hello world"'),
    );

    // 5. Cartesia generates audio
    const cartesiaResponse = JSON.stringify({
      type: 'chunk',
      data: 'base64-tts-audio',
    });
    await cartesiaHandlers.message(Buffer.from(cartesiaResponse));

    // Verify audio forwarded back to Twilio
    expect(mockTwilioWs.send).toHaveBeenCalledWith(
      expect.stringContaining('"payload":"base64-tts-audio"'),
    );
  });
});
