/**
 * Agency Billing Service
 * Handles usage-based billing arbitrage for agencies
 * Agencies buy wholesale, sell retail, profit from the spread
 */

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import {
  agencyPricingTiers,
  agencySubscriptionPackages,
  revenueShareLedger,
  usageWallets,
  type InsertAgencyPricingTier,
  type InsertRevenueShareLedger,
  type InsertUsageWallet,
} from '../../shared/schema-agentic-os';
import { organizations } from '../../shared/schema';
import { db } from '../db';

export interface UsageEvent {
  eventType: 'voice_minute' | 'premium_tokens' | 'standard_tokens' | 'tool_execution' | 'chat_token';
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
    rates?: Partial<InsertAgencyPricingTier>
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
    }
  ) {
    const tier = await this.getPricingTier(organizationId);
    if (!tier) {
      throw new Error('Pricing tier not found. Create one first.');
    }

    // Validate markup doesn't exceed limit
    if (retailRates.retailVoicePerMinute) {
      const markupPercent =
        ((retailRates.retailVoicePerMinute - tier.wholesaleVoicePerMinute!) /
         tier.wholesaleVoicePerMinute!) * 100;

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
  private async calculatePricing(
    event: UsageEvent
  ): Promise<PricingRates> {
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
        wholesale = (tier.wholesaleStandardTokensPer1k! * event.quantity) / 1000;
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
    await this.deductFromWallet(
      event.agencyOrganizationId,
      pricing.wholesale
    );

    // If client exists, charge their wallet (retail price)
    if (event.clientOrganizationId) {
      await this.deductFromWallet(
        event.clientOrganizationId,
        pricing.retail
      );
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
  async addCredits(
    organizationId: string,
    amountCents: number
  ) {
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
  private async deductFromWallet(
    organizationId: string,
    amountCents: number
  ) {
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
    wallet: typeof usageWallets.$inferSelect
  ) {
    // TODO: Integrate with Stripe to charge saved payment method
    // For now, just log
    console.log(`Auto-recharge triggered for org ${organizationId}`);

    // Add credits
    await this.addCredits(
      organizationId,
      wallet.autoRechargeAmountCents!
    );
  }

  /**
   * Send low balance alert
   */
  private async sendLowBalanceAlert(
    organizationId: string,
    wallet: typeof usageWallets.$inferSelect
  ) {
    // Prevent spam - only send once
    if (wallet.lowBalanceAlertSent) return;

    // TODO: Send email via NurtureService
    console.log(`Low balance alert for org ${organizationId}`);

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
    endDate: Date
  ) {
    const ledger = await db
      .select()
      .from(revenueShareLedger)
      .where(
        and(
          eq(revenueShareLedger.agencyOrganizationId, agencyOrganizationId),
          gte(revenueShareLedger.createdAt, startDate),
          lte(revenueShareLedger.createdAt, endDate)
        )
      )
      .orderBy(desc(revenueShareLedger.createdAt));

    const totalProfit = ledger.reduce((sum, entry) => sum + entry.agencyProfitCents!, 0);
    const totalWholesale = ledger.reduce((sum, entry) => sum + entry.wholesaleCostCents!, 0);
    const totalRetail = ledger.reduce((sum, entry) => sum + entry.retailChargeCents!, 0);

    // Breakdown by event type
    const byEventType = ledger.reduce((acc, entry) => {
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
    }, {} as Record<string, any>);

    return {
      periodStart: startDate,
      periodEnd: endDate,
      totalProfitCents: totalProfit,
      totalWholesaleCents: totalWholesale,
      totalRetailCents: totalRetail,
      profitMarginPercent: totalRetail > 0 ? (totalProfit / totalRetail) * 100 : 0,
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
    }
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
          eq(agencySubscriptionPackages.agencyOrganizationId, agencyOrganizationId),
          eq(agencySubscriptionPackages.active, true)
        )
      );
  }
}

export const agencyBillingService = new AgencyBillingService();
