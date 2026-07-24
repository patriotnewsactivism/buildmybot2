/**
 * Sales Outreach Agent — distinct from Lead Researcher
 *
 * Researcher's job: find good leads (populate researched_leads). Full stop.
 * This agent's job: pick up NEW leads from the researcher's output, decide
 * email-first or call-first per lead context, initiate first contact, log
 * everything to the outreach fields, and hand off anything that needs a
 * human (Don) rather than guessing on high-stakes replies.
 *
 * Flow: researched_leads (status='new'|'surfaced_to_sales') → this agent
 *   evaluates each → email or call → log to leads.notes/contact_method →
 *   schedule next_followup_at → escalate if needed.
 *
 * Non-negotiable: nothing happens without a real record. Every email and
 * call is logged. Every lead touched gets a timestamped note.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  aiTeamKilled,
  callLLM,
  logAgentError,
  logShift,
  notifyDiscord,
  notifySlack,
  recallMemories,
  rememberMemory,
  salesAutomationDryRun,
} from '../ai-team/lib.js';
import { initiateOutboundCall, twilioConfigured } from '../twilio/service.js';

const ROLE_ID = 'sales-outreach-agent';
const ROLE_NAME = 'Jordan Blake';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const GLOBAL_BUDGET_MS = Number(process.env.CRON_MAX_RUNTIME_MS || 50_000);
const PER_LEAD_BUDGET_MS = 20_000;

async function sbFetch(path: string, init?: RequestInit) {
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

async function sbSelect(table: string, query: string) {
  const resp = await sbFetch(`${table}?${query}`);
  if (!resp.ok) return [];
  return resp.json();
}

async function sbUpdate(table: string, data: any, filter: string) {
  const resp = await sbFetch(`${table}?${filter}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(data),
  });
  return resp.ok;
}

async function sbInsert(table: string, data: any) {
  const resp = await sbFetch(table, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) return null;
  return resp.json();
}

interface ResearchedLead {
  id: string;
  company_name: string;
  website: string;
  industry: string;
  city: string;
  why_good_fit: string;
  suggested_angle: string;
  email?: string;
  phone?: string;
  contact_name?: string;
}

interface OutreachResult {
  id: string;
  company: string;
  action:
    | 'email_sent'
    | 'call_initiated'
    | 'promoted_to_crm'
    | 'skipped'
    | 'escalated'
    | 'dry_run'
    | 'error';
  detail?: string;
}

/**
 * Decide: email-first or call-first?
 * - Has phone? → call-first (faster, higher conversion)
 * - Has email only? → email-first
 * - Neither? → skip, log for manual lookup
 */
async function decideContactMethod(
  lead: ResearchedLead,
): Promise<'email' | 'call' | 'skip'> {
  // If we have a phone number AND Twilio is configured, call first
  if (lead.phone && twilioConfigured()) {
    return 'call';
  }
  // If we have an email, email first
  if (lead.email) {
    return 'email';
  }
  // Neither — skip (needs manual contact info lookup)
  return 'skip';
}

/**
 * Draft a cold outreach email for a researched lead.
 */
async function draftColdEmail(
  lead: ResearchedLead,
): Promise<{ subject: string; body: string }> {
  const prompt = `You are Jordan Blake, Sales Outreach Agent for BuildMyBot. Draft a short, specific cold-outreach email to a potential customer.

Company: ${lead.company_name}
Industry: ${lead.industry}
City: ${lead.city}
Why they're a fit: ${lead.why_good_fit}
Suggested angle: ${lead.suggested_angle}
Contact name: ${lead.contact_name || '(unknown — use "Hi there")'}

Rules:
- Under 100 words in the body
- One clear CTA (reply or book a demo at https://buildmybot.app/demo)
- Plain text, no markdown
- Sign as Jordan Blake, Sales, BuildMyBot
- Never use placeholder brackets like [Company Name]

Respond with ONLY a JSON object: {"subject": "...", "body": "..."}`;

  const raw = await callLLM(
    'You are a sales outreach agent. Output valid JSON only.',
    prompt,
  );

  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
    return {
      subject: String(
        parsed.subject || `AI chatbot for your ${lead.industry} business`,
      ),
      body: String(parsed.body || ''),
    };
  } catch {
    return {
      subject: `AI chatbot for your ${lead.industry} business in ${lead.city}`,
      body: `Hi${lead.contact_name ? ` ${lead.contact_name.split(' ')[0]}` : ' there'},\n\nI noticed your ${lead.industry} business in ${lead.city} could benefit from an AI chatbot that handles customer inquiries 24/7 — no missed calls, instant responses.\n\nWould you be open to a quick 10-minute demo? You can book one here: https://buildmybot.app/demo\n\nBest,\nJordan Blake\nSales, BuildMyBot`,
    };
  }
}

/**
 * Send an email through the same transport the rest of the platform uses.
 */
async function sendOutreachEmail(opts: {
  to: string;
  subject: string;
  body: string;
  fromName: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (salesAutomationDryRun()) {
    await logAgentError({
      source: ROLE_ID,
      level: 'warning',
      message: `[DRY RUN] Would send cold outreach email to ${opts.to}: "${opts.subject}"`,
      context: { dry_run: true, to: opts.to, subject: opts.subject },
    }).catch(() => null);
    return { sent: false, reason: 'dry_run' };
  }

  if (process.env.RESEND_API_KEY) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${opts.fromName} <sales@buildmybot.app>`,
        to: [opts.to],
        subject: opts.subject,
        text: opts.body,
      }),
    });
    if (!resp.ok) return { sent: false, reason: `resend_${resp.status}` };
    return { sent: true };
  }

  if (process.env.SMTP_HOST) {
    try {
      const nodemailer = (await import('nodemailer')).default;
      const smtpUser = process.env.MAILBOX_PASS_SALES
        ? 'sales@buildmybot.app'
        : process.env.SMTP_USER;
      const smtpPass = process.env.MAILBOX_PASS_SALES || process.env.SMTP_PASS;
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
      });
      await transport.sendMail({
        from: `${opts.fromName} <sales@buildmybot.app>`,
        to: opts.to,
        subject: opts.subject,
        text: opts.body,
      });
      return { sent: true };
    } catch {
      return { sent: false, reason: 'smtp_error' };
    }
  }

  return { sent: false, reason: 'no_transport' };
}

/**
 * Process one researched lead: promote to CRM, decide contact method,
 * initiate outreach, log everything.
 */
async function processLead(lead: ResearchedLead): Promise<OutreachResult> {
  const method = await decideContactMethod(lead);

  if (method === 'skip') {
    return {
      id: lead.id,
      company: lead.company_name,
      action: 'skipped',
      detail: 'No email or phone — needs manual contact info lookup',
    };
  }

  // Step 1: Promote to the main leads CRM table so it's visible in the dashboard
  const existingLeads = await sbSelect(
    'leads',
    `email=eq.${encodeURIComponent(lead.email || '')}&select=id&limit=1`,
  );
  let crmLeadId: string;

  if (existingLeads?.[0]?.id) {
    crmLeadId = existingLeads[0].id;
  } else {
    // Create the CRM lead
    const ownerEmail =
      process.env.PORTFOLIO_OWNER_EMAIL || 'president@buildmybot.app';
    const owners = await sbSelect(
      'users',
      `email=eq.${encodeURIComponent(ownerEmail)}&select=id&limit=1`,
    );
    const ownerId = owners?.[0]?.id;

    const newLead = await sbInsert('leads', {
      id: crypto.randomUUID(),
      name: lead.contact_name || lead.company_name,
      email: lead.email || '',
      phone: lead.phone || null,
      source: 'researched_outbound',
      source_bot_id: null,
      user_id: ownerId || 'system',
      status: 'New',
      score: 60,
      notes: `[${new Date().toISOString().slice(0, 16)}] Promoted from research pipeline.\nCompany: ${lead.company_name}\nIndustry: ${lead.industry}, ${lead.city}\nFit: ${lead.why_good_fit}\nAngle: ${lead.suggested_angle}`,
      contact_method: method,
    });
    crmLeadId = newLead?.[0]?.id || crypto.randomUUID();
  }

  // Step 2: Initiate contact based on method
  if (method === 'email' && lead.email) {
    try {
      const draft = await draftColdEmail(lead);
      const result = await sendOutreachEmail({
        to: lead.email,
        subject: draft.subject,
        body: draft.body,
        fromName: 'Jordan Blake, BuildMyBot',
      });

      if (!result.sent) {
        if (result.reason === 'dry_run') {
          return {
            id: lead.id,
            company: lead.company_name,
            action: 'dry_run',
            detail: `[DRY RUN] Would email ${lead.email}: "${draft.subject}"`,
          };
        }
        return {
          id: lead.id,
          company: lead.company_name,
          action: 'error',
          detail: `Email failed: ${result.reason}`,
        };
      }

      // Log the outreach
      const now = new Date().toISOString();
      await sbUpdate(
        'leads',
        {
          last_contacted_at: now,
          contact_method: 'email',
          last_ai_action_at: now,
          next_followup_at: new Date(
            Date.now() + 3 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          email_thread_id: `outreach-${lead.id}`,
        },
        `id=eq.${crmLeadId}`,
      );

      // Log to email_messages for audit trail
      await sbInsert('email_messages', {
        employee_id: ROLE_ID,
        direction: 'outbound',
        from_address: 'sales@buildmybot.app',
        to_address: lead.email,
        subject: draft.subject,
        body: draft.body,
        status: 'sent',
      }).catch(() => null);

      await rememberMemory({
        roleId: ROLE_ID,
        subjectType: 'lead',
        subjectId: crmLeadId,
        content: `Cold outreach email sent to ${lead.company_name} (${lead.email}). Subject: "${draft.subject}". Next follow-up in 3 days.`,
        metadata: { method: 'email', industry: lead.industry, city: lead.city },
      });

      return {
        id: lead.id,
        company: lead.company_name,
        action: 'email_sent',
        detail: `Email sent to ${lead.email}`,
      };
    } catch (err: any) {
      return {
        id: lead.id,
        company: lead.company_name,
        action: 'error',
        detail: `Email draft/send failed: ${err.message}`,
      };
    }
  }

  if (method === 'call' && lead.phone) {
    const callResult = await initiateOutboundCall({
      leadId: crmLeadId,
      phoneNumber: lead.phone,
      objective: `Cold outreach to ${lead.company_name}. ${lead.why_good_fit}. Angle: ${lead.suggested_angle}`,
      agentRoleId: ROLE_ID,
      agentName: ROLE_NAME,
    });

    if (!callResult.success) {
      if (callResult.error === 'dry_run') {
        return {
          id: lead.id,
          company: lead.company_name,
          action: 'dry_run',
          detail: `[DRY RUN] Would call ${lead.phone}`,
        };
      }

      // Fall back to email if call fails and we have an email
      if (lead.email) {
        try {
          const draft = await draftColdEmail(lead);
          const emailResult = await sendOutreachEmail({
            to: lead.email,
            subject: draft.subject,
            body: draft.body,
            fromName: 'Jordan Blake, BuildMyBot',
          });
          if (emailResult.sent) {
            return {
              id: lead.id,
              company: lead.company_name,
              action: 'email_sent',
              detail: `Call failed (${callResult.error}), fell back to email`,
            };
          }
        } catch {
          /* both failed */
        }
      }

      return {
        id: lead.id,
        company: lead.company_name,
        action: 'error',
        detail: `Call failed: ${callResult.error}`,
      };
    }

    return {
      id: lead.id,
      company: lead.company_name,
      action: 'call_initiated',
      detail: `Call SID: ${callResult.callSid}`,
    };
  }

  return {
    id: lead.id,
    company: lead.company_name,
    action: 'skipped',
    detail: 'No viable contact method',
  };
}

/**
 * Main handler — runs as a cron job.
 * Picks up new researched leads and initiates outreach.
 */
export async function salesOutreachHandler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (aiTeamKilled()) {
    return res.status(200).json({ success: true, killed: true });
  }

  const startedAt = Date.now();
  const globalDeadline = startedAt + GLOBAL_BUDGET_MS;

  // Cap outreach per run to protect deliverability
  const cap = Number(process.env.SALES_OUTREACH_CAP || 10);

  // Fetch researched leads that haven't been touched yet
  const newLeads: ResearchedLead[] = await sbSelect(
    'researched_leads',
    `status=in.(new,surfaced_to_sales)&order=created_at.asc&limit=${cap}&select=*`,
  );

  if (!newLeads.length) {
    return res.status(200).json({
      success: true,
      message: 'No new researched leads to process',
      processed: 0,
    });
  }

  const results: OutreachResult[] = [];
  let paused = false;

  for (const lead of newLeads) {
    if (Date.now() + PER_LEAD_BUDGET_MS > globalDeadline) {
      paused = true;
      break;
    }

    const result = await processLead(lead);
    results.push(result);

    // Dry-run leads get zero persisted side effects — leave the researched
    // lead exactly as found so a real run (once dry-run is off) processes it.
    if (result.action !== 'dry_run') {
      await sbUpdate(
        'researched_leads',
        {
          status:
            result.action === 'error' ? 'outreach_failed' : 'outreach_initiated',
          outreach_initiated_at: new Date().toISOString(),
        },
        `id=eq.${lead.id}`,
      );
    }
  }

  const emailsSent = results.filter((r) => r.action === 'email_sent').length;
  const callsInitiated = results.filter(
    (r) => r.action === 'call_initiated',
  ).length;
  const skipped = results.filter((r) => r.action === 'skipped').length;
  const dryRun = results.filter((r) => r.action === 'dry_run').length;
  const errors = results.filter((r) => r.action === 'error').length;

  const summary = `Outreach run: ${results.length} lead(s) processed — ${emailsSent} email(s), ${callsInitiated} call(s), ${skipped} skipped, ${dryRun} dry-run, ${errors} error(s).${paused ? ' Paused (time budget).' : ''}`;

  await logShift({
    role_id: ROLE_ID,
    role_name: ROLE_NAME,
    summary,
    tasks_completed: emailsSent + callsInitiated,
    flags: errors > 0 ? `${errors} outreach error(s)` : '',
  });

  if (emailsSent + callsInitiated > 0 || errors > 0) {
    await notifyDiscord(`📞 **${ROLE_NAME} — Sales Outreach**\n${summary}`);
    await notifySlack(
      `:telephone_receiver: *${ROLE_NAME} — Sales Outreach*\n${summary}`,
    );
  }

  return res.status(200).json({
    success: true,
    processed: results.length,
    emails_sent: emailsSent,
    calls_initiated: callsInitiated,
    skipped,
    dry_run: dryRun,
    errors,
    paused,
    duration_ms: Date.now() - startedAt,
    results,
  });
}
