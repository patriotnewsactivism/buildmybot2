import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { bots, users, voiceAgents } from '../../shared/schema';
import { db } from '../db';
import { env } from '../env';
import { whitelabelService } from './WhitelabelService';

export interface LeadAlertData {
  leadId: string;
  leadName: string;
  leadEmail: string;
  leadPhone?: string | null;
  leadScore: number;
  botId: string;
  botName: string;
  organizationId?: string | null;
  conversationContext?: string;
}

export class LeadAlertService {
  private static instance: LeadAlertService;
  private transporter: nodemailer.Transporter | null = null;

  private constructor() {
    this.initializeTransporter();
  }

  static getInstance(): LeadAlertService {
    if (!LeadAlertService.instance) {
      LeadAlertService.instance = new LeadAlertService();
    }
    return LeadAlertService.instance;
  }

  private initializeTransporter() {
    if (!env.SMTP_HOST) {
      console.warn('SMTP not configured - lead alerts will be logged only');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === 'true',
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }

  /**
   * Send lead alert notification to the bot owner
   * Called when a new lead is captured with a high score
   */
  async sendLeadAlert(data: LeadAlertData): Promise<boolean> {
    const {
      leadId,
      leadName,
      leadEmail,
      leadPhone,
      leadScore,
      botId,
      botName,
      organizationId,
      conversationContext,
    } = data;

    // Get bot owner's email
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
    if (!bot?.userId) {
      console.warn(`No owner found for bot ${botId}`);
      return false;
    }

    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.id, bot.userId));
    if (!owner?.email) {
      console.warn(`No email found for bot owner ${bot.userId}`);
      return false;
    }

    // Determine lead quality
    const isHotLead = leadScore >= 70;
    const leadQuality =
      leadScore >= 70 ? 'HOT' : leadScore >= 40 ? 'WARM' : 'COLD';
    const emoji = isHotLead ? '🔥' : leadScore >= 40 ? '⭐' : '📋';

    const subject = `${emoji} New ${leadQuality} Lead from ${botName}: ${leadName}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${isHotLead ? '#dc2626' : leadScore >= 40 ? '#f59e0b' : '#3b82f6'}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
            .lead-info { background: white; padding: 15px; border-radius: 6px; margin-bottom: 15px; }
            .score { font-size: 24px; font-weight: bold; color: ${isHotLead ? '#dc2626' : leadScore >= 40 ? '#f59e0b' : '#3b82f6'}; }
            .label { font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; }
            .value { margin-bottom: 10px; }
            .cta-button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 15px; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin: 0;">${emoji} New ${leadQuality} Lead Captured!</h2>
              <p style="margin: 5px 0 0 0;">From your bot: ${botName}</p>
            </div>
            <div class="content">
              <div class="lead-info">
                <div class="value">
                  <div class="label">Lead Score</div>
                  <span class="score">${leadScore}/100</span>
                </div>
                <div class="value">
                  <div class="label">Name</div>
                  ${leadName}
                </div>
                <div class="value">
                  <div class="label">Email</div>
                  <a href="mailto:${leadEmail}">${leadEmail}</a>
                </div>
                ${
                  leadPhone
                    ? `
                <div class="value">
                  <div class="label">Phone</div>
                  <a href="tel:${leadPhone}">${leadPhone}</a>
                </div>
                `
                    : ''
                }
                ${
                  conversationContext
                    ? `
                <div class="value">
                  <div class="label">Conversation Summary</div>
                  <p style="margin: 0; white-space: pre-wrap;">${conversationContext.substring(0, 500)}${conversationContext.length > 500 ? '...' : ''}</p>
                </div>
                `
                    : ''
                }
              </div>
              
              <a href="${env.APP_BASE_URL}/leads/${leadId}" class="cta-button">View Lead Details</a>
              
              <div class="footer">
                <p>This lead was captured by BuildMyBot. Respond quickly - ${isHotLead ? 'hot leads are time-sensitive!' : 'faster response times lead to higher conversion rates.'}</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    // Try whitelabeled email first, fall back to system email
    if (organizationId) {
      try {
        await whitelabelService.sendWhitelabeledEmail(
          organizationId,
          owner.email,
          subject,
          html,
        );
        console.log(
          `Lead alert sent to ${owner.email} for lead ${leadId} via whitelabel`,
        );
        return true;
      } catch (error) {
        console.error(
          'Whitelabel email failed, falling back to system SMTP:',
          error,
        );
      }
    }

    // Fall back to system SMTP
    if (!this.transporter) {
      console.log(`[LEAD ALERT] ${subject} - would be sent to ${owner.email}`);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: env.SMTP_FROM || 'noreply@buildmybot.app',
        to: owner.email,
        subject,
        html,
      });
      console.log(`Lead alert sent to ${owner.email} for lead ${leadId}`);
      return true;
    } catch (error) {
      console.error('Failed to send lead alert:', error);
      return false;
    }
  }

  /**
   * Resolve the best available phone number for the bot owner.
   *
   * Priority:
   *   1. user.phone_config.notification_phone (explicit SMS opt-in)
   *   2. voice_agent.transfer_number for the same organization
   *      (this is the number calls get forwarded to — typically the owner)
   *   3. null — no phone available
   */
  private async resolveOwnerPhone(
    userId: string,
    organizationId?: string | null,
  ): Promise<string | null> {
    // 1. Check user's phone_config
    const [owner] = await db
      .select({ phoneConfig: users.phoneConfig })
      .from(users)
      .where(eq(users.id, userId));

    if (owner?.phoneConfig) {
      const config = owner.phoneConfig as Record<string, unknown>;
      const notifPhone = config.notification_phone || config.phone;
      if (typeof notifPhone === 'string' && notifPhone.length >= 10) {
        // Ensure E.164 format
        return notifPhone.startsWith('+') ? notifPhone : `+1${notifPhone.replace(/\D/g, '')}`;
      }
    }

    // 2. Fall back to the org's voice agent transfer_number
    if (organizationId) {
      const [va] = await db
        .select({ transferNumber: voiceAgents.transferNumber })
        .from(voiceAgents)
        .where(eq(voiceAgents.organizationId, organizationId));
      if (va?.transferNumber) {
        const num = va.transferNumber.replace(/\D/g, '');
        return num.startsWith('1') ? `+${num}` : `+1${num}`;
      }
    }

    return null;
  }

  /**
   * Send SMS alert for hot leads (requires Twilio)
   */
  async sendSmsAlert(data: LeadAlertData): Promise<boolean> {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_PHONE_NUMBER) {
      console.warn('[SMS Alert] Twilio not configured — skipping SMS alert');
      return false;
    }

    const { leadName, leadEmail, leadPhone, leadScore, botName, conversationContext } = data;

    // Get bot owner
    const [bot] = await db.select().from(bots).where(eq(bots.id, data.botId));
    if (!bot?.userId) return false;

    // Resolve the best phone number for the owner
    const ownerPhone = await this.resolveOwnerPhone(bot.userId, data.organizationId);
    if (!ownerPhone) {
      console.warn(`[SMS Alert] No phone number found for bot owner ${bot.userId} — skipping SMS`);
      return false;
    }

    const twilio = await import('twilio');
    const client = twilio.default(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_AUTH_TOKEN,
    );

    // Build a concise but informative SMS (stay under 3 segments / 480 chars)
    let message = `🔥 HOT LEAD from ${botName}!\n\nName: ${leadName}\nEmail: ${leadEmail}`;
    if (leadPhone) message += `\nPhone: ${leadPhone}`;
    message += `\nScore: ${leadScore}/100`;
    if (conversationContext) {
      const snippet = conversationContext.substring(0, 120).replace(/\n/g, ' ');
      message += `\n\n"${snippet}${conversationContext.length > 120 ? '…' : ''}"`;
    }
    message += `\n\nView: ${env.APP_BASE_URL}/leads/${data.leadId}`;

    try {
      await client.messages.create({
        body: message,
        from: env.TWILIO_PHONE_NUMBER,
        to: ownerPhone,
      });
      console.log(`[SMS Alert] Sent to ${ownerPhone} for lead ${data.leadId} (score: ${leadScore})`);
      return true;
    } catch (error) {
      console.error('[SMS Alert] Failed to send:', error);
      return false;
    }
  }
}

export const leadAlertService = LeadAlertService.getInstance();
