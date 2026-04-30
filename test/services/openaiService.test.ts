/**
 * OpenAI Service Tests
 * Tests for AI model integration (backend-driven default model)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateBotResponse,
  generateMarketingContent,
  scrapeWebsiteContent,
} from '../../services/openaiService';

// Mock fetch globally
global.fetch = vi.fn();

describe('OpenAI Service - Model Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('omits model field when no model specified (backend decides)', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Test response' } }],
      }),
    };

    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response);

    await generateBotResponse('Test prompt', [], 'User message');

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1]?.body as string);

    // Model should not be in the request body — backend uses DEFAULT_AI_MODEL
    expect(requestBody.model).toBeUndefined();
  });

  it('omits model for marketing content generation', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Marketing content' } }],
      }),
    };

    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response);

    await generateMarketingContent('email', 'product launch', 'professional');

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1]?.body as string);

    expect(requestBody.model).toBeUndefined();
  });

  it('allows override to different model', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Test response' } }],
      }),
    };

    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response);

    await generateBotResponse(
      'Test prompt',
      [],
      'User message',
      'grok-4-1-fast-reasoning', // Explicit model override
    );

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1]?.body as string);

    expect(requestBody.model).toBe('grok-4-1-fast-reasoning');
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('API Error'));

    const response = await generateBotResponse(
      'Test prompt',
      [],
      'User message',
    );
    expect(response).toBe(
      "I'm having trouble connecting to my AI brain right now. Please check your internet connection.",
    );
  });
});
