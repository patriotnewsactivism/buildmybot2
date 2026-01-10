/**
 * OpenAI Service Tests
 * Tests for GPT-5o Mini model migration verification
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateBotResponse,
  generateMarketingContent,
  scrapeWebsiteContent,
} from '../../services/openaiService';

// Mock fetch globally
global.fetch = vi.fn();

describe('OpenAI Service - Model Migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('uses gpt-5o-mini as default model', async () => {
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

    expect(requestBody.model).toBe('gpt-5o-mini');
  });

  it('uses gpt-5o-mini for website scraping', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Scraped content' } }],
      }),
    };

    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response);

    await scrapeWebsiteContent('https://example.com');

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1]?.body as string);

    expect(requestBody.model).toBe('gpt-5o-mini');
  });

  it('uses gpt-5o-mini for marketing content generation', async () => {
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

    expect(requestBody.model).toBe('gpt-5o-mini');
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
      'gpt-4o', // Explicit model override
    );

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1]?.body as string);

    expect(requestBody.model).toBe('gpt-4o');
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('API Error'));

    await expect(
      generateBotResponse('Test prompt', [], 'User message'),
    ).rejects.toThrow();
  });
});
