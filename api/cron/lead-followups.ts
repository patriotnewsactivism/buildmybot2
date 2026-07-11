import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  logAgentError,
  logShift,
  notifyDiscord,
  notifySlack,
  rememberMemory,
  runAgentTask,
} from '../ai-team/lib.js';

// Autonomous Lead Follow-Up worker for BuildMyBot.App.
//
// Finds CRM leads that haven't replied 48+ hours after creation and routes
// EACH lead through the core Thought -> Action -> Observation reasoning loop
// in api/ai-team/lib.ts:
//   1. Memory retrieval first — the agent recalls everything the AI Team
//      knows about this lead from the pgvector store before acting.
//   2. The agent decides: send a personalized follow-up, skip, or escalate.
//   3. Every action is written back as a vector embedding for future recall.
//   4. Failures/rate-limits land in error_logs (ErrorRecoveryDashboard);
//      when the serverless time budget runs out the worker pauses gracefully
//      and reports exactly which leads remain.
//
// If no LLM provider is reachable the worker falls back to the proven static
// case-study template, so revenue-critical follow-ups never silently stop.

const ROLE_ID = 'lead-followup-agent';
const ROLE_NAME = 'Grace Sullivan';

// Global budget: stop picking up new leads once this much wall-clock is spent,
// leaving headroom to log + respond before the serverless timeout.
const GLOBAL_BUDGET_MS = Number(process.env.CRON_MAX_RUNTIME_MS || 50_000);
// Per-lead reasoning budget inside the global budget.
const PER_LEAD_BUDGET_MS = 15_000;

const CASE_STUDY_HTML = `
  <div style="margin-top:16px;padding:16px;border-left:3px solid #2DE2E6;background:#f7fafc;">
    <p style="margin:0 0 8px;font-weight:600;">How one client stopped losing leads after-hours</p>
    <p style="margin:0 0 8px;">A local service business was missing over 40% of inbound inquiries that
    came in outside business hours. After launching a BuildMyBot AI chatbot trained on their site and FAQs,
    with instant lead capture and notifications:</p>
    <ul style="margin:0 0 8px;padding-left:18px;">
      <li>Response time dropped from ~6 hours to under 1 minute, 24/7</li>
      <li>Leads captured per month increased by 63%</li>
      <li>They booked 22 additional appointments in the first month</li>
    </ul>
    <p style="margin:0;">Happy to show you exactly how this would work for your business — just reply to this email.</p>
  </div>
`;

interface LeadRow {
  id: string;
  name: string;
  email: string;
  created_at: string;
  status: string | null;
  source_url: string | null;
  metadata: Record<string, unknown> | null;
}

interface LeadResult {
  id: string;
  email: string;
  action: 'sent' | 'skipped' | 'escalated' | 'already_replied' | 'error';
  detail?: string;
}

function buildEmailHtml(name: string, openingHtml?: string) {
  const firstName = (name || 'there').split(' ')[0];
  const opener =
    openingHtml ||
    `<p>Just wanted to follow up — I don't want you to miss out on what BuildMyBot can do for your business.</p>`;
  return `
    <div style="font-family:sans-serif;font-size:15px;color:#111;line-height:1.5;">
      <p>Hi ${firstName},</p>
      ${opener}
      ${CASE_STUDY_HTML}
      <p style="margin-top:16px;">Let me know if you have any questions!</p>
      <p>— The BuildMyBot Team</p>
    </div>
  `;
}

function buildEmailText(name: string, openingText?: string) {
  const firstName = (name || 'there').split(' ')[0];
  const opener =
    openingText ||
    `Just wanted to follow up — I don't want you to miss out on what BuildMyBot can do for your business.`;
  return `Hi ${firstName},\n\n${opener}\n\nHow one client stopped losing leads after-hours: after launching a BuildMyBot AI chatbot, response time dropped from ~6 hours to under 1 minute, 24/7, leads captured per month increased by 63%, and they booked 22 additional appointments in the first month.\n\nHappy to show you exactly how this would work for your business — just reply to this email.\n\nLet me know if you have any questions!\n\n— The BuildMyBot Team`;
}

async function sbFetch(path: string, init?: RequestInit) {
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

async function sendFollowupEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ sent: boolean; reason?: string }> {
  if (process.env.RESEND_API_KEY) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'BuildMyBot <support@buildmybot.app>',
        to: [to],
        subject,
        html,
      }),
    });
    if (!resp.ok) return { sent: false, reason: `resend_${resp.status}` };
    return { sent: true };
  }

  if (process.env.SMTP_HOST) {
    try {
      const nodemailer = (await import('nodemailer')).default;
      const smtpUser = process.env.MAILBOX_PASS_SUPPORT
        ? 'support@buildmybot.app'
        : process.env.SMTP_USER;
      const smtpPass =
        process.env.MAILBOX_PASS_SUPPORT || process.env.SMTP_PASS;
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
      });
      await transport.sendMail({
        from: 'support@buildmybot.app',
        to,
        subject,
        html,
        text,
      });
      return { sent: true };
    } catch {
      return { sent: false, reason: 'smtp_error' };
    }
  }

  return { sent: false, reason: 'no_transport' };
}

/** Mark the follow-up sent + refresh the AI activity timestamp so the CRM
 * timeline (LeadsCRM.tsx) reflects the agent's action in real time. */
async function markFollowupSent(leadId: string, note: string) {
  await sbFetch(`leads?id=eq.${encodeURIComponent(leadId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      follow_up_sent_at: new Date().toISOString(),
      last_ai_action_at: new Date().toISOString(),
      ai_notes: note.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }),
  });
}

/** Deterministic fallback path (pre-reasoning-loop behavior) used when no
 * LLM provider is reachable — follow-ups keep flowing regardless. */
async function staticFollowup(lead: LeadRow): Promise<LeadResult> {
  const subject = `Still interested, ${(lead.name || 'there').split(' ')[0]}?`;
  const send = await sendFollowupEmail(
    lead.email,
    subject,
    buildEmailHtml(lead.name),
    buildEmailText(lead.name),
  );
  if (!send.sent) {
    return { id: lead.id, email: lead.email, action: 'error', detail: send.reason };
  }
  await markFollowupSent(lead.id, 'Static template follow-up sent (LLM unavailable).');
  await rememberMemory({
    roleId: ROLE_ID,
    subjectType: 'lead',
    subjectId: lead.id,
    content: `Sent static-template 48h follow-up email to ${lead.name} <${lead.email}> (subject: "${subject}").`,
    metadata: { channel: 'email', mode: 'static_fallback' },
  });
  return { id: lead.id, email: lead.email, action: 'sent', detail: 'static_fallback' };
}

/** Route one lead through the core reasoning loop. */
async function reasonAndFollowUp(
  lead: LeadRow,
  deadlineAt: number,
): Promise<LeadResult> {
  const hoursSince = Math.round(
    (Date.now() - new Date(lead.created_at).getTime()) / 3_600_000,
  );

  let outcome: LeadResult = {
    id: lead.id,
    email: lead.email,
    action: 'skipped',
  };

  const result = await runAgentTask({
    roleId: ROLE_ID,
    roleName: ROLE_NAME,
    persona: `You are ${ROLE_NAME}, the Lead Follow-Up Agent for BuildMyBot, a white-label AI chatbot/voice-agent platform that fixes "speed to lead" for local service businesses. Voice: warm, concise, zero pressure. Never invent details about the lead that aren't in the objective or your memory.`,
    objective: `Lead ${lead.name || '(no name)'} <${lead.email}> signed up ${hoursSince}h ago (status: ${lead.status || 'New'}, source: ${lead.source_url || 'unknown'}) and has never replied. Decide the right follow-up: send ONE personalized email via send_followup_email, or finish with a reason to skip, or escalate_to_human if something looks wrong (e.g. memory shows prior complaints or an unsubscribe request).`,
    subjectType: 'lead',
    subjectId: lead.id,
    maxSteps: 3,
    deadlineAt,
    tools: {
      send_followup_email: {
        description:
          'Send the follow-up email to this lead. args: {"subject": "<short personal subject line>", "opening_line": "<1-2 sentence personalized opener, plain text, no greeting — the template adds \'Hi <name>\' and a case study after it>"}',
        run: async (args) => {
          const subject = String(
            args.subject ||
              `Still interested, ${(lead.name || 'there').split(' ')[0]}?`,
          ).slice(0, 120);
          const opening = String(args.opening_line || '').slice(0, 400);
          const send = await sendFollowupEmail(
            lead.email,
            subject,
            buildEmailHtml(lead.name, opening ? `<p>${opening}</p>` : undefined),
            buildEmailText(lead.name, opening || undefined),
          );
          if (!send.sent) {
            outcome = {
              id: lead.id,
              email: lead.email,
              action: 'error',
              detail: send.reason,
            };
            return `Email transport failed (${send.reason}). Do not retry this run — finish and report the failure.`;
          }
          await markFollowupSent(
            lead.id,
            `AI follow-up sent: "${subject}" — ${opening || 'template opener'}`,
          );
          outcome = { id: lead.id, email: lead.email, action: 'sent' };
          return `Email sent to ${lead.email} with subject "${subject}" and the follow_up_sent_at timestamp was recorded on the lead.`;
        },
      },
      escalate_to_human: {
        description:
          'Flag this lead for human review instead of emailing. args: {"reason": "<why an admin should look at this lead>"}',
        run: async (args) => {
          const reason = String(args.reason || 'Unspecified').slice(0, 500);
          await logAgentError({
            source: 'cron/lead-followups',
            level: 'warning',
            message: `Lead escalated to human review: ${lead.email} — ${reason}`,
            context: { lead_id: lead.id, reason },
          });
          outcome = {
            id: lead.id,
            email: lead.email,
            action: 'escalated',
            detail: reason,
          };
          return 'Escalation logged for admin review in the error recovery queue.';
        },
      },
    },
  });

  // Loop failed hard (all LLM providers down) → deterministic fallback so
  // the follow-up still goes out.
  if (result.status === 'failed' && outcome.action === 'skipped') {
    return staticFollowup(lead);
  }

  if (outcome.action === 'skipped') {
    outcome.detail = result.finalAnswer.slice(0, 300);
    await rememberMemory({
      roleId: ROLE_ID,
      subjectType: 'lead',
      subjectId: lead.id,
      content: `Reviewed lead ${lead.name} <${lead.email}> for 48h follow-up and decided to skip: ${result.finalAnswer}`,
      metadata: { decision: 'skip' },
    });
  }

  return outcome;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      success: false,
      error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY',
    });
  }

  const startedAt = Date.now();
  const globalDeadline = startedAt + GLOBAL_BUDGET_MS;
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const listResp = await sbFetch(
    `leads?replied_at=is.null&follow_up_sent_at=is.null&created_at=lte.${encodeURIComponent(cutoff)}&select=id,name,email,created_at,status,source_url,metadata&order=created_at.asc`,
  );
  if (!listResp.ok) {
    const text = await listResp.text();
    await logAgentError({
      source: 'cron/lead-followups',
      level: 'critical',
      message: `Supabase leads query failed: ${listResp.status} ${text.slice(0, 300)}`,
    });
    return res.status(500).json({
      success: false,
      error: `Supabase leads query failed: ${listResp.status}`,
    });
  }

  const leads: LeadRow[] = await listResp.json();
  if (leads.length === 0) {
    return res.status(200).json({
      success: true,
      checked: 0,
      replied_detected: 0,
      sent: 0,
      paused: false,
      results: [],
    });
  }

  // Reply detection: reuse email_messages (populated by /api/email/inbound)
  // so we never follow up with someone who already answered.
  const emailList = leads.map((l) => l.email).filter(Boolean);
  const inList = emailList.map((e) => `"${e}"`).join(',');
  const replyMap = new Map<string, string>();
  if (inList.length > 0) {
    const repliesResp = await sbFetch(
      `email_messages?direction=eq.inbound&from_address=in.(${inList})&select=from_address,created_at&order=created_at.asc`,
    );
    if (repliesResp.ok) {
      const rows: Array<{ from_address: string; created_at: string }> =
        await repliesResp.json();
      for (const row of rows) {
        const key = row.from_address.toLowerCase();
        if (!replyMap.has(key)) replyMap.set(key, row.created_at);
      }
    }
  }

  const results: LeadResult[] = [];
  let repliedDetected = 0;
  let paused = false;
  const remaining: string[] = [];

  for (const lead of leads) {
    // Graceful pause: leave headroom for the memory writes + response below.
    if (Date.now() + PER_LEAD_BUDGET_MS > globalDeadline) {
      paused = true;
      remaining.push(
        ...leads.slice(leads.indexOf(lead)).map((l) => l.id),
      );
      break;
    }

    const replyTimestamp = lead.email
      ? replyMap.get(lead.email.toLowerCase())
      : undefined;

    if (replyTimestamp && replyTimestamp > lead.created_at) {
      await sbFetch(`leads?id=eq.${encodeURIComponent(lead.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ replied_at: replyTimestamp }),
      });
      await rememberMemory({
        roleId: ROLE_ID,
        subjectType: 'lead',
        subjectId: lead.id,
        content: `Lead ${lead.name} <${lead.email}> replied on ${replyTimestamp} — no follow-up needed; marked replied_at.`,
        metadata: { decision: 'already_replied' },
      });
      repliedDetected++;
      results.push({
        id: lead.id,
        email: lead.email,
        action: 'already_replied',
      });
      continue;
    }

    if (!lead.email) {
      results.push({
        id: lead.id,
        email: '',
        action: 'skipped',
        detail: 'no_email',
      });
      continue;
    }

    try {
      const perLeadDeadline = Math.min(
        Date.now() + PER_LEAD_BUDGET_MS,
        globalDeadline,
      );
      results.push(await reasonAndFollowUp(lead, perLeadDeadline));
    } catch (err: any) {
      await logAgentError({
        source: 'cron/lead-followups',
        message: `Unhandled failure processing lead ${lead.id}: ${err.message}`,
        context: { lead_id: lead.id, email: lead.email },
      });
      results.push({
        id: lead.id,
        email: lead.email,
        action: 'error',
        detail: err.message?.slice(0, 200),
      });
    }
  }

  if (paused) {
    await logAgentError({
      source: 'cron/lead-followups',
      level: 'warning',
      message: `Run paused before completion: serverless budget spent after ${results.length} of ${leads.length} leads. Remaining leads will be picked up next run.`,
      context: { remaining_lead_ids: remaining },
    });
  }

  const sent = results.filter((r) => r.action === 'sent').length;
  const escalated = results.filter((r) => r.action === 'escalated').length;
  const skipped = results.filter((r) => r.action === 'skipped').length;

  const runSummary = `48h follow-up run: ${leads.length} overdue lead(s) reviewed — ${sent} personalized email(s) sent, ${repliedDetected} reply/replies detected, ${skipped} skipped, ${escalated} escalated to human review.${paused ? ` Paused with ${remaining.length} lead(s) remaining (time budget).` : ''}`;

  await logShift({
    role_id: ROLE_ID,
    role_name: ROLE_NAME,
    summary: runSummary,
    tasks_completed: sent + repliedDetected,
    flags: escalated ? `${escalated} lead(s) escalated to human review` : '',
  });

  // Discord summary whenever the run actually did something worth knowing
  // about (emails out, escalations, or a paused run needing attention).
  if (sent > 0 || escalated > 0 || paused) {
    await notifyDiscord(`📬 **${ROLE_NAME} — Lead Follow-Ups**\n${runSummary}`);
    await notifySlack(`:mailbox: *${ROLE_NAME} — Lead Follow-Ups*\n${runSummary}`);
  }

  return res.status(200).json({
    success: true,
    checked: results.length,
    replied_detected: repliedDetected,
    sent,
    escalated,
    paused,
    remaining: remaining.length,
    duration_ms: Date.now() - startedAt,
    results,
  });
}
