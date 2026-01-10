import { type SQL, and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  type AnalyticsEvent,
  type InsertAnalyticsEvent,
  analyticsEvents,
  bots,
  conversations,
  leads,
} from '../../shared/schema';
import { db } from '../db';

export interface ConversionMetrics {
  totalConversations: number;
  totalLeads: number;
  conversionRate: number;
  averageScore: number;
}

export interface BotPerformance {
  botId: string;
  botName: string;
  conversationCount: number;
  leadCount: number;
  conversionRate: number;
}

export interface TimeSeriesData {
  date: string;
  conversations: number;
  leads: number;
  conversionRate: number;
}

export interface Insight {
  type: 'positive' | 'negative' | 'info' | 'suggestion';
  title: string;
  message: string;
  metric?: number;
  trend?: 'up' | 'down' | 'stable';
  items?: string[];
  actionable?: string;
}

export interface PeakHours {
  start: string;
  end: string;
  peakHour: number;
  conversationCount: number;
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}

export class AnalyticsService {
  async trackEvent(
    eventData: Omit<InsertAnalyticsEvent, 'id' | 'createdAt'>,
  ): Promise<AnalyticsEvent> {
    const [event] = await db
      .insert(analyticsEvents)
      .values({
        id: uuidv4(),
        ...eventData,
        createdAt: new Date(),
      })
      .returning();

    return event;
  }

  async getEventsByOrganization(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
    limit = 100,
  ): Promise<AnalyticsEvent[]> {
    // Collect conditions in an array first
    const conditions: SQL[] = [
      eq(analyticsEvents.organizationId, organizationId),
    ];

    if (startDate) {
      conditions.push(gte(analyticsEvents.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(analyticsEvents.createdAt, endDate));
    }

    // Apply all conditions at once
    return db
      .select()
      .from(analyticsEvents)
      .where(and(...conditions))
      .orderBy(desc(analyticsEvents.createdAt))
      .limit(limit);
  }

  async getEventsByType(
    organizationId: string,
    eventType: string,
    limit = 100,
  ): Promise<AnalyticsEvent[]> {
    return db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.organizationId, organizationId),
          eq(analyticsEvents.eventType, eventType),
        ),
      )
      .orderBy(desc(analyticsEvents.createdAt))
      .limit(limit);
  }

  async getEventsByBot(botId: string, limit = 100): Promise<AnalyticsEvent[]> {
    return db
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.botId, botId))
      .orderBy(desc(analyticsEvents.createdAt))
      .limit(limit);
  }

  async getConversionMetrics(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<ConversionMetrics> {
    // Build condition arrays for each table
    const conversationConditions: SQL[] = [
      eq(conversations.organizationId, organizationId),
    ];
    const leadConditions: SQL[] = [eq(leads.organizationId, organizationId)];

    if (startDate) {
      conversationConditions.push(gte(conversations.timestamp, startDate));
      leadConditions.push(gte(leads.createdAt, startDate));
    }

    if (endDate) {
      conversationConditions.push(lte(conversations.timestamp, endDate));
      leadConditions.push(lte(leads.createdAt, endDate));
    }

    // Execute queries with the collected conditions
    const [conversationResult] = await db
      .select({ count: count() })
      .from(conversations)
      .where(and(...conversationConditions));

    const [leadResult] = await db
      .select({ count: count() })
      .from(leads)
      .where(and(...leadConditions));

    const totalConversations = Number(conversationResult?.count || 0);
    const totalLeads = Number(leadResult?.count || 0);

    // Calculate average lead score
    const avgScoreResult = await db
      .select({ avg: sql<number>`AVG(${leads.score})` })
      .from(leads)
      .where(and(...leadConditions));

    const averageScore = Number(avgScoreResult[0]?.avg || 0);
    const conversionRate =
      totalConversations > 0 ? totalLeads / totalConversations : 0;

    return {
      totalConversations,
      totalLeads,
      conversionRate,
      averageScore,
    };
  }

  async getBotPerformance(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<BotPerformance[]> {
    const allBots = await db
      .select()
      .from(bots)
      .where(eq(bots.organizationId, organizationId));

    const performance: BotPerformance[] = [];

    for (const bot of allBots) {
      const conversationConditions: SQL[] = [eq(conversations.botId, bot.id)];
      const leadConditions: SQL[] = [eq(leads.sourceBotId, bot.id)];

      if (startDate) {
        conversationConditions.push(gte(conversations.timestamp, startDate));
        leadConditions.push(gte(leads.createdAt, startDate));
      }

      if (endDate) {
        conversationConditions.push(lte(conversations.timestamp, endDate));
        leadConditions.push(lte(leads.createdAt, endDate));
      }

      const [conversationResult] = await db
        .select({ count: count() })
        .from(conversations)
        .where(and(...conversationConditions));

      const [leadResult] = await db
        .select({ count: count() })
        .from(leads)
        .where(and(...leadConditions));

      const conversationCount = Number(conversationResult?.count || 0);
      const leadCount = Number(leadResult?.count || 0);

      performance.push({
        botId: bot.id,
        botName: bot.name,
        conversationCount,
        leadCount,
        conversionRate:
          conversationCount > 0 ? leadCount / conversationCount : 0,
      });
    }

    return performance;
  }

  async getTimeSeriesData(
    organizationId: string,
    days = 30,
  ): Promise<TimeSeriesData[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const timeSeries: TimeSeriesData[] = [];

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const conversationConditions: SQL[] = [
        eq(conversations.organizationId, organizationId),
        gte(conversations.timestamp, date),
        lte(conversations.timestamp, nextDate),
      ];

      const leadConditions: SQL[] = [
        eq(leads.organizationId, organizationId),
        gte(leads.createdAt, date),
        lte(leads.createdAt, nextDate),
      ];

      const [conversationResult] = await db
        .select({ count: count() })
        .from(conversations)
        .where(and(...conversationConditions));

      const [leadResult] = await db
        .select({ count: count() })
        .from(leads)
        .where(and(...leadConditions));

      const conversationCount = Number(conversationResult?.count || 0);
      const leadCount = Number(leadResult?.count || 0);

      timeSeries.push({
        date: date.toISOString().split('T')[0],
        conversations: conversationCount,
        leads: leadCount,
        conversionRate:
          conversationCount > 0 ? leadCount / conversationCount : 0,
      });
    }

    return timeSeries;
  }

  async generateInsights(organizationId: string): Promise<Insight[]> {
    const insights: Insight[] = [];
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const currentMetrics = await this.getConversionMetrics(
      organizationId,
      oneWeekAgo,
      now,
    );
    const previousMetrics = await this.getConversionMetrics(
      organizationId,
      twoWeeksAgo,
      oneWeekAgo,
    );

    if (previousMetrics.conversionRate > 0) {
      const changePercent =
        ((currentMetrics.conversionRate - previousMetrics.conversionRate) /
          previousMetrics.conversionRate) *
        100;

      if (changePercent > 10) {
        insights.push({
          type: 'positive',
          title: 'Conversion Rate Up',
          message: `Your bot converted ${changePercent.toFixed(1)}% more leads this week compared to last week!`,
          metric: currentMetrics.conversionRate,
          trend: 'up',
        });
      } else if (changePercent < -10) {
        insights.push({
          type: 'negative',
          title: 'Conversion Rate Down',
          message: `Conversion rate dropped ${Math.abs(changePercent).toFixed(1)}% this week. Consider updating your bot prompts.`,
          metric: currentMetrics.conversionRate,
          trend: 'down',
          actionable:
            'Review and update your bot system prompts for better engagement.',
        });
      }
    }

    if (
      currentMetrics.totalConversations >
      previousMetrics.totalConversations * 1.2
    ) {
      insights.push({
        type: 'positive',
        title: 'Traffic Surge',
        message: `Conversations increased by ${(((currentMetrics.totalConversations - previousMetrics.totalConversations) / (previousMetrics.totalConversations || 1)) * 100).toFixed(0)}% this week!`,
        metric: currentMetrics.totalConversations,
        trend: 'up',
      });
    }

    const peakHours = await this.analyzePeakHours(organizationId);
    if (peakHours.conversationCount > 0) {
      insights.push({
        type: 'info',
        title: 'Peak Activity Hours',
        message: `Most conversations happen between ${peakHours.start} and ${peakHours.end}.`,
        actionable:
          'Schedule your marketing campaigns during these peak hours for maximum engagement.',
      });
    }

    const sentimentBreakdown = await this.getSentimentBreakdown(
      organizationId,
      oneWeekAgo,
      now,
    );
    if (sentimentBreakdown.total > 0) {
      const positiveRate =
        (sentimentBreakdown.positive / sentimentBreakdown.total) * 100;
      if (positiveRate >= 70) {
        insights.push({
          type: 'positive',
          title: 'Great Customer Sentiment',
          message: `${positiveRate.toFixed(0)}% of your conversations have positive sentiment!`,
          metric: positiveRate,
        });
      } else if (positiveRate < 50) {
        insights.push({
          type: 'suggestion',
          title: 'Improve Customer Experience',
          message: `Only ${positiveRate.toFixed(0)}% of conversations have positive sentiment.`,
          actionable:
            'Consider refining your bot responses to be more helpful and friendly.',
        });
      }
    }

    if (currentMetrics.averageScore > 0) {
      const scoreChange =
        currentMetrics.averageScore - previousMetrics.averageScore;
      if (scoreChange > 5) {
        insights.push({
          type: 'positive',
          title: 'Lead Quality Improving',
          message: `Average lead score increased by ${scoreChange.toFixed(1)} points this week.`,
          metric: currentMetrics.averageScore,
          trend: 'up',
        });
      }
    }

    if (insights.length === 0) {
      insights.push({
        type: 'info',
        title: 'Building Your Analytics',
        message:
          'Keep engaging with customers to unlock more insights about your bot performance.',
      });
    }

    return insights;
  }

  async analyzePeakHours(organizationId: string): Promise<PeakHours> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recentConversations = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.organizationId, organizationId),
          gte(conversations.timestamp, oneWeekAgo),
        ),
      );

    const hourCounts: Record<number, number> = {};
    for (let i = 0; i < 24; i++) {
      hourCounts[i] = 0;
    }

    for (const conv of recentConversations) {
      if (conv.timestamp) {
        const hour = new Date(conv.timestamp).getHours();
        hourCounts[hour]++;
      }
    }

    let peakHour = 0;
    let maxCount = 0;
    for (const [hour, cnt] of Object.entries(hourCounts)) {
      if (cnt > maxCount) {
        maxCount = cnt;
        peakHour = Number.parseInt(hour);
      }
    }

    const formatHour = (h: number) => {
      const suffix = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 || 12;
      return `${hour12}:00 ${suffix}`;
    };

    return {
      start: formatHour(peakHour),
      end: formatHour((peakHour + 2) % 24),
      peakHour,
      conversationCount: maxCount,
    };
  }

  async getSentimentBreakdown(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<SentimentBreakdown> {
    const conditions: SQL[] = [
      eq(conversations.organizationId, organizationId),
    ];
    if (startDate) conditions.push(gte(conversations.timestamp, startDate));
    if (endDate) conditions.push(lte(conversations.timestamp, endDate));

    const allConvs = await db
      .select({ sentiment: conversations.sentiment })
      .from(conversations)
      .where(and(...conditions));

    let positive = 0;
    let neutral = 0;
    let negative = 0;

    for (const conv of allConvs) {
      const sentiment = (conv.sentiment || 'neutral').toLowerCase();
      if (sentiment === 'positive') positive++;
      else if (sentiment === 'negative') negative++;
      else neutral++;
    }

    return {
      positive,
      neutral,
      negative,
      total: allConvs.length,
    };
  }

  async getLeadQualityDistribution(
    organizationId: string,
  ): Promise<{ high: number; medium: number; low: number }> {
    const allLeads = await db
      .select({ score: leads.score })
      .from(leads)
      .where(eq(leads.organizationId, organizationId));

    let high = 0;
    let medium = 0;
    let low = 0;

    for (const lead of allLeads) {
      const score = lead.score || 0;
      if (score >= 70) high++;
      else if (score >= 40) medium++;
      else low++;
    }

    return { high, medium, low };
  }

  async getWeekOverWeekGrowth(organizationId: string): Promise<{
    conversationsGrowth: number;
    leadsGrowth: number;
    revenueGrowth: number;
  }> {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const currentMetrics = await this.getConversionMetrics(
      organizationId,
      oneWeekAgo,
      now,
    );
    const previousMetrics = await this.getConversionMetrics(
      organizationId,
      twoWeeksAgo,
      oneWeekAgo,
    );

    const calcGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      conversationsGrowth: calcGrowth(
        currentMetrics.totalConversations,
        previousMetrics.totalConversations,
      ),
      leadsGrowth: calcGrowth(
        currentMetrics.totalLeads,
        previousMetrics.totalLeads,
      ),
      revenueGrowth: 0,
    };
  }
}
