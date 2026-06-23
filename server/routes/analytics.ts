import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { db } from '../db';
import { organizations, users, bots, conversations, messages, knowledgeGaps } from '../../shared/schema';
import { eq, count, sum, sql, gte, lte, and, desc } from 'drizzle-orm';
import botPerformanceRouter from './analytics/bot-performance'; // Import the new router
import { BenchmarkService } from '../services/BenchmarkService';

const router = Router();
const benchmarkService = new BenchmarkService();

// Use the new bot performance router
router.use(botPerformanceRouter);

// New endpoint for comparative benchmarks
router.get('/benchmarks', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.organization?.id;
    if (!organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }

    const { botId, currentPeriodStart, currentPeriodEnd, previousPeriodStart, previousPeriodEnd } = req.query;

    if (!currentPeriodStart || !currentPeriodEnd || !previousPeriodStart || !previousPeriodEnd) {
      return res.status(400).json({ error: 'Missing required date parameters for benchmarking.' });
    }

    const currentStart = new Date(currentPeriodStart as string);
    const currentEnd = new Date(currentPeriodEnd as string);
    const previousStart = new Date(previousPeriodStart as string);
    const previousEnd = new Date(previousPeriodEnd as string);

    const comparativeBenchmark = await benchmarkService.getComparativeBenchmark(
      organizationId,
      botId as string | undefined,
      currentStart,
      currentEnd,
      previousStart,
      previousEnd
    );

    const suggestions = benchmarkService.generateOptimizationSuggestions(comparativeBenchmark);

    res.json({
      ...comparativeBenchmark,
      suggestions,
    });

  } catch (error) {
    console.error('Error fetching comparative benchmarks:', error);
    res.status(500).json({ error: 'Failed to fetch comparative benchmarks' });
  }
});

// Example: Get overall analytics for an organization
router.get('/', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.organization?.id;
    if (!organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }

    const totalUsers = await db.select({ count: count(users.id) })
      .from(users)
      .where(eq(users.organizationId, organizationId));

    const totalBots = await db.select({ count: count(bots.id) })
      .from(bots)
      .where(eq(bots.organizationId, organizationId));

    const totalConversations = await db.select({ count: count(conversations.id) })
      .from(conversations)
      .where(eq(conversations.organizationId, organizationId));

    const totalMessages = await db.select({ count: count(messages.id) })
      .from(messages)
      .where(eq(messages.organizationId, organizationId));

    const totalKnowledgeGaps = await db.select({ count: count(knowledgeGaps.id) })
      .from(knowledgeGaps)
      .where(eq(knowledgeGaps.organizationId, organizationId));

    // You can add more complex queries here for a comprehensive dashboard
    // For example, daily active users, conversation trends, etc.

    res.json({
      totalUsers: totalUsers[0]?.count || 0,
      totalBots: totalBots[0]?.count || 0,
      totalConversations: totalConversations[0]?.count || 0,
      totalMessages: totalMessages[0]?.count || 0,
      totalKnowledgeGaps: totalKnowledgeGaps[0]?.count || 0,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Example: Get conversation trends over time
router.get('/conversation-trends', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.organization?.id;
    if (!organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }

    const { startDate, endDate } = req.query;

    const conditions = [
      eq(conversations.organizationId, organizationId),
      startDate ? gte(conversations.createdAt, new Date(startDate as string)) : undefined,
      endDate ? lte(conversations.createdAt, new Date(endDate as string)) : undefined,
    ].filter(Boolean);

    const trends = await db.select({
      date: sql<string>`DATE(${conversations.createdAt})`,
      count: count(conversations.id),
    })
      .from(conversations)
      .where(and(...conditions))
      .groupBy(sql`DATE(${conversations.createdAt})`)
      .orderBy(sql`DATE(${conversations.createdAt})`);

    res.json(trends);
  } catch (error) {
    console.error('Error fetching conversation trends:', error);
    res.status(500).json({ error: 'Failed to fetch conversation trends' });
  }
});

export default router;
