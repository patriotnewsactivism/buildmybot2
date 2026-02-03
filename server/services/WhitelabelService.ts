import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { v4 as uuid } from 'uuid';
import {
  type InsertOrganizationBranding,
  organizationBranding,
} from '../../shared/billing-schema';
import { db } from '../db';
import { billingService } from './BillingService';

export class WhitelabelService {
  async getBranding(organizationId: string) {
    const [branding] = await db
      .select()
      .from(organizationBranding)
      .where(eq(organizationBranding.organizationId, organizationId));
    return branding;
  }

  async createOrUpdateBranding(
    organizationId: string,
    data: Partial<InsertOrganizationBranding>,
  ) {
    const entitlement = await billingService.checkEntitlement(
      organizationId,
      'white_label',
    );
    if (!entitlement.allowed) {
      throw new Error('White-label branding requires an upgraded plan');
    }

    const existing = await this.getBranding(organizationId);
    if (existing) {
      const [updated] = await db
        .update(organizationBranding)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(organizationBranding.id, existing.id))
        .returning();
      return updated;
    }

    const id = uuid();
    const [branding] = await db
      .insert(organizationBranding)
      .values({ ...data, id, organizationId })
      .returning();
    return branding;
  }

  async updateCustomDomain(organizationId: string, customDomain: string) {
    return this.createOrUpdateBranding(organizationId, {
      customDomain,
      domainVerified: false,
    });
  }

  async verifyDomain(organizationId: string) {
    const [branding] = await db
      .update(organizationBranding)
      .set({ domainVerified: true, updatedAt: new Date() })
      .where(eq(organizationBranding.organizationId, organizationId))
      .returning();
    return branding;
  }

  async updateLogo(organizationId: string, logoUrl: string) {
    return this.createOrUpdateBranding(organizationId, { logoUrl });
  }

  async updateFavicon(organizationId: string, faviconUrl: string) {
    return this.createOrUpdateBranding(organizationId, { faviconUrl });
  }

  async updateColors(
    organizationId: string,
    colors: {
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
    },
  ) {
    return this.createOrUpdateBranding(organizationId, colors);
  }

  async updateCompanyInfo(
    organizationId: string,
    info: { companyName?: string; supportEmail?: string },
  ) {
    return this.createOrUpdateBranding(organizationId, info);
  }

  async updateCustomCss(organizationId: string, customCss: string) {
    return this.createOrUpdateBranding(organizationId, { customCss });
  }

  async updateSmtpConfig(
    organizationId: string,
    smtpConfig: any, // Should ideally type this
  ) {
    return this.createOrUpdateBranding(organizationId, { smtpConfig });
  }

  async toggleBuiltWithBadge(organizationId: string, hide: boolean) {
    return this.createOrUpdateBranding(organizationId, {
      hideBuiltWithBadge: hide,
    });
  }

  async deleteBranding(organizationId: string) {
    await db
      .delete(organizationBranding)
      .where(eq(organizationBranding.organizationId, organizationId));
  }

  async sendWhitelabeledEmail(
    organizationId: string,
    to: string,
    subject: string,
    html: string,
  ) {
    const branding = await this.getBranding(organizationId);

    // Default transport (system)
    let transporter = nodemailer.createTransport({
      // Configure default system transport here from env vars
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    let from = process.env.SMTP_FROM || 'noreply@buildmybot.app';

    // Use whitelabel SMTP if configured
    if (branding?.smtpConfig) {
      const config = branding.smtpConfig as any;
      transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass,
        },
      });
      from = config.from || from;
    }

    await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });
  }
}

export const whitelabelService = new WhitelabelService();
