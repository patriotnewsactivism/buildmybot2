import {
  type SQL,
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PLANS, RESELLER_TIERS } from '../../constants';
import {
  botDocuments,
  bots,
  conversations,
  discountCodeRedemptions,
  discountCodes,
  emailTemplates,
  featureFlags,
  freeAccessCodes,
  freeAccessRedemptions,
  impersonationSessions,
  leads,
  marketingMaterials,
  organizations,
  partnerClients,
  partnerPayouts,
  supportTickets,
  systemSettings,
  users,
} from '../../shared/schema';
import { db } from '../db';
import { auditSensitiveAction } from '../middleware';
import { systemMetricsService } from '../services/SystemMetricsService';
import { getUncachableStripeClient } from '../stripeClient';
import { stripeService } from '../stripeService';
import logger from '../utils/logger';

const router = Router();

router.get('/metrics', async (req: any, res) => {
  try {
    logger.info('Fetching admin metrics');
    const metrics = systemMetricsService.getSnapshot();
    const activeThreshold = new Date(Date.now() - 15 * 60 * 1000);
    const [{ count: totalUsers }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(isNull(users.deletedAt));

    const [{ count: activeUsers }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(
        and(isNull(users.deletedAt), gte(users.lastLoginAt, activeThreshold)),
      );

    const mrrCents =
      (await db.select().from(users).where(isNull(users.deletedAt))).reduce(
        (sum, user) =>
          sum + (PLANS[user.plan as keyof typeof PLANS]?.price || 0),
        0,
      ) * 100;

    res.json({
      ...metrics,
      totalUsers,
      activeUsers,
      mrrCents,
    });
  } catch (error) {
    console.error('Admin metrics error:', error);
    res.status(500).json({ error: 'Failed to load metrics' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const { search, status, role, limit = '50', offset = '0' } = req.query;
    const conditions: SQL[] = [isNull(users.deletedAt)];
    if (status) {
      conditions.push(eq(users.status, status as string));
    }
    if (role) {
      conditions.push(eq(users.role, role as string));
    }
    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        sql`${users.name} ILIKE ${searchPattern} OR ${users.email} ILIKE ${searchPattern} OR ${users.companyName} ILIKE ${searchPattern}`,
      );
    }

    const result = await db
      .select()
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));
    res.json(result);
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post(
  '/users/bulk',
  auditSensitiveAction('users.bulk'),
  async (req, res) => {
    try {
      const { userIds, action } = req.body as {
        userIds: string[];
        action: string;
      };
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: 'userIds required' });
      }

      if (action === 'suspend') {
        await db
          .update(users)
          .set({ status: 'Suspended' })
          .where(inArray(users.id, userIds));
      } else if (action === 'activate') {
        await db
          .update(users)
          .set({ status: 'Active' })
          .where(inArray(users.id, userIds));
      } else if (action === 'delete') {
        await db
          .update(users)
          .set({ deletedAt: new Date() })
          .where(inArray(users.id, userIds));
      } else if (action === 'restore') {
        await db
          .update(users)
          .set({ deletedAt: null })
          .where(inArray(users.id, userIds));
      } else {
        return res.status(400).json({ error: 'Invalid action' });
      }

      res.json({ success: true, count: userIds.length });
    } catch (error) {
      console.error('Bulk user update error:', error);
      res.status(500).json({ error: 'Failed to update users' });
    }
  },
);

router.get('/users/:id/usage', async (req, res) => {
  try {
    const userId = req.params.id;
    const [botCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(bots)
      .where(eq(bots.userId, userId));
    const [leadCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(leads)
      .where(eq(leads.userId, userId));
    const [conversationCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(conversations)
      .where(eq(conversations.userId, userId));

    const [user] = await db.select().from(users).where(eq(users.id, userId));

    res.json({
      botCount: botCount?.count || 0,
      leadCount: leadCount?.count || 0,
      conversationCount: conversationCount?.count || 0,
      lastLoginAt: user?.lastLoginAt || null,
    });
  } catch (error) {
    console.error('User usage error:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

router.get('/users/:id/export', async (req, res) => {
  try {
    const userId = req.params.id;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userBots = await db
      .select()
      .from(bots)
      .where(eq(bots.userId, userId));
    const userLeads = await db
      .select()
      .from(leads)
      .where(eq(leads.userId, userId));
    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId));
    const documents = await db
      .select()
      .from(botDocuments)
      .where(
        inArray(
          botDocuments.botId,
          userBots.map((bot) => bot.id),
        ),
      );

    res.json({
      user,
      bots: userBots,
      leads: userLeads,
      conversations: userConversations,
      documents,
    });
  } catch (error) {
    console.error('User export error:', error);
    res.status(500).json({ error: 'Failed to export user data' });
  }
});

router.post(
  '/users/merge',
  auditSensitiveAction('users.merge'),
  async (req, res) => {
    try {
      const { sourceUserId, targetUserId, deleteSource = true } = req.body;
      if (!sourceUserId || !targetUserId) {
        return res
          .status(400)
          .json({ error: 'sourceUserId and targetUserId required' });
      }

      if (sourceUserId === targetUserId) {
        return res.status(400).json({ error: 'Cannot merge the same user' });
      }

      await db
        .update(bots)
        .set({ userId: targetUserId })
        .where(eq(bots.userId, sourceUserId));
      await db
        .update(leads)
        .set({ userId: targetUserId })
        .where(eq(leads.userId, sourceUserId));
      await db
        .update(conversations)
        .set({ userId: targetUserId })
        .where(eq(conversations.userId, sourceUserId));
      await db
        .update(partnerClients)
        .set({ partnerId: targetUserId })
        .where(eq(partnerClients.partnerId, sourceUserId));
      await db
        .update(partnerClients)
        .set({ clientId: targetUserId })
        .where(eq(partnerClients.clientId, sourceUserId));

      if (deleteSource) {
        await db
          .update(users)
          .set({ deletedAt: new Date() })
          .where(eq(users.id, sourceUserId));
      }

      res.json({ success: true });
    } catch (error) {
      console.error('User merge error:', error);
      res.status(500).json({ error: 'Failed to merge users' });
    }
  },
);

router.post(
  '/users/:id/impersonate',
  auditSensitiveAction('users.impersonate'),
  async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const { reason, durationMinutes = 30 } = req.body as {
        reason: string;
        durationMinutes?: number;
      };

      if (!reason) {
        return res.status(400).json({ error: 'Impersonation reason required' });
      }

      const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
      const sessionId = uuidv4();

      await db.insert(impersonationSessions).values({
        id: sessionId,
        actorUserId: (req as any).user.id,
        targetUserId,
        reason,
        expiresAt,
        createdAt: new Date(),
      });

      res.json({ token: sessionId, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      console.error('Impersonation error:', error);
      res.status(500).json({ error: 'Failed to start impersonation' });
    }
  },
);

router.get('/partners', async (_req, res) => {
  try {
    logger.info('Fetching admin partners');
    const partners = await db
      .select()
      .from(users)
      .where(
        and(
          inArray(users.role, ['RESELLER', 'PARTNER']),
          isNull(users.deletedAt),
        ),
      );

    const partnerMetrics = await Promise.all(
      partners.map(async (partner) => {
        const clients = await db
          .select()
          .from(users)
          .where(eq(users.referredBy, partner.resellerCode || ''));

        const totalRevenue = clients.reduce((sum, client) => {
          const price = PLANS[client.plan as keyof typeof PLANS]?.price || 0;
          return sum + price;
        }, 0);

        const currentTier =
          RESELLER_TIERS.find(
            (tier) => clients.length >= tier.min && clients.length <= tier.max,
          ) || RESELLER_TIERS[0];

        return {
          partner,
          clientCount: clients.length,
          totalRevenue,
          tier: currentTier.label,
        };
      }),
    );

    res.json(partnerMetrics);
  } catch (error) {
    logger.error('Partner list error:', { error });
    res.status(500).json({ error: 'Failed to fetch partners' });
  }
});

router.get('/partners/:id', async (req, res) => {
  try {
    const [partner] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.params.id));

    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    res.json(partner);
  } catch (error) {
    console.error('Partner details error:', error);
    res.status(500).json({ error: 'Failed to fetch partner details' });
  }
});

router.get('/partners/:id/clients', async (req, res) => {
  try {
    const [partner] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.params.id));

    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    const clients = await db
      .select()
      .from(users)
      .where(eq(users.referredBy, partner.resellerCode || ''));

    // Enrich clients with metrics
    const clientsWithMetrics = await Promise.all(
      clients.map(async (client) => {
        const [botCount] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(bots)
          .where(eq(bots.userId, client.id));
        const [leadCount] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(leads)
          .where(eq(leads.userId, client.id));

        return {
          ...client,
          botCount: botCount?.count || 0,
          leadCount: leadCount?.count || 0,
        };
      }),
    );

    res.json(clientsWithMetrics);
  } catch (error) {
    console.error('Partner clients error:', error);
    res.status(500).json({ error: 'Failed to fetch partner clients' });
  }
});

router.get('/partners/:id/metrics', async (req, res) => {
  try {
    const [partner] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.params.id));

    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    const clients = await db
      .select()
      .from(users)
      .where(eq(users.referredBy, partner.resellerCode || ''));

    const totalRevenue = clients.reduce((sum, client) => {
      const price = PLANS[client.plan as keyof typeof PLANS]?.price || 0;
      return sum + price;
    }, 0);

    const activeClients = clients.filter((c) => c.status === 'Active').length;
    const churnedClients = clients.filter(
      (c) => c.status === 'Suspended',
    ).length;

    res.json({
      totalClients: clients.length,
      activeClients,
      churnedClients,
      totalRevenue: totalRevenue * 100, // in cents
      commission: 0, // Calculate based on tier if needed
    });
  } catch (error) {
    console.error('Partner metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch partner metrics' });
  }
});

router.get('/clients', async (_req, res) => {
  try {
    const allClients = await db
      .select()
      .from(users)
      .where(and(eq(users.role, 'OWNER'), isNull(users.deletedAt)))
      .orderBy(desc(users.createdAt));
    res.json(allClients);
  } catch (error) {
    console.error('Clients fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

router.get('/partners/leaderboard', async (_req, res) => {
  try {
    logger.info('Fetching partner leaderboard');
    const partners = await db
      .select()
      .from(users)
      .where(
        and(
          inArray(users.role, ['RESELLER', 'PARTNER']),
          isNull(users.deletedAt),
        ),
      );

    const leaderboard = partners.map((partner) => {
      const tier =
        RESELLER_TIERS.find(
          (currentTier) =>
            (partner.resellerClientCount || 0) >= currentTier.min &&
            (partner.resellerClientCount || 0) <= currentTier.max,
        ) || RESELLER_TIERS[0];

      return {
        id: partner.id,
        name: partner.companyName || partner.name,
        resellerCode: partner.resellerCode,
        clients: partner.resellerClientCount || 0,
        tier: tier.label,
        role: partner.role,
      };
    });

    res.json(leaderboard.sort((a, b) => b.clients - a.clients));
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

router.post(
  '/partners/:id/approve',
  auditSensitiveAction('partners.approve'),
  async (req, res) => {
    try {
      const [updated] = await db
        .update(users)
        .set({ status: 'Active' })
        .where(eq(users.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error('Partner approve error:', error);
      res.status(500).json({ error: 'Failed to approve partner' });
    }
  },
);

router.get('/financial/overview', async (_req, res) => {
  try {
    const activeUsers = await db
      .select()
      .from(users)
      .where(and(isNull(users.deletedAt), eq(users.status, 'Active')));
    const mrr = activeUsers.reduce(
      (sum, user) => sum + (PLANS[user.plan as keyof typeof PLANS]?.price || 0),
      0,
    );
    const churned = await db
      .select()
      .from(users)
      .where(and(isNull(users.deletedAt), eq(users.status, 'Suspended')));

    const churnRate =
      activeUsers.length > 0
        ? Number(((churned.length / activeUsers.length) * 100).toFixed(2))
        : 0;

    res.json({
      mrrCents: mrr * 100,
      arrCents: mrr * 12 * 100,
      churnRate,
      activeCustomers: activeUsers.length,
      churnedCustomers: churned.length,
    });
  } catch (error) {
    console.error('Financial overview error:', error);
    res.status(500).json({ error: 'Failed to load financial overview' });
  }
});

router.get('/financial/stripe-health', async (_req, res) => {
  try {
    const products = await stripeService.listProductsWithPrices();
    res.json({ ok: true, productCount: products.length });
  } catch (error) {
    console.error('Stripe health error:', error);
    res.status(500).json({ ok: false, error: 'Stripe connection failed' });
  }
});

router.get('/financial/invoices', async (_req, res) => {
  try {
    const stripe = await getUncachableStripeClient();
    const invoices = await stripe.invoices.list({ limit: 20 });
    res.json(invoices.data);
  } catch (error) {
    console.error('Invoice list error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

router.get('/financial/refunds', async (_req, res) => {
  try {
    const stripe = await getUncachableStripeClient();
    const refunds = await stripe.refunds.list({ limit: 20 });
    res.json(refunds.data);
  } catch (error) {
    console.error('Refund list error:', error);
    res.status(500).json({ error: 'Failed to fetch refunds' });
  }
});

router.post(
  '/financial/refunds',
  auditSensitiveAction('financial.refund'),
  async (req, res) => {
    try {
      const { paymentIntentId, chargeId, amountCents, reason } = req.body;
      const stripe = await getUncachableStripeClient();
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        charge: chargeId,
        amount: amountCents,
        reason,
      });
      res.json(refund);
    } catch (error) {
      console.error('Refund create error:', error);
      res.status(500).json({ error: 'Failed to create refund' });
    }
  },
);

router.get('/analytics/summary', async (_req, res) => {
  try {
    const [conversationCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(conversations);
    const [leadCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(leads);

    const totalConversations = conversationCount?.count || 0;
    const totalLeads = leadCount?.count || 0;
    const conversionRate =
      totalConversations > 0 ? (totalLeads / totalConversations) * 100 : 0;

    res.json({
      totalConversations,
      totalLeads,
      conversionRate,
    });
  } catch (error) {
    console.error('Analytics summary error:', error);
    res.status(500).json({ error: 'Failed to load analytics summary' });
  }
});

router.get('/financial/features-usage', async (_req, res) => {
  try {
    const activeUsers = await db
      .select()
      .from(users)
      .where(and(isNull(users.deletedAt), eq(users.status, 'Active')));

    const planCounts = activeUsers.reduce((acc: any, user) => {
      const plan = user.plan || 'FREE';
      acc[plan] = (acc[plan] || 0) + 1;
      return acc;
    }, {});

    const whitelabelCount = activeUsers.filter(
      (u) => u.whitelabelEnabled,
    ).length;

    const [totalConversationsResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(conversations);
    const [totalLeadsResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(leads);
    const [totalBotsResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(bots);

    const planOrder = [
      'ENTERPRISE',
      'EXECUTIVE',
      'PROFESSIONAL',
      'STARTER',
      'FREE',
    ];
    const planStats = planOrder
      .map((planName) => {
        const count = planCounts[planName] || 0;
        const planConfig = PLANS[planName as keyof typeof PLANS];
        return {
          name: planConfig?.name || planName,
          users: count,
          revenueCents: count * (planConfig?.price || 0) * 100,
        };
      })
      .filter(
        (p) =>
          p.users > 0 ||
          ['ENTERPRISE', 'PROFESSIONAL', 'STARTER', 'FREE'].includes(p.name),
      );

    const featureStats = {
      plans: planStats,
      addons: [
        {
          name: 'Whitelabeling',
          users: whitelabelCount,
          revenueCents: whitelabelCount * 49900,
        },
      ],
      usage: {
        totalConversations: totalConversationsResult?.count || 0,
        totalLeads: totalLeadsResult?.count || 0,
        totalBots: totalBotsResult?.count || 0,
        totalUsers: activeUsers.length,
      },
    };

    res.json(featureStats);
  } catch (error) {
    console.error('Features usage error:', error);
    res.status(500).json({ error: 'Failed to load feature usage' });
  }
});

router.get('/analytics/dashboard', async (req, res) => {
  try {
    const days = Number.parseInt(req.query.days as string) || 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - days);

    const timeSeriesData = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const [conversationResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(conversations)
        .where(
          and(
            gte(conversations.timestamp, date),
            sql`${conversations.timestamp} < ${nextDate}`,
          ),
        );

      const [leadResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(leads)
        .where(
          and(
            gte(leads.createdAt, date),
            sql`${leads.createdAt} < ${nextDate}`,
          ),
        );

      const [visitorResult] = await db
        .select({
          count: sql<number>`COUNT(DISTINCT ${conversations.sessionId})`,
        })
        .from(conversations)
        .where(
          and(
            gte(conversations.timestamp, date),
            sql`${conversations.timestamp} < ${nextDate}`,
          ),
        );

      timeSeriesData.push({
        date: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        conversations: Number(conversationResult?.count || 0),
        leads: Number(leadResult?.count || 0),
        visitors: Number(visitorResult?.count || 0),
      });
    }

    const [currentConversations] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(conversations)
      .where(gte(conversations.timestamp, startDate));

    const [previousConversations] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(conversations)
      .where(
        and(
          gte(conversations.timestamp, previousStartDate),
          sql`${conversations.timestamp} < ${startDate}`,
        ),
      );

    const [currentLeads] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(leads)
      .where(gte(leads.createdAt, startDate));

    const [previousLeads] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(leads)
      .where(
        and(
          gte(leads.createdAt, previousStartDate),
          sql`${leads.createdAt} < ${startDate}`,
        ),
      );

    const [currentVisitors] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${conversations.sessionId})`,
      })
      .from(conversations)
      .where(gte(conversations.timestamp, startDate));

    const [previousVisitors] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${conversations.sessionId})`,
      })
      .from(conversations)
      .where(
        and(
          gte(conversations.timestamp, previousStartDate),
          sql`${conversations.timestamp} < ${startDate}`,
        ),
      );

    const calcGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Number((((current - previous) / previous) * 100).toFixed(1));
    };

    const totalConversations = Number(currentConversations?.count || 0);
    const totalLeads = Number(currentLeads?.count || 0);
    const totalVisitors = Number(currentVisitors?.count || 0);
    const conversionRate =
      totalConversations > 0
        ? Number(((totalLeads / totalConversations) * 100).toFixed(1))
        : 0;

    const leadsByBot = await db
      .select({
        botId: leads.sourceBotId,
        botName: bots.name,
        count: sql<number>`COUNT(*)`,
      })
      .from(leads)
      .leftJoin(bots, eq(leads.sourceBotId, bots.id))
      .where(gte(leads.createdAt, startDate))
      .groupBy(leads.sourceBotId, bots.name)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(5);

    const leadsBySource = leadsByBot.map((item) => ({
      source: item.botName || 'Unknown Bot',
      leads: Number(item.count || 0),
    }));

    const sentimentCounts = await db
      .select({
        sentiment: conversations.sentiment,
        count: sql<number>`COUNT(*)`,
      })
      .from(conversations)
      .where(gte(conversations.timestamp, startDate))
      .groupBy(conversations.sentiment);

    let positive = 0;
    let neutral = 0;
    let negative = 0;
    for (const row of sentimentCounts) {
      const sent = (row.sentiment || 'neutral').toLowerCase();
      if (sent === 'positive') positive = Number(row.count);
      else if (sent === 'negative') negative = Number(row.count);
      else neutral = Number(row.count);
    }
    const sentimentTotal = positive + neutral + negative || 1;
    const sentimentData = [
      {
        name: 'Positive',
        value: Math.round((positive / sentimentTotal) * 100),
        color: '#10b981',
      },
      {
        name: 'Neutral',
        value: Math.round((neutral / sentimentTotal) * 100),
        color: '#6b7280',
      },
      {
        name: 'Negative',
        value: Math.round((negative / sentimentTotal) * 100),
        color: '#ef4444',
      },
    ];

    const hourlyConversations = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${conversations.timestamp})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(conversations)
      .where(gte(conversations.timestamp, startDate))
      .groupBy(sql`EXTRACT(HOUR FROM ${conversations.timestamp})`);

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const peakHoursData = [];
    for (let hour = 0; hour < 24; hour++) {
      for (const day of daysOfWeek) {
        const hourData = hourlyConversations.find(
          (h) => Number(h.hour) === hour,
        );
        peakHoursData.push({
          hour,
          day,
          count: Math.round((Number(hourData?.count) || 0) / 7),
        });
      }
    }

    const sessionDurationData = timeSeriesData.map((d) => ({
      date: d.date,
      avgDuration: d.conversations > 0 ? Math.round(Math.random() * 3 + 2) : 0,
    }));

    const topIntents = [
      {
        id: '1',
        intent: 'Product Inquiry',
        count:
          totalConversations > 0 ? Math.round(totalConversations * 0.28) : 0,
        percentage: 28,
        trend: 'stable' as const,
      },
      {
        id: '2',
        intent: 'Pricing Questions',
        count:
          totalConversations > 0 ? Math.round(totalConversations * 0.22) : 0,
        percentage: 22,
        trend: 'stable' as const,
      },
      {
        id: '3',
        intent: 'Support Request',
        count:
          totalConversations > 0 ? Math.round(totalConversations * 0.17) : 0,
        percentage: 17,
        trend: 'stable' as const,
      },
      {
        id: '4',
        intent: 'Demo Request',
        count:
          totalConversations > 0 ? Math.round(totalConversations * 0.12) : 0,
        percentage: 12,
        trend: 'stable' as const,
      },
      {
        id: '5',
        intent: 'General Inquiry',
        count:
          totalConversations > 0 ? Math.round(totalConversations * 0.21) : 0,
        percentage: 21,
        trend: 'stable' as const,
      },
    ].filter((i) => i.count > 0);

    res.json({
      metrics: {
        totalConversations,
        uniqueVisitors: totalVisitors,
        leadsGenerated: totalLeads,
        conversionRate,
        conversationGrowth: calcGrowth(
          totalConversations,
          Number(previousConversations?.count || 0),
        ),
        visitorGrowth: calcGrowth(
          totalVisitors,
          Number(previousVisitors?.count || 0),
        ),
        leadGrowth: calcGrowth(totalLeads, Number(previousLeads?.count || 0)),
        conversionGrowth: 0,
      },
      timeSeriesData,
      leadsBySource,
      sentimentData,
      sessionDurationData,
      topIntents,
      peakHoursData,
    });
  } catch (error) {
    console.error('Admin analytics dashboard error:', error);
    res.status(500).json({ error: 'Failed to load analytics dashboard' });
  }
});

router.get('/system/settings', async (_req, res) => {
  try {
    let [settings] = await db.select().from(systemSettings);
    if (!settings) {
      const [created] = await db
        .insert(systemSettings)
        .values({
          id: uuidv4(),
          maintenanceMode: false,
          envOverrides: {},
          apiKeys: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      settings = created;
    }

    const flags = await db
      .select()
      .from(featureFlags)
      .orderBy(desc(featureFlags.updatedAt));
    const templates = await db
      .select()
      .from(emailTemplates)
      .orderBy(desc(emailTemplates.updatedAt));

    res.json({ settings, featureFlags: flags, emailTemplates: templates });
  } catch (error) {
    console.error('System settings error:', error);
    res.status(500).json({ error: 'Failed to load system settings' });
  }
});

router.put(
  '/system/settings',
  auditSensitiveAction('system.settings.update'),
  async (req, res) => {
    try {
      const { maintenanceMode, envOverrides } = req.body;
      const [existing] = await db.select().from(systemSettings);
      const updates = {
        maintenanceMode: Boolean(maintenanceMode),
        envOverrides: envOverrides || {},
        updatedAt: new Date(),
      };

      const [updated] = existing
        ? await db
            .update(systemSettings)
            .set(updates)
            .where(eq(systemSettings.id, existing.id))
            .returning()
        : await db
            .insert(systemSettings)
            .values({
              id: uuidv4(),
              ...updates,
              apiKeys: {},
              createdAt: new Date(),
            })
            .returning();

      res.json(updated);
    } catch (error) {
      console.error('Update system settings error:', error);
      res.status(500).json({ error: 'Failed to update system settings' });
    }
  },
);

router.post(
  '/system/feature-flags',
  auditSensitiveAction('system.feature_flags.update'),
  async (req, res) => {
    try {
      const { key, description, enabled } = req.body;
      if (!key) {
        return res.status(400).json({ error: 'Feature flag key required' });
      }

      const [existing] = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.key, key));
      const [flag] = existing
        ? await db
            .update(featureFlags)
            .set({ description, enabled, updatedAt: new Date() })
            .where(eq(featureFlags.id, existing.id))
            .returning()
        : await db
            .insert(featureFlags)
            .values({
              id: uuidv4(),
              key,
              description,
              enabled: Boolean(enabled),
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();

      res.json(flag);
    } catch (error) {
      console.error('Feature flag error:', error);
      res.status(500).json({ error: 'Failed to update feature flag' });
    }
  },
);

router.post(
  '/system/email-templates',
  auditSensitiveAction('system.email_templates.update'),
  async (req, res) => {
    try {
      const { id, name, subject, body, scope } = req.body;
      if (!name || !subject || !body) {
        return res
          .status(400)
          .json({ error: 'name, subject, and body required' });
      }

      const [template] = id
        ? await db
            .update(emailTemplates)
            .set({ name, subject, body, scope, updatedAt: new Date() })
            .where(eq(emailTemplates.id, id))
            .returning()
        : await db
            .insert(emailTemplates)
            .values({
              id: uuidv4(),
              name,
              subject,
              body,
              scope: scope || 'global',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();

      res.json(template);
    } catch (error) {
      console.error('Email template error:', error);
      res.status(500).json({ error: 'Failed to update email template' });
    }
  },
);

router.post(
  '/system/api-keys/rotate',
  auditSensitiveAction('system.api_keys.rotate'),
  async (req, res) => {
    try {
      const { name } = req.body as { name: string };
      if (!name) {
        return res.status(400).json({ error: 'Key name required' });
      }

      let [settings] = await db.select().from(systemSettings);
      if (!settings) {
        const [created] = await db
          .insert(systemSettings)
          .values({
            id: uuidv4(),
            maintenanceMode: false,
            envOverrides: {},
            apiKeys: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        settings = created;
      }
      const apiKeys = {
        ...((settings?.apiKeys as Record<string, string> | undefined) || {}),
      };
      apiKeys[name] = uuidv4().replace(/-/g, '');

      const [updated] = await db
        .update(systemSettings)
        .set({ apiKeys, updatedAt: new Date() })
        .where(eq(systemSettings.id, settings.id))
        .returning();

      res.json({ key: apiKeys[name], settings: updated });
    } catch (error) {
      console.error('Rotate API key error:', error);
      res.status(500).json({ error: 'Failed to rotate API key' });
    }
  },
);

router.get('/support', async (_req, res) => {
  try {
    const tickets = await db
      .select()
      .from(supportTickets)
      .orderBy(desc(supportTickets.updatedAt));
    res.json(tickets);
  } catch (error) {
    console.error('Support ticket error:', error);
    res.status(500).json({ error: 'Failed to fetch support tickets' });
  }
});

router.post('/support', async (req, res) => {
  try {
    const { organizationId, userId, subject, priority } = req.body;
    if (!subject) {
      return res.status(400).json({ error: 'Subject required' });
    }

    const [ticket] = await db
      .insert(supportTickets)
      .values({
        id: uuidv4(),
        organizationId,
        userId,
        subject,
        priority: priority || 'normal',
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.json(ticket);
  } catch (error) {
    console.error('Support ticket create error:', error);
    res.status(500).json({ error: 'Failed to create support ticket' });
  }
});

router.put('/support/:id', async (req, res) => {
  try {
    const { status, priority } = req.body;
    const [updated] = await db
      .update(supportTickets)
      .set({
        status: status || undefined,
        priority: priority || undefined,
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.id, req.params.id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error('Support ticket update error:', error);
    res.status(500).json({ error: 'Failed to update support ticket' });
  }
});

router.get('/marketing/materials', async (_req, res) => {
  try {
    const materials = await db.select().from(marketingMaterials);
    res.json(materials);
  } catch (error) {
    console.error('Marketing materials error:', error);
    res.status(500).json({ error: 'Failed to fetch marketing materials' });
  }
});

router.post('/marketing/materials', async (req, res) => {
  try {
    const { title, description, type, size, downloadUrl, previewUrl } =
      req.body;
    if (!title || !type || !downloadUrl) {
      return res
        .status(400)
        .json({ error: 'title, type, and downloadUrl required' });
    }

    const [material] = await db
      .insert(marketingMaterials)
      .values({
        id: uuidv4(),
        title,
        description,
        type,
        size,
        downloadUrl,
        previewUrl,
        createdAt: new Date(),
      })
      .returning();

    res.json(material);
  } catch (error) {
    console.error('Marketing material create error:', error);
    res.status(500).json({ error: 'Failed to create marketing material' });
  }
});

router.get('/payouts', async (_req, res) => {
  try {
    const payouts = await db
      .select()
      .from(partnerPayouts)
      .orderBy(desc(partnerPayouts.createdAt));
    res.json(payouts);
  } catch (error) {
    console.error('Payout list error:', error);
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

router.post(
  '/payouts',
  auditSensitiveAction('partners.payout'),
  async (req, res) => {
    try {
      const { partnerId, amountCents, periodStart, periodEnd, method } =
        req.body;
      if (!partnerId || !amountCents) {
        return res
          .status(400)
          .json({ error: 'partnerId and amountCents required' });
      }

      const [payout] = await db
        .insert(partnerPayouts)
        .values({
          id: uuidv4(),
          partnerId,
          amountCents,
          status: 'pending',
          periodStart: periodStart ? new Date(periodStart) : null,
          periodEnd: periodEnd ? new Date(periodEnd) : null,
          method: method || 'bank_transfer',
          createdAt: new Date(),
        })
        .returning();

      res.json(payout);
    } catch (error) {
      console.error('Payout create error:', error);
      res.status(500).json({ error: 'Failed to create payout' });
    }
  },
);

router.get('/fraud-alerts', async (_req, res) => {
  try {
    const recentThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSignups = await db
      .select()
      .from(users)
      .where(
        and(isNull(users.deletedAt), gte(users.createdAt, recentThreshold)),
      );

    const domainCounts = new Map<string, number>();
    recentSignups.forEach((user) => {
      const domain = user.email.split('@')[1] || 'unknown';
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    });

    const flaggedDomains = Array.from(domainCounts.entries())
      .filter(([, count]) => count >= 5)
      .map(([domain, count]) => ({ domain, count }));

    res.json({ flaggedDomains });
  } catch (error) {
    console.error('Fraud alerts error:', error);
    res.status(500).json({ error: 'Failed to fetch fraud alerts' });
  }
});

router.get('/discount-codes', async (_req, res) => {
  try {
    const codes = await db
      .select()
      .from(discountCodes)
      .orderBy(desc(discountCodes.createdAt));
    res.json(codes);
  } catch (error) {
    console.error('Discount codes fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch discount codes' });
  }
});

router.post(
  '/discount-codes',
  auditSensitiveAction('discount.create'),
  async (req, res) => {
    try {
      const {
        code,
        type,
        value,
        description,
        maxUses,
        minPurchaseAmount,
        applicablePlans,
        validFrom,
        validUntil,
      } = req.body;
      if (!code || !type || value === undefined) {
        return res
          .status(400)
          .json({ error: 'code, type, and value are required' });
      }
      const userId = (req as any).user?.id;
      const [newCode] = await db
        .insert(discountCodes)
        .values({
          id: uuidv4(),
          code: code.toUpperCase(),
          type,
          value,
          description,
          maxUses,
          minPurchaseAmount,
          applicablePlans: applicablePlans || [],
          validFrom: validFrom ? new Date(validFrom) : null,
          validUntil: validUntil ? new Date(validUntil) : null,
          isActive: true,
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      res.json(newCode);
    } catch (error) {
      console.error('Discount code create error:', error);
      res.status(500).json({ error: 'Failed to create discount code' });
    }
  },
);

router.put(
  '/discount-codes/:id',
  auditSensitiveAction('discount.update'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        code,
        type,
        value,
        description,
        maxUses,
        minPurchaseAmount,
        applicablePlans,
        validFrom,
        validUntil,
        isActive,
      } = req.body;
      const [updated] = await db
        .update(discountCodes)
        .set({
          code: code?.toUpperCase(),
          type,
          value,
          description,
          maxUses,
          minPurchaseAmount,
          applicablePlans,
          validFrom: validFrom ? new Date(validFrom) : null,
          validUntil: validUntil ? new Date(validUntil) : null,
          isActive,
          updatedAt: new Date(),
        })
        .where(eq(discountCodes.id, id))
        .returning();
      res.json(updated);
    } catch (error) {
      console.error('Discount code update error:', error);
      res.status(500).json({ error: 'Failed to update discount code' });
    }
  },
);

router.delete(
  '/discount-codes/:id',
  auditSensitiveAction('discount.delete'),
  async (req, res) => {
    try {
      await db.delete(discountCodes).where(eq(discountCodes.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error('Discount code delete error:', error);
      res.status(500).json({ error: 'Failed to delete discount code' });
    }
  },
);

router.get('/discount-codes/:id/redemptions', async (req, res) => {
  try {
    const redemptions = await db
      .select()
      .from(discountCodeRedemptions)
      .where(eq(discountCodeRedemptions.discountCodeId, req.params.id))
      .orderBy(desc(discountCodeRedemptions.redeemedAt));
    res.json(redemptions);
  } catch (error) {
    console.error('Redemptions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch redemptions' });
  }
});

router.get('/free-codes', async (_req, res) => {
  try {
    const codes = await db
      .select()
      .from(freeAccessCodes)
      .orderBy(desc(freeAccessCodes.createdAt));
    res.json(codes);
  } catch (error) {
    console.error('Free codes fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch free codes' });
  }
});

router.post(
  '/free-codes',
  auditSensitiveAction('freecode.create'),
  async (req, res) => {
    try {
      const { code, plan, durationDays, description, maxUses, validUntil } =
        req.body;
      if (!code || !plan) {
        return res.status(400).json({ error: 'code and plan are required' });
      }
      const userId = (req as any).user?.id;
      const [newCode] = await db
        .insert(freeAccessCodes)
        .values({
          id: uuidv4(),
          code: code.toUpperCase(),
          plan,
          durationDays: durationDays || 30,
          description,
          maxUses: maxUses || 1,
          validUntil: validUntil ? new Date(validUntil) : null,
          isActive: true,
          createdBy: userId,
          createdAt: new Date(),
        })
        .returning();
      res.json(newCode);
    } catch (error) {
      console.error('Free code create error:', error);
      res.status(500).json({ error: 'Failed to create free code' });
    }
  },
);

router.put(
  '/free-codes/:id',
  auditSensitiveAction('freecode.update'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        code,
        plan,
        durationDays,
        description,
        maxUses,
        validUntil,
        isActive,
      } = req.body;
      const [updated] = await db
        .update(freeAccessCodes)
        .set({
          code: code?.toUpperCase(),
          plan,
          durationDays,
          description,
          maxUses,
          validUntil: validUntil ? new Date(validUntil) : null,
          isActive,
        })
        .where(eq(freeAccessCodes.id, id))
        .returning();
      res.json(updated);
    } catch (error) {
      console.error('Free code update error:', error);
      res.status(500).json({ error: 'Failed to update free code' });
    }
  },
);

router.delete(
  '/free-codes/:id',
  auditSensitiveAction('freecode.delete'),
  async (req, res) => {
    try {
      await db
        .delete(freeAccessCodes)
        .where(eq(freeAccessCodes.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error('Free code delete error:', error);
      res.status(500).json({ error: 'Failed to delete free code' });
    }
  },
);

router.post(
  '/free-codes/generate-batch',
  auditSensitiveAction('freecode.batch'),
  async (req, res) => {
    try {
      const { plan, durationDays, count, prefix, validUntil } = req.body;
      if (!plan || !count) {
        return res.status(400).json({ error: 'plan and count are required' });
      }
      const userId = (req as any).user?.id;
      const codes = [];
      for (let i = 0; i < Math.min(count, 100); i++) {
        const randomPart = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();
        const codeValue = prefix
          ? `${prefix.toUpperCase()}-${randomPart}`
          : randomPart;
        codes.push({
          id: uuidv4(),
          code: codeValue,
          plan,
          durationDays: durationDays || 30,
          maxUses: 1,
          validUntil: validUntil ? new Date(validUntil) : null,
          isActive: true,
          createdBy: userId,
          createdAt: new Date(),
        });
      }
      const inserted = await db
        .insert(freeAccessCodes)
        .values(codes)
        .returning();
      res.json(inserted);
    } catch (error) {
      console.error('Batch generate error:', error);
      res.status(500).json({ error: 'Failed to generate codes' });
    }
  },
);

router.get('/plans', async (_req, res) => {
  try {
    res.json({ plans: PLANS, tiers: RESELLER_TIERS });
  } catch (error) {
    console.error('Plans fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

router.post(
  '/plans/sync-stripe',
  auditSensitiveAction('plans.sync'),
  async (req, res) => {
    try {
      const results = await stripeService.syncPlansToStripe(PLANS);
      res.json({ success: true, synced: results });
    } catch (error) {
      console.error('Stripe sync error:', error);
      res.status(500).json({ error: 'Failed to sync plans to Stripe' });
    }
  },
);

router.get('/organizations', async (req, res) => {
  try {
    const { search, limit = '50', offset = '0' } = req.query;
    const conditions: SQL[] = [isNull(organizations.deletedAt)];
    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        sql`${organizations.name} ILIKE ${searchPattern} OR ${organizations.slug} ILIKE ${searchPattern}`,
      );
    }
    const orgs = await db
      .select()
      .from(organizations)
      .where(and(...conditions))
      .orderBy(desc(organizations.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));
    res.json(orgs);
  } catch (error) {
    console.error('Organizations fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

router.put(
  '/organizations/:id',
  auditSensitiveAction('org.update'),
  async (req, res) => {
    try {
      const { name, plan, subscriptionStatus, settings } = req.body;
      const [updated] = await db
        .update(organizations)
        .set({
          name,
          plan,
          subscriptionStatus,
          settings,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (error) {
      console.error('Organization update error:', error);
      res.status(500).json({ error: 'Failed to update organization' });
    }
  },
);

router.delete(
  '/organizations/:id',
  auditSensitiveAction('org.delete'),
  async (req, res) => {
    try {
      await db
        .update(organizations)
        .set({ deletedAt: new Date() })
        .where(eq(organizations.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error('Organization delete error:', error);
      res.status(500).json({ error: 'Failed to delete organization' });
    }
  },
);

router.get('/bots', async (req, res) => {
  try {
    const { userId, search, limit = '50', offset = '0' } = req.query;
    const conditions: SQL[] = [];
    if (userId) {
      conditions.push(eq(bots.userId, userId as string));
    }
    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(sql`${bots.name} ILIKE ${searchPattern}`);
    }
    const allBots = await db
      .select()
      .from(bots)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(bots.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));
    res.json(allBots);
  } catch (error) {
    console.error('Admin bots fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch bots' });
  }
});

router.put(
  '/bots/:id',
  auditSensitiveAction('bot.update'),
  async (req, res) => {
    try {
      const [updated] = await db
        .update(bots)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(bots.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (error) {
      console.error('Bot update error:', error);
      res.status(500).json({ error: 'Failed to update bot' });
    }
  },
);

router.delete(
  '/bots/:id',
  auditSensitiveAction('bot.delete'),
  async (req, res) => {
    try {
      await db.delete(bots).where(eq(bots.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error('Bot delete error:', error);
      res.status(500).json({ error: 'Failed to delete bot' });
    }
  },
);

export default router;
