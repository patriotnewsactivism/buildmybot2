import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  aiTeamKilled,
  callLLM,
  logAgentError,
  messageAgent,
  notifyDiscord,
  notifySlack,
  rememberMemory,
  salesAutomationDryRun,
  supabaseFetch,
} from '../ai-team/lib.js';

// Around-the-clock pulse worker — runs every 10 minutes (vercel.json cron).
//
// Design principle: PERSISTENT but CHEAP. An idle pulse is a handful of
// Supabase reads and zero LLM calls; tokens are only spent when there is
// actual work. What each pulse does:
//
//   1. Overdue leads → if any lead has gone 48h+ with no follow-up, invoke
//      the lead-followups worker. The pulse is the single scheduler for this
//      work, avoiding a race with a second fixed cron.
//   2. Internal mail → unread agent_messages get answered by their recipient
//      role (tight, budgeted LLM call), so inter-agent questions resolve in
//      minutes, not next-shift. Anti-loop guard: replies (subject "Re:") are
//      never auto-replied to, capping every thread at one round trip.
//   3. Sales outreach → if researched leads are waiting (status new/
//      surfaced_to_sales), invoke the sales-outreach worker immediately.
//   4. Stale critical errors → open criticals older than 2h that nobody
//      resolved get ONE Discord+Slack reminder (deduped via context flag).
//   5. Escalation SLA → open escalations / president-required agent_messages
//      older than ESCALATION_SLA_HOURS (default 4h) get ONE reminder each,
//      same dedup pattern as step 4 — an escalation nobody reads must not
//      sit forever just because the first alert was missed.
//
// A pulse only writes an ai_team_log row when it actually did something —
// 144 no-op rows a day would drown the log Marcus reads.

export const maxDuration = 300;

const ROLE_NAMES: Record<string, string> = {
  'sam-support': 'Jack Miller',
  'eli-engineering': 'Luke Bradley',
  'maya-marketing': 'Amanda Hayes',
  'oscar-operations': 'Michael Easton',
  'piper-product': 'James Cooper',
  'hr-associate': 'David Briggs',
  'billing-associate': 'Travis Cordell',
  'derek-sales-director': 'Robert Vance',
  'hannah-hr': 'William Cross',
  'victoria-vp-sales': 'Thomas Sterling',
  'brianna-billing': 'John Garrison',
  'marcus-manager': 'Marcus Stone',
  'lead-researcher': 'Sarah Collins',
};

export async function pulseHandler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).end();

  if (aiTeamKilled()) {
    return res.status(200).json({ success: true, killed: true });
  }

  const startedAt = Date.now();
  const deadlineAt = startedAt + 240_000; // leave headroom under maxDuration
  const actions: string[] = [];
  // A safety pause must be token-free. Explicit previews remain available on
  // the individual outbound workers with ?preview=1.
  const outboundEnabled = !salesAutomationDryRun();

  // ── 1. Overdue leads → dispatch the follow-up worker now ─────────────────
  if (outboundEnabled) {
    try {
      const cutoff = new Date(Date.now() - 48 * 3600_000).toISOString();
      const overdue =
        (await supabaseFetch(
          'leads',
          `select=id&replied_at=is.null&follow_up_sent_at=is.null&created_at=lt.${cutoff}&limit=1`,
        )) || [];
      if (overdue.length > 0) {
        const base = process.env.APP_BASE_URL || 'https://www.buildmybot.app';
        const resp = await fetch(`${base}/api/cron/lead-followups`, {
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        });
        const body = await resp.json().catch(() => ({}));
        actions.push(
          `dispatched lead-followups (sent=${body.sent ?? '?'}, escalated=${body.escalated ?? '?'})`,
        );
      }
    } catch (err: any) {
      await logAgentError({
        source: 'cron/pulse/lead-dispatch',
        message: `Overdue-lead dispatch failed: ${err.message}`,
      });
    }
  }

  // ── 2. Internal mail — recipients answer their unread messages ───────────
  try {
    const unread =
      (await supabaseFetch(
        'agent_messages',
        'status=eq.sent&order=created_at.asc&limit=5&select=id,from_employee,to_employee,subject,body,thread_id',
      )) || [];

    for (const msg of unread) {
      if (Date.now() > deadlineAt) break;
      // Never LLM-answer mail addressed to the human, and never answer a
      // reply — that's how two agents end up billing you for a conversation
      // with each other at 3 a.m.
      const isReply = /^re:/i.test(msg.subject || '');
      const toHuman = /president|don/i.test(msg.to_employee || '');
      if (isReply || toHuman) {
        if (isReply) {
          await supabaseFetch('agent_messages', `id=eq.${msg.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'read' }),
          });
        }
        continue;
      }

      const recipientName = ROLE_NAMES[msg.to_employee] || msg.to_employee;
      const senderName = ROLE_NAMES[msg.from_employee] || msg.from_employee;
      const reply = await callLLM(
        `You are ${recipientName}, ${msg.to_employee} on BuildMyBot's AI team. A teammate emailed you. Answer concretely and briefly (under 150 words). If you cannot actually resolve it, say exactly what you need or who should handle it. Never invent completed work.`,
        `From: ${senderName} (${msg.from_employee})\nSubject: ${msg.subject}\n\n${msg.body}`,
      );

      await messageAgent({
        fromRoleId: msg.to_employee,
        fromRoleName: recipientName,
        toRoleId: msg.from_employee,
        subject: `Re: ${msg.subject || 'your message'}`,
        body: reply,
        threadId: msg.thread_id || msg.id,
      });
      await supabaseFetch('agent_messages', `id=eq.${msg.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'read' }),
      });
      await rememberMemory({
        roleId: msg.to_employee,
        subjectType: 'system',
        content: `Answered internal mail from ${senderName} re "${msg.subject}": ${reply.slice(0, 300)}`,
        metadata: { thread_id: msg.thread_id || msg.id },
      });
      actions.push(`answered mail ${msg.from_employee} → ${msg.to_employee}`);
    }
  } catch (err: any) {
    await logAgentError({
      source: 'cron/pulse/internal-mail',
      message: `Internal mail processing failed: ${err.message}`,
    });
  }

  // ── 3. Sales outreach — dispatch if researched leads are waiting ──────
  if (outboundEnabled) {
    try {
      const waitingLeads =
        (await supabaseFetch(
          'researched_leads',
          'select=id&status=in.(new,surfaced_to_sales)&limit=1',
        )) || [];
      if (waitingLeads.length > 0) {
        const base = process.env.APP_BASE_URL || 'https://www.buildmybot.app';
        const resp = await fetch(`${base}/api/cron/sales-outreach`, {
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        });
        const body = await resp.json().catch(() => ({}));
        actions.push(
          `dispatched sales-outreach (emails=${body.emails_sent ?? '?'}, calls=${body.calls_initiated ?? '?'})`,
        );
      }
    } catch (err: any) {
      await logAgentError({
        source: 'cron/pulse/sales-outreach',
        message: `Sales outreach dispatch failed: ${err.message}`,
      });
    }
  }

  // ── 4. Stale critical errors — one loud reminder each ────────────────────
  try {
    const staleCutoff = new Date(Date.now() - 2 * 3600_000).toISOString();
    const stale =
      (await supabaseFetch(
        'error_logs',
        `status=eq.open&level=eq.critical&created_at=lt.${staleCutoff}&select=id,source,message,context,created_at&limit=10`,
      )) || [];
    for (const e of stale) {
      if (e.context?.pulse_reminded) continue;
      await notifyDiscord(
        `⏰ **Unresolved CRITICAL (${Math.round((Date.now() - new Date(e.created_at).getTime()) / 3600_000)}h old)** — \`${e.source}\`\n${String(e.message).slice(0, 400)}`,
      );
      await notifySlack(
        `:alarm_clock: *Unresolved CRITICAL* — \`${e.source}\`\n${String(e.message).slice(0, 400)}`,
      );
      await supabaseFetch('error_logs', `id=eq.${e.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          context: { ...(e.context ?? {}), pulse_reminded: true },
        }),
      });
      actions.push(`reminded stale critical ${e.source}`);
    }
  } catch (err: any) {
    console.error('[pulse] stale-error sweep failed:', err.message);
  }

  // ── 5. Escalation SLA — nobody reads it, nobody hears about it twice ─────
  // An escalations/agent_messages row can sit open forever if the one-time
  // notification that created it was missed. Same dedup pattern as the
  // stale-critical sweep above (a `context.pulse_reminded` flag), applied
  // to escalations and to agent_messages flagged requires_president.
  try {
    const slaHours = Number(process.env.ESCALATION_SLA_HOURS || 4);
    const slaCutoff = new Date(Date.now() - slaHours * 3600_000).toISOString();

    const staleEscalations =
      (await supabaseFetch(
        'escalations',
        `status=eq.open&created_at=lt.${slaCutoff}&select=id,source,subject,summary,reason,priority,context,created_at&limit=10`,
      )) || [];
    for (const e of staleEscalations) {
      if (e.context?.pulse_reminded) continue;
      const ageHours = Math.round(
        (Date.now() - new Date(e.created_at).getTime()) / 3600_000,
      );
      const label = e.subject || e.summary || e.reason || 'Untitled escalation';
      await notifyDiscord(
        `🚨 **Escalation unacknowledged for ${ageHours}h** (${e.priority || 'normal'}) — \`${e.source}\`\n${String(label).slice(0, 400)}`,
      );
      await notifySlack(
        `:rotating_light: *Escalation unacknowledged for ${ageHours}h* (${e.priority || 'normal'}) — \`${e.source}\`\n${String(label).slice(0, 400)}`,
      );
      await supabaseFetch('escalations', `id=eq.${e.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          context: { ...(e.context ?? {}), pulse_reminded: true },
        }),
      });
      actions.push(`reminded stale escalation ${e.id}`);
    }

    const stalePresidentMail =
      (await supabaseFetch(
        'agent_messages',
        `requires_president=eq.true&status=eq.sent&created_at=lt.${slaCutoff}&select=id,from_employee,subject,context,created_at&limit=10`,
      )) || [];
    for (const m of stalePresidentMail) {
      if (m.context?.pulse_reminded) continue;
      const ageHours = Math.round(
        (Date.now() - new Date(m.created_at).getTime()) / 3600_000,
      );
      await notifyDiscord(
        `🚨 **President-required message unread for ${ageHours}h** — from \`${m.from_employee}\`\n${String(m.subject || '(no subject)').slice(0, 200)}`,
      );
      await notifySlack(
        `:rotating_light: *President-required message unread for ${ageHours}h* — from \`${m.from_employee}\`\n${String(m.subject || '(no subject)').slice(0, 200)}`,
      );
      await supabaseFetch('agent_messages', `id=eq.${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          context: { ...(m.context ?? {}), pulse_reminded: true },
        }),
      });
      actions.push(`reminded stale president-mail ${m.id}`);
    }
  } catch (err: any) {
    console.error('[pulse] escalation-SLA sweep failed:', err.message);
  }

  return res.status(200).json({
    success: true,
    actions,
    idle: actions.length === 0,
    duration_ms: Date.now() - startedAt,
  });
}
