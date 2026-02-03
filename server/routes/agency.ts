/**
 * Agency Billing Routes
 * API endpoints for agency billing arbitrage features
 */

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  agencyPricingTiers,
  organizations,
  revenueShareLedger,
  usageWallets,
} from '../../shared/schema-agentic-os';
import { db } from '../db';
import { agencyBillingService } from '../services/AgencyBillingService';

const router = Router();

/**
 * GET /api/agency/profit-report
 * Returns profit analytics for the agency
 */
router.get('/profit-report', async (req: any, res) => {
  try {
    const organizationId = req.org?.id;
    if (!organizationId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const startDate = req.query.start
      ? new Date(req.query.start as string)
      : new Date('2020-01-01');
    const endDate = req.query.end
      ? new Date(req.query.end as string)
      : new Date();

    const report = await agencyBillingService.getAgencyProfitReport(
      organizationId,
      startDate,
      endDate,
    );

    // Get timeline data (daily aggregation)
    const timeline = await db
      .select({
        date: sql<string>`DATE(${revenueShareLedger.createdAt})`,
        profit: sql<number>`SUM(${revenueShareLedger.agencyProfitCents})`,
        wholesale: sql<number>`SUM(${revenueShareLedger.wholesaleCostCents})`,
        retail: sql<number>`SUM(${revenueShareLedger.retailChargeCents})`,
      })
      .from(revenueShareLedger)
      .where(
        and(
          eq(revenueShareLedger.agencyOrganizationId, organizationId),
          gte(revenueShareLedger.createdAt, startDate),
          lte(revenueShareLedger.createdAt, endDate),
        ),
      )
      .groupBy(sql`DATE(${revenueShareLedger.createdAt})`)
      .orderBy(sql`DATE(${revenueShareLedger.createdAt})`);

    const formattedTimeline = timeline.map((row) => ({
      date: new Date(row.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      profit: (row.profit || 0) / 100,
      wholesale: (row.wholesale || 0) / 100,
      retail: (row.retail || 0) / 100,
    }));

    res.json({
      stats: report,
      timeline: formattedTimeline,
    });
  } catch (error) {
    console.error('Profit report error:', error);
    res.status(500).json({ error: 'Failed to fetch profit report' });
  }
});

/**
 * GET /api/agency/wallet
 * Returns wallet balance and transaction history
 */
router.get('/wallet', async (req: any, res) => {
  try {
    const organizationId = req.org?.id;
    if (!organizationId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [wallet] = await db
      .select()
      .from(usageWallets)
      .where(eq(usageWallets.organizationId, organizationId))
      .limit(1);

    if (!wallet) {
      // Create default wallet
      const newWallet = await db
        .insert(usageWallets)
        .values({
          id: uuidv4(),
          organizationId,
          balanceCents: 0,
          autoRechargeEnabled: false,
          autoRechargeThresholdCents: 5000, // $50
          autoRechargeAmountCents: 10000, // $100
        })
        .returning();

      return res.json({
        wallet: newWallet[0],
        transactions: [],
      });
    }

    // Get recent transactions from revenue share ledger
    const ledgerEntries = await db
      .select()
      .from(revenueShareLedger)
      .where(eq(revenueShareLedger.agencyOrganizationId, organizationId))
      .orderBy(desc(revenueShareLedger.createdAt))
      .limit(50);

    const transactions = ledgerEntries.map((entry) => ({
      id: entry.id,
      type: 'debit' as const,
      amountCents: entry.wholesaleCostCents || 0,
      description: `${entry.eventType} usage - ${entry.quantity} units`,
      createdAt: entry.createdAt?.toISOString() || new Date().toISOString(),
    }));

    // Calculate total recharged (would come from payment records in production)
    const totalRecharged = 0; // TODO: Sum from payment records

    res.json({
      wallet: {
        ...wallet,
        totalRecharged,
      },
      transactions,
    });
  } catch (error) {
    console.error('Wallet fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch wallet' });
  }
});

/**
 * POST /api/agency/wallet/recharge
 * Add funds to wallet
 */
router.post('/wallet/recharge', async (req: any, res) => {
  try {
    const organizationId = req.org?.id;
    if (!organizationId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { amountCents } = req.body;

    if (!amountCents || amountCents < 1000) {
      // Minimum $10
      return res.status(400).json({ error: 'Minimum recharge amount is $10' });
    }

    // TODO: Process payment via Stripe here
    // For now, just update the wallet balance

    const [wallet] = await db
      .select()
      .from(usageWallets)
      .where(eq(usageWallets.organizationId, organizationId))
      .limit(1);

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const newBalance = (wallet.balanceCents || 0) + amountCents;

    await db
      .update(usageWallets)
      .set({
        balanceCents: newBalance,
        lastRechargeAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(usageWallets.id, wallet.id));

    res.json({
      success: true,
      newBalance: newBalance,
      message: 'Wallet recharged successfully',
    });
  } catch (error) {
    console.error('Wallet recharge error:', error);
    res.status(500).json({ error: 'Failed to recharge wallet' });
  }
});

/**
 * POST /api/agency/wallet/auto-recharge
 * Configure auto-recharge settings
 */
router.post('/wallet/auto-recharge', async (req: any, res) => {
  try {
    const organizationId = req.org?.id;
    if (!organizationId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { enabled, thresholdCents, amountCents } = req.body;

    const [wallet] = await db
      .select()
      .from(usageWallets)
      .where(eq(usageWallets.organizationId, organizationId))
      .limit(1);

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    await db
      .update(usageWallets)
      .set({
        autoRechargeEnabled: enabled,
        autoRechargeThresholdCents: thresholdCents,
        autoRechargeAmountCents: amountCents,
        updatedAt: new Date(),
      })
      .where(eq(usageWallets.id, wallet.id));

    res.json({
      success: true,
      message: 'Auto-recharge settings updated',
    });
  } catch (error) {
    console.error('Auto-recharge update error:', error);
    res.status(500).json({ error: 'Failed to update auto-recharge settings' });
  }
});

/**
 * GET /api/agency/pricing
 * Get pricing tier configuration
 */
router.get('/pricing', async (req: any, res) => {
  try {
    const organizationId = req.org?.id;
    if (!organizationId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [tier] = await db
      .select()
      .from(agencyPricingTiers)
      .where(eq(agencyPricingTiers.organizationId, organizationId))
      .limit(1);

    if (!tier) {
      // Create default pricing tier
      const defaultTier = await db
        .insert(agencyPricingTiers)
        .values({
          id: uuidv4(),
          organizationId,
          wholesaleVoicePerMinute: 0.1, // $0.10 per minute
          retailVoicePerMinute: 0.2, // $0.20 per minute (100% markup)
          wholesaleTokensPer1k: 0.02, // $0.02 per 1k tokens
          retailTokensPer1k: 0.04, // $0.04 per 1k tokens (100% markup)
          maxMarkupPercentage: 25.0, // Allow up to 25% markup
        })
        .returning();

      return res.json({ tier: defaultTier[0] });
    }

    res.json({ tier });
  } catch (error) {
    console.error('Pricing fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

/**
 * POST /api/agency/pricing
 * Update pricing tier configuration
 */
router.post('/pricing', async (req: any, res) => {
  try {
    const organizationId = req.org?.id;
    if (!organizationId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { retailVoicePerMinute, retailTokensPer1k } = req.body;

    const [tier] = await db
      .select()
      .from(agencyPricingTiers)
      .where(eq(agencyPricingTiers.organizationId, organizationId))
      .limit(1);

    if (!tier) {
      return res.status(404).json({ error: 'Pricing tier not found' });
    }

    // Validate markup doesn't exceed maximum
    const voiceMarkup =
      ((retailVoicePerMinute - (tier.wholesaleVoicePerMinute || 0)) /
        (tier.wholesaleVoicePerMinute || 1)) *
      100;
    const tokenMarkup =
      ((retailTokensPer1k - (tier.wholesaleTokensPer1k || 0)) /
        (tier.wholesaleTokensPer1k || 1)) *
      100;

    if (
      voiceMarkup > (tier.maxMarkupPercentage || 25) ||
      tokenMarkup > (tier.maxMarkupPercentage || 25)
    ) {
      return res.status(400).json({
        error: `Markup exceeds maximum allowed ${tier.maxMarkupPercentage}%`,
      });
    }

    await db
      .update(agencyPricingTiers)
      .set({
        retailVoicePerMinute,
        retailTokensPer1k,
        updatedAt: new Date(),
      })
      .where(eq(agencyPricingTiers.id, tier.id));

    res.json({
      success: true,
      message: 'Pricing updated successfully',
    });
  } catch (error) {
    console.error('Pricing update error:', error);
    res.status(500).json({ error: 'Failed to update pricing' });
  }
});

/**
 * GET /api/agency/client-usage
 * Get usage breakdown by client
 */
router.get('/client-usage', async (req: any, res) => {
  try {
    const organizationId = req.org?.id;
    if (!organizationId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get aggregated usage by client from revenue share ledger
    const clientUsage = await db
      .select({
        clientOrganizationId: revenueShareLedger.clientOrganizationId,
        totalProfitCents: sql<number>`SUM(${revenueShareLedger.agencyProfitCents})`,
        wholesaleCostCents: sql<number>`SUM(${revenueShareLedger.wholesaleCostCents})`,
        retailChargeCents: sql<number>`SUM(${revenueShareLedger.retailChargeCents})`,
        voiceMinutes: sql<number>`SUM(CASE WHEN ${revenueShareLedger.eventType} = 'voice_minute' THEN ${revenueShareLedger.quantity} ELSE 0 END)`,
        chatTokens: sql<number>`SUM(CASE WHEN ${revenueShareLedger.eventType} = 'chat_token' THEN ${revenueShareLedger.quantity} ELSE 0 END)`,
        lastActivityAt: sql<Date>`MAX(${revenueShareLedger.createdAt})`,
      })
      .from(revenueShareLedger)
      .where(
        and(
          eq(revenueShareLedger.agencyOrganizationId, organizationId),
          sql`${revenueShareLedger.clientOrganizationId} IS NOT NULL`,
        ),
      )
      .groupBy(revenueShareLedger.clientOrganizationId);

    // Get client organization names
    const clientIds = clientUsage
      .map((c) => c.clientOrganizationId)
      .filter(Boolean) as string[];

    const clientOrgs =
      clientIds.length > 0
        ? await db
            .select()
            .from(organizations)
            .where(
              sql`${organizations.id} IN (${sql.join(clientIds, sql`, `)})`,
            )
        : [];

    const orgMap = new Map(clientOrgs.map((org) => [org.id, org.name]));

    const clients = clientUsage.map((usage) => ({
      clientOrganizationId: usage.clientOrganizationId || '',
      clientName:
        orgMap.get(usage.clientOrganizationId || '') || 'Unknown Client',
      voiceMinutes: usage.voiceMinutes || 0,
      chatTokens: usage.chatTokens || 0,
      totalProfitCents: usage.totalProfitCents || 0,
      wholesaleCostCents: usage.wholesaleCostCents || 0,
      retailChargeCents: usage.retailChargeCents || 0,
      lastActivityAt:
        usage.lastActivityAt?.toISOString() || new Date().toISOString(),
    }));

    res.json({ clients });
  } catch (error) {
    console.error('Client usage error:', error);
    res.status(500).json({ error: 'Failed to fetch client usage' });
  }
});

export default router;
