// =====================================================================
// Shared transactional mailer (Resend, with SMTP fallback).
// Extracted from api/gateway-legacy.ts in P1 so auth flows (password
// reset, email verification) can send mail without importing the whole
// API gateway module.
// =====================================================================

export async function sendEmail(opts: {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  scheduledAt?: string; // ISO timestamp — Resend holds and sends it later
}): Promise<{ sent: boolean; providerId?: string; reason?: string }> {
  const fromHeader = opts.fromName
    ? `${opts.fromName} <${opts.from}>`
    : opts.from;

  if (process.env.RESEND_API_KEY) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromHeader,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        reply_to: opts.replyTo,
        ...(opts.scheduledAt ? { scheduled_at: opts.scheduledAt } : {}),
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error('[email] Resend send failed:', resp.status, detail);
      return { sent: false, reason: `resend_${resp.status}` };
    }
    const data = await resp.json().catch(() => ({}));
    return { sent: true, providerId: data.id };
  }

  if (process.env.SMTP_HOST) {
    try {
      const nodemailer = (await import('nodemailer')).default;

      // Each AI-employee mailbox authenticates as ITSELF, not a shared
      // account. cPanel/Exim rewrites the From header to match whichever
      // account authenticated the SMTP session (anti-spoofing), so sending
      // everything through one shared login silently overwrote every
      // employee's From address with that one account's address. Look up
      // this specific sender's own SMTP password by local-part; fall back
      // to the legacy shared SMTP_USER/SMTP_PASS only if no per-mailbox
      // credential is configured for that address yet.
      const localPart = String(opts.from).split('@')[0].toUpperCase();
      const perMailboxPass = process.env[`MAILBOX_PASS_${localPart}`];
      const smtpUser = perMailboxPass ? opts.from : process.env.SMTP_USER;
      const smtpPass = perMailboxPass || process.env.SMTP_PASS;
      if (!perMailboxPass) {
        console.warn(
          `[email] No MAILBOX_PASS_${localPart} configured — falling back to shared SMTP_USER for ${opts.from}. From header may be rewritten by the mail server.`,
        );
      }

      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
      });
      const info = await transport.sendMail({
        from: fromHeader,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        replyTo: opts.replyTo,
      });
      return { sent: true, providerId: info.messageId };
    } catch (err) {
      console.error('[email] SMTP send failed:', err);
      return { sent: false, reason: 'smtp_error' };
    }
  }

  console.warn(
    '[email] No email transport configured (set RESEND_API_KEY or SMTP_*)',
  );
  return { sent: false, reason: 'no_transport' };
}
