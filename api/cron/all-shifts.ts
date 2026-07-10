import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runRoleShift, callLLM, logShift, notifySlack, notifyEmail } from '../ai-team/lib.js';

// Every AI Team role, each runnable individually via ?role=<id> so an
// external scheduler (GitHub Actions) can trigger each one at its own time
// of day — matching the original blueprint's hourly cadence — instead of
// being crammed into Vercel's Hobby-plan cron limit (2 jobs/day only).
// Calling with no ?role param still runs everyone + Marcus in one go, kept
// as a manual/backup path.
const ROLES: { id: string; name: string; prompt: string }[] = [
  { id: 'sam-support', name: 'Sam', prompt: `You are Sam, Customer Support Agent for BuildMyBot. Warm, empathetic. Never invent features - escalate technical issues to eli-engineering, billing to brianna-billing.` },
  { id: 'eli-engineering', name: 'Eli', prompt: `You are Eli, Engineering Agent for BuildMyBot. No live system-health feed yet - say so honestly rather than inventing incidents. Flag critical issues with [CRITICAL].` },
  { id: 'sales-agents', name: 'Sales Agents', prompt: `You represent BuildMyBot's 5 Sales Agents. Summarize today's outreach from business_data (leads). If empty, say so rather than inventing numbers.` },
  { id: 'maya-marketing', name: 'Maya', prompt: `You are Maya, Marketing Agent for BuildMyBot. Draft one concrete content piece with a clear CTA, building on any sales wins in cross_team_flags_today.` },
  { id: 'oscar-operations', name: 'Oscar', prompt: `You are Oscar, Operations Agent for BuildMyBot. One-line standup rollup from cross_team_flags_today. If empty, say so plainly.` },
  { id: 'piper-product', name: 'Piper', prompt: `You are Piper, Product Agent for BuildMyBot. One product observation from cross_team_flags_today (especially Sam/support). If nothing concrete, say the roadmap is stable.` },
  { id: 'hr-associate', name: 'HR Associate', prompt: `You are an HR Associate for BuildMyBot supporting Hannah. Note any concrete task, or be honest if there's nothing today.` },
  { id: 'billing-associate', name: 'Billing Associate', prompt: `You are a Billing Associate for BuildMyBot supporting Brianna. Note any concrete task, or be honest if there's nothing today.` },
  { id: 'derek-sales-director', name: 'Derek', prompt: `You are Derek, Sales Director for BuildMyBot. Today's sales digest from business_data (leads) and the Sales Agents' shift. If empty, say so rather than inventing figures.` },
  { id: 'hannah-hr', name: 'Hannah', prompt: `You are Hannah, HR Lead for BuildMyBot's AI workforce. Flag anyone quiet in cross_team_flags_today, brief warm check-in.` },
  { id: 'victoria-vp-sales', name: 'Victoria', prompt: `You are Victoria, VP of Sales for BuildMyBot. Review Derek's digest and pipeline health. If unavailable, say review is pending.` },
  { id: 'brianna-billing', name: 'Brianna', prompt: `You are Brianna, Billing Lead for BuildMyBot. business_data has real Stripe subscription counts if configured - use it. If null, say no live billing feed rather than inventing revenue.` },
];

async function runMarcusSummary(precomputedResults?: Record<string, any>) {
  const today = new Date().toISOString().slice(0, 10);
  let results = precomputedResults;

  if (!results) {
    // Marcus is running standalone (GitHub Actions calls him last, after
    // every other role already ran earlier today) — pull today's real
    // shift log from Supabase instead of re-running everyone.
    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_team_log?shift_date=eq.${today}&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    const rows = resp.ok ? await resp.json() : [];
    results = {};
    for (const row of rows) {
      if (!results[row.role_id]) {
        results[row.role_id] = {
          summary: row.summary,
          tasks: row.tasks_completed,
          flags: row.flags,
        };
      }
    }
  }

  const roleCount = Object.keys(results).length;
  const totalTasks = Object.values(results).reduce((s: number, r: any) => s + (r.tasks || 0), 0);

  const marcusSummary =
    roleCount === 0
      ? `No shifts logged yet today (${today}) — nothing to report.`
      : await callLLM(
          `You are Marcus, the Manager overseeing BuildMyBot's AI employee team.`,
          `Today's shift results from every role that has reported in so far (${roleCount} of ${ROLES.length} roles):\n\n${JSON.stringify(results, null, 2)}\n\nWrite ONE clear, prioritized executive summary for Don (the President): what happened, what needs a decision, what's urgent. Keep it tight and scannable. If a role hasn't reported, don't invent their activity.`,
        );

  await logShift({ role_id: 'marcus-manager', role_name: 'Marcus', summary: marcusSummary, tasks_completed: totalTasks });
  await notifySlack(`*Daily AI Team Executive Summary*\n${marcusSummary}`);
  await notifyEmail(`BuildMyBot AI Team — Daily Summary (${today})`, marcusSummary);
  return marcusSummary;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();

  const url = new URL(req.url || '/', 'http://localhost');
  const roleParam = url.searchParams.get('role');

  // Single-role mode: an external scheduler calls this at that role's own
  // time of day. Marcus is a special case (rolls up everyone else instead
  // of running his own shift).
  if (roleParam) {
    if (roleParam === 'marcus' || roleParam === 'marcus-manager') {
      const marcusSummary = await runMarcusSummary();
      return res.status(200).json({ marcusSummary });
    }
    const role = ROLES.find((r) => r.id === roleParam);
    if (!role) return res.status(400).json({ error: `Unknown role '${roleParam}'` });
    try {
      const result = await runRoleShift(role.id, role.name, role.prompt);
      return res.status(200).json({ [role.id]: result });
    } catch (e: any) {
      return res.status(500).json({ [role.id]: { error: e.message } });
    }
  }

  // No role param: manual/backup mode — run everyone + Marcus in one call.
  const results: Record<string, any> = {};
  for (const role of ROLES) {
    try {
      results[role.id] = await runRoleShift(role.id, role.name, role.prompt);
    } catch (e: any) {
      results[role.id] = { error: e.message };
    }
  }
  const marcusSummary = await runMarcusSummary(results);
  res.status(200).json({ results, marcusSummary });
}
