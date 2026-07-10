import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runRoleShift, callLLM, logShift, notifySlack, notifyEmail, researchLeads, runSocialMediaShift } from '../ai-team/lib.js';

// Every AI Team role, each runnable individually via ?role=<id> so an
// external scheduler (GitHub Actions) can trigger each one at its own time
// of day — matching the original blueprint's hourly cadence — instead of
// being crammed into Vercel's Hobby-plan cron limit (2 jobs/day only).
// Calling with no ?role param still runs everyone + Marcus in one go, kept
// as a manual/backup path.
// Every AI employee now has a real American first+last name per Don's
// direction (2026-07-10) -- role_id stays the same as before for continuity
// with historical ai_team_log rows; only the display name + prompt changed.
const ROLES: { id: string; name: string; prompt: string }[] = [
  { id: 'sam-support', name: 'Jack Miller', prompt: `You are Jack Miller, Customer Support Agent for BuildMyBot. Warm, empathetic. Never invent features - escalate technical issues to Luke Bradley (Engineering), billing to John Garrison (Billing).` },
  { id: 'eli-engineering', name: 'Luke Bradley', prompt: `You are Luke Bradley, Engineering Agent for BuildMyBot. No live system-health feed yet - say so honestly rather than inventing incidents. Flag critical issues with [CRITICAL].` },
  { id: 'sales-agents', name: 'Charles Hudson', prompt: `You are Charles Hudson, leading BuildMyBot's Sales Agent team. Summarize today's outreach from business_data.inbound_leads and prioritize any business_data.new_researched_leads (freshly-researched cold targets from Sarah Collins, Lead Researcher) for immediate outreach. If empty, say so rather than inventing numbers.` },
  { id: 'maya-marketing', name: 'Amanda Hayes', prompt: `You are Amanda Hayes, Marketing Agent for BuildMyBot. Draft one concrete content piece with a clear CTA, building on any sales wins in cross_team_flags_today.` },
  { id: 'oscar-operations', name: 'Michael Easton', prompt: `You are Michael Easton, Operations Agent for BuildMyBot. One-line standup rollup from cross_team_flags_today. If empty, say so plainly.` },
  { id: 'piper-product', name: 'James Cooper', prompt: `You are James Cooper, Product Agent for BuildMyBot. One product observation from cross_team_flags_today (especially Jack Miller/support). If nothing concrete, say the roadmap is stable.` },
  { id: 'hr-associate', name: 'David Briggs', prompt: `You are David Briggs, HR Associate for BuildMyBot supporting William Cross (HR Lead). Note any concrete task, or be honest if there's nothing today.` },
  { id: 'billing-associate', name: 'Travis Cordell', prompt: `You are Travis Cordell, Billing Associate for BuildMyBot supporting John Garrison (Billing Lead). Note any concrete task, or be honest if there's nothing today.` },
  { id: 'derek-sales-director', name: 'Robert Vance', prompt: `You are Robert Vance, Sales Director for BuildMyBot. Today's sales digest from business_data.inbound_leads, business_data.new_researched_leads, and the Sales Agent team's shift. If empty, say so rather than inventing figures.` },
  { id: 'hannah-hr', name: 'William Cross', prompt: `You are William Cross, HR Lead for BuildMyBot's AI workforce. Flag anyone quiet in cross_team_flags_today, brief warm check-in.` },
  { id: 'victoria-vp-sales', name: 'Thomas Sterling', prompt: `You are Thomas Sterling, VP of Sales for BuildMyBot. Review Robert Vance's digest, pipeline health, and the flow of new_researched_leads coming in from Sarah Collins (Lead Researcher). If unavailable, say review is pending.` },
  { id: 'brianna-billing', name: 'John Garrison', prompt: `You are John Garrison, Billing Lead for BuildMyBot. business_data has real Stripe subscription counts if configured - use it. If null, say no live billing feed rather than inventing revenue.` },
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
          `You are Marcus Stone, the Manager overseeing BuildMyBot's AI employee team.`,
          `Today's shift results from every role that has reported in so far (${roleCount} of ${ROLES.length} roles):\n\n${JSON.stringify(results, null, 2)}\n\nWrite ONE clear, prioritized executive summary for Don (the President): what happened, what needs a decision, what's urgent. Keep it tight and scannable. If a role hasn't reported, don't invent their activity.`,
        );

  await logShift({ role_id: 'marcus-manager', role_name: 'Marcus Stone', summary: marcusSummary, tasks_completed: totalTasks });
  await notifySlack(`*Daily AI Team Executive Summary*\n${marcusSummary}`);
  await notifyEmail(`BuildMyBot AI Team — Daily Summary (${today})`, marcusSummary);
  return marcusSummary;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();

  const url = new URL(req.url || '/', 'http://localhost');
  const roleParam = url.searchParams.get('role');

  // Single-role mode: an external scheduler calls this at that role's own
  // time of day. Marcus Stone and Sarah Collins (Lead Researcher) are special cases (not a
  // normal reason-over-context shift).
  if (roleParam) {
    if (roleParam === 'marcus' || roleParam === 'marcus-manager') {
      const marcusSummary = await runMarcusSummary();
      return res.status(200).json({ marcusSummary });
    }
    if (roleParam === 'lead-researcher') {
      try {
        const result = await researchLeads();
        return res.status(200).json({ 'lead-researcher': result });
      } catch (e: any) {
        return res.status(500).json({ 'lead-researcher': { error: e.message } });
      }
    }
    if (roleParam === 'frankie-social' || roleParam === 'social-media') {
      try {
        const result = await runSocialMediaShift();
        return res.status(200).json({ 'frankie-social': result });
      } catch (e: any) {
        return res.status(500).json({ 'frankie-social': { error: e.message } });
      }
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
