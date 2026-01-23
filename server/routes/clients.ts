import { type SQL, and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  analyticsEvents,
  bots,
  conversations,
  leads,
  users,
} from '../../shared/schema';
import { db } from '../db';
import { AnalyticsService } from '../services/AnalyticsService';

const router = Router();
const analyticsService = new AnalyticsService();

router.get('/overview', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const organizationId = user.organizationId;
    const [botCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(bots)
      .where(
        organizationId
          ? eq(bots.organizationId, organizationId)
          : eq(bots.userId, user.id),
      );

    const [leadCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(leads)
      .where(
        organizationId
          ? eq(leads.organizationId, organizationId)
          : eq(leads.userId, user.id),
      );

    const conversion = organizationId
      ? await analyticsService.getConversionMetrics(organizationId)
      : {
          totalConversations: 0,
          totalLeads: leadCount?.count || 0,
          conversionRate: 0,
          averageScore: 0,
        };

    const recentBots = await db
      .select()
      .from(bots)
      .where(
        organizationId
          ? eq(bots.organizationId, organizationId)
          : eq(bots.userId, user.id),
      )
      .orderBy(desc(bots.createdAt))
      .limit(6);

    const recentLeads = await db
      .select()
      .from(leads)
      .where(
        organizationId
          ? eq(leads.organizationId, organizationId)
          : eq(leads.userId, user.id),
      )
      .orderBy(desc(leads.createdAt))
      .limit(10);

    res.json({
      stats: {
        botCount: botCount?.count || 0,
        leadCount: leadCount?.count || 0,
        conversionRate: conversion.conversionRate,
        averageLeadScore: conversion.averageScore,
      },
      recentBots,
      recentLeads,
    });
  } catch (error) {
    console.error('Client overview error:', error);
    res.status(500).json({ error: 'Failed to load overview' });
  }
});

router.get('/bots', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const organizationId = user.organizationId;
    
    // Allow seeing bots from the organization OR personal bots
    const visibilityConditions = [eq(bots.userId, user.id)];
    if (organizationId) {
      visibilityConditions.push(eq(bots.organizationId, organizationId));
    }

    const list = await db
      .select()
      .from(bots)
      .where(
        and(
          or(...visibilityConditions),
          isNull(bots.deletedAt)
        )
      )
      .orderBy(desc(bots.createdAt));
    res.json(list);
  } catch (error) {
    console.error('Client bots error:', error);
    res.status(500).json({ error: 'Failed to load bots' });
  }
});

router.get('/leads', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const organizationId = user.organizationId;
    const status = req.query.status as string | undefined;
    const conditions: SQL[] = [
      organizationId
        ? eq(leads.organizationId, organizationId)
        : eq(leads.userId, user.id),
    ];

    if (status) {
      conditions.push(eq(leads.status, status));
    }
    const list = await db
      .select()
      .from(leads)
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt));
    res.json(list);
  } catch (error) {
    console.error('Client leads error:', error);
    res.status(500).json({ error: 'Failed to load leads' });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user?.organizationId) {
      return res
        .status(400)
        .json({ error: 'Organization required for analytics' });
    }

    const days = Number(req.query.days || 30);
    const timeSeries = await analyticsService.getTimeSeriesData(
      user.organizationId,
      days,
    );
    const conversion = await analyticsService.getConversionMetrics(
      user.organizationId,
    );
    const botPerformance = await analyticsService.getBotPerformance(
      user.organizationId,
    );

    res.json({
      timeSeries,
      conversion,
      botPerformance,
    });
  } catch (error) {
    console.error('Client analytics error:', error);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

router.post('/onboarding/complete', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const preferences = {
      ...(user.preferences || {}),
      onboardingComplete: true,
    };
    const [updated] = await db
      .update(users)
      .set({ preferences })
      .where(eq(users.id, user.id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error('Onboarding complete error:', error);
    res.status(500).json({ error: 'Failed to update onboarding status' });
  }
});

router.post('/events', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { eventType, eventData, botId } = req.body;
    if (!eventType) {
      return res.status(400).json({ error: 'eventType required' });
    }

    const [event] = await db
      .insert(analyticsEvents)
      .values({
        id: uuidv4(),
        organizationId: user.organizationId,
        userId: user.id,
        botId,
        eventType,
        eventData,
        createdAt: new Date(),
      })
      .returning();

    res.json(event);
  } catch (error) {
    console.error('Client event error:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

router.get('/analytics/dashboard', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const organizationId = user.organizationId;
    const getScope = (table: any) => {
        if (organizationId) return eq(table.organizationId, organizationId);
        return eq(table.userId, user.id);
    };

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
            getScope(conversations),
            gte(conversations.timestamp, date),
            sql`${conversations.timestamp} < ${nextDate}`,
          ),
        );

      const [leadResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(leads)
        .where(
          and(
            getScope(leads),
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
            getScope(conversations),
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
      .where(
        and(
            getScope(conversations),
            gte(conversations.timestamp, startDate)
        )
      );

    const [previousConversations] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(conversations)
      .where(
        and(
          getScope(conversations),
          gte(conversations.timestamp, previousStartDate),
          sql`${conversations.timestamp} < ${startDate}`,
        ),
      );

    const [currentLeads] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(leads)
      .where(
          and(
              getScope(leads),
              gte(leads.createdAt, startDate)
          )
      );

    const [previousLeads] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(leads)
      .where(
        and(
          getScope(leads),
          gte(leads.createdAt, previousStartDate),
          sql`${leads.createdAt} < ${startDate}`,
        ),
      );

    const [currentVisitors] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${conversations.sessionId})`,
      })
      .from(conversations)
      .where(
          and(
              getScope(conversations),
              gte(conversations.timestamp, startDate)
          )
      );

    const [previousVisitors] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${conversations.sessionId})`,
      })
      .from(conversations)
      .where(
        and(
          getScope(conversations),
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
      .where(
          and(
              getScope(leads),
              gte(leads.createdAt, startDate)
          )
      )
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
      .where(
          and(
              getScope(conversations),
              gte(conversations.timestamp, startDate)
          )
      )
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
      .where(
          and(
              getScope(conversations),
              gte(conversations.timestamp, startDate)
          )
      )
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
    console.error('Client analytics dashboard error:', error);
    res.status(500).json({ error: 'Failed to load analytics dashboard' });
  }
});

export default router;
