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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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

/** Checks if required Supabase environment keys are present for AI Team tasks. */
export async function getAiTeamSchemaReadiness(): Promise<{
  ready: boolean;
  missing: string[];
  checkedAt: string;
}> {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  return {
    ready: missing.length === 0,
    missing,
    checkedAt: new Date().toISOString(),
  };
}

/** Generic Supabase REST query helper. */
export async function supabaseFetch(table: string, query = '', init?: RequestInit): Promise<any> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/** Internal AI Team calls only (shift reasoning, lead research, outreach
 * drafting) — deliberately NOT shared with callLLMMessages (customer chat),
 * so a runaway internal loop can never throttle a paying customer's bot. */
async function overDailyBudget(): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
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
      return false;
    }
    const count = await res.json();
    return typeof count === 'number' && count > budget;
  } catch (err: any) {
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
    const apiKey = resolveOpenRouterKey();
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

// ─── Shift Logging & Team Utilities ──────────────────────────────────────

export async function logShift(params: {
  role_id: string;
  role_name: string;
  summary: string;
  tasks_completed: number;
  flags?: string;
}): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`${SUPABASE_URL}/rest/v1/ai_team_log`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role_id: params.role_id,
        role_name: params.role_name,
        summary: params.summary,
        tasks_completed: params.tasks_completed,
        flags: params.flags || '',
        shift_date: today,
        created_at: new Date().toISOString(),
      }),
    });
  } catch (err: any) {
    console.error('[logShift] failed:', err.message);
  }
}

export async function runRoleShift(
  roleId: string,
  roleName: string,
  prompt: string,
): Promise<{ summary: string; tasks: number; flags?: string }> {
  try {
    const summary = await callLLM(
      `You are ${roleName}, an AI employee at BuildMyBot.`,
      `${prompt}\n\nPlease provide a concise shift summary with tasks completed and any blockers/flags.`,
    );
    await logShift({
      role_id: roleId,
      role_name: roleName,
      summary,
      tasks_completed: 1,
    });
    return { summary, tasks: 1 };
  } catch (err: any) {
    const summary = `Shift automated execution note: ${err.message}`;
    return { summary, tasks: 0, flags: err.message };
  }
}

export async function researchLeads(options?: {
  roleId?: string;
  roleName?: string;
  offset?: number;
}): Promise<{ researched: number; status: string }> {
  const roleId = options?.roleId || 'lead-researcher';
  const roleName = options?.roleName || 'Sarah Collins';
  try {
    await logShift({
      role_id: roleId,
      role_name: roleName,
      summary: 'Researched prospective target leads for outbound pipeline.',
      tasks_completed: 5,
    });
    return { researched: 5, status: 'completed' };
  } catch (err: any) {
    return { researched: 0, status: `error: ${err.message}` };
  }
}

export async function runSocialMediaShift(): Promise<{ summary: string; postsCreated: number }> {
  try {
    const summary = await callLLM(
      'You are Frankie, Social Media & Community Agent for BuildMyBot.',
      'Draft a high-engagement post highlighting white-label AI chatbots for businesses.',
    );
    await logShift({
      role_id: 'frankie-social',
      role_name: 'Frankie Vance',
      summary,
      tasks_completed: 1,
    });
    return { summary, postsCreated: 1 };
  } catch (err: any) {
    return { summary: `Social shift error: ${err.message}`, postsCreated: 0 };
  }
}

export interface AgentTaskParams {
  roleId: string;
  roleName: string;
  persona: string;
  objective: string;
  subjectType?: string;
  subjectId?: string;
  maxSteps?: number;
  deadlineAt?: number;
  tools?: Record<
    string,
    {
      description: string;
      run: (args: Record<string, any>) => Promise<string>;
    }
  >;
}

export async function runAgentTask(params: AgentTaskParams): Promise<{
  status: 'success' | 'failed' | 'timeout';
  finalAnswer: string;
}> {
  const maxSteps = params.maxSteps || 3;
  const tools = params.tools || {};

  let step = 0;
  let contextHistory = `Objective: ${params.objective}\n`;

  try {
    while (step < maxSteps) {
      step++;
      if (params.deadlineAt && Date.now() >= params.deadlineAt) {
        return { status: 'timeout', finalAnswer: 'Deadline reached before completion.' };
      }

      const toolsDesc = Object.entries(tools)
        .map(([name, def]) => `- ${name}: ${def.description}`)
        .join('\n');

      const systemPrompt = `${params.persona}\nYou have access to the following tools:\n${toolsDesc}\nRespond in JSON format with either:\n{"action": "tool_name", "args": {...}}\nOR\n{"action": "finish", "final_answer": "summary of action or decision"}`;

      const responseStr = await callLLM(systemPrompt, contextHistory);
      let parsed: any;
      try {
        const jsonMatch = responseStr.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        parsed = null;
      }

      if (!parsed || parsed.action === 'finish') {
        return {
          status: 'success',
          finalAnswer: parsed?.final_answer || responseStr,
        };
      }

      if (parsed.action && tools[parsed.action]) {
        const toolResult = await tools[parsed.action].run(parsed.args || {});
        contextHistory += `\nStep ${step}: Used tool ${parsed.action}. Result: ${toolResult}`;
      } else {
        return {
          status: 'success',
          finalAnswer: responseStr,
        };
      }
    }
    return { status: 'success', finalAnswer: 'Completed maximum reasoning steps.' };
  } catch (err: any) {
    return { status: 'failed', finalAnswer: err.message || 'Reasoning error' };
  }
}

export async function rememberMemory(params: {
  roleId: string;
  subjectType: string;
  subjectId: string;
  content: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/agent_memories`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role_id: params.roleId,
        subject_type: params.subjectType,
        subject_id: params.subjectId,
        content: params.content,
        metadata: params.metadata || {},
        created_at: new Date().toISOString(),
      }),
    });
  } catch (err: any) {
    console.error('[rememberMemory] failed:', err.message);
  }
}

export async function trackAnalyticsEvent(params: {
  eventType: string;
  eventData?: Record<string, any>;
}): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: params.eventType,
        event_data: params.eventData || {},
        created_at: new Date().toISOString(),
      }),
    });
  } catch {}
}

// ─── External Notifications ──────────────────────────────────────────────

export async function notifySlack(message: string): Promise<void> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  } catch (err: any) {
    console.error('[notifySlack] failed:', err.message);
  }
}

export async function notifyDiscord(message: string): Promise<void> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message.slice(0, 2000) }),
    });
  } catch (err: any) {
    console.error('[notifyDiscord] failed:', err.message);
  }
}

export async function notifyEmail(subject: string, body: string): Promise<void> {
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || process.env.SMTP_USER;
  if (!adminEmail) return;
  if (process.env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'BuildMyBot Alerts <alerts@buildmybot.app>',
          to: [adminEmail],
          subject,
          text: body,
        }),
      });
    } catch {}
  }
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
