import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = process.env;

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  process.env.MISTRAL_API_KEY = undefined as any;
  process.env.COHERE_API_KEY = undefined as any;
  process.env.KILOCODE_API_KEY = undefined as any;
  process.env.KILOCODE_BASE_URL = undefined as any;
  process.env.KILOCODE_MODEL = undefined as any;
  process.env.AI_TEAM_LLM_PROVIDER = undefined as any;
  process.env.GEMINI_API_KEY = undefined as any;
  process.env.GROQ_API_KEY = undefined as any;
  process.env.CEREBRAS_API_KEY = undefined as any;
  process.env.OPENROUTER_API_KEY = undefined as any;
  process.env.OPENAI_API_KEY = undefined as any;
}

afterEach(() => {
  resetEnv();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('api/ai-team/lib.ts — multi-provider LLM', () => {
  describe('buildProviderOrder', () => {
    it('returns round-robin order when no env preferred is set', async () => {
      process.env.MISTRAL_API_KEY = 'mk-test';
      process.env.COHERE_API_KEY = 'co-test';
      process.env.OPENAI_API_KEY = 'oai-test';

      const { buildProviderOrder, callLLM, callLLMMessages } = await import(
  '../../api/ai-team/lib.js'
);
      const order = buildProviderOrder().order;

      expect(order).toContain('mistral');
      expect(order).toContain('cohere');
      expect(order).toContain('openai');
    });

    it('prefers AI_TEAM_LLM_PROVIDER when configured and key is present', async () => {
      process.env.AI_TEAM_LLM_PROVIDER = 'cohere';
      process.env.MISTRAL_API_KEY = 'mk-test';
      process.env.COHERE_API_KEY = 'co-test';

      const { buildProviderOrder, callLLM, callLLMMessages } = await import(
  '../../api/ai-team/lib.js'
);
      const { order, source } = buildProviderOrder();

      expect(order[0]).toBe('cohere');
      expect(source).toBe('env');
    });

    it('prefers explicit preferredProvider over env', async () => {
      process.env.AI_TEAM_LLM_PROVIDER = 'mistral';
      process.env.MISTRAL_API_KEY = 'mk-test';
      process.env.COHERE_API_KEY = 'co-test';

      const { buildProviderOrder, callLLM, callLLMMessages } = await import(
  '../../api/ai-team/lib.js'
);
      const { order, source } = buildProviderOrder('cohere');

      expect(order[0]).toBe('cohere');
      expect(source).toBe('preferred');
    });

    it('skips providers without API keys', async () => {
      process.env.COHERE_API_KEY = 'co-test';

      const { buildProviderOrder, callLLM, callLLMMessages } = await import(
  '../../api/ai-team/lib.js'
);
      const order = buildProviderOrder().order;

      expect(order).toEqual(['cohere']);
    });

    it('returns empty order when no providers configured', async () => {
      const { buildProviderOrder, callLLM, callLLMMessages } = await import(
  '../../api/ai-team/lib.js'
);
      const { order, source } = buildProviderOrder();

      expect(order).toEqual([]);
      expect(source).toBe('none');
    });
  });

  describe('callLLMMessages — fallback + logging', () => {
    it('succeeds via the first configured provider', async () => {
      process.env.MISTRAL_API_KEY = 'mk-test';
      process.env.COHERE_API_KEY = 'co-test';

      const mockPost = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'fallback-ok' } }] }),
      });

      vi.stubGlobal('fetch', mockPost as any);
      (globalThis as any).fetch = mockPost;

      const { callLLMMessages } = await import(
        '../../api/ai-team/lib.js'
      );

      const result = await callLLMMessages([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
      ]);

      expect(result).toBe('fallback-ok');
      expect(mockPost.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('throws when all providers fail', async () => {
      process.env.MISTRAL_API_KEY = 'mk-test';
      process.env.COHERE_API_KEY = 'co-test';

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('{"error":{"message":"boom"}}', { status: 500 }),
        ) as any,
      );

      vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const { callLLMMessages } = await import('../../api/ai-team/lib.js');
      await expect(
        callLLMMessages([
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hello' },
        ]),
      ).rejects.toThrow('All configured LLM providers failed');

      const errorLogs = consoleErrorSpy.mock.calls.map((c) => c[0]);
      const parsed = errorLogs.map((l) => JSON.parse(l));
      expect(parsed.some((l) => l.status === 'all_failed')).toBe(true);
    });

    it('round-robins across multiple healthy providers', async () => {
      process.env.MISTRAL_API_KEY = 'mk-test';
      process.env.COHERE_API_KEY = 'co-test';
      process.env.KILOCODE_API_KEY = 'kc-test';

      const responses = [
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'ok1' } }] }),
          { status: 200 },
        ),
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'ok2' } }] }),
          { status: 200 },
        ),
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'ok3' } }] }),
          { status: 200 },
        ),
      ];

      const mockPost = vi.fn().mockImplementation(async () => {
        const res = responses.shift()!;
        return res;
      });

      vi.stubGlobal('fetch', mockPost as any);
      (globalThis as any).fetch = mockPost;
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const { callLLMMessages } = await import('../../api/ai-team/lib.js');
      await callLLMMessages([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
      ]);

      expect(mockPost).toHaveBeenCalledTimes(1);
    });
  });

  describe('provider wire formats', () => {
    it('adapts OpenAI-style payloads for openai providers', async () => {
      process.env.MISTRAL_API_KEY = 'mk-test';

      const mockPost = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
          { status: 200 },
        ),
      );

      vi.stubGlobal('fetch', mockPost as any);
      (globalThis as any).fetch = mockPost;
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const { callLLMMessages } = await import('../../api/ai-team/lib.js');
      await callLLMMessages([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
      ]);

      const body = JSON.parse(mockPost.mock.calls[0][1].body);
      expect(body.model).toBe('mistral-small-latest');
      expect(body.messages).toHaveLength(2);
    });

    it('adapts payloads for cohere format', async () => {
      process.env.COHERE_API_KEY = 'co-test';

      const mockPost = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: 'cohere-ok' }), { status: 200 }),
      );

      vi.stubGlobal('fetch', mockPost as any);
      (globalThis as any).fetch = mockPost;
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const { callLLMMessages } = await import('../../api/ai-team/lib.js');
      const result = await callLLMMessages([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
      ]);

      expect(result).toBe('cohere-ok');
      const body = JSON.parse(mockPost.mock.calls[0][1].body);
      expect(body.model).toBe('command-r-plus');
      expect(body.system_prompt).toBe('sys');
      expect(body.messages[0].role).toBe('USER');
      expect(body.messages[0].message).toBe('hello');
    });

    it('uses KILOCODE_BASE_URL and KILOCODE_MODEL overrides', async () => {
      process.env.KILOCODE_API_KEY = 'kc-test';
      process.env.KILOCODE_BASE_URL = 'https://custom.kilocode.ai/v1/chat/completions';
      process.env.KILOCODE_MODEL = 'custom-model';

      const mockPost = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
          { status: 200 },
        ),
      );

      vi.stubGlobal('fetch', mockPost as any);
      (globalThis as any).fetch = mockPost;
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const { callLLMMessages } = await import('../../api/ai-team/lib.js');
      await callLLMMessages([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
      ]);

      expect(mockPost.mock.calls[0][0]).toBe('https://custom.kilocode.ai/v1/chat/completions');
      const body = JSON.parse(mockPost.mock.calls[0][1].body);
      expect(body.model).toBe('custom-model');
    });
  });

  describe('callLLM', () => {
    it('uses the same fallback + logging as callLLMMessages', async () => {
      process.env.MISTRAL_API_KEY = 'mk-test';

      const mockPost = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'llm-ok' } }] }),
          { status: 200 },
        ),
      );

      vi.stubGlobal('fetch', mockPost as any);
      (globalThis as any).fetch = mockPost;
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { callLLM } = await import('../../api/ai-team/lib.js');
      const result = await callLLM('system-prompt', 'user-prompt');

      expect(result).toBe('llm-ok');
      const logs = consoleLogSpy.mock.calls.map((c) => c[0]);
      const parsed = logs.map((l) => JSON.parse(l));
      expect(parsed.some((l) => l.event === 'llm_request' && l.provider === 'mistral')).toBe(true);
    });
  });
});
