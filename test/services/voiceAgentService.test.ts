import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([{ id: 'bot-123', systemPrompt: 'Test Prompt' }]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue(true),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

describe('VoiceAgentService', () => {
  let service: VoiceAgentService;
  let mockTwilioWs: any;
  let mockOpenAIWs: any;
  let mockCartesiaWs: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup Mock WebSockets
    const eventHandlers: Record<string, Function> = {};
    const createMockWs = () => ({
      on: vi.fn((event, handler) => {
        eventHandlers[event] = handler;
      }),
      send: vi.fn(),
      close: vi.fn(),
      readyState: WebSocket.OPEN,
      emit: (event: string, data: any) => {
        if (eventHandlers[event]) {
          eventHandlers[event](data);
        }
      },
    });

    mockTwilioWs = createMockWs();
    mockOpenAIWs = createMockWs();
    mockCartesiaWs = createMockWs();

    // Mock WebSocket constructor to return different mocks based on URL
    (WebSocket as unknown as any).mockImplementation((url: string) => {
      if (url.includes('openai.com')) return mockOpenAIWs;
      if (url.includes('cartesia.ai')) return mockCartesiaWs;
      return createMockWs();
    });

    service = new VoiceAgentService();
  });

  it('should handle "start" event and initialize connections', async () => {
    // Mock incoming Twilio connection
    // We need to capture the 'message' handler attached to Twilio WS
    const twilioHandlers: Record<string, Function> = {};
    mockTwilioWs.on.mockImplementation((event: string, handler: Function) => {
        twilioHandlers[event] = handler;
    });

    await service.handleConnection(mockTwilioWs);

    expect(mockTwilioWs.on).toHaveBeenCalledWith('message', expect.any(Function));

    // Simulate "start" message from Twilio
    const startMsg = JSON.stringify({
      event: 'start',
      start: {
        streamSid: 'stream-123',
        customParameters: {
          userId: 'user-123',
          voiceId: 'voice-abc',
          introMessage: 'Hello there',
        },
      },
    });

    await twilioHandlers['message'](startMsg);

    // Verify DB lookup for bot
    expect(mockDb.select).toHaveBeenCalled();

    // Verify OpenAI WS initialization
    expect(WebSocket).toHaveBeenCalledWith(
      expect.stringContaining('api.openai.com'),
      expect.objectContaining({ headers: expect.any(Object) })
    );

    // Verify Cartesia WS initialization
    expect(WebSocket).toHaveBeenCalledWith(
      expect.stringContaining('api.cartesia.ai'),
      undefined
    );
  });
});
