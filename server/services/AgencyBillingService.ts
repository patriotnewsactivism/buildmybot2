/**
 * Agency Billing Service
 * Handles usage-based billing arbitrage for agencies
 * Agencies buy wholesale, sell retail, profit from the spread
 */

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { organizations, users } from '../../shared/schema';
import {
  type InsertAgencyPricingTier,
  type InsertRevenueShareLedger,
  type InsertUsageWallet,
  agencyPricingTiers,
  agencySubscriptionPackages,
  revenueShareLedger,
  usageWallets,
} from '../../shared/schema-agentic-os';
import { db } from '../db';
import { env } from '../env';
import { stripeService } from '../stripeService';
import { whitelabelService } from './WhitelabelService';

export interface UsageEvent {
  eventType:
    | 'voice_minute'
    | 'premium_tokens'
    | 'standard_tokens'
    | 'tool_execution'
    | 'chat_token';
  quantity: number; // minutes, token count, or execution count
  agencyOrganizationId: string;
  clientOrganizationId?: string;
  conversationId?: string;
  botId?: string;
}

export interface PricingRates {
  wholesale: number;
  retail: number;
  profit: number;
}

export class AgencyBillingService {
  /**
   * Initialize pricing tier for an agency
   */
  async createPricingTier(
    organizationId: string,
    rates?: Partial<InsertAgencyPricingTier>,
  ) {
    const id = uuid();

    const [tier] = await db
      .insert(agencyPricingTiers)
      .values({
        id,
        organizationId,
        ...rates,
      })
      .returning();

    return tier;
  }

  /**
   * Get pricing tier for an agency
   */
  async getPricingTier(organizationId: string) {
    const [tier] = await db
      .select()
      .from(agencyPricingTiers)
      .where(eq(agencyPricingTiers.organizationId, organizationId))
      .limit(1);

    return tier;
  }

  /**
   * Update retail pricing (what agency charges clients)
   */
  async updateRetailPricing(
    organizationId: string,
    retailRates: {
      retailVoicePerMinute?: number;
      retailPremiumTokensPer1k?: number;
      retailStandardTokensPer1k?: number;
    },
  ) {
    const tier = await this.getPricingTier(organizationId);
    if (!tier) {
      throw new Error('Pricing tier not found. Create one first.');
    }

    // Validate markup doesn't exceed limit
    if (retailRates.retailVoicePerMinute) {
      const markupPercent =
        ((retailRates.retailVoicePerMinute - tier.wholesaleVoicePerMinute!) /
          tier.wholesaleVoicePerMinute!) *
        100;

      if (markupPercent > tier.maxMarkupPercentage!) {
        throw new Error(`Markup exceeds limit of ${tier.maxMarkupPercentage}%`);
      }
    }

    const [updated] = await db
      .update(agencyPricingTiers)
      .set({
        ...retailRates,
        updatedAt: new Date(),
      })
      .where(eq(agencyPricingTiers.organizationId, organizationId))
      .returning();

    return updated;
  }

  /**
   * Calculate pricing for a usage event
   */
  private async calculatePricing(event: UsageEvent): Promise<PricingRates> {
    const tier = await this.getPricingTier(event.agencyOrganizationId);
    if (!tier) {
      throw new Error('Pricing tier not configured for agency');
    }

    let wholesale = 0;
    let retail = 0;

    switch (event.eventType) {
      case 'voice_minute':
        wholesale = tier.wholesaleVoicePerMinute! * event.quantity;
        retail = tier.retailVoicePerMinute! * event.quantity;
        break;
      case 'premium_tokens':
        wholesale = (tier.wholesalePremiumTokensPer1k! * event.quantity) / 1000;
        retail = (tier.retailPremiumTokensPer1k! * event.quantity) / 1000;
        break;
      case 'standard_tokens':
      case 'chat_token':
        wholesale =
          (tier.wholesaleStandardTokensPer1k! * event.quantity) / 1000;
        retail = (tier.retailStandardTokensPer1k! * event.quantity) / 1000;
        break;
      case 'tool_execution':
        // Flat rate per tool execution: $0.01 wholesale, $0.02 retail
        wholesale = 0.01 * event.quantity;
        retail = 0.02 * event.quantity;
        break;
    }

    const profit = retail - wholesale;

    return {
      wholesale: Math.round(wholesale * 100), // Convert to cents
      retail: Math.round(retail * 100),
      profit: Math.round(profit * 100),
    };
  }

  /**
   * Record a billable usage event
   * This is the CRITICAL function called after every AI interaction
   */
  async recordUsageEvent(event: UsageEvent): Promise<void> {
    const pricing = await this.calculatePricing(event);

    // Record in ledger
    const id = uuid();
    await db.insert(revenueShareLedger).values({
      id,
      agencyOrganizationId: event.agencyOrganizationId,
      clientOrganizationId: event.clientOrganizationId,
      eventType: event.eventType,
      quantity: event.quantity,
      wholesaleCostCents: pricing.wholesale,
      retailChargeCents: pricing.retail,
      agencyProfitCents: pricing.profit,
      conversationId: event.conversationId,
      botId: event.botId,
      billedAt: new Date(),
    });

    // Deduct from agency's wallet (wholesale cost)
    await this.deductFromWallet(event.agencyOrganizationId, pricing.wholesale);

    // If client exists, charge their wallet (retail price)
    if (event.clientOrganizationId) {
      await this.deductFromWallet(event.clientOrganizationId, pricing.retail);
    }
  }

  /**
   * Initialize wallet for an organization
   */
  async createWallet(organizationId: string) {
    const id = uuid();

    const [wallet] = await db
      .insert(usageWallets)
      .values({
        id,
        organizationId,
        balanceCents: 0,
      })
      .returning();

    return wallet;
  }

  /**
   * Get wallet for an organization
   */
  async getWallet(organizationId: string) {
    let [wallet] = await db
      .select()
      .from(usageWallets)
      .where(eq(usageWallets.organizationId, organizationId))
      .limit(1);

    // Auto-create if doesn't exist
    if (!wallet) {
      wallet = await this.createWallet(organizationId);
    }

    return wallet;
  }

  /**
   * Add credits to wallet
   */
  async addCredits(organizationId: string, amountCents: number) {
    await db
      .update(usageWallets)
      .set({
        balanceCents: sql`${usageWallets.balanceCents} + ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(usageWallets.organizationId, organizationId));

    return this.getWallet(organizationId);
  }

  /**
   * Deduct from wallet
   */
  private async deductFromWallet(organizationId: string, amountCents: number) {
    const wallet = await this.getWallet(organizationId);

    // Check if balance sufficient
    if (wallet.balanceCents! < amountCents) {
      // Check auto-recharge
      if (wallet.autoRechargeEnabled) {
        await this.triggerAutoRecharge(organizationId, wallet);
      } else {
        // Send low balance alert
        await this.sendLowBalanceAlert(organizationId, wallet);
        throw new Error('Insufficient wallet balance');
      }
    }

    await db
      .update(usageWallets)
      .set({
        balanceCents: sql`${usageWallets.balanceCents} - ${amountCents}`,
        lifetimeSpentCents: sql`${usageWallets.lifetimeSpentCents} + ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(usageWallets.organizationId, organizationId));
  }

  /**
   * Trigger auto-recharge via Stripe
   */
  private async triggerAutoRecharge(
    organizationId: string,
    wallet: typeof usageWallets.$inferSelect,
  ) {
    // Get organization and owner
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId));

    if (!org?.ownerId) {
      console.error(`No owner found for organization ${organizationId}`);
      return;
    }

    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.id, org.ownerId));

    if (!owner?.stripeCustomerId) {
      console.error(`No Stripe customer ID for owner ${owner?.id}`);
      throw new Error('No payment method configured');
    }

    try {
      // Create a payment intent for the recharge amount
      const amountCents = wallet.autoRechargeAmountCents || 5000; // Default $50

      // Use Stripe to charge the saved payment method
      // Note: This requires a saved payment method (setup intent completed previously)
      const paymentIntent = await stripeService.createPaymentIntent(
        owner.stripeCustomerId,
        amountCents,
        {
          purpose: 'wallet_recharge',
          organizationId,
        },
      );

      if (paymentIntent.status === 'succeeded') {
        // Add credits to wallet
        await this.addCredits(organizationId, amountCents);

        // Reset alert flags
        await db
          .update(usageWallets)
          .set({
            lowBalanceAlertSent: false,
            lastRechargeAt: new Date(),
          })
          .where(eq(usageWallets.id, wallet.id));

        console.log(
          `Auto-recharge successful: $${amountCents / 100} for org ${organizationId}`,
        );
      } else {
        throw new Error(`Payment failed with status: ${paymentIntent.status}`);
      }
    } catch (error) {
      console.error('Auto-recharge failed:', error);
      throw new Error('Auto-recharge failed. Please add credits manually.');
    }
  }

  /**
   * Send low balance alert
   */
  private async sendLowBalanceAlert(
    organizationId: string,
    wallet: typeof usageWallets.$inferSelect,
  ) {
    // Prevent spam - only send once per low balance period
    if (wallet.lowBalanceAlertSent) return;

    // Get organization owner
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId));

    if (!org?.ownerId) return;

    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.id, org.ownerId));

    if (!owner?.email) return;

    const balance = (wallet.balanceCents || 0) / 100;
    const subject =
      '⚠️ Low Balance Alert - Add Credits to Your BuildMyBot Account';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
            .balance { font-size: 32px; font-weight: bold; color: #dc2626; }
            .cta-button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin: 0;">⚠️ Low Balance Warning</h2>
              <p style="margin: 5px 0 0 0;">Your wallet balance is running low</p>
            </div>
            <div class="content">
              <p>Hello ${owner.name || 'there'},</p>
              <p>Your BuildMyBot wallet balance is running low:</p>
              <p class="balance">$${balance.toFixed(2)}</p>
              <p>Low balance may affect your services. Add credits to ensure uninterrupted service.</p>
              <a href="${env.APP_BASE_URL}/billing" class="cta-button">Add Credits</a>
              <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
                You can enable auto-recharge in your billing settings to automatically top up your balance.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await whitelabelService.sendWhitelabeledEmail(
        organizationId,
        owner.email,
        subject,
        html,
      );
      console.log(
        `Low balance alert sent to ${owner.email} for org ${organizationId}`,
      );
    } catch (error) {
      console.error('Failed to send low balance alert email:', error);
    }

    await db
      .update(usageWallets)
      .set({
        lowBalanceAlertSent: true,
        lastAlertAt: new Date(),
      })
      .where(eq(usageWallets.id, wallet.id));
  }

  /**
   * Get agency profit report
   * Shows how much money the agency made from markup
   */
  async getAgencyProfitReport(
    agencyOrganizationId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const ledger = await db
      .select()
      .from(revenueShareLedger)
      .where(
        and(
          eq(revenueShareLedger.agencyOrganizationId, agencyOrganizationId),
          gte(revenueShareLedger.createdAt, startDate),
          lte(revenueShareLedger.createdAt, endDate),
        ),
      )
      .orderBy(desc(revenueShareLedger.createdAt));

    const totalProfit = ledger.reduce(
      (sum, entry) => sum + entry.agencyProfitCents!,
      0,
    );
    const totalWholesale = ledger.reduce(
      (sum, entry) => sum + entry.wholesaleCostCents!,
      0,
    );
    const totalRetail = ledger.reduce(
      (sum, entry) => sum + entry.retailChargeCents!,
      0,
    );

    // Breakdown by event type
    const byEventType = ledger.reduce(
      (acc, entry) => {
        if (!acc[entry.eventType!]) {
          acc[entry.eventType!] = {
            count: 0,
            totalProfit: 0,
            totalQuantity: 0,
          };
        }
        acc[entry.eventType!].count++;
        acc[entry.eventType!].totalProfit += entry.agencyProfitCents!;
        acc[entry.eventType!].totalQuantity += entry.quantity!;
        return acc;
      },
      {} as Record<string, any>,
    );

    return {
      periodStart: startDate,
      periodEnd: endDate,
      totalProfitCents: totalProfit,
      totalWholesaleCents: totalWholesale,
      totalRetailCents: totalRetail,
      profitMarginPercent:
        totalRetail > 0 ? (totalProfit / totalRetail) * 100 : 0,
      eventBreakdown: byEventType,
      transactionCount: ledger.length,
    };
  }

  /**
   * Create subscription package for agencies to sell
   */
  async createSubscriptionPackage(
    agencyOrganizationId: string,
    packageData: {
      name: string;
      description?: string;
      monthlyPriceCents: number;
      includedVoiceMinutes?: number;
      includedPremiumTokens?: number;
      includedStandardTokens?: number;
      overageVoicePerMinute?: number;
      overagePremiumTokensPer1k?: number;
      overageStandardTokensPer1k?: number;
    },
  ) {
    const id = uuid();

    const [pkg] = await db
      .insert(agencySubscriptionPackages)
      .values({
        id,
        agencyOrganizationId,
        ...packageData,
      })
      .returning();

    return pkg;
  }

  /**
   * Get all subscription packages for an agency
   */
  async getSubscriptionPackages(agencyOrganizationId: string) {
    return db
      .select()
      .from(agencySubscriptionPackages)
      .where(
        and(
          eq(
            agencySubscriptionPackages.agencyOrganizationId,
            agencyOrganizationId,
          ),
          eq(agencySubscriptionPackages.active, true),
        ),
      );
  }
}

export const agencyBillingService = new AgencyBillingService();
