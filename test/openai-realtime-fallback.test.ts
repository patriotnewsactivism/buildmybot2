import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPENAI_REALTIME_MODEL,
  openAIToolsFromGeminiTools,
} from '../api/voice/openai-realtime-fallback.js';

describe('OpenAI Realtime fallback adapter', () => {
  it('defaults to the current production fallback model', () => {
    expect(DEFAULT_OPENAI_REALTIME_MODEL).toBe('gpt-realtime-2.1');
  });

  it('converts Gemini function declarations to GA OpenAI function tools', () => {
    const tools = openAIToolsFromGeminiTools([
      {
        functionDeclarations: [
          {
            name: 'route_department',
            description: 'Route the caller.',
            parameters: {
              type: 'OBJECT',
              properties: {
                department: { type: 'STRING', enum: ['sales', 'support'] },
                details: {
                  type: 'ARRAY',
                  items: { type: 'STRING' },
                },
              },
              required: ['department'],
            },
          },
        ],
      },
    ]);

    expect(tools).toEqual([
      {
        type: 'function',
        name: 'route_department',
        description: 'Route the caller.',
        parameters: {
          type: 'object',
          properties: {
            department: { type: 'string', enum: ['sales', 'support'] },
            details: { type: 'array', items: { type: 'string' } },
          },
          required: ['department'],
        },
      },
    ]);
  });

  it('ignores malformed tool bundles rather than exposing invalid tools', () => {
    expect(openAIToolsFromGeminiTools(null)).toEqual([]);
    expect(openAIToolsFromGeminiTools([{ functionDeclarations: [null, {}, { name: 12 }] }])).toEqual([]);
  });
});
