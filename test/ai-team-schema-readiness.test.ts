import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-supabase-key';

describe('AI Team schema readiness gate', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports ready only after all required columns and RPCs respond', async () => {
    const urls: string[] = [];
    global.fetch = vi.fn(async (url: string) => {
      urls.push(String(url));
      return { ok: true } as Response;
    }) as any;

    const { getAiTeamSchemaReadiness } = await import('../api/ai-team/lib.js');
    const readiness = await getAiTeamSchemaReadiness(true);

    expect(readiness.ready).toBe(true);
    expect(readiness.missing).toEqual([]);
    expect(urls).toHaveLength(6);
    expect(urls.some((url) => url.includes('/rpc/match_agent_memories'))).toBe(
      true,
    );
  });

  it('names schema drift instead of letting autonomous work proceed', async () => {
    global.fetch = vi.fn(async (url: string) => ({
      ok: !String(url).includes('/ai_agent_memories?'),
    })) as any;

    const { getAiTeamSchemaReadiness } = await import('../api/ai-team/lib.js');
    const readiness = await getAiTeamSchemaReadiness(true);

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toContain('ai_agent_memories.organization_id');
  });
});
