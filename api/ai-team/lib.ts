// Shared library for the AI Team automation, running natively on Vercel + Supabase.
// No Base44 dependency, no per-message credit ceiling — just usage-based LLM billing.
//
// LLM PROVIDER: tries a chain of FREE providers first (whichever have API keys
// configured), only falling back to paid OpenAI as a last resort. Order:
// AI_TEAM_LLM_PROVIDER (your preferred default) -> gemini -> groq -> cerebras
// -> openrouter -> openai. Swap the preferred default anytime via the
// AI_TEAM_LLM_PROVIDER env var — no code changes needed. Add a provider's key
// (GEMINI_API_KEY / GROQ_API_KEY / CEREBRAS_API_KEY / OPENROUTER_API_KEY) and
// it automatically joins the fallback chain.

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Provider = 'groq' | 'gemini' | 'cerebras' | 'openrouter' | 'openai';

const PROVIDER_CONFIG: Record<Provider, { baseURL: string; model: string; keyEnv: string }> = {
  // Google's free tier (no card) via their OpenAI-compatible endpoint. Most
  // accessible free baseline as of mid-2026.
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.5-flash',
    keyEnv: 'GEMINI_API_KEY',
  },
  // Free tier, no card, LPU inference — among the fastest available. Great
  // for short internal-reasoning shifts like these.
  groq: {
    baseURL: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    keyEnv: 'GROQ_API_KEY',
  },
  // Free tier, no card, 1M tokens/day — the most generous free daily volume
  // of any provider as of mid-2026. Good backstop when others rate-limit.
  cerebras: {
    baseURL: 'https://api.cerebras.ai/v1/chat/completions',
    model: 'llama-3.3-70b',
    keyEnv: 'CEREBRAS_API_KEY',
  },
  // Aggregator with several genuinely free models (Llama, DeepSeek, Qwen, etc).
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.1-8b-instruct:free',
    keyEnv: 'OPENROUTER_API_KEY',
  },
  // Paid last resort / use for anything customer-facing where quality matters most.
  openai: {
    baseURL: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    keyEnv: 'OPENAI_API_KEY',
  },
};

const FALLBACK_ORDER: Provider[] = ['gemini', 'groq', 'cerebras', 'openrouter', 'openai'];

export async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const preferred = (process.env.AI_TEAM_LLM_PROVIDER as Provider) || 'groq';
  const order = [preferred, ...FALLBACK_ORDER.filter((p) => p !== preferred)];

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

  throw new Error(
    errors.length
      ? `All configured LLM providers failed: ${errors.join(' | ')}`
      : `No LLM provider configured — set at least one of: ${FALLBACK_ORDER.map((p) => PROVIDER_CONFIG[p].keyEnv).join(', ')}`,
  );
}

async function callWithConfig(
  cfg: { baseURL: string; model: string },
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const res = await fetch(cfg.baseURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function supabaseFetch(table: string, params: string, init?: RequestInit) {
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
    console.error(`Supabase ${table} fetch failed:`, res.status, await res.text());
    return null;
  }
  return res.json();
}

export interface RoleContext {
  role_id: string;
  today: string;
  recent_own_shifts: any[];
  cross_team_flags_today: any[];
  business_data: any;
}

export async function getRoleContext(roleId: string): Promise<RoleContext> {
  const today = new Date().toISOString().slice(0, 10);

  const ownHistory =
    (await supabaseFetch(
      'ai_team_log',
      `role_id=eq.${roleId}&order=created_at.desc&limit=5`
    )) || [];

  const todayLogs =
    (await supabaseFetch('ai_team_log', `shift_date=eq.${today}`)) || [];

  const crossTeamFlags = todayLogs
    .filter((l: any) => l.role_id !== roleId && l.flags)
    .map((l: any) => ({ role_name: l.role_name, flags: l.flags }));

  let businessData: any = null;
  if (roleId === 'sam-support') {
    businessData = await supabaseFetch(
      'email_messages',
      'direction=eq.inbound&order=created_at.desc&limit=20'
    );
  } else if (
    ['derek-sales-director', 'victoria-vp-sales', 'sales-agents'].includes(roleId)
  ) {
    businessData = await supabaseFetch('leads', 'order=created_at.desc&limit=25');
  } else if (roleId === 'brianna-billing') {
    businessData = await getStripeSummary();
  }

  return {
    role_id: roleId,
    today,
    recent_own_shifts: ownHistory,
    cross_team_flags_today: crossTeamFlags,
    business_data: businessData,
  };
}

async function getStripeSummary() {
  const key = process.env.BUILDMYBOT_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.stripe.com/v1/subscriptions?limit=20&status=all', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const active = data.data.filter((s: any) => s.status === 'active').length;
    const pastDue = data.data.filter((s: any) => s.status === 'past_due').length;
    const canceled = data.data.filter((s: any) => s.status === 'canceled').length;
    return { active, past_due: pastDue, canceled, sample_size: data.data.length };
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

export async function notifySlack(text: string) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

// Runs one role's full shift: gather context -> reason -> log -> (optionally notify).
export async function runRoleShift(
  roleId: string,
  roleName: string,
  systemPrompt: string,
  opts?: { notify?: boolean }
) {
  const context = await getRoleContext(roleId);

  const userPrompt = `Today's context:\n${JSON.stringify(context, null, 2)}\n\nDo your shift's work based on this context. Be honest if data is missing rather than inventing activity. Respond in this exact format:\nSUMMARY: <what you did/found>\nTASKS_COMPLETED: <number>\nFLAGS: <anything urgent, or leave blank>\nESCALATED_TO: <role_id if escalating, or leave blank>`;

  const raw = await callLLM(systemPrompt, userPrompt);

  const summary = raw.match(/SUMMARY:\s*([\s\S]*?)(?:\nTASKS_COMPLETED:|$)/i)?.[1]?.trim() || raw;
  const tasks = parseInt(raw.match(/TASKS_COMPLETED:\s*(\d+)/i)?.[1] || '0', 10);
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

  if (opts?.notify) {
    await notifySlack(`*${roleName}* shift complete:\n${summary}${flags ? `\n:warning: ${flags}` : ''}`);
  }

  return { summary, tasks, flags, escalatedTo };
}

export async function notifyEmail(subject: string, bodyText: string) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.AI_TEAM_REPORT_EMAIL || 'don@buildmybot.app';
  if (!key) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'AI Team <reports@buildmybot.app>',
      to: [to],
      subject,
      text: bodyText,
    }),
  });
}
