import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  callLLM,
  logShift,
  notifyDiscord,
  notifyEmail,
  notifySlack,
  researchLeads,
  runRoleShift,
  runSocialMediaShift,
} from '../ai-team/lib.js';

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
  {
    id: 'sam-support',
    name: 'Jack Miller',
    prompt:
      'You are Jack Miller, Customer Support Agent for BuildMyBot. Warm, empathetic. Never invent features - escalate technical issues to Luke Bradley (Engineering), billing to John Garrison (Billing).',
  },
  {
    id: 'eli-engineering',
    name: 'Luke Bradley',
    prompt:
      'You are Luke Bradley, Engineering Agent for BuildMyBot. business_data has REAL system health: Vercel deployment statuses, recent error/warning audit logs, and function errors. Report on actual deploy state and any errors you see. If a deploy failed or errors are spiking, flag with [CRITICAL]. Never invent incidents not present in the data.',
  },
  {
    id: 'maya-marketing',
    name: 'Amanda Hayes',
    prompt:
      'You are Amanda Hayes, Marketing Agent for BuildMyBot. Draft one concrete content piece with a clear CTA, building on any sales wins in cross_team_flags_today.',
  },
  {
    id: 'oscar-operations',
    name: 'Michael Easton',
    prompt:
      'You are Michael Easton, Operations Agent for BuildMyBot. One-line standup rollup from cross_team_flags_today. If empty, say so plainly.',
  },
  {
    id: 'piper-product',
    name: 'James Cooper',
    prompt:
      'You are James Cooper, Product Agent for BuildMyBot. One product observation from cross_team_flags_today (especially Jack Miller/support). If nothing concrete, say the roadmap is stable.',
  },
  {
    id: 'hr-associate',
    name: 'David Briggs',
    prompt: `You are David Briggs, HR Associate for BuildMyBot supporting William Cross (HR Lead). Note any concrete task, or be honest if there's nothing today.`,
  },
  {
    id: 'billing-associate',
    name: 'Travis Cordell',
    prompt: `You are Travis Cordell, Billing Associate for BuildMyBot supporting John Garrison (Billing Lead). Note any concrete task, or be honest if there's nothing today.`,
  },
  {
    id: 'derek-sales-director',
    name: 'Robert Vance',
    prompt: `You are Robert Vance, Sales Director for BuildMyBot. Pre-launch: the 5 Sales Agents are in research mode (building the lead database, not yet calling). Today's digest from business_data.inbound_leads and business_data.new_researched_leads (fresh cold targets found by the research team). If empty, say so rather than inventing figures.`,
  },
  {
    id: 'hannah-hr',
    name: 'William Cross',
    prompt: `You are William Cross, HR Lead for BuildMyBot's AI workforce. Flag anyone quiet in cross_team_flags_today, brief warm check-in.`,
  },
  {
    id: 'victoria-vp-sales',
    name: 'Thomas Sterling',
    prompt: `You are Thomas Sterling, VP of Sales for BuildMyBot. Review Robert Vance's digest, pipeline health, and the flow of new_researched_leads coming in from Sarah Collins (Lead Researcher). If unavailable, say review is pending.`,
  },
  {
    id: 'brianna-billing',
    name: 'John Garrison',
    prompt:
      'You are John Garrison, Billing Lead for BuildMyBot. business_data has real Stripe subscription counts if configured - use it. If null, say no live billing feed rather than inventing revenue.',
  },
];

// The 5 Sales Agents, pre-launch (2026-07-10 onward): Don wants them building
// the biggest possible lead database until BuildMyBot actually launches and
// they start making real sales calls. Each has a fixed `offset` into the ICP
// rotation (api/ai-team/lib.ts pickIcpQuery) so all 5 -- plus Sarah Collins,
// the primary Lead Researcher -- cover DIFFERENT industry/city combos in the
// same pass instead of duplicating each other's search.
//
// Flip SALES_AGENTS_MODE=outreach (Vercel env var) once real sales calls
// start -- no redeploy needed -- and they'll switch to normal reasoning
// shifts over business_data.new_researched_leads instead of researching.
const SALES_AGENT_RESEARCHERS: { id: string; name: string; offset: number }[] =
  [
    { id: 'sales-agent-1', name: 'Charles Hudson', offset: 37 },
    { id: 'sales-agent-2', name: 'Brian Walsh', offset: 74 },
    { id: 'sales-agent-3', name: 'Kevin Prescott', offset: 111 },
    { id: 'sales-agent-4', name: 'Nathan Doyle', offset: 148 },
    { id: 'sales-agent-5', name: 'Ryan Fletcher', offset: 185 },
  ];

function salesAgentsInResearchMode() {
  return (process.env.SALES_AGENTS_MODE || 'research') !== 'outreach';
}

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
  const totalTasks = Object.values(results).reduce(
    (s: number, r: any) => s + (r.tasks || 0),
    0,
  );

  // Echo back whatever briefing Don gave the team today, so his exec email
  // confirms it was actually received and acted on.
  const SUPABASE_URL2 = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY2 = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const briefResp = await fetch(
    `${SUPABASE_URL2}/rest/v1/manager_briefings?briefing_date=eq.${today}&order=created_at.desc&limit=1`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY2,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY2}`,
      },
    },
  );
  const briefRows = briefResp.ok ? await briefResp.json() : [];
  const briefingToday = briefRows[0]?.content as string | undefined;
  const briefingContext = briefingToday
    ? `\n\nDon's briefing to the team today: "${briefingToday}"`
    : '';

  // ── Hard numbers for the conference call — pulled from real tables, never
  // from the LLM. Marcus narrates them; he doesn't get to make them up.
  const sbCount = async (table: string, filter: string): Promise<number> => {
    const resp = await fetch(
      `${SUPABASE_URL2}/rest/v1/${table}?select=id&${filter}&limit=1000`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY2,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY2}`,
        },
      },
    );
    const rows = resp.ok ? await resp.json() : [];
    return Array.isArray(rows) ? rows.length : 0;
  };
  const dayStart = `${today}T00:00:00Z`;
  const [leadsNew, followUpsSent, repliesIn, openErrors, mailUnread] =
    await Promise.all([
      sbCount('leads', `created_at=gte.${dayStart}`),
      sbCount('leads', `follow_up_sent_at=gte.${dayStart}`),
      sbCount('leads', `replied_at=gte.${dayStart}`),
      sbCount('error_logs', 'status=eq.open'),
      sbCount('agent_messages', 'status=eq.sent'),
    ]);
  const numbers = {
    date: today,
    roles_reported: roleCount,
    roles_total: ROLES.length,
    tasks_completed_total: totalTasks,
    leads_created_today: leadsNew,
    follow_ups_sent_today: followUpsSent,
    lead_replies_today: repliesIn,
    open_errors: openErrors,
    unread_internal_mail: mailUnread,
  };

  const marcusSummary =
    roleCount === 0
      ? `No shifts logged yet today (${today}) — nothing to report.${briefingContext}\n\nNumbers: ${JSON.stringify(numbers)}`
      : await callLLM(
          `You are Marcus Stone, Manager of BuildMyBot's AI employee team, chairing the DAILY COMPANY CONFERENCE CALL. Don (the President) reads these minutes every day to run the business.`,
          `Today's shift reports (${roleCount} of ${ROLES.length} roles):\n\n${JSON.stringify(results, null, 2)}\n\nHARD NUMBERS (from the database — use these verbatim, never invent or adjust them):\n${JSON.stringify(numbers, null, 2)}${briefingContext}\n\nProduce the conference call minutes in exactly this structure:\nATTENDANCE: which roles reported, which are missing\nNUMBERS: today's metrics with one-line commentary on each trend\nWINS: what actually got done (only from reports above)\nRISKS & BLOCKERS: what's stuck, errors open, escalations pending\nDECISIONS NEEDED FROM DON: numbered, each with a recommendation\nTOMORROW'S PLAN: one concrete priority per department\n\nIf a role hasn't reported, list it as absent — never invent its activity.`,
        );

  await logShift({
    role_id: 'marcus-manager',
    role_name: 'Marcus Stone',
    summary: marcusSummary,
    tasks_completed: totalTasks,
    flags: openErrors > 0 ? `${openErrors} open error(s)` : '',
  });

  // Tomorrow's plan becomes tomorrow's standing briefing so the whole team
  // wakes up already steered. If Don posts his own briefing in the morning
  // it's newer and wins (getRoleContext takes latest by created_at).
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const planMatch = marcusSummary.match(/TOMORROW'S PLAN:([\s\S]*)$/i);
  if (planMatch?.[1]?.trim()) {
    await fetch(`${SUPABASE_URL2}/rest/v1/manager_briefings`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY2,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY2}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        briefing_date: tomorrow,
        content: `Plan agreed on yesterday's conference call (Don's own briefing overrides this if given):\n${planMatch[1].trim().slice(0, 3000)}`,
        delivered_via: 'daily-conference',
      }),
    });
  }

  await notifySlack(`*📞 Daily Conference Call — ${today}*\n${marcusSummary}`);
  await notifyDiscord(
    `📞 **Daily Conference Call (${today})**\n${marcusSummary}`,
  );
  await notifyEmail(
    `BuildMyBot Daily Conference Call — ${today}`,
    marcusSummary,
  );
  return marcusSummary;
}

export async function allShiftsHandler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).end();

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
        return res
          .status(500)
          .json({ 'lead-researcher': { error: e.message } });
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
    const salesAgent = SALES_AGENT_RESEARCHERS.find((a) => a.id === roleParam);
    if (salesAgent) {
      if (salesAgentsInResearchMode()) {
        try {
          const result = await researchLeads({
            roleId: salesAgent.id,
            roleName: salesAgent.name,
            offset: salesAgent.offset,
          });
          return res.status(200).json({ [salesAgent.id]: result });
        } catch (e: any) {
          return res
            .status(500)
            .json({ [salesAgent.id]: { error: e.message } });
        }
      }
      // Post-launch (SALES_AGENTS_MODE=outreach): normal reasoning shift over real leads.
      try {
        const result = await runRoleShift(
          salesAgent.id,
          salesAgent.name,
          `You are ${salesAgent.name}, a Sales Agent for BuildMyBot. Review business_data.inbound_leads and business_data.new_researched_leads and report your outreach activity. If empty, say so rather than inventing numbers.`,
        );
        return res.status(200).json({ [salesAgent.id]: result });
      } catch (e: any) {
        return res.status(500).json({ [salesAgent.id]: { error: e.message } });
      }
    }
    const role = ROLES.find((r) => r.id === roleParam);
    if (!role)
      return res.status(400).json({ error: `Unknown role '${roleParam}'` });
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
