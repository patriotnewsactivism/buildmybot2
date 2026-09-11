// Shared AI Team runtime for BuildMyBot2.
// Operator policy 2026-09-04: FREE models first (most-reasoning until
// exhausted), then CHEAPEST high-reasoning PAID models as last resort.
// No sole paid usage without explicit operator authorization.

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Provider =
  | 'openrouter-minimax-m3'
  | 'openrouter-nemotron-ultra'
  | 'openrouter-nemotron-super'
  | 'openrouter-deepseek-v4-flash-paid'
  | 'openrouter-gpt-oss-120b-paid'
  | 'openrouter-deepseek-v3-paid'
  | 'openrouter-grok-4-6-bedrock';

interface ProviderConfig {
  baseURL: string;
  model: string;
  keyEnvs: string[];
  // Optional OpenRouter reasoning-effort hint (reasoning models only).
  reasoningEffort?: 'low' | 'medium' | 'high';
  // Optional OpenRouter provider-routing block. Needed when a model is served
  // by several providers and only one of them is the intended target — e.g. a
  // BYOK endpoint, which is only used if the request lands on that provider.
  providerRouting?: { only?: string[]; allow_fallbacks?: boolean };
}

// Free-tier key order: new-account free key first, then the old-account
// backup (still serves :free models), then the legacy alias.
const FREE_KEY_ENVS = [
  'OPENROUTER_FREE_API_KEY',
  'OPENROUTER_API_KEY_2',
  'OPENROUTER_API_KEY',
];
// Paid keys back ONLY the paid tail (last resort).
const PAID_KEY_ENVS = ['OPENROUTER_API_KEY_3'];
// BYOK is configured per OpenRouter ACCOUNT, so this key must belong to the
// account holding the Amazon Bedrock provider key. If that is the same account
// as the paid key above, leave OPENROUTER_BYOK_API_KEY unset.
const BYOK_KEY_ENVS = [
  'OPENROUTER_BYOK_API_KEY',
  'OPENROUTER_API_KEY_3',
  'OPENROUTER_API_KEY',
];

const PROVIDER_CONFIG: Record<Provider, ProviderConfig> = {
  'openrouter-minimax-m3': {
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'minimax/minimax-m3:free',
    keyEnvs: FREE_KEY_ENVS,
  },
  'openrouter-nemotron-ultra': {
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    keyEnvs: FREE_KEY_ENVS,
  },
  'openrouter-nemotron-super': {
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    keyEnvs: FREE_KEY_ENVS,
  },
  'openrouter-deepseek-v4-flash-paid': {
    // Operator-approved PRIMARY paid fallback (2026-09-05): kicks in only
    // after all four free models exhaust. Reasoning model — runs at low
    // effort and the null-content guard below keeps it from silently
    // returning an empty reply when thinking eats the token budget.
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'deepseek/deepseek-v4-flash-0731',
    keyEnvs: PAID_KEY_ENVS,
    reasoningEffort: 'low',
  },
  'openrouter-gpt-oss-120b-paid': {
    // Cheapest high-reasoning paid model on OpenRouter ($0.037/M in).
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openai/gpt-oss-120b',
    keyEnvs: PAID_KEY_ENVS,
  },
  'openrouter-deepseek-v3-paid': {
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'deepseek/deepseek-v3.2',
    keyEnvs: PAID_KEY_ENVS,
  },
  'openrouter-grok-4-6-bedrock': {
    // Last-resort rung (operator-authorised 2026-09-07). Routed through the
    // operator's own Amazon Bedrock BYOK credential, so it bills AWS instead
    // of OpenRouter credits and keeps the AI team answering when the free
    // models are daily-capped AND the paid credits are exhausted — the exact
    // combination that took the fleet down on 2026-09-06.
    //
    // Pinning is required, not a preference: x-ai/grok-4.6 is served by five
    // endpoints and xAI direct is cheaper and much faster, so an unpinned
    // request routes there and bills the credits this rung exists to avoid.
    // allow_fallbacks:false stops a Bedrock outage becoming a silent
    // paid-credit call; the chain falls through instead.
    //
    // The `/us-west-2` suffix is REQUIRED. OpenRouter documents a base provider
    // slug as matching every endpoint of that provider including regional ones,
    // but for this model it does not: the bare slug is dropped by the router's
    // "Filter by Regional Surcharge" step (Bedrock is $2.2/M against xAI's
    // $2/M) before `only` is applied. Verified against the live API on
    // 2026-09-07, same request otherwise:
    //
    //   only: ['amazon-bedrock']           -> HTTP 404 "No allowed providers
    //                                         are available for the selected
    //                                         model" (funnel: 5 endpoints -> 4
    //                                         at the surcharge filter, leaving
    //                                         only xai)
    //   only: ['amazon-bedrock/us-west-2'] -> served, tokens returned
    //
    // Reverting to the bare slug does not widen the match, it disables the rung.
    //
    // reasoningEffort is mandatory: grok-4.6 has reasoning.mandatory = true
    // and defaults to 'high', which spends the whole token budget thinking and
    // returns content: null — caught by the empty-completion guard below, but
    // only after wasting the call.
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'x-ai/grok-4.6',
    keyEnvs: BYOK_KEY_ENVS,
    reasoningEffort: 'low',
    providerRouting: {
      only: ['amazon-bedrock/us-west-2'],
      allow_fallbacks: false,
    },
  },
};

const FALLBACK_ORDER: Provider[] = [
  'openrouter-minimax-m3',
  'openrouter-nemotron-ultra',
  'openrouter-nemotron-super',
  'openrouter-deepseek-v4-flash-paid',
  'openrouter-gpt-oss-120b-paid',
  'openrouter-deepseek-v3-paid',
  // Last: BYOK, so it is only reached once everything cheaper is exhausted.
  'openrouter-grok-4-6-bedrock',
];

function resolveOpenRouterKeys(config?: ProviderConfig): string[] {
  const envNames = config?.keyEnvs ?? FREE_KEY_ENVS;
  const keys: string[] = [];
  for (const envName of envNames) {
    const value = process.env[envName];
    // Ignore placeholder/garbage values (real OpenRouter keys are long).
    if (value && value.length >= 40 && !keys.includes(value)) keys.push(value);
  }
  return keys;
}

export function salesAutomationDryRun(): boolean {
  return (
    (process.env.SALES_AUTOMATION_DRY_RUN || 'true').toLowerCase() !== 'false'
  );
}

export function aiTeamKilled(): boolean {
  return (process.env.AI_TEAM_KILL_SWITCH || '').toLowerCase() === 'true';
}

async function overDailyBudget(): Promise<boolean> {
  const configuredBudget = Number(process.env.LLM_DAILY_BUDGET_CALLS || 500);
  const budget = Number.isFinite(configuredBudget)
    ? Math.max(0, Math.floor(configuredBudget))
    : 500;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/increment_llm_usage`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ usage_day: today }),
      },
    );
    if (!response.ok) {
      throw new Error(`budget RPC returned ${response.status}`);
    }
    const count = await response.json();
    return typeof count === 'number' && count > budget;
  } catch (error: any) {
    throw new Error(`llm_budget_guard_unavailable: ${error.message}`);
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
      message: `Daily internal LLM call budget exceeded (LLM_DAILY_BUDGET_CALLS=${process.env.LLM_DAILY_BUDGET_CALLS || 500}).`,
    }).catch(() => null);
    throw new Error('daily_llm_budget_exceeded');
  }

  const errors: string[] = [];
  for (const provider of FALLBACK_ORDER) {
    const config = PROVIDER_CONFIG[provider];
    // Try every configured key for this provider tier before moving on —
    // a single exhausted key (daily free-model caps) must not strand the
    // whole provider when a second live key exists.
    for (const apiKey of resolveOpenRouterKeys(config)) {
      try {
        return await callWithConfig(config, apiKey, systemPrompt, userPrompt);
      } catch (error: any) {
        errors.push(`${provider}: ${error.message}`);
      }
    }
  }

  throw await providerChainExhausted(errors);
}

async function providerChainExhausted(errors: string[]): Promise<Error> {
  const message = errors.length
    ? `All OpenRouter agent models failed: ${errors.join(' | ')}`
    : 'No OpenRouter credential is configured. Set OPENROUTER_FREE_API_KEY (or OPENROUTER_API_KEY_2) for free-tier, OPENROUTER_API_KEY_3 for the paid tail.';
  await logAgentError({
    source: 'llm-provider-chain',
    message,
    level: 'critical',
    context: { providers_tried: errors.length, chain: FALLBACK_ORDER },
  }).catch(() => null);
  return new Error(message);
}

export async function callLLMMessages(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  temperature = 0.7,
  preferredProvider?: string,
): Promise<string> {
  const preferred =
    preferredProvider && preferredProvider in PROVIDER_CONFIG
      ? (preferredProvider as Provider)
      : FALLBACK_ORDER[0];
  const order = [preferred, ...FALLBACK_ORDER.filter((p) => p !== preferred)];
  const errors: string[] = [];

  for (const provider of order) {
    const config = PROVIDER_CONFIG[provider];
    // Try every configured key for this provider tier before moving on —
    // a single exhausted key (daily free-model caps) must not strand the
    // whole provider when a second live key exists.
    for (const apiKey of resolveOpenRouterKeys(config)) {
      try {
        return await callWithConfigMessages(
          config,
          apiKey,
          messages,
          temperature,
        );
      } catch (error: any) {
        errors.push(`${provider}: ${error.message}`);
      }
    }
  }

  throw await providerChainExhausted(errors);
}

async function callWithConfig(
  config: ProviderConfig,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  return callWithConfigMessages(
    config,
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    0.4,
  );
}

async function callWithConfigMessages(
  config: ProviderConfig,
  apiKey: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  temperature: number,
): Promise<string> {
  const configuredMaxTokens = Number(
    process.env.AI_TEAM_MAX_OUTPUT_TOKENS || 1024,
  );
  const maxTokens = Number.isFinite(configuredMaxTokens)
    ? Math.min(4096, Math.max(128, Math.floor(configuredMaxTokens)))
    : 1024;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(config.baseURL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://buildmybot.app',
        'X-Title': 'BuildMyBot AI Team',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(config.reasoningEffort
          ? { reasoning: { effort: config.reasoningEffort } }
          : {}),
        ...(config.providerRouting ? { provider: config.providerRouting } : {}),
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`${response.status} ${detail.slice(0, 200)}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    // Reasoning models (e.g. deepseek-v4-flash) can spend the whole token
    // budget thinking and return content: null. That is NOT a success —
    // throw so the chain falls through to the next provider instead of
    // silently returning an empty reply.
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error(
        `empty completion content (finish_reason: ${
          data.choices?.[0]?.finish_reason ?? 'unknown'
        })`,
      );
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

export async function supabaseFetch(
  table: string,
  params: string,
  init?: RequestInit,
): Promise<any> {
  const suffix = params ? `?${params}` : '';
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${suffix}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: init?.method === 'POST' ? 'return=representation' : '',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`Supabase ${table} fetch failed:`, response.status, detail);
    return null;
  }

  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
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
  const checks: Array<{ name: string; path: string; init?: RequestInit }> = [
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
  if (!apiKey) return null;
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
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
    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

export async function recallMemories(
  query: string,
  opts: {
    subjectType?: MemorySubjectType;
    subjectId?: string;
    roleId?: string;
    limit?: number;
    organizationId?: string;
  } = {},
): Promise<AgentMemoryRow[]> {
  const limit = opts.limit ?? 8;
  const organizationId = opts.organizationId ?? 'house';
  const queryEmbedding = await embedText(query);

  if (queryEmbedding) {
    try {
      const response = await fetch(
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
      if (response.ok) return (await response.json()) as AgentMemoryRow[];
    } catch {
      // Fall through to recency-based recall.
    }
  }

  const filters = [
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

export async function rememberMemory(entry: {
  roleId: string;
  subjectType: MemorySubjectType;
  subjectId?: string;
  content: string;
  metadata?: Record<string, unknown>;
  organizationId?: string;
}): Promise<void> {
  const embedding = await embedText(entry.content);
  await supabaseFetch('ai_agent_memories', '', {
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
}

export function formatMemories(memories: AgentMemoryRow[]): string {
  if (!memories.length) return 'No prior memories on record for this subject.';
  return memories
    .map(
      (memory) =>
        `- [${memory.created_at.slice(0, 10)}] (${memory.role_id}) ${memory.content}`,
    )
    .join('\n');
}

export async function notifySlack(text: string): Promise<void> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (error: any) {
    console.error('[slack] webhook post failed:', error.message);
  }
}

export async function notifyDiscord(text: string): Promise<void> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'BuildMyBot AI Team',
        content: text.slice(0, 1900),
      }),
    });
  } catch (error: any) {
    console.error('[discord] webhook post failed:', error.message);
  }
}

export async function logAgentError(params: {
  source: string;
  message: string;
  level?: 'warning' | 'error' | 'critical' | string;
  botId?: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseFetch('error_logs', '', {
      method: 'POST',
      body: JSON.stringify({
        source: params.source,
        level: params.level ?? 'error',
        message: params.message.slice(0, 2000),
        bot_id: params.botId ?? null,
        context: params.context ?? {},
        status: 'open',
      }),
    });
    if ((params.level ?? 'error') === 'critical') {
      await notifyDiscord(
        `CRITICAL — ${params.source}\n${params.message.slice(0, 500)}`,
      );
      await notifySlack(
        `CRITICAL — ${params.source}\n${params.message.slice(0, 500)}`,
      );
    }
  } catch (error) {
    console.error('[logAgentError] failed to log:', params.message, error);
  }
}

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
  }).catch(() => null);
}

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
  deadlineAt?: number;
}): Promise<AgentTaskResult> {
  const maxSteps = opts.maxSteps ?? 6;
  const deadlineAt = opts.deadlineAt ?? Date.now() + 45_000;
  const source = `ai-team/${opts.roleId}`;
  const steps: AgentStep[] = [];
  const memories = await recallMemories(opts.objective, {
    subjectType: opts.subjectType,
    subjectId: opts.subjectId,
    roleId: opts.roleId,
  });
  const toolCatalog = Object.entries(opts.tools)
    .map(([name, tool]) => `- ${name}: ${tool.description}`)
    .join('\n');
  const systemPrompt = `${opts.persona}\n\nUse a strict Thought -> Action -> Observation loop.\nAvailable tools:\n${toolCatalog}\n- finish: end the task. args: {"answer":"<outcome>"}\n\nRespond with exactly:\nTHOUGHT: <reasoning>\nACTION: {"tool":"<tool>","args":{}}`;
  let transcript = `OBJECTIVE: ${opts.objective}\n\nHISTORICAL MEMORY:\n${formatMemories(memories)}`;

  for (let index = 0; index < maxSteps; index++) {
    if (Date.now() > deadlineAt) {
      return {
        status: 'paused',
        finalAnswer: 'Paused because the task time budget was exhausted.',
        steps,
      };
    }

    let raw: string;
    try {
      raw = await callLLM(systemPrompt, transcript);
    } catch (error: any) {
      await logAgentError({
        source,
        level: 'critical',
        message: `LLM unavailable mid-task: ${error.message}`,
      });
      return {
        status: 'failed',
        finalAnswer: 'LLM providers unavailable.',
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
      transcript +=
        '\nOBSERVATION: Invalid ACTION JSON. Retry with valid JSON.';
      continue;
    }

    if (action.tool === 'finish') {
      const answer = String(action.args.answer ?? 'Done.');
      steps.push({ thought, action, observation: 'Task finished.' });
      await rememberMemory({
        roleId: opts.roleId,
        subjectType: opts.subjectType ?? 'system',
        subjectId: opts.subjectId,
        content: `${opts.roleName} completed: ${opts.objective} — ${answer}`,
        metadata: { steps: steps.length },
      });
      return { status: 'completed', finalAnswer: answer, steps };
    }

    const tool = opts.tools[action.tool];
    let observation: string;
    if (!tool) {
      observation = `Unknown tool ${action.tool}.`;
    } else {
      try {
        observation = await tool.run(action.args);
      } catch (error: any) {
        observation = `Tool failed: ${error.message}`;
        await logAgentError({
          source,
          message: observation,
          context: { tool: action.tool },
        });
      }
    }
    steps.push({ thought, action, observation });
    transcript += `\nTHOUGHT: ${thought}\nACTION: ${JSON.stringify(action)}\nOBSERVATION: ${observation}`;
  }

  return {
    status: 'paused',
    finalAnswer: `Paused after ${maxSteps} reasoning steps.`,
    steps,
  };
}

export async function messageAgent(opts: {
  fromRoleId: string;
  fromRoleName?: string;
  toRoleId: string;
  subject: string;
  body: string;
  threadId?: string;
  requiresPresident?: boolean;
}): Promise<any> {
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

export async function markMessagesRead(roleId: string): Promise<void> {
  await supabaseFetch(
    'agent_messages',
    `to_employee=eq.${roleId}&status=eq.sent`,
    { method: 'PATCH', body: JSON.stringify({ status: 'read' }) },
  );
}

export async function saveManagerBriefing(
  content: string,
  deliveredVia?: string,
): Promise<any> {
  return supabaseFetch('manager_briefings', '', {
    method: 'POST',
    body: JSON.stringify({
      briefing_date: new Date().toISOString().slice(0, 10),
      content,
      delivered_via: deliveredVia || 'unspecified',
    }),
  });
}

export async function logShift(entry: {
  role_id: string;
  role_name: string;
  summary: string;
  tasks_completed?: number;
  flags?: string;
  escalated_to?: string;
}): Promise<void> {
  await supabaseFetch('ai_team_log', '', {
    method: 'POST',
    body: JSON.stringify({
      ...entry,
      shift_date: new Date().toISOString().slice(0, 10),
      tasks_completed: entry.tasks_completed ?? 0,
      flags: entry.flags ?? '',
      escalated_to: entry.escalated_to ?? '',
    }),
  });
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
  const [ownHistory, todayLogs, briefingRows, unreadMessages] =
    await Promise.all([
      supabaseFetch(
        'ai_team_log',
        `role_id=eq.${roleId}&order=created_at.desc&limit=5`,
      ),
      supabaseFetch('ai_team_log', `shift_date=eq.${today}`),
      supabaseFetch(
        'manager_briefings',
        `briefing_date=eq.${today}&order=created_at.desc&limit=1`,
      ),
      supabaseFetch(
        'agent_messages',
        `to_employee=eq.${roleId}&status=eq.sent&order=created_at.asc&limit=10`,
      ),
    ]);

  let businessData: any = null;
  if (roleId === 'sam-support') {
    businessData = await supabaseFetch(
      'email_messages',
      'direction=eq.inbound&order=created_at.desc&limit=20',
    );
  } else if (roleId.includes('sales')) {
    const [inboundLeads, researchedLeads] = await Promise.all([
      supabaseFetch('leads', 'order=created_at.desc&limit=25'),
      supabaseFetch(
        'researched_leads',
        'status=in.(new,surfaced_to_sales)&order=created_at.desc&limit=15',
      ),
    ]);
    businessData = {
      inbound_leads: inboundLeads || [],
      new_researched_leads: researchedLeads || [],
    };
  } else if (roleId === 'eli-engineering') {
    businessData = {
      recent_errors:
        (await supabaseFetch('error_logs', 'order=created_at.desc&limit=10')) ||
        [],
    };
  }

  const logs = Array.isArray(todayLogs) ? todayLogs : [];
  const relevantMemories = await recallMemories(
    `${roleId} shift context ${today}`,
    { roleId, limit: 8 },
  );

  return {
    role_id: roleId,
    today,
    recent_own_shifts: Array.isArray(ownHistory) ? ownHistory : [],
    cross_team_flags_today: logs
      .filter((entry: any) => entry.role_id !== roleId && entry.flags)
      .map((entry: any) => ({
        role_name: entry.role_name,
        flags: entry.flags,
      })),
    business_data: businessData,
    manager_briefing_today: briefingRows?.[0]?.content || null,
    relevant_memories: relevantMemories,
    unread_messages: Array.isArray(unreadMessages) ? unreadMessages : [],
  };
}

export async function runRoleShift(
  roleId: string,
  roleName: string,
  systemPrompt: string,
  opts?: { notify?: boolean },
): Promise<{
  summary: string;
  tasks: number;
  flags: string;
  escalatedTo: string;
}> {
  const context = await getRoleContext(roleId);
  const briefing = context.manager_briefing_today
    ? `President briefing: ${context.manager_briefing_today}\n\n`
    : '';
  const prompt = `${briefing}Memory:\n${formatMemories(context.relevant_memories)}\n\nToday's context:\n${JSON.stringify({ ...context, relevant_memories: undefined }, null, 2)}\n\nRespond exactly:\nSUMMARY: <work done or findings>\nTASKS_COMPLETED: <number>\nFLAGS: <urgent issue or blank>\nESCALATED_TO: <role id or blank>`;
  const raw = await callLLM(systemPrompt, prompt);
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
  await rememberMemory({
    roleId,
    subjectType: 'system',
    content: `${roleName} shift outcome: ${summary}${flags ? ` | Flags: ${flags}` : ''}`,
    metadata: { tasks_completed: tasks, escalated_to: escalatedTo },
  });
  await markMessagesRead(roleId);

  if (escalatedTo) {
    await messageAgent({
      fromRoleId: roleId,
      fromRoleName: roleName,
      toRoleId: /don|president/i.test(escalatedTo) ? 'president' : escalatedTo,
      subject: `Escalation from ${roleName}`,
      body: `${summary}${flags ? `\n\nFlags: ${flags}` : ''}`,
      requiresPresident: /don|president/i.test(escalatedTo),
    });
  }

  if (opts?.notify) {
    await notifySlack(`${roleName} shift complete:\n${summary}`);
    await notifyDiscord(`${roleName} shift complete:\n${summary}`);
  }
  return { summary, tasks, flags, escalatedTo };
}

const ICP_INDUSTRIES = [
  'HVAC company',
  'roofing company',
  'plumbing company',
  'personal injury lawyer',
  'medspa',
  'real estate brokerage',
];
const TARGET_CITIES = [
  'Dallas TX',
  'Houston TX',
  'Austin TX',
  'Atlanta GA',
  'Charlotte NC',
  'Tampa FL',
  'Denver CO',
];

export async function researchLeads(identity?: {
  roleId: string;
  roleName: string;
  offset?: number;
}): Promise<any> {
  const roleId = identity?.roleId || 'lead-researcher';
  const roleName = identity?.roleName || 'Sarah Collins';
  const slot = Math.floor(Date.now() / 3_600_000) + (identity?.offset || 0);
  const industry = ICP_INDUSTRIES[slot % ICP_INDUSTRIES.length];
  const city =
    TARGET_CITIES[
      Math.floor(slot / ICP_INDUSTRIES.length) % TARGET_CITIES.length
    ];
  const query = `${industry} in ${city}`;
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) {
    await logShift({
      role_id: roleId,
      role_name: roleName,
      summary:
        'Lead research skipped because TAVILY_API_KEY is not configured.',
      tasks_completed: 0,
      flags: 'TAVILY_API_KEY missing',
    });
    return { skipped: true, reason: 'no TAVILY_API_KEY' };
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: tavilyKey,
      query,
      search_depth: 'basic',
      max_results: 8,
    }),
  });
  if (!response.ok) {
    throw new Error(`Tavily search failed with ${response.status}`);
  }
  const searchData = await response.json();
  const results = (searchData.results || []).map((result: any) => ({
    title: result.title,
    url: result.url,
    content: String(result.content || '').slice(0, 500),
  }));
  if (!results.length) return { found: 0, query };

  const raw = await callLLM(
    `You are ${roleName}, researching real BuildMyBot prospects. Use only businesses and URLs present in the supplied search results. Never invent a company or URL.`,
    `Query: ${query}\nResults:\n${JSON.stringify(results, null, 2)}\n\nReturn only a JSON array with: company_name, website, industry, city, why_good_fit, suggested_angle.`,
  );
  let candidates: any[] = [];
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    candidates = match ? JSON.parse(match[0]) : [];
  } catch {
    candidates = [];
  }
  const validUrls = new Set(results.map((result: any) => result.url));
  const safeCandidates = candidates.filter(
    (candidate) => candidate.website && validUrls.has(candidate.website),
  );
  let inserted = 0;
  for (const candidate of safeCandidates) {
    const row = await supabaseFetch('researched_leads', '', {
      method: 'POST',
      body: JSON.stringify({
        company_name: candidate.company_name,
        website: candidate.website,
        industry: candidate.industry || industry,
        city: candidate.city || city,
        why_good_fit: candidate.why_good_fit,
        suggested_angle: candidate.suggested_angle,
        source_query: query,
        researched_by: roleName,
        status: 'new',
      }),
    });
    if (row) inserted++;
  }
  await logShift({
    role_id: roleId,
    role_name: roleName,
    summary: `Researched ${query} and added ${inserted} grounded lead(s).`,
    tasks_completed: inserted,
  });
  return { found: inserted, query };
}

export async function runSocialMediaShift(): Promise<any> {
  const roleId = 'frankie-social';
  const roleName = 'Frankie Mercer';
  const todayLogs =
    (await supabaseFetch(
      'ai_team_log',
      `shift_date=eq.${new Date().toISOString().slice(0, 10)}`,
    )) || [];
  const raw = await callLLM(
    'You are Frankie Mercer, BuildMyBot social media manager. Draft one concise, grounded social post. Do not invent metrics, customers, or completed activity.',
    `Real team activity today:\n${JSON.stringify(todayLogs.slice(0, 12), null, 2)}\n\nReturn only the post text.`,
  );
  const content = raw.trim().slice(0, 1900);
  if (content) {
    await supabaseFetch('social_posts', '', {
      method: 'POST',
      body: JSON.stringify({
        platform: 'linkedin',
        content,
        post_type: 'post',
        status: 'draft_awaiting_approval',
      }),
    });
  }
  await logShift({
    role_id: roleId,
    role_name: roleName,
    summary: content
      ? 'Drafted a grounded social post and saved it for approval.'
      : 'No usable social draft was produced.',
    tasks_completed: content ? 1 : 0,
  });
  return { drafted: content ? 1 : 0, published: 0, content };
}

export async function notifyEmail(
  subject: string,
  bodyText: string,
): Promise<void> {
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
