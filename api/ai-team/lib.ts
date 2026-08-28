// Shared library for the AI Team automation, running natively on Vercel + Supabase.
// No Base44 dependency, no per-message credit ceiling — just usage-based LLM billing.
//
// LLM PROVIDER: tries a chain of FREE providers first (whichever have API keys
// configured), only falling back to paid OpenAI as a last resort. Order:
// AI_TEAM_LLM_PROVIDER (your preferred default) -> gemini -> groq -> cerebras
// -> openrouter -> github -> openai. Swap the preferred default anytime via
// the AI_TEAM_LLM_PROVIDER env var — no code changes needed. Add a provider's
// key (GEMINI_API_KEY / GROQ_API_KEY / CEREBRAS_API_KEY / OPENROUTER_API_KEY /
// GITHUB_TOKEN_4) and it automatically joins the fallback chain. github ==
// GitHub Models (models.github.ai), free via the GITHUB_TOKEN_4 PAT already
// provisioned across the rest of this ecosystem for repo writes.

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Provider =
  | 'groq'
  | 'gemini'
  | 'cerebras'
  | 'cohere'
  | 'openrouter'
  | 'openrouter2'
  | 'github'
  | 'openai';

const PROVIDER_CONFIG: Record<
  Provider,
  { baseURL: string; model: string; keyEnv: string }
> = {
  // Google's free tier (no card) via their OpenAI-compatible endpoint. Most
  // accessible free baseline as of mid-2026.
  gemini: {
    baseURL:
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.5-flash',
    keyEnv: 'GEMINI_API_KEY',
  },
  // Free tier, no card, LPU inference — among the fastest available. Great
  // for short internal-reasoning shifts like these.
  groq: {
    baseURL: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'openai/gpt-oss-120b',
    keyEnv: 'GROQ_API_KEY',
  },
  // Free tier, no card, 1M tokens/day — the most generous free daily volume
  // of any provider as of mid-2026. Good backstop when others rate-limit.
  cerebras: {
    baseURL: 'https://api.cerebras.ai/v1/chat/completions',
    model: 'gpt-oss-120b',
    keyEnv: 'CEREBRAS_API_KEY',
  },
  // Production-tier Cohere key (confirmed live via direct completion test,
  // 2026-07-26 portfolio-wide LLM audit). Placed ahead of gemini/openrouter
  // since those two showed simultaneous rate-limit exhaustion same day.
  cohere: {
    baseURL: 'https://api.cohere.ai/compatibility/v1/chat/completions',
    model: 'command-r-plus-08-2024',
    keyEnv: 'COHERE_API_KEY',
  },
  // Aggregator with a rotating catalog of genuinely free models. WARNING:
  // the :free catalog churns — llama-3.1-8b-instruct:free died in the
  // 2026-07-22 purge and this provider silently failed on every call until
  // the 2026-07-23 audit caught it. Both ids below were live-verified
  // against GET /api/v1/models on 2026-07-23. If OpenRouter starts erroring
  // in the shift logs, re-check the catalog before assuming rate limits.
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openai/gpt-oss-20b:free',
    keyEnv: 'OPENROUTER_API_KEY',
  },
  // Second OpenRouter rung (same key, different free model) so one delisted
  // model doesn't take out the whole OpenRouter link in the chain.
  openrouter2: {
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    keyEnv: 'OPENROUTER_API_KEY',
  },
  // Free via GitHub Models (models.github.ai) using the existing
  // GITHUB_TOKEN_4 PAT -- no new key needed. Live-verified 2026-07-20.
  github: {
    baseURL: 'https://models.github.ai/inference/chat/completions',
    model: 'openai/gpt-4.1',
    keyEnv: 'GITHUB_TOKEN_4',
  },
  // Qwen Cloud removed 2026-07-26 -- confirmed dead/blocked across the entire portfolio (401 on every cached key variant).
  // Paid last resort / use for anything customer-facing where quality matters most.
  openai: {
    baseURL: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    keyEnv: 'OPENAI_API_KEY',
  },
};

const FALLBACK_ORDER: Provider[] = [
  'cerebras',
  'groq',
  'cohere',
  'gemini',
  'openrouter',
  'openrouter2',
  'github',
  'openai',
];

// Safety gate for anything that sends a real email or places a real phone
// call to a real lead. Defaults to TRUE (dry-run) whenever the env var is
// unset or anything other than the literal string 'false' — a missing var
// must never accidentally go live. Added 2026-07-24 after discovering the
// GitHub Actions schedules kept firing real sends/calls despite an intended
// pause the night before (the pause only touched vercel.json, not the
// workflows actually triggering these paths).
export function salesAutomationDryRun(): boolean {
  return (
    (process.env.SALES_AUTOMATION_DRY_RUN || 'true').toLowerCase() !== 'false'
  );
}

// Global emergency stop for every AI Team cron handler. Unset/anything but
// 'true' means normal operation.
export function aiTeamKilled(): boolean {
  return (process.env.AI_TEAM_KILL_SWITCH || '').toLowerCase() === 'true';
}

/** Internal AI Team calls only (shift reasoning, lead research, outreach
 * drafting) — deliberately NOT shared with callLLMMessages (customer chat),
 * so a runaway internal loop can never throttle a paying customer's bot. */
async function overDailyBudget(): Promise<boolean> {
  const configuredBudget = Number(process.env.LLM_DAILY_BUDGET_CALLS || 500);
  const budget = Number.isFinite(configuredBudget)
    ? Math.max(0, Math.floor(configuredBudget))
    : 500;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_llm_usage`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ usage_day: today }),
    });
    if (!res.ok) {
      throw new Error(`budget RPC returned ${res.status}`);
    }
    const count = await res.json();
    return typeof count === 'number' && count > budget;
  } catch (err: any) {
    // Fail closed: if the governor cannot count calls, allowing every cron to
    // proceed recreates the exact unbounded-spend failure this guard exists to
    // prevent. Customer chat uses callLLMMessages and is not affected.
    throw new Error(`llm_budget_guard_unavailable: ${err.message}`);
  }
}

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  if (await overDailyBudget()) {
    await logAgentError({
      source: 'llm-daily-budget',
      level: 'warning',
      message: `Daily internal LLM call budget exceeded (LLM_DAILY_BUDGET_CALLS=${process.env.LLM_DAILY_BUDGET_CALLS || 500}) — skipping this call, will resume tomorrow.`,
    }).catch(() => null);
    throw new Error('daily_llm_budget_exceeded');
  }

  const paidInternalFallback = ['1', 'true', 'on'].includes(
    (process.env.AI_TEAM_PAID_FALLBACK || 'off').toLowerCase(),
  );
  const availableOrder = paidInternalFallback
    ? FALLBACK_ORDER
    : FALLBACK_ORDER.filter((provider) => provider !== 'openai');
  const configuredPreferred =
    (process.env.AI_TEAM_LLM_PROVIDER as Provider) || 'cerebras';
  const preferred = availableOrder.includes(configuredPreferred)
    ? configuredPreferred
    : (availableOrder[0] ?? 'cerebras');
  const order = [preferred, ...availableOrder.filter((p) => p !== preferred)];

  const errors: string[] = [];
  for (const provider of order) {
    const cfg = PROVIDER_CONFIG[provider];
    const apiKey = process.env[cfg.keyEnv];
    if (!apiKey) continue; // no key configured for this provider, skip silently
    try {
      return await callWithConfig(cfg, apiKey, systemPrompt, userPrompt);
    } catch (err: any) {
      errors.push(`${provider}: ${err.message}`);
      // try the next provider in the chain (likely rate-limited or transient)
    }
  }

  throw await providerChainExhausted(errors);
}

/** Full provider-chain exhaustion is a portfolio-level event: log it as a
 * CRITICAL error_logs row (which also pings Discord + Slack via
 * logAgentError, and surfaces in Apex's buildmybot_open_errors telemetry)
 * instead of only throwing into whichever caller happened to hit it.
 * Alerting must never mask the real failure, so this returns the Error for
 * the caller to throw rather than throwing from inside the alert path. */
async function providerChainExhausted(errors: string[]): Promise<Error> {
  const message = errors.length
    ? `All configured LLM providers failed: ${errors.join(' | ')}`
    : `No LLM provider configured — set at least one of: ${FALLBACK_ORDER.map((p) => PROVIDER_CONFIG[p].keyEnv).join(', ')}`;
  try {
    await logAgentError({
      source: 'llm-provider-chain',
      message,
      level: 'critical',
      context: { providers_tried: errors.length, chain: FALLBACK_ORDER },
    });
  } catch {
    console.error(
      '[llm-provider-chain] exhaustion alert itself failed:',
      message,
    );
  }
  return new Error(message);
}

/** Multi-turn variant for real conversations (customer-facing chat widget).
 * Same free-provider-first fallback chain as callLLM. `preferredProvider`
 * lets a caller override AI_TEAM_LLM_PROVIDER (e.g. a bot's configured
 * model) without touching the env var used by the internal AI Team. */
export async function callLLMMessages(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  temperature = 0.7,
  preferredProvider?: string,
): Promise<string> {
  // Guard against garbage input (e.g. a bot's free-text `model` field like
  // "grok-4-1-fast-reasoning" that isn't one of our actual provider keys) --
  // silently ignore anything that isn't a real configured provider instead
  // of crashing the whole chat request.
  const validPreferred =
    preferredProvider && preferredProvider in PROVIDER_CONFIG
      ? (preferredProvider as Provider)
      : undefined;
  const preferred =
    validPreferred || (process.env.AI_TEAM_LLM_PROVIDER as Provider) || 'groq';
  const order = [preferred, ...FALLBACK_ORDER.filter((p) => p !== preferred)];

  const errors: string[] = [];
  for (const provider of order) {
    const cfg = PROVIDER_CONFIG[provider];
    const apiKey = process.env[cfg.keyEnv];
    if (!apiKey) continue;
    try {
      return await callWithConfigMessages(cfg, apiKey, messages, temperature);
    } catch (err: any) {
      errors.push(`${provider}: ${err.message}`);
    }
  }

  throw await providerChainExhausted(errors);
}

async function callWithConfig(
  cfg: { baseURL: string; model: string },
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.4,
): Promise<string> {
  return callWithConfigMessages(
    cfg,
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
  );
}

/** Same wire format as callWithConfig, but accepts a full multi-turn
 * OpenAI-style messages array (used by customer-facing chat, which needs
 * real conversation history, not just one system+user turn). */
async function callWithConfigMessages(
  cfg: { baseURL: string; model: string },
  apiKey: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  temperature = 0.4,
): Promise<string> {
  const configuredMaxTokens = Number(
    process.env.AI_TEAM_MAX_OUTPUT_TOKENS || 1024,
  );
  const maxTokens = Number.isFinite(configuredMaxTokens)
    ? Math.min(4096, Math.max(128, Math.floor(configuredMaxTokens)))
    : 1024;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  let res: Response;
  try {
    res = await fetch(cfg.baseURL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

export async function supabaseFetch(
  table: string,
  params: string,
  init?: RequestInit,
) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: init?.method === 'POST' ? 'return=representation' : '',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    console.error(
      `Supabase ${table} fetch failed:`,
      res.status,
      await res.text(),
    );
    return null;
  }
  // PostgREST returns 204 No Content with an EMPTY body for successful
  // writes (PATCH/DELETE/PUT) unless Prefer: return=representation was
  // sent -- res.ok is true for 204, so calling res.json() on the empty
  // body throws "Unexpected end of JSON input". Guard against that (and
  // any other genuinely empty-but-ok response) before parsing.
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    console.error(`Supabase ${table} fetch: non-JSON body`, text.slice(0, 200));
    return null;
  }
}

export interface AiTeamSchemaReadiness {
  ready: boolean;
  missing: string[];
  checkedAt: string;
}

let schemaReadinessCache:
  | { expiresAt: number; value: AiTeamSchemaReadiness }
  | undefined;

/** Verify the columns/RPCs every autonomous cron requires before it can spend
 * a model token. This intentionally fails closed at the dynamic cron route:
 * schema drift should be a visible 503, not thousands of logged errors hidden
 * behind HTTP 200 responses. */
export async function getAiTeamSchemaReadiness(
  force = false,
): Promise<AiTeamSchemaReadiness> {
  if (
    !force &&
    schemaReadinessCache &&
    schemaReadinessCache.expiresAt > Date.now()
  ) {
    return schemaReadinessCache.value;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ready: false,
      missing: ['SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'],
      checkedAt: new Date().toISOString(),
    };
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  const checks: Array<{
    name: string;
    path: string;
    init?: RequestInit;
  }> = [
    {
      name: 'ai_agent_memories.organization_id',
      path: 'ai_agent_memories?select=id,organization_id&limit=0',
    },
    {
      name: 'agent_messages.context',
      path: 'agent_messages?select=id,context&limit=0',
    },
    {
      name: 'escalations.context',
      path: 'escalations?select=id,context&limit=0',
    },
    {
      name: 'audit_logs.user_email',
      path: 'audit_logs?select=id,user_email&limit=0',
    },
    {
      name: 'llm_usage_daily.call_count',
      path: 'llm_usage_daily?select=day,call_count&limit=0',
    },
    {
      name: 'match_agent_memories RPC',
      path: 'rpc/match_agent_memories',
      init: {
        method: 'POST',
        body: JSON.stringify({
          query_embedding: null,
          match_subject_type: null,
          match_subject_id: null,
          match_role_id: null,
          match_threshold: 0.3,
          match_count: 1,
          match_organization_id: 'house',
        }),
      },
    },
  ];

  const results = await Promise.all(
    checks.map(async (check) => {
      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/${check.path}`, {
          ...check.init,
          headers: { ...headers, ...(check.init?.headers || {}) },
        });
        return response.ok ? null : check.name;
      } catch {
        return check.name;
      }
    }),
  );
  const missing = results.filter((name): name is string => Boolean(name));
  const value = {
    ready: missing.length === 0,
    missing,
    checkedAt: new Date().toISOString(),
  };
  schemaReadinessCache = { expiresAt: Date.now() + 60_000, value };
  return value;
}

// ---------------------------------------------------------------------------
// Agent Memory (pgvector) — the persistence layer that makes the AI Team
// actually remember. Before ANY agent executes a task it MUST call
// recallMemories() to retrieve historical context about the lead, company,
// or internal system state; after acting it calls rememberMemory() so the
// observation is embedded back into Supabase for future recall.
// Embeddings: OpenAI text-embedding-3-small (1536 dims) — the exact same
// model/dimensions as knowledge_chunks (see api/rag.ts), so one provider
// key powers both RAG and agent memory.
// ---------------------------------------------------------------------------

const EMBEDDING_MODEL = 'text-embedding-3-small';

export type MemorySubjectType = 'lead' | 'company' | 'system';

export interface AgentMemoryRow {
  id: string;
  role_id: string;
  subject_type: MemorySubjectType;
  subject_id: string | null;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  similarity?: number;
}

async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null; // memory degrades to recency-based recall, never crashes a shift
  try {
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
      }),
    });
    if (!resp.ok) {
      console.error('[memory] embedding failed:', resp.status);
      return null;
    }
    const data = await resp.json();
    return data.data?.[0]?.embedding || null;
  } catch (err: any) {
    console.error('[memory] embedding error:', err.message);
    return null;
  }
}

/** Retrieve the most relevant historical memories for a task. Vector
 * similarity when an embedding key is configured; recency-scoped REST
 * fallback otherwise — so agents always get SOME context, never a crash. */
export async function recallMemories(
  query: string,
  opts: {
    subjectType?: MemorySubjectType;
    subjectId?: string;
    roleId?: string;
    limit?: number;
    /** Tenant scope. Every current caller acts on BuildMyBot's own behalf,
     * never a client organization's, so this defaults to 'house'. Pass a
     * real organization id once agents act for client orgs — recall must
     * never cross tenant boundaries. */
    organizationId?: string;
  } = {},
): Promise<AgentMemoryRow[]> {
  const limit = opts.limit ?? 8;
  const organizationId = opts.organizationId ?? 'house';

  const queryEmbedding = await embedText(query);
  if (queryEmbedding) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/match_agent_memories`,
        {
          method: 'POST',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query_embedding: JSON.stringify(queryEmbedding),
            match_subject_type: opts.subjectType ?? null,
            match_subject_id: opts.subjectId ?? null,
            match_role_id: opts.roleId ?? null,
            match_threshold: 0.3,
            match_count: limit,
            match_organization_id: organizationId,
          }),
        },
      );
      if (res.ok) return (await res.json()) as AgentMemoryRow[];
      console.error('[memory] match_agent_memories RPC failed:', res.status);
    } catch (err: any) {
      console.error('[memory] recall error:', err.message);
    }
  }

  // Fallback: most recent memories for the same subject/role (no vector math).
  const filters: string[] = [
    'order=created_at.desc',
    `limit=${limit}`,
    `organization_id=eq.${organizationId}`,
  ];
  if (opts.subjectType) filters.push(`subject_type=eq.${opts.subjectType}`);
  if (opts.subjectId) filters.push(`subject_id=eq.${opts.subjectId}`);
  if (opts.roleId) filters.push(`role_id=eq.${opts.roleId}`);
  const rows = await supabaseFetch('ai_agent_memories', filters.join('&'));
  return (rows as AgentMemoryRow[]) || [];
}

/** Persist an observation back to the memory store with its embedding so
 * every future shift can recall it. Failures are logged, never thrown —
 * a memory write must not kill the action that produced it. */
export async function rememberMemory(entry: {
  roleId: string;
  subjectType: MemorySubjectType;
  subjectId?: string;
  content: string;
  metadata?: Record<string, unknown>;
  /** Tenant scope — see recallMemories()'s organizationId doc. */
  organizationId?: string;
}): Promise<void> {
  const embedding = await embedText(entry.content);
  const row = await supabaseFetch('ai_agent_memories', '', {
    method: 'POST',
    body: JSON.stringify({
      role_id: entry.roleId,
      subject_type: entry.subjectType,
      subject_id: entry.subjectId ?? null,
      content: entry.content,
      metadata: entry.metadata ?? {},
      organization_id: entry.organizationId ?? 'house',
      ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
    }),
  });
  if (!row)
    console.error('[memory] failed to persist memory for', entry.roleId);
}

/** Format recalled memories into a prompt-ready block. */
export function formatMemories(memories: AgentMemoryRow[]): string {
  if (!memories.length) return 'No prior memories on record for this subject.';
  return memories
    .map((m) => `- [${m.created_at.slice(0, 10)}] (${m.role_id}) ${m.content}`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Error Recovery — every unresolvable agent state lands in error_logs, the
// table the ErrorRecoveryDashboard reads via /api/bots/errors/recent
// (gateway handleBotErrors). Admins see it, can mark it resolved.
// ---------------------------------------------------------------------------

export async function logAgentError(entry: {
  source: string;
  message: string;
  level?: 'warning' | 'error' | 'critical';
  botId?: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  const row = await supabaseFetch('error_logs', '', {
    method: 'POST',
    body: JSON.stringify({
      source: entry.source,
      message: entry.message.slice(0, 2000),
      level: entry.level ?? 'error',
      bot_id: entry.botId ?? null,
      context: entry.context ?? {},
      status: 'open',
    }),
  });
  if (!row) {
    // Last-resort visibility: the console shows up in Vercel function logs.
    console.error(`[error-recovery] ${entry.source}: ${entry.message}`);
  }
  // Critical failures also ping Discord + Slack so Don sees them without
  // opening the ErrorRecoveryDashboard.
  if ((entry.level ?? 'error') === 'critical') {
    await notifyDiscord(
      `🚨 **CRITICAL** — \`${entry.source}\`\n${entry.message.slice(0, 500)}`,
    );
    await notifySlack(
      `:rotating_light: *CRITICAL* — \`${entry.source}\`\n${entry.message.slice(0, 500)}`,
    );
  }
}

/**
 * Records one row in analytics_events for a key sales-funnel moment (lead
 * captured, outreach sent, follow-up sent, call completed). Best-effort —
 * the funnel dashboard reading this table is nice-to-have, so a failure
 * here must never interrupt the caller's actual work (sending the email,
 * placing the call, etc).
 */
export async function trackAnalyticsEvent(entry: {
  eventType: string;
  organizationId?: string | null;
  botId?: string | null;
  userId?: string | null;
  eventData?: Record<string, unknown>;
}): Promise<void> {
  await supabaseFetch('analytics_events', '', {
    method: 'POST',
    body: JSON.stringify({
      id: crypto.randomUUID(),
      organization_id: entry.organizationId ?? null,
      bot_id: entry.botId ?? null,
      user_id: entry.userId ?? null,
      event_type: entry.eventType,
      event_data: entry.eventData ?? {},
    }),
  }).catch((err: any) => {
    console.error(
      '[analytics] track event failed:',
      entry.eventType,
      err.message,
    );
  });
}

// ---------------------------------------------------------------------------
// Thought → Action → Observation loop (ReAct). The core reasoning engine
// every agent runs through. Enforces:
//   1. Strict memory retrieval BEFORE any task execution.
//   2. Explicit tool calls only — the model never "pretends" it acted.
//   3. A hard deadline budget so background workers finish before serverless
//      timeouts; on exhaustion the agent gracefully pauses its shift and
//      files an actionable error_logs row for admin review.
//   4. Every completed run writes its outcome back as a vector memory.
// ---------------------------------------------------------------------------

export type AgentTool = (args: Record<string, unknown>) => Promise<string>;

export interface AgentStep {
  thought: string;
  action: { tool: string; args: Record<string, unknown> };
  observation: string;
}

export interface AgentTaskResult {
  status: 'completed' | 'paused' | 'failed';
  finalAnswer: string;
  steps: AgentStep[];
}

export async function runAgentTask(opts: {
  roleId: string;
  roleName: string;
  objective: string;
  persona: string;
  tools: Record<string, { description: string; run: AgentTool }>;
  subjectType?: MemorySubjectType;
  subjectId?: string;
  maxSteps?: number;
  deadlineAt?: number; // epoch ms — hard stop for serverless budgets
}): Promise<AgentTaskResult> {
  const maxSteps = opts.maxSteps ?? 6;
  const deadlineAt = opts.deadlineAt ?? Date.now() + 45_000;
  const source = `ai-team/${opts.roleId}`;
  const steps: AgentStep[] = [];

  // 1. MANDATORY memory retrieval before executing anything.
  const memories = await recallMemories(opts.objective, {
    subjectType: opts.subjectType,
    subjectId: opts.subjectId,
  });

  const toolCatalog = Object.entries(opts.tools)
    .map(([name, t]) => `- ${name}: ${t.description}`)
    .join('\n');

  const systemPrompt = `${opts.persona}

You work in a strict Thought -> Action -> Observation loop.
Available tools:
${toolCatalog}
- finish: end the task. args: {"answer": "<final outcome summary>"}

Respond with EXACTLY this format every turn (no markdown, no commentary):
THOUGHT: <your reasoning about the current state>
ACTION: {"tool": "<tool name>", "args": {<json args>}}

Rules: one action per turn. Never claim an action happened unless a prior OBSERVATION confirms it. If you cannot make progress, call finish with an honest explanation.`;

  let transcript = `OBJECTIVE: ${opts.objective}

HISTORICAL MEMORY (retrieved from the vector store — factor this in before acting):
${formatMemories(memories)}`;

  for (let i = 0; i < maxSteps; i++) {
    // 3. Graceful pause when the serverless budget is nearly spent.
    if (Date.now() > deadlineAt) {
      await logAgentError({
        source,
        level: 'warning',
        message: `Agent paused mid-task: serverless time budget exhausted after ${i} step(s).`,
        context: { objective: opts.objective, stepsCompleted: steps },
      });
      return {
        status: 'paused',
        finalAnswer: `Paused after ${i} step(s) — time budget exhausted. Logged for admin review.`,
        steps,
      };
    }

    let raw: string;
    try {
      raw = await callLLM(systemPrompt, transcript);
    } catch (err: any) {
      // LLM providers all failed (rate limits, outage) — unresolvable state.
      await logAgentError({
        source,
        level: 'critical',
        message: `All LLM providers failed mid-task: ${err.message}`,
        context: { objective: opts.objective, stepsCompleted: steps },
      });
      return {
        status: 'failed',
        finalAnswer: 'LLM providers unavailable — task paused and escalated.',
        steps,
      };
    }

    const thought =
      raw.match(/THOUGHT:\s*([\s\S]*?)(?:\nACTION:|$)/i)?.[1]?.trim() || '';
    const actionJson = raw.match(/ACTION:\s*(\{[\s\S]*\})/i)?.[1];

    let action: { tool: string; args: Record<string, unknown> };
    try {
      const parsed = JSON.parse(actionJson || '');
      action = { tool: String(parsed.tool), args: parsed.args ?? {} };
    } catch {
      // Malformed action — feed the format error back as an observation once.
      transcript += `\n\nTHOUGHT: ${thought}\nOBSERVATION: Your last ACTION was not valid JSON in the required format. Retry with ACTION: {"tool": "...", "args": {...}}.`;
      continue;
    }

    if (action.tool === 'finish') {
      const answer = String(action.args.answer ?? 'Done.');
      steps.push({ thought, action, observation: 'Task finished.' });
      // 4. Write the outcome back to the vector store for future recall.
      await rememberMemory({
        roleId: opts.roleId,
        subjectType: opts.subjectType ?? 'system',
        subjectId: opts.subjectId,
        content: `${opts.roleName} completed: ${opts.objective} — outcome: ${answer}`,
        metadata: { steps: steps.length },
      });
      return { status: 'completed', finalAnswer: answer, steps };
    }

    const tool = opts.tools[action.tool];
    let observation: string;
    if (!tool) {
      observation = `Unknown tool "${action.tool}". Valid tools: ${Object.keys(opts.tools).join(', ')}, finish.`;
    } else {
      try {
        observation = await tool.run(action.args);
      } catch (err: any) {
        observation = `Tool "${action.tool}" failed: ${err.message}`;
        await logAgentError({
          source,
          message: `Tool "${action.tool}" threw during agent task: ${err.message}`,
          context: { objective: opts.objective, args: action.args },
        });
      }
    }

    steps.push({ thought, action, observation });
    transcript += `\n\nTHOUGHT: ${thought}\nACTION: ${JSON.stringify(action)}\nOBSERVATION: ${observation}`;
  }

  // Step ceiling hit without finish — unresolvable state, pause + log.
  await logAgentError({
    source,
    level: 'warning',
    message: `Agent hit the ${maxSteps}-step ceiling without finishing. Paused for admin review.`,
    context: { objective: opts.objective, steps },
  });
  return {
    status: 'paused',
    finalAnswer: `Paused: exceeded ${maxSteps} reasoning steps without completion.`,
    steps,
  };
}

export interface RoleContext {
  role_id: string;
  today: string;
  recent_own_shifts: any[];
  cross_team_flags_today: any[];
  business_data: any;
  manager_briefing_today: string | null;
  relevant_memories: AgentMemoryRow[];
  unread_messages: any[];
}

export async function getRoleContext(roleId: string): Promise<RoleContext> {
  const today = new Date().toISOString().slice(0, 10);

  const ownHistory =
    (await supabaseFetch(
      'ai_team_log',
      `role_id=eq.${roleId}&order=created_at.desc&limit=5`,
    )) || [];

  const todayLogs =
    (await supabaseFetch('ai_team_log', `shift_date=eq.${today}`)) || [];

  // Don's own morning briefing/direction for the day, if he's given one --
  // every role reads this FIRST and should treat it as top priority.
  const briefingRows =
    (await supabaseFetch(
      'manager_briefings',
      `briefing_date=eq.${today}&order=created_at.desc&limit=1`,
    )) || [];
  const managerBriefingToday = briefingRows[0]?.content || null;

  // Internal inbox: unread messages other agents sent this role. The role
  // reads them as part of its shift context and they're marked read after
  // the shift completes (markMessagesRead in runRoleShift).
  const unreadMessages =
    (await supabaseFetch(
      'agent_messages',
      `to_employee=eq.${roleId}&status=eq.sent&order=created_at.asc&limit=10&select=id,from_employee,subject,body,created_at`,
    )) || [];

  const crossTeamFlags = todayLogs
    .filter((l: any) => l.role_id !== roleId && l.flags)
    .map((l: any) => ({ role_name: l.role_name, flags: l.flags }));

  let businessData: any = null;
  if (roleId === 'sam-support') {
    businessData = await supabaseFetch(
      'email_messages',
      'direction=eq.inbound&order=created_at.desc&limit=20',
    );
  } else if (
    [
      'derek-sales-director',
      'victoria-vp-sales',
      'sales-agent-1',
      'sales-agent-2',
      'sales-agent-3',
      'sales-agent-4',
      'sales-agent-5',
    ].includes(roleId)
  ) {
    const [existingLeads, freshResearchedLeads] = await Promise.all([
      supabaseFetch('leads', 'order=created_at.desc&limit=25'),
      // Freshly-researched cold leads (from Sarah Collins, Lead Researcher) not yet
      // surfaced to sales — gives the sales roles real new targets to act on,
      // on top of the existing inbound-signup leads.
      supabaseFetch(
        'researched_leads',
        'status=eq.new&order=created_at.desc&limit=15',
      ),
    ]);
    businessData = {
      inbound_leads: existingLeads,
      new_researched_leads: freshResearchedLeads,
    };

    // Mark whatever we just showed them as surfaced so the next shift (and
    // the next role) doesn't keep re-presenting the same stale batch.
    if (freshResearchedLeads?.length) {
      const ids = freshResearchedLeads.map((l: any) => l.id);
      await supabaseFetch(`researched_leads?id=in.(${ids.join(',')})`, '', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'surfaced_to_sales',
          surfaced_to_sales_at: new Date().toISOString(),
        }),
      });
    }
  } else if (roleId === 'eli-engineering') {
    businessData = await getEngineeringHealth();
  } else if (roleId === 'brianna-billing') {
    businessData = await getStripeSummary();
  }

  // Strict memory-retrieval step: pull this role's most relevant historical
  // context from the vector store before it does ANY work this shift.
  const relevantMemories = await recallMemories(
    `${roleId} shift context ${today}: prior findings, open threads, lead and system state`,
    { roleId, limit: 8 },
  );

  return {
    role_id: roleId,
    today,
    recent_own_shifts: ownHistory,
    cross_team_flags_today: crossTeamFlags,
    business_data: businessData,
    manager_briefing_today: managerBriefingToday,
    relevant_memories: relevantMemories,
    unread_messages: unreadMessages,
  };
}

// ---------------------------------------------------------------------------
// Internal agent-to-agent email. agent_messages is the team's mail system:
// every escalation, question, or handoff between AI employees is a row here.
// Recipients read their unread inbox as part of shift context (getRoleContext)
// and the 10-minute pulse worker (api/cron/pulse.ts) answers urgent mail
// between shifts. Messages flagged requires_president ALSO go to Don's real
// inbox via notifyEmail so nothing needing a human decision sits unseen.
// ---------------------------------------------------------------------------

export async function messageAgent(opts: {
  fromRoleId: string;
  fromRoleName?: string;
  toRoleId: string;
  subject: string;
  body: string;
  threadId?: string;
  requiresPresident?: boolean;
}) {
  const rows = await supabaseFetch('agent_messages', '', {
    method: 'POST',
    body: JSON.stringify({
      from_employee: opts.fromRoleId,
      to_employee: opts.toRoleId,
      subject: opts.subject.slice(0, 200),
      body: opts.body.slice(0, 4000),
      thread_id: opts.threadId ?? null,
      requires_president: opts.requiresPresident ?? false,
      status: 'sent',
    }),
  });
  if (opts.requiresPresident) {
    await notifyEmail(
      `[AI Team escalation] ${opts.subject}`,
      `From: ${opts.fromRoleName || opts.fromRoleId}\nTo: ${opts.toRoleId}\n\n${opts.body}`,
    );
  }
  return rows?.[0] ?? null;
}

/** Mark a role's unread inbox as read — called after the shift that consumed it. */
export async function markMessagesRead(roleId: string) {
  await supabaseFetch(
    'agent_messages',
    `to_employee=eq.${roleId}&status=eq.sent`,
    { method: 'PATCH', body: JSON.stringify({ status: 'read' }) },
  );
}

// Called whenever Don gives a briefing/direction for the day (voice, WhatsApp,
// chat -- however it reaches the Superagent). One row per day; latest wins if
// he gives more than one. Every role picks this up via getRoleContext above
// on their NEXT shift after it's saved -- there's no separate "push" needed.
export async function saveManagerBriefing(
  content: string,
  deliveredVia?: string,
) {
  const today = new Date().toISOString().slice(0, 10);
  return supabaseFetch('manager_briefings', '', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      briefing_date: today,
      content,
      delivered_via: deliveredVia || 'unspecified',
    }),
  });
}

// ---------------------------------------------------------------------------
// Eli / Luke Bradley — Engineering Health Feed
// Pulls real deployment status from Vercel + recent audit log errors so the
// Engineering shift can report on actual system state instead of guessing.
// ---------------------------------------------------------------------------
async function getEngineeringHealth() {
  const result: Record<string, any> = {};

  // 1. Vercel deployment status — last 5 deployments
  const vercelToken = process.env.VERCEL_TOKEN || process.env.VERCEL_TOKEN_3;
  const vercelProjectId = process.env.VERCEL_PROJECT_ID;
  if (vercelToken) {
    try {
      const projectFilter = vercelProjectId
        ? `&projectId=${vercelProjectId}`
        : '';
      const resp = await fetch(
        `https://api.vercel.com/v6/deployments?limit=5${projectFilter}`,
        { headers: { Authorization: `Bearer ${vercelToken}` } },
      );
      if (resp.ok) {
        const data = await resp.json();
        result.vercel_deployments = (data.deployments || []).map((d: any) => ({
          id: d.uid,
          state: d.state || d.readyState,
          url: d.url,
          created: d.created ? new Date(d.created).toISOString() : null,
          source: d.meta?.githubCommitMessage?.slice(0, 80) || d.name,
        }));
      } else {
        result.vercel_deployments = { error: `API ${resp.status}` };
      }
    } catch (e: any) {
      result.vercel_deployments = { error: e.message };
    }
  } else {
    result.vercel_deployments = null; // no token configured
  }

  // 2. Recent audit log entries. NOTE: the live audit_logs table has no
  // `level` column (user_id/action/resource_type/metadata only) — filtering
  // on it 400'd on every engineering shift. Open problems come from
  // error_logs (below); audit_logs contributes recent admin/user actions.
  try {
    const auditRows = await supabaseFetch(
      'audit_logs',
      'order=created_at.desc&limit=10&select=action,resource_type,user_email,created_at',
    );
    result.recent_errors = auditRows || [];
  } catch {
    result.recent_errors = [];
  }

  // 3. Recent failed function invocations (from error_logs if the table exists)
  try {
    const fnErrors = await supabaseFetch(
      'error_logs',
      'order=created_at.desc&limit=10',
    );
    result.recent_function_errors = fnErrors || [];
  } catch {
    result.recent_function_errors = [];
  }

  return result;
}

async function getStripeSummary() {
  const key =
    process.env.BUILDMYBOT_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      'https://api.stripe.com/v1/subscriptions?limit=20&status=all',
      {
        headers: { Authorization: `Bearer ${key}` },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const active = data.data.filter((s: any) => s.status === 'active').length;
    const pastDue = data.data.filter(
      (s: any) => s.status === 'past_due',
    ).length;
    const canceled = data.data.filter(
      (s: any) => s.status === 'canceled',
    ).length;
    return {
      active,
      past_due: pastDue,
      canceled,
      sample_size: data.data.length,
    };
  } catch {
    return null;
  }
}

export async function logShift(entry: {
  role_id: string;
  role_name: string;
  summary: string;
  tasks_completed?: number;
  flags?: string;
  escalated_to?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  await supabaseFetch('ai_team_log', '', {
    method: 'POST',
    body: JSON.stringify({
      ...entry,
      shift_date: today,
      tasks_completed: entry.tasks_completed ?? 0,
      flags: entry.flags ?? '',
      escalated_to: entry.escalated_to ?? '',
    }),
  });
}

/** Post to Slack via incoming webhook. Configure via the SLACK_WEBHOOK_URL
 * env var — never hardcode the URL, it's a live credential. Failures are
 * swallowed: a dead webhook must never break an agent's actual work. */
export async function notifySlack(text: string) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err: any) {
    console.error('[slack] webhook post failed:', err.message);
  }
}

/** Post a summary message to Discord when a notable agent action happens
 * (shift completions, lead follow-up runs, critical failures, daily exec
 * summary). Configure via the DISCORD_WEBHOOK_URL env var — never hardcode
 * the webhook URL, it's a live credential. Failures are swallowed: a dead
 * webhook must never break an agent's actual work. */
export async function notifyDiscord(text: string) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'BuildMyBot AI Team',
        // Discord hard-caps content at 2000 chars; leave headroom.
        content: text.slice(0, 1900),
      }),
    });
  } catch (err: any) {
    console.error('[discord] webhook post failed:', err.message);
  }
}

// Runs one role's full shift: retrieve memory -> gather context -> reason ->
// log -> write memory back -> (optionally notify). Unresolvable failures land
// in error_logs for the ErrorRecoveryDashboard instead of vanishing.
export async function runRoleShift(
  roleId: string,
  roleName: string,
  systemPrompt: string,
  opts?: { notify?: boolean },
) {
  let context: RoleContext;
  try {
    context = await getRoleContext(roleId);
  } catch (err: any) {
    await logAgentError({
      source: `ai-team/runRoleShift/${roleId}`,
      level: 'critical',
      message: `Context gathering failed — shift paused: ${err.message}`,
    });
    throw err;
  }

  const briefingLine = context.manager_briefing_today
    ? `DON'S BRIEFING FOR THE TEAM TODAY (top priority -- factor this into your work above everything else): "${context.manager_briefing_today}"\n\n`
    : '';

  const memoryBlock = `WHAT YOU REMEMBER FROM PAST SHIFTS (vector-recalled — build on this, don't repeat completed work):\n${formatMemories(context.relevant_memories)}\n\n`;

  const userPrompt = `${briefingLine}${memoryBlock}Today's context:\n${JSON.stringify({ ...context, relevant_memories: undefined }, null, 2)}\n\nDo your shift's work based on this context. Be honest if data is missing rather than inventing activity. Respond in this exact format:\nSUMMARY: <what you did/found>\nTASKS_COMPLETED: <number>\nFLAGS: <anything urgent, or leave blank>\nESCALATED_TO: <role_id if escalating, or leave blank>`;

  let raw: string;
  try {
    raw = await callLLM(systemPrompt, userPrompt);
  } catch (err: any) {
    // All providers down — gracefully pause the shift and file it for review.
    await logAgentError({
      source: `ai-team/runRoleShift/${roleId}`,
      level: 'critical',
      message: `All LLM providers failed — shift paused: ${err.message}`,
    });
    await logShift({
      role_id: roleId,
      role_name: roleName,
      summary:
        'Shift paused: no LLM provider was reachable. Logged to error recovery for admin review.',
      tasks_completed: 0,
      flags: 'LLM_PROVIDERS_DOWN',
    });
    throw err;
  }

  const summary =
    raw.match(/SUMMARY:\s*([\s\S]*?)(?:\nTASKS_COMPLETED:|$)/i)?.[1]?.trim() ||
    raw;
  const tasks = Number.parseInt(
    raw.match(/TASKS_COMPLETED:\s*(\d+)/i)?.[1] || '0',
    10,
  );
  const flags = raw.match(/FLAGS:\s*(.*)/i)?.[1]?.trim() || '';
  const escalatedTo = raw.match(/ESCALATED_TO:\s*(.*)/i)?.[1]?.trim() || '';

  await logShift({
    role_id: roleId,
    role_name: roleName,
    summary,
    tasks_completed: tasks,
    flags,
    escalated_to: escalatedTo,
  });

  // Write-back: embed this shift's outcome so future shifts recall it.
  await rememberMemory({
    roleId,
    subjectType: 'system',
    content: `${roleName} shift outcome: ${summary}${flags ? ` | Flags: ${flags}` : ''}`,
    metadata: { tasks_completed: tasks, escalated_to: escalatedTo },
  });

  // Inbox hygiene: this shift's context included the unread mail — mark it
  // read so the pulse worker doesn't re-answer it.
  await markMessagesRead(roleId);

  // Escalation = internal email to the target (manager/peer). President-bound
  // escalations also land in Don's real inbox via messageAgent.
  if (escalatedTo) {
    const toPresident = /don|president/i.test(escalatedTo);
    await messageAgent({
      fromRoleId: roleId,
      fromRoleName: roleName,
      toRoleId: toPresident ? 'president' : escalatedTo,
      subject: `Escalation from ${roleName} (${new Date().toISOString().slice(0, 10)})`,
      body: `${summary}${flags ? `\n\nFlags: ${flags}` : ''}`,
      requiresPresident: toPresident,
    });
  }

  if (opts?.notify) {
    await notifySlack(
      `*${roleName}* shift complete:\n${summary}${flags ? `\n:warning: ${flags}` : ''}`,
    );
    await notifyDiscord(
      `**${roleName}** shift complete:\n${summary}${flags ? `\n⚠️ ${flags}` : ''}`,
    );
  }

  return { summary, tasks, flags, escalatedTo };
}

export async function notifyEmail(subject: string, bodyText: string) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.AI_TEAM_REPORT_EMAIL || 'don@buildmybot.app';
  if (!key) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AI Team <reports@buildmybot.app>',
      to: [to],
      subject,
      text: bodyText,
    }),
  });
}

// ---------------------------------------------------------------------------
// Lead Researcher — steady drip of NEW cold-outbound sales targets, grounded
// in real web search results (Tavily). The LLM is only ever allowed to
// select/summarize from real search hits it was given — never to invent a
// company name or URL from nothing. This matters: a fabricated "lead" here
// would poison the sales pipeline with a fake company, wasting a real rep's
// (or Derek/Victoria's AI) time on a dead end.
// ---------------------------------------------------------------------------

// Real BuildMyBot ICP, pulled directly from docs/marketing/field-operations-manual.md
// and agent-playbook.md — "green light" industries only. Never widen this to
// red-light categories (restaurants, generic retail, corporate giants) without
// Don updating the actual sales playbook first.
const ICP_INDUSTRIES = [
  'HVAC company',
  'roofing company',
  'plumbing company',
  'solar installation company',
  'personal injury lawyer',
  'DUI defense lawyer',
  'family law attorney',
  'medspa',
  'plastic surgery clinic',
  'dental implants clinic',
  'real estate brokerage',
];

const TARGET_CITIES = [
  'Dallas TX',
  'Houston TX',
  'Austin TX',
  'San Antonio TX',
  'Phoenix AZ',
  'Atlanta GA',
  'Charlotte NC',
  'Nashville TN',
  'Tampa FL',
  'Orlando FL',
  'Denver CO',
  'Las Vegas NV',
  'Columbus OH',
  'Indianapolis IN',
  'Jacksonville FL',
  'Oklahoma City OK',
  'Memphis TN',
  'Louisville KY',
  'Kansas City MO',
  'Raleigh NC',
];

// Deterministic rotation so we work through many different (industry, city)
// combos over time instead of hammering the same query every run — driven off
// the current hour so different runs across the day naturally vary. `offset`
// lets multiple researcher identities running in the same hour each land on a
// DIFFERENT combo instead of duplicating each other's search (each of the 5
// sales-agent researchers passes its own fixed offset — see all-shifts.ts).
function pickIcpQuery(offset = 0): { industry: string; city: string } {
  const hourSlot = Math.floor(Date.now() / (1000 * 60 * 60)) + offset; // changes every hour, shifted per identity
  const industry = ICP_INDUSTRIES[hourSlot % ICP_INDUSTRIES.length];
  const city =
    TARGET_CITIES[
      Math.floor(hourSlot / ICP_INDUSTRIES.length) % TARGET_CITIES.length
    ];
  return { industry, city };
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

async function webSearch(
  query: string,
  maxResults = 8,
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: maxResults,
      }),
    });
    if (!res.ok) {
      console.error('Tavily search failed:', res.status, await res.text());
      return [];
    }
    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      content: (r.content || '').slice(0, 500),
    }));
  } catch (err) {
    console.error('Tavily search error:', err);
    return [];
  }
}

// `identity` lets any of the 6 researcher roles (Sarah Collins, the primary
// Lead Researcher, plus the 5 sales agents temporarily in research mode
// pre-launch -- see all-shifts.ts) run this same grounded-search engine under
// their own name, each landing on a different (industry, city) combo via
// their own fixed `offset` so they build the lead database in parallel
// instead of duplicating each other's search.
export async function researchLeads(identity?: {
  roleId: string;
  roleName: string;
  offset?: number;
}) {
  const roleId = identity?.roleId || 'lead-researcher';
  const roleName = identity?.roleName || 'Sarah Collins';
  const { industry, city } = pickIcpQuery(identity?.offset || 0);
  const query = `${industry} in ${city}`;

  if (!process.env.TAVILY_API_KEY) {
    await logShift({
      role_id: roleId,
      role_name: roleName,
      summary:
        'No TAVILY_API_KEY configured yet — cannot search for real companies. Skipped this run rather than inventing fake leads.',
      tasks_completed: 0,
      flags: 'TAVILY_API_KEY missing',
    });
    return { skipped: true, reason: 'no TAVILY_API_KEY' };
  }

  const results = await webSearch(query, 8);

  if (!results.length) {
    await logShift({
      role_id: roleId,
      role_name: roleName,
      summary: `Searched "${query}" but got zero results. Nothing new to add this run.`,
      tasks_completed: 0,
    });
    return { found: 0, query };
  }

  // Check which of these we already have, so the LLM doesn't waste effort
  // re-qualifying companies already in the table.
  const existing =
    (await supabaseFetch('researched_leads', 'select=website')) || [];
  const knownDomains = new Set(
    existing.map((r: any) => new URL(r.website).hostname.replace(/^www\./, '')),
  );

  const newResults = results.filter((r) => {
    try {
      return !knownDomains.has(new URL(r.url).hostname.replace(/^www\./, ''));
    } catch {
      return false;
    }
  });

  if (!newResults.length) {
    await logShift({
      role_id: roleId,
      role_name: roleName,
      summary: `Searched "${query}" — all ${results.length} results were companies we already have on file. No new leads this run.`,
      tasks_completed: 0,
    });
    return { found: 0, query, duplicates: results.length };
  }

  const systemPrompt = `You are ${roleName}, one of BuildMyBot's researchers building the outbound lead database. BuildMyBot sells a white-label AI chatbot/voice-agent platform that fixes "speed to lead" for local service businesses. ICP: Home Services (HVAC/Roofing/Plumbing/Solar), Legal (Personal Injury/DUI/Family Law), Medical/Esthetics (MedSpa/Plastic Surgery/Dental Implants), Real Estate brokerages. AVOID: restaurants, generic retail, large corporations.

CRITICAL RULE: You may ONLY reference real businesses that appear in the search results provided below. NEVER invent a company name, website, or detail that isn't directly supported by a provided result. If a result is a directory/listicle page rather than an actual business, skip it. If NONE of the results are real qualifying businesses, return an empty JSON array.`;

  const userPrompt = `Search query used: "${query}"\n\nReal search results:\n${JSON.stringify(newResults, null, 2)}\n\nFrom these results ONLY, identify real, distinct businesses that are genuine BuildMyBot outbound sales targets. Return ONLY a JSON array (no markdown, no commentary), each item shaped exactly like:\n{"company_name": "...", "website": "<the exact url from the results>", "industry": "${industry}", "city": "${city}", "why_good_fit": "1-2 sentences tied to a real ICP pain point (missed calls, slow response, after-hours gaps)", "suggested_angle": "which opener from the field ops manual to use, e.g. Ghost Shopper Audit or the 5-Minute Rule"}\n\nIf nothing qualifies, return: []`;

  const raw = await callLLM(systemPrompt, userPrompt);

  let candidates: any[] = [];
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    candidates = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch (err) {
    console.error(`${roleName}: failed to parse LLM JSON output:`, raw);
  }

  // Belt-and-suspenders: only keep candidates whose website URL actually
  // matches one of the real search results we provided — never trust the
  // LLM's URL in isolation.
  const validUrls = new Set(newResults.map((r) => r.url));
  const safeCandidates = candidates.filter(
    (c) => c.website && validUrls.has(c.website),
  );

  let inserted = 0;
  for (const c of safeCandidates) {
    const row = await supabaseFetch('researched_leads', '', {
      method: 'POST',
      headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
      body: JSON.stringify({
        company_name: c.company_name,
        website: c.website,
        industry: c.industry || industry,
        city: c.city || city,
        why_good_fit: c.why_good_fit,
        suggested_angle: c.suggested_angle,
        source_query: query,
        researched_by: roleName,
        status: 'new',
      }),
    });
    if (row) inserted++;
  }

  const summary = inserted
    ? `Researched "${query}": found ${inserted} new real ${industry} lead(s) in ${city} matching ICP, added to researched_leads for sales to pick up. (${results.length - newResults.length} of ${results.length} search results were already-known companies.)`
    : `Researched "${query}" (${results.length} results) but none were qualifying real businesses matching ICP this run.`;

  await logShift({
    role_id: roleId,
    role_name: roleName,
    summary,
    tasks_completed: inserted,
  });

  return { found: inserted, query, candidates: safeCandidates.length };
}

// ---------------------------------------------------------------------------
// Frankie Mercer — Social Media Manager. Reasons about what to post, drafts
// content, and (only once real platform credentials exist) actually publishes
// and checks for replies/mentions. Self-triggering via GitHub Actions on a
// recurring schedule (see .github/workflows/ai-team-schedule.yml).
//
// IMPORTANT / honest-by-design: this NEVER fakes a publish. If a platform's
// API keys aren't configured, Frankie logs the content as a 'draft' only and
// says so plainly in the shift summary -- exactly like Eli's placeholder
// engineering shifts or Brianna's pre-Stripe billing shifts.
// ---------------------------------------------------------------------------

interface SocialDraft {
  platform: 'twitter' | 'linkedin';
  content: string;
  post_type: 'post' | 'reply';
  in_reply_to_id?: string;
}

function twitterConfigured() {
  return !!(
    process.env.TWITTER_API_KEY &&
    process.env.TWITTER_API_SECRET &&
    process.env.TWITTER_ACCESS_TOKEN &&
    process.env.TWITTER_ACCESS_TOKEN_SECRET
  );
}

function linkedinConfigured() {
  return !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_ORG_URN);
}

// OAuth 1.0a signing for X/Twitter API v2 (POST /2/tweets requires user-context auth).
async function twitterOAuthHeader(
  method: string,
  url: string,
  extraParams: Record<string, string> = {},
) {
  const crypto = await import('node:crypto');
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: process.env.TWITTER_API_KEY!,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.TWITTER_ACCESS_TOKEN!,
    oauth_version: '1.0',
    ...extraParams,
  };
  const allParams = { ...oauthParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');
  const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
  const signingKey = `${encodeURIComponent(process.env.TWITTER_API_SECRET!)}&${encodeURIComponent(process.env.TWITTER_ACCESS_TOKEN_SECRET!)}`;
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');
  const headerParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  };
  const header = `OAuth ${Object.keys(headerParams)
    .sort()
    .map(
      (k) =>
        `${encodeURIComponent(k)}="${encodeURIComponent(headerParams[k])}"`,
    )
    .join(', ')}`;
  return header;
}

async function publishToTwitter(
  content: string,
  inReplyToId?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!twitterConfigured()) return { ok: false, error: 'not_configured' };
  const url = 'https://api.twitter.com/2/tweets';
  try {
    const authHeader = await twitterOAuthHeader('POST', url);
    const body: any = { text: content.slice(0, 280) };
    if (inReplyToId) body.reply = { in_reply_to_tweet_id: inReplyToId };
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) return { ok: false, error: JSON.stringify(data) };
    return { ok: true, id: data.data?.id };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

async function publishToLinkedIn(
  content: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!linkedinConfigured()) return { ok: false, error: 'not_configured' };
  try {
    const resp = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: process.env.LINKEDIN_ORG_URN,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: content },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    });
    if (!resp.ok) return { ok: false, error: await resp.text() };
    const id = resp.headers.get('x-restli-id') || undefined;
    return { ok: true, id };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// Check X mentions since our last check (only if configured) — used so Frankie
// can honestly reply to real people instead of inventing engagement.
async function fetchTwitterMentions(): Promise<any[]> {
  if (!twitterConfigured() || !process.env.TWITTER_USER_ID) return [];
  try {
    const url = `https://api.twitter.com/2/users/${process.env.TWITTER_USER_ID}/mentions?max_results=10`;
    const authHeader = await twitterOAuthHeader('GET', url);
    const resp = await fetch(url, { headers: { Authorization: authHeader } });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.data || [];
  } catch {
    return [];
  }
}

export async function runSocialMediaShift() {
  const roleId = 'frankie-social';
  const roleName = 'Frankie Mercer';
  const today = new Date().toISOString().slice(0, 10);

  // Context: recent own posts/drafts, recent marketing content from Amanda
  // Hayes and sales wins from the rest of the team, so Frankie posts about
  // real things instead of generic filler.
  const recentPosts =
    (await supabaseFetch('social_posts', 'order=created_at.desc&limit=10')) ||
    [];
  const todayLogs =
    (await supabaseFetch('ai_team_log', `shift_date=eq.${today}`)) || [];
  const teamHighlights = todayLogs
    .filter((l: any) => l.role_id !== roleId)
    .map((l: any) => ({ role_name: l.role_name, summary: l.summary }));

  const twitterOn = twitterConfigured();
  const linkedinOn = linkedinConfigured();

  const mentions = await fetchTwitterMentions();

  const systemPrompt = `You are Frankie Mercer, Social Media Manager for BuildMyBot, a white-label AI chatbot/voice-agent platform for local service businesses (home services, legal, medical/esthetics, real estate). Voice: confident, helpful, a little punchy -- never corporate/generic. Never invent metrics, followers, or engagement that isn't in the data you're given.`;

  const userPrompt = `Today's real context:
Recent posts/drafts (last 10): ${JSON.stringify(
    recentPosts.map((p: any) => ({
      platform: p.platform,
      content: p.content,
      status: p.status,
      created_at: p.created_at,
    })),
    null,
    2,
  )}
Today's team activity you can draw content from: ${JSON.stringify(teamHighlights, null, 2)}
Live platform connections: Twitter/X ${twitterOn ? 'CONNECTED' : 'NOT connected yet'}, LinkedIn ${linkedinOn ? 'CONNECTED' : 'NOT connected yet'}.
Real unanswered mentions right now: ${JSON.stringify(mentions, null, 2)}

Do your shift:
1. Draft 1-2 NEW original posts (platform: twitter and/or linkedin) grounded in today's real team activity or BuildMyBot's product/ICP -- not generic hype.
2. If there are real unanswered mentions above, draft a reply for each.
3. Do NOT reference posting/replying as if it already happened if the platform isn't connected -- say so honestly.

Respond in this exact format (repeat the DRAFT block for each item, at least 1):
DRAFT_PLATFORM: twitter|linkedin
DRAFT_TYPE: post|reply
DRAFT_REPLY_TO_ID: <mention id if type=reply, else blank>
DRAFT_CONTENT: <the actual post/reply text>
---
SUMMARY: <one line: what you drafted/posted/replied to>
FLAGS: <anything urgent, or blank>`;

  const raw = await callLLM(systemPrompt, userPrompt);

  const draftBlocks = raw.split('---')[0];
  const summary =
    raw.match(/SUMMARY:\s*([\s\S]*?)(?:\nFLAGS:|$)/i)?.[1]?.trim() ||
    'No summary produced.';
  const flags = raw.match(/FLAGS:\s*(.*)/i)?.[1]?.trim() || '';

  const drafts: SocialDraft[] = [];
  const blocks = draftBlocks.split(/DRAFT_PLATFORM:/i).slice(1);
  for (const block of blocks) {
    const platform = block
      .match(/^\s*(twitter|linkedin)/i)?.[1]
      ?.toLowerCase() as 'twitter' | 'linkedin' | undefined;
    const postType = block
      .match(/DRAFT_TYPE:\s*(post|reply)/i)?.[1]
      ?.toLowerCase() as 'post' | 'reply' | undefined;
    const rawReplyToId = block
      .match(/DRAFT_REPLY_TO_ID:[ \t]*([^\n]*)/i)?.[1]
      ?.trim();
    // Guard against the regex bleeding into the next field's label when the
    // model leaves this blank (seen live: captured "DRAFT_CONTENT:" itself).
    const replyToId =
      rawReplyToId && !/^DRAFT_/i.test(rawReplyToId) ? rawReplyToId : undefined;
    const draftContent = block
      .match(/DRAFT_CONTENT:\s*([\s\S]*)/i)?.[1]
      ?.trim();
    if (platform && draftContent) {
      drafts.push({
        platform,
        content: draftContent,
        post_type: postType || 'post',
        in_reply_to_id: replyToId || undefined,
      });
    }
  }

  let publishedCount = 0;
  const results: any[] = [];
  for (const draft of drafts) {
    const configured = draft.platform === 'twitter' ? twitterOn : linkedinOn;
    if (!configured) {
      await supabaseFetch('social_posts', '', {
        method: 'POST',
        body: JSON.stringify({
          platform: draft.platform,
          content: draft.content,
          post_type: draft.post_type,
          in_reply_to_id: draft.in_reply_to_id || null,
          status: 'draft_awaiting_credentials',
        }),
      });
      results.push({ ...draft, status: 'draft_awaiting_credentials' });
      continue;
    }
    const publishResult =
      draft.platform === 'twitter'
        ? await publishToTwitter(draft.content, draft.in_reply_to_id)
        : await publishToLinkedIn(draft.content);
    await supabaseFetch('social_posts', '', {
      method: 'POST',
      body: JSON.stringify({
        platform: draft.platform,
        content: draft.content,
        post_type: draft.post_type,
        in_reply_to_id: draft.in_reply_to_id || null,
        status: publishResult.ok ? 'published' : 'failed',
        external_post_id: publishResult.id || null,
        error: publishResult.error || null,
      }),
    });
    if (publishResult.ok) publishedCount++;
    results.push({
      ...draft,
      status: publishResult.ok ? 'published' : 'failed',
      error: publishResult.error,
    });
  }

  const credentialNote =
    !twitterOn && !linkedinOn
      ? ' No platform is connected yet — all content saved as drafts only, nothing was actually posted.'
      : '';

  await logShift({
    role_id: roleId,
    role_name: roleName,
    summary: summary + credentialNote,
    tasks_completed: publishedCount,
    flags,
  });

  return {
    summary,
    drafted: drafts.length,
    published: publishedCount,
    twitterOn,
    linkedinOn,
    results,
  };
}

export default async function handler(req: any, res: any) {
  if (res && typeof res.status === 'function') {
    return res.status(404).json({ error: 'AI Team library helper - not an API endpoint' });
  }
}
