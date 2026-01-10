import { eq } from 'drizzle-orm';
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
}

export const whitelabelService = new WhitelabelService();
