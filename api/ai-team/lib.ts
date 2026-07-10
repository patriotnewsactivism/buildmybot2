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
    const [existingLeads, freshResearchedLeads] = await Promise.all([
      supabaseFetch('leads', 'order=created_at.desc&limit=25'),
      // Freshly-researched cold leads (from the Lead Researcher role) not yet
      // surfaced to sales — gives the sales roles real new targets to act on,
      // on top of the existing inbound-signup leads.
      supabaseFetch(
        'researched_leads',
        'status=eq.new&order=created_at.desc&limit=15'
      ),
    ]);
    businessData = { inbound_leads: existingLeads, new_researched_leads: freshResearchedLeads };

    // Mark whatever we just showed them as surfaced so the next shift (and
    // the next role) doesn't keep re-presenting the same stale batch.
    if (freshResearchedLeads?.length) {
      const ids = freshResearchedLeads.map((l: any) => l.id);
      await supabaseFetch(
        `researched_leads?id=in.(${ids.join(',')})`,
        '',
        { method: 'PATCH', body: JSON.stringify({ status: 'surfaced_to_sales', surfaced_to_sales_at: new Date().toISOString() }) }
      );
    }
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
  'Dallas TX', 'Houston TX', 'Austin TX', 'San Antonio TX', 'Phoenix AZ',
  'Atlanta GA', 'Charlotte NC', 'Nashville TN', 'Tampa FL', 'Orlando FL',
  'Denver CO', 'Las Vegas NV', 'Columbus OH', 'Indianapolis IN', 'Jacksonville FL',
  'Oklahoma City OK', 'Memphis TN', 'Louisville KY', 'Kansas City MO', 'Raleigh NC',
];

// Deterministic rotation so we work through many different (industry, city)
// combos over time instead of hammering the same query every run — driven off
// the current hour so different runs across the day naturally vary.
function pickIcpQuery(): { industry: string; city: string } {
  const hourSlot = Math.floor(Date.now() / (1000 * 60 * 60)); // changes every hour
  const industry = ICP_INDUSTRIES[hourSlot % ICP_INDUSTRIES.length];
  const city = TARGET_CITIES[Math.floor(hourSlot / ICP_INDUSTRIES.length) % TARGET_CITIES.length];
  return { industry, city };
}

interface TavilyResult { title: string; url: string; content: string }

async function webSearch(query: string, maxResults = 8): Promise<TavilyResult[]> {
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
    return (data.results || []).map((r: any) => ({ title: r.title, url: r.url, content: (r.content || '').slice(0, 500) }));
  } catch (err) {
    console.error('Tavily search error:', err);
    return [];
  }
}

export async function researchLeads() {
  const { industry, city } = pickIcpQuery();
  const query = `${industry} in ${city}`;

  if (!process.env.TAVILY_API_KEY) {
    await logShift({
      role_id: 'lead-researcher',
      role_name: 'Lead Researcher',
      summary: `No TAVILY_API_KEY configured yet — cannot search for real companies. Skipped this run rather than inventing fake leads.`,
      tasks_completed: 0,
      flags: 'TAVILY_API_KEY missing',
    });
    return { skipped: true, reason: 'no TAVILY_API_KEY' };
  }

  const results = await webSearch(query, 8);

  if (!results.length) {
    await logShift({
      role_id: 'lead-researcher',
      role_name: 'Lead Researcher',
      summary: `Searched "${query}" but got zero results. Nothing new to add this run.`,
      tasks_completed: 0,
    });
    return { found: 0, query };
  }

  // Check which of these we already have, so the LLM doesn't waste effort
  // re-qualifying companies already in the table.
  const existing = (await supabaseFetch('researched_leads', 'select=website')) || [];
  const knownDomains = new Set(existing.map((r: any) => new URL(r.website).hostname.replace(/^www\./, '')));

  const newResults = results.filter((r) => {
    try {
      return !knownDomains.has(new URL(r.url).hostname.replace(/^www\./, ''));
    } catch {
      return false;
    }
  });

  if (!newResults.length) {
    await logShift({
      role_id: 'lead-researcher',
      role_name: 'Lead Researcher',
      summary: `Searched "${query}" — all ${results.length} results were companies we already have on file. No new leads this run.`,
      tasks_completed: 0,
    });
    return { found: 0, query, duplicates: results.length };
  }

  const systemPrompt = `You are BuildMyBot's Lead Researcher. BuildMyBot sells a white-label AI chatbot/voice-agent platform that fixes "speed to lead" for local service businesses. ICP: Home Services (HVAC/Roofing/Plumbing/Solar), Legal (Personal Injury/DUI/Family Law), Medical/Esthetics (MedSpa/Plastic Surgery/Dental Implants), Real Estate brokerages. AVOID: restaurants, generic retail, large corporations.

CRITICAL RULE: You may ONLY reference real businesses that appear in the search results provided below. NEVER invent a company name, website, or detail that isn't directly supported by a provided result. If a result is a directory/listicle page rather than an actual business, skip it. If NONE of the results are real qualifying businesses, return an empty JSON array.`;

  const userPrompt = `Search query used: "${query}"\n\nReal search results:\n${JSON.stringify(newResults, null, 2)}\n\nFrom these results ONLY, identify real, distinct businesses that are genuine BuildMyBot outbound sales targets. Return ONLY a JSON array (no markdown, no commentary), each item shaped exactly like:\n{"company_name": "...", "website": "<the exact url from the results>", "industry": "${industry}", "city": "${city}", "why_good_fit": "1-2 sentences tied to a real ICP pain point (missed calls, slow response, after-hours gaps)", "suggested_angle": "which opener from the field ops manual to use, e.g. Ghost Shopper Audit or the 5-Minute Rule"}\n\nIf nothing qualifies, return: []`;

  const raw = await callLLM(systemPrompt, userPrompt);

  let candidates: any[] = [];
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    candidates = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch (err) {
    console.error('Lead Researcher: failed to parse LLM JSON output:', raw);
  }

  // Belt-and-suspenders: only keep candidates whose website URL actually
  // matches one of the real search results we provided — never trust the
  // LLM's URL in isolation.
  const validUrls = new Set(newResults.map((r) => r.url));
  const safeCandidates = candidates.filter((c) => c.website && validUrls.has(c.website));

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
        status: 'new',
      }),
    });
    if (row) inserted++;
  }

  const summary = inserted
    ? `Researched "${query}": found ${inserted} new real ${industry} lead(s) in ${city} matching ICP, added to researched_leads for sales to pick up. (${results.length - newResults.length} of ${results.length} search results were already-known companies.)`
    : `Researched "${query}" (${results.length} results) but none were qualifying real businesses matching ICP this run.`;

  await logShift({
    role_id: 'lead-researcher',
    role_name: 'Lead Researcher',
    summary,
    tasks_completed: inserted,
  });

  return { found: inserted, query, candidates: safeCandidates.length };
}
