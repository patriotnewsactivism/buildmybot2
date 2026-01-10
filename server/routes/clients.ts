import { type SQL, and, desc, eq, sql } from 'drizzle-orm';
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
    const list = await db
      .select()
      .from(bots)
      .where(
        organizationId
          ? eq(bots.organizationId, organizationId)
          : eq(bots.userId, user.id),
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

export default router;
