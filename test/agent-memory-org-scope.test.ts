/**
 * Covers the org-scoping added 2026-07-24 to ai_agent_memories
 * (api/ai-team/lib.ts recallMemories/rememberMemory): every current caller
 * acts on BuildMyBot's own behalf, so both default to organizationId
 * 'house', but a real org id must flow through to the RPC/insert/filter so
 * a future client-facing agent can't leak memories across tenants.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-supabase-key';

describe('recallMemories org scoping (no embedding provider — REST fallback path)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to organization_id=eq.house when none is passed', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string) => {
      calls.push(String(url));
      return { ok: true, text: async () => '[]' } as any;
    }) as any;

    const { recallMemories } = await import('../api/ai-team/lib.js');
    await recallMemories('test query', { roleId: 'sales-outreach-agent' });

    const memoryCall = calls.find((u) =>
      u.includes('/rest/v1/ai_agent_memories'),
    );
    expect(memoryCall).toBeDefined();
    expect(memoryCall).toContain('organization_id=eq.house');
  });

  it('passes through an explicit organizationId', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string) => {
      calls.push(String(url));
      return { ok: true, text: async () => '[]' } as any;
    }) as any;

    const { recallMemories } = await import('../api/ai-team/lib.js');
    await recallMemories('test query', {
      roleId: 'sales-outreach-agent',
      organizationId: 'org-123',
    });

    const memoryCall = calls.find((u) =>
      u.includes('/rest/v1/ai_agent_memories'),
    );
    expect(memoryCall).toContain('organization_id=eq.org-123');
  });
});

describe('recallMemories org scoping (embedding provider configured — RPC path)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = 'test-openai-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.OPENAI_API_KEY = '';
  });

  it('includes match_organization_id in the match_agent_memories RPC call', async () => {
    const rpcBodies: any[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/v1/embeddings')) {
        return {
          ok: true,
          json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
        } as any;
      }
      if (u.includes('/rpc/match_agent_memories')) {
        rpcBodies.push(JSON.parse(String(init?.body)));
        return { ok: true, json: async () => [] } as any;
      }
      return { ok: true, text: async () => '[]' } as any;
    }) as any;

    const { recallMemories } = await import('../api/ai-team/lib.js');
    await recallMemories('test query', { organizationId: 'org-456' });

    expect(rpcBodies).toHaveLength(1);
    expect(rpcBodies[0].match_organization_id).toBe('org-456');
  });
});

describe('rememberMemory org scoping', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults organization_id to "house" when persisting a memory', async () => {
    const insertBodies: any[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        insertBodies.push(JSON.parse(String(init.body)));
        return { ok: true, text: async () => '[{"id":"mem-1"}]' } as any;
      }
      return { ok: true, text: async () => '[]' } as any;
    }) as any;

    const { rememberMemory } = await import('../api/ai-team/lib.js');
    await rememberMemory({
      roleId: 'sales-outreach-agent',
      subjectType: 'lead',
      content: 'test memory',
    });

    expect(insertBodies).toHaveLength(1);
    expect(insertBodies[0].organization_id).toBe('house');
  });

  it('persists an explicit organizationId', async () => {
    const insertBodies: any[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        insertBodies.push(JSON.parse(String(init.body)));
        return { ok: true, text: async () => '[{"id":"mem-1"}]' } as any;
      }
      return { ok: true, text: async () => '[]' } as any;
    }) as any;

    const { rememberMemory } = await import('../api/ai-team/lib.js');
    await rememberMemory({
      roleId: 'sales-outreach-agent',
      subjectType: 'lead',
      content: 'test memory',
      organizationId: 'org-789',
    });

    expect(insertBodies[0].organization_id).toBe('org-789');
  });
});
