import type { VercelRequest, VercelResponse } from '@vercel/node';

// Native Vercel port of the old Base44 "Lead Follow-Up" workflow — finds
// CRM leads that haven't replied 48+ hours after creation and sends them a
// follow-up email with a case study. Runs off GitHub Actions (every 6h) now
// instead of a Base44 workflow, so it's never blocked by Base44 integration
// credits again. Same reply-detection logic: reuses email_messages (already
// populated by /api/email/inbound) to check if the lead replied before
// sending a follow-up.

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

function buildEmailHtml(name: string) {
  const firstName = (name || 'there').split(' ')[0];
  return `
    <div style="font-family:sans-serif;font-size:15px;color:#111;line-height:1.5;">
      <p>Hi ${firstName},</p>
      <p>Just wanted to follow up — I don't want you to miss out on what BuildMyBot can do for your business.</p>
      ${CASE_STUDY_HTML}
      <p style="margin-top:16px;">Let me know if you have any questions!</p>
      <p>— The BuildMyBot Team</p>
    </div>
  `;
}

function buildEmailText(name: string) {
  const firstName = (name || 'there').split(' ')[0];
  return `Hi ${firstName},\n\nJust wanted to follow up — I don't want you to miss out on what BuildMyBot can do for your business.\n\nHow one client stopped losing leads after-hours: after launching a BuildMyBot AI chatbot, response time dropped from ~6 hours to under 1 minute, 24/7, leads captured per month increased by 63%, and they booked 22 additional appointments in the first month.\n\nHappy to show you exactly how this would work for your business — just reply to this email.\n\nLet me know if you have any questions!\n\n— The BuildMyBot Team`;
}

async function sbFetch(
  supabaseUrl: string,
  apiKey: string,
  path: string,
  init?: RequestInit,
) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
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
    } catch (err) {
      return { sent: false, reason: 'smtp_error' };
    }
  }

  return { sent: false, reason: 'no_transport' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      success: false,
      error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY',
    });
  }

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const listResp = await sbFetch(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    `leads?replied_at=is.null&follow_up_sent_at=is.null&created_at=lte.${encodeURIComponent(cutoff)}&select=id,name,email,created_at`,
  );
  if (!listResp.ok) {
    const text = await listResp.text();
    return res.status(500).json({
      success: false,
      error: `Supabase leads query failed: ${listResp.status} ${text}`,
    });
  }

  const leads: Array<{
    id: string;
    name: string;
    email: string;
    created_at: string;
  }> = await listResp.json();
  const results: Array<{
    id: string;
    email: string;
    sent: boolean;
    reason?: string;
  }> = [];

  if (leads.length === 0) {
    return res.status(200).json({
      success: true,
      checked: 0,
      replied_detected: 0,
      sent: 0,
      results: [],
    });
  }

  const emailList = leads.map((l) => l.email).filter(Boolean);
  const inList = emailList.map((e) => `"${e}"`).join(',');
  const replyMap = new Map<string, string>();

  if (inList.length > 0) {
    const repliesResp = await sbFetch(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
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

  let repliedDetected = 0;

  for (const lead of leads) {
    const replyTimestamp = lead.email
      ? replyMap.get(lead.email.toLowerCase())
      : undefined;

    if (replyTimestamp && replyTimestamp > lead.created_at) {
      await sbFetch(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        `leads?id=eq.${encodeURIComponent(lead.id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ replied_at: replyTimestamp }),
        },
      );
      repliedDetected++;
      results.push({
        id: lead.id,
        email: lead.email,
        sent: false,
        reason: 'already_replied',
      });
      continue;
    }

    if (!lead.email) {
      results.push({ id: lead.id, email: '', sent: false, reason: 'no_email' });
      continue;
    }

    const subject = `Still interested, ${(lead.name || 'there').split(' ')[0]}?`;
    const send = await sendFollowupEmail(
      lead.email,
      subject,
      buildEmailHtml(lead.name),
      buildEmailText(lead.name),
    );

    if (!send.sent) {
      results.push({
        id: lead.id,
        email: lead.email,
        sent: false,
        reason: send.reason,
      });
      continue;
    }

    const patchResp = await sbFetch(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      `leads?id=eq.${encodeURIComponent(lead.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ follow_up_sent_at: new Date().toISOString() }),
      },
    );

    results.push({
      id: lead.id,
      email: lead.email,
      sent: true,
      reason: patchResp.ok ? undefined : 'status_update_failed',
    });
  }

  return res.status(200).json({
    success: true,
    checked: leads.length,
    replied_detected: repliedDetected,
    sent: results.filter((r) => r.sent).length,
    results,
  });
}
