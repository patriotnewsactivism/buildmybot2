// Shared library for the AI Team automation, running natively on Vercel + Supabase.
// No Base44 dependency, no per-message credit ceiling — just usage-based LLM billing.
//
// LLM PROVIDER (2026-08-29): switched to OpenRouter DeepSeek V4 stack — same
// model config as Apex. DeepSeek V4 is extremely inexpensive, high-quality,
// 1M+ context. Uses OPENROUTER_API_KEY_2 as the primary key.
//
//   1. DeepSeek V4 Flash Latest  — $0.03/$0.10 per M tokens (primary)
//   2. DeepSeek V4 Flash 0731    — $0.06/$0.12 per M tokens (fallback)
//   3. DeepSeek V4 Pro 0813      — $0.66/$1.98 per M tokens (heavy reasoning)
//
// All three use the same OpenRouter endpoint and API key. Circuit breakers
// are not needed at this layer — OpenRouter handles routing internally.

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Provider =
  | 'openrouter-flash'
  | 'openrouter-flash-0731'
  | 'openrouter-pro';

const PROVIDER_CONFIG: Record<
  Provider,
  { baseURL: string; model: string; keyEnvs: string[] }
> = {
  // Primary: cheapest DeepSeek V4 Flash, latest snapshot. The ~ prefix tells
  // OpenRouter to auto-route to the cheapest available provider for this model.
  'openrouter-flash': {
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    model: '~deepseek/deepseek-v4-flash-latest',
    keyEnvs: ['OPENROUTER_API_KEY_2', 'OPENROUTER_API_KEY'],
  },
  // Fallback: pinned 0731 snapshot in case "latest" has a transient issue.
  'openrouter-flash-0731': {
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'deepseek/deepseek-v4-flash-0731',
    keyEnvs: ['OPENROUTER_API_KEY_2', 'OPENROUTER_API_KEY'],
  },
  // Heavy reasoning: the Pro model for complex multi-step analysis. More
  // expensive but still a fraction of GPT-4o pricing.
  'openrouter-pro': {
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'deepseek/deepseek-v4-pro-0813',
    keyEnvs: ['OPENROUTER_API_KEY_2', 'OPENROUTER_API_KEY'],
  },
};

/** Resolve the first available OpenRouter API key from the environment. */
function resolveOpenRouterKey(): string | undefined {
  for (const envName of ['OPENROUTER_API_KEY_2', 'OPENROUTER_API_KEY']) {
    const key = process.env[envName];
    if (key) return key;
  }
  return undefined;
}

const FALLBACK_ORDER: Provider[] = [
  'openrouter-flash',
  'openrouter-flash-0731',
  'openrouter-pro',
];

// Safety gate for anything that sends a real email or places a real phone
// call to a real lead. Defaults to TRUE (dry-run) whenever the env var is
// unset or anything other than the literal string 'false' — a missing var
// must never accidentally go live.
export function salesAutomationDryRun(): boolean {
  return (
    (process.env.SALES_AUTOMATION_DRY_RUN || 'true').toLowerCase() !== 'false'
  );
}

// Global emergency stop for every AI Team cron handler.
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
    // prevent.
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

  const errors: string[] = [];
  for (const provider of FALLBACK_ORDER) {
    const cfg = PROVIDER_CONFIG[provider];
    const apiKey = resolveOpenRouterKey();
    if (!apiKey) continue; // no OpenRouter key configured, skip silently
    try {
      return await callWithConfig(cfg, apiKey, systemPrompt, userPrompt);
    } catch (err: any) {
      errors.push(`${provider}: ${err.message}`);
      // try the next model in the chain
    }
  }

  throw await providerChainExhausted(errors);
}

/** Full provider-chain exhaustion is a portfolio-level event: log it as a
 * CRITICAL error_logs row instead of only throwing. */
async function providerChainExhausted(errors: string[]): Promise<Error> {
  const message = errors.length
    ? `All OpenRouter DeepSeek V4 models failed: ${errors.join(' | ')}`
    : `OPENROUTER_API_KEY_2 not configured — set it on Vercel to enable AI Team LLM calls`;
  try {
    await logAgentError({
      source: 'llm-provider-chain',
      message,
      level: 'critical',
      context: { providers_tried: errors.length, chain: FALLBACK_ORDER },
    });
  } catch {
    console.error('[llm-provider-chain] exhaustion alert itself failed:', message);
  }
  return new Error(message);
}

/** Multi-turn variant for real conversations (customer-facing chat widget).
 * Uses the same OpenRouter DeepSeek V4 stack. `preferredProvider` lets a
 * caller override the default flash model (e.g. use the Pro model for
 * complex customer queries). */
export async function callLLMMessages(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  temperature = 0.7,
  preferredProvider?: string,
): Promise<string> {
  const validPreferred =
    preferredProvider && preferredProvider in PROVIDER_CONFIG
      ? (preferredProvider as Provider)
      : undefined;
  const preferred = validPreferred || FALLBACK_ORDER[0];
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

// ─── HTTP call helpers ────────────────────────────────────────────────────

async function callWithConfig(
  cfg: { baseURL: string; model: string },
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch(cfg.baseURL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://buildmybot.app',
      'X-Title': 'BuildMyBot AI Team',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 4096,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callWithConfigMessages(
  cfg: { baseURL: string; model: string },
  apiKey: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  temperature: number,
): Promise<string> {
  const res = await fetch(cfg.baseURL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://buildmybot.app',
      'X-Title': 'BuildMyBot AI Team',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature,
      max_tokens: 4096,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// ─── Supabase error logging ──────────────────────────────────────────────

export async function logAgentError(params: {
  source: string;
  message: string;
  level?: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/error_logs`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: params.source,
        level: params.level ?? 'error',
        message: params.message,
        context: params.context ?? {},
        status: 'new',
      }),
    });
  } catch (err) {
    console.error('[logAgentError] failed to log:', params.message, err);
  }
}
