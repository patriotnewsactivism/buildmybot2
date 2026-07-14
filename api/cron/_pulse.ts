import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  callLLM,
  logAgentError,
  messageAgent,
  notifyDiscord,
  notifySlack,
  rememberMemory,
  supabaseFetch,
} from '../ai-team/lib.js';

// Around-the-clock pulse worker — runs every 10 minutes (vercel.json cron).
//
// Design principle: PERSISTENT but CHEAP. An idle pulse is a handful of
// Supabase reads and zero LLM calls; tokens are only spent when there is
// actual work. What each pulse does:
//
//   1. Overdue leads → if any lead has gone 48h+ with no follow-up, invoke
//      the lead-followups worker immediately instead of waiting for its
//      2-hour cron slot.
//   2. Internal mail → unread agent_messages get answered by their recipient
//      role (tight, budgeted LLM call), so inter-agent questions resolve in
//      minutes, not next-shift. Anti-loop guard: replies (subject "Re:") are
//      never auto-replied to, capping every thread at one round trip.
//   3. Stale critical errors → open criticals older than 2h that nobody
//      resolved get ONE Discord+Slack reminder (deduped via context flag).
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

  const startedAt = Date.now();
  const deadlineAt = startedAt + 240_000; // leave headroom under maxDuration
  const actions: string[] = [];

  // ── 1. Overdue leads → dispatch the follow-up worker now ─────────────────
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

  return res.status(200).json({
    success: true,
    actions,
    idle: actions.length === 0,
    duration_ms: Date.now() - startedAt,
  });
}
