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

// Around-the-clock pulse worker. Idle pulses use database reads only; model
// tokens are spent only when there is actual internal mail to answer.
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
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }
  if (aiTeamKilled()) {
    return res.status(200).json({ success: true, killed: true });
  }

  const startedAt = Date.now();
  const deadlineAt = startedAt + 240_000;
  const actions: string[] = [];
  const outboundEnabled = !salesAutomationDryRun();

  // 1. Overdue leads: dispatch follow-up worker only when outbound is live.
  if (outboundEnabled) {
    try {
      const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString();
      const overdue =
        (await supabaseFetch(
          'leads',
          `select=id&replied_at=is.null&follow_up_sent_at=is.null&created_at=lt.${cutoff}&limit=1`,
        )) || [];
      if (overdue.length > 0) {
        const base = process.env.APP_BASE_URL || 'https://www.buildmybot.app';
        const response = await fetch(`${base}/api/cron/lead-followups`, {
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        });
        const body = await response.json().catch(() => ({}));
        actions.push(
          `dispatched lead-followups (sent=${body.sent ?? '?'}, escalated=${body.escalated ?? '?'})`,
        );
      }
    } catch (error: any) {
      await logAgentError({
        source: 'cron/pulse/lead-dispatch',
        message: `Overdue-lead dispatch failed: ${error.message}`,
      });
    }
  }

  // 2. Internal mail: answer one round-trip, never president mail or replies.
  try {
    const unread =
      (await supabaseFetch(
        'agent_messages',
        'status=eq.sent&order=created_at.asc&limit=5&select=id,from_employee,to_employee,subject,body,thread_id',
      )) || [];

    for (const message of unread) {
      if (Date.now() > deadlineAt) break;
      const isReply = /^re:/i.test(message.subject || '');
      const toHuman = /president|don/i.test(message.to_employee || '');
      if (isReply || toHuman) {
        if (isReply) {
          await supabaseFetch('agent_messages', `id=eq.${message.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'read' }),
          });
        }
        continue;
      }

      const recipientName =
        ROLE_NAMES[message.to_employee] || message.to_employee;
      const senderName =
        ROLE_NAMES[message.from_employee] || message.from_employee;
      const reply = await callLLM(
        `You are ${recipientName} on BuildMyBot's AI team. Answer this teammate concretely and briefly. If you cannot resolve it, state exactly what is needed. Never invent completed work.`,
        `From: ${senderName} (${message.from_employee})\nSubject: ${message.subject}\n\n${message.body}`,
      );

      await messageAgent({
        fromRoleId: message.to_employee,
        fromRoleName: recipientName,
        toRoleId: message.from_employee,
        subject: `Re: ${message.subject || 'your message'}`,
        body: reply,
        threadId: message.thread_id || message.id,
      });
      await supabaseFetch('agent_messages', `id=eq.${message.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'read' }),
      });
      await rememberMemory({
        roleId: message.to_employee,
        subjectType: 'system',
        content: `Answered internal mail from ${senderName} re "${message.subject}": ${reply.slice(0, 300)}`,
        metadata: { thread_id: message.thread_id || message.id },
      });
      actions.push(
        `answered mail ${message.from_employee} → ${message.to_employee}`,
      );
    }
  } catch (error: any) {
    await logAgentError({
      source: 'cron/pulse/internal-mail',
      message: `Internal mail processing failed: ${error.message}`,
    });
  }

  // 3. Sales outreach: dispatch only when outbound is explicitly live.
  if (outboundEnabled) {
    try {
      const waitingLeads =
        (await supabaseFetch(
          'researched_leads',
          'select=id&status=in.(new,surfaced_to_sales)&limit=1',
        )) || [];
      if (waitingLeads.length > 0) {
        const base = process.env.APP_BASE_URL || 'https://www.buildmybot.app';
        const response = await fetch(`${base}/api/cron/sales-outreach`, {
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        });
        const body = await response.json().catch(() => ({}));
        actions.push(
          `dispatched sales-outreach (emails=${body.emails_sent ?? '?'}, calls=${body.calls_initiated ?? '?'})`,
        );
      }
    } catch (error: any) {
      await logAgentError({
        source: 'cron/pulse/sales-outreach',
        message: `Sales outreach dispatch failed: ${error.message}`,
      });
    }
  }

  // 4. Remind once for stale critical errors.
  try {
    const cutoff = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const stale =
      (await supabaseFetch(
        'error_logs',
        `status=eq.open&level=eq.critical&created_at=lt.${cutoff}&select=id,source,message,context,created_at&limit=10`,
      )) || [];
    for (const error of stale) {
      if (error.context?.pulse_reminded) continue;
      const ageHours = Math.round(
        (Date.now() - new Date(error.created_at).getTime()) / 3_600_000,
      );
      await notifyDiscord(
        `Unresolved CRITICAL (${ageHours}h old) — ${error.source}\n${String(error.message).slice(0, 400)}`,
      );
      await notifySlack(
        `Unresolved CRITICAL (${ageHours}h old) — ${error.source}\n${String(error.message).slice(0, 400)}`,
      );
      await supabaseFetch('error_logs', `id=eq.${error.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          context: { ...(error.context ?? {}), pulse_reminded: true },
        }),
      });
      actions.push(`reminded stale critical ${error.source}`);
    }
  } catch (error: any) {
    console.error('[pulse] stale-error sweep failed:', error.message);
  }

  // 5. Escalation SLA: remind exactly once on stale escalations and
  // president-required messages.
  try {
    const slaHours = Number(process.env.ESCALATION_SLA_HOURS || 4);
    const cutoff = new Date(Date.now() - slaHours * 3_600_000).toISOString();
    const staleEscalations =
      (await supabaseFetch(
        'escalations',
        `status=eq.open&created_at=lt.${cutoff}&select=id,source,subject,summary,reason,priority,context,created_at&limit=10`,
      )) || [];

    for (const escalation of staleEscalations) {
      if (escalation.context?.pulse_reminded) continue;
      const ageHours = Math.round(
        (Date.now() - new Date(escalation.created_at).getTime()) / 3_600_000,
      );
      const label =
        escalation.subject ||
        escalation.summary ||
        escalation.reason ||
        'Untitled escalation';
      await notifyDiscord(
        `Escalation unacknowledged for ${ageHours}h (${escalation.priority || 'normal'}) — ${escalation.source}\n${String(label).slice(0, 400)}`,
      );
      await notifySlack(
        `Escalation unacknowledged for ${ageHours}h (${escalation.priority || 'normal'}) — ${escalation.source}\n${String(label).slice(0, 400)}`,
      );
      await supabaseFetch('escalations', `id=eq.${escalation.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          context: {
            ...(escalation.context ?? {}),
            pulse_reminded: true,
          },
        }),
      });
      actions.push(`reminded stale escalation ${escalation.id}`);
    }

    const stalePresidentMail =
      (await supabaseFetch(
        'agent_messages',
        `requires_president=eq.true&status=eq.sent&created_at=lt.${cutoff}&select=id,from_employee,subject,context,created_at&limit=10`,
      )) || [];
    for (const message of stalePresidentMail) {
      if (message.context?.pulse_reminded) continue;
      const ageHours = Math.round(
        (Date.now() - new Date(message.created_at).getTime()) / 3_600_000,
      );
      await notifyDiscord(
        `President-required message unread for ${ageHours}h — ${message.from_employee}\n${String(message.subject || '(no subject)').slice(0, 200)}`,
      );
      await notifySlack(
        `President-required message unread for ${ageHours}h — ${message.from_employee}\n${String(message.subject || '(no subject)').slice(0, 200)}`,
      );
      await supabaseFetch('agent_messages', `id=eq.${message.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          context: { ...(message.context ?? {}), pulse_reminded: true },
        }),
      });
      actions.push(`reminded stale president-mail ${message.id}`);
    }
  } catch (error: any) {
    console.error('[pulse] escalation-SLA sweep failed:', error.message);
  }

  return res.status(200).json({
    success: true,
    actions,
    idle: actions.length === 0,
    duration_ms: Date.now() - startedAt,
  });
}
