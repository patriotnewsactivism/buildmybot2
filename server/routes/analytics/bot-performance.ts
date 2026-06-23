import { Router } from 'express';
import { db } from '../../db';
import { conversations, messages, knowledgeGaps, organizations } from '../../../shared/schema';
import { eq, sql, and, count, desc, sum, avg, gte, lte, asc } from 'drizzle-orm';
import { authenticateToken } from '../../middleware/auth';
import { z } from 'zod';

const router = Router();

// Schema for query parameters
const BotPerformanceQuerySchema = z.object({
  botId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

router.get('/bot-performance', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.organization?.id;
    if (!organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }

    const { botId, startDate, endDate } = BotPerformanceQuerySchema.parse(req.query);

    const conversationConditions = [
      eq(conversations.organizationId, organizationId),
      botId ? eq(conversations.botId, botId) : undefined,
      startDate ? gte(conversations.createdAt, new Date(startDate)) : undefined,
      endDate ? lte(conversations.createdAt, new Date(endDate)) : undefined,
    ].filter(Boolean);

    const messageConditions = [
      eq(messages.organizationId, organizationId),
      botId ? eq(messages.botId, botId) : undefined,
      startDate ? gte(messages.createdAt, new Date(startDate)) : undefined,
      endDate ? lte(messages.createdAt, new Date(endDate)) : undefined,
    ].filter(Boolean);

    const knowledgeGapConditions = [
      eq(knowledgeGaps.organizationId, organizationId),
      botId ? eq(knowledgeGaps.botId, botId) : undefined,
      startDate ? gte(knowledgeGaps.createdAt, new Date(startDate)) : undefined,
      endDate ? lte(knowledgeGaps.createdAt, new Date(endDate)) : undefined,
    ].filter(Boolean);

    // 1. Conversation Completion Rates by Day
    const completionRates = await db.select({
      date: sql<string>`DATE(${conversations.createdAt})`,
      completedConversations: count(conversations.id).filter(eq(conversations.status, 'completed')),
      totalConversations: count(conversations.id),
      completionRate: sql<number>`CAST(COUNT(CASE WHEN ${conversations.status} = 'completed' THEN 1 END) AS DECIMAL) * 100 / COUNT(${conversations.id})`,
    })
      .from(conversations)
      .where(and(...conversationConditions))
      .groupBy(sql`DATE(${conversations.createdAt})`)
      .orderBy(asc(sql`DATE(${conversations.createdAt})`));

    // 2. Average Sentiment Scores
    const sentimentScores = await db.select({
      date: sql<string>`DATE(${messages.createdAt})`,
      averageSentiment: avg(messages.sentimentScore),
    })
      .from(messages)
      .where(and(...messageConditions, sql`${messages.sentimentScore} IS NOT NULL`))
      .groupBy(sql`DATE(${messages.createdAt})`)
      .orderBy(asc(sql`DATE(${messages.createdAt})`));

    // 3. Common Unanswered Questions (Knowledge Gaps)
    const commonKnowledgeGaps = await db.select({
      question: knowledgeGaps.question,
      count: count(knowledgeGaps.id),
    })
      .from(knowledgeGaps)
      .where(and(...knowledgeGapConditions))
      .groupBy(knowledgeGaps.question)
      .orderBy(desc(count(knowledgeGaps.id)))
      .limit(10);

    res.json({
      completionRates,
      sentimentScores,
      commonKnowledgeGaps,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
    }
    console.error('Error fetching bot performance analytics:', error);
    res.status(500).json({ error: 'Failed to fetch bot performance analytics' });
  }
});

export default router;
