import { type SQL, and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  type AnalyticsEvent,
  type InsertAnalyticsEvent,
  analyticsEvents,
  botPerformanceDaily,
  bots,
  conversationMetrics,
  conversations,
  leadSources,
  leads,
  satisfactionRatings,
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

export interface ConversationAnalytics {
  totalConversations: number;
  avgDuration: number; // seconds
  completionRate: number; // percentage
  activeHours: { hour: number; count: number }[];
  peakHour: number;
}

export interface LeadAnalytics {
  leadsPerBot: { botId: string; botName: string; count: number }[];
  conversionFunnel: {
    conversationsStarted: number;
    conversationsCompleted: number;
    leadsGenerated: number;
  };
  qualityScores: {
    excellent: number; // 80-100
    good: number; // 60-79
    average: number; // 40-59
    poor: number; // 0-39
  };
  sources: { source: string; count: number }[];
}

export interface PerformanceTrends {
  weekOverWeek: {
    conversations: { current: number; previous: number; change: number };
    leads: { current: number; previous: number; change: number };
    conversionRate: { current: number; previous: number; change: number };
  };
  dailyTrend: {
    date: string;
    conversations: number;
    leads: number;
    conversionRate: number;
  }[];
  engagementPattern: {
    day: string;
    avgDuration: number;
    completionRate: number;
  }[];
}

export interface SatisfactionAnalytics {
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  averageRating: number;
  totalRatings: number;
  topComplaints: string[];
  commonQuestions: { question: string; count: number }[];
  escalationRate: number;
}

export class AnalyticsService {
  async updateConversationMetrics(
    conversationId: string,
    botId: string,
    organizationId: string | undefined,
    messageRole: 'user' | 'model' | 'system',
    leadId?: string,
  ) {
    const [existing] = await db
      .select()
      .from(conversationMetrics)
      .where(eq(conversationMetrics.conversationId, conversationId));

    if (existing) {
      const now = new Date();
      const durationSeconds = Math.round(
        (now.getTime() - existing.startedAt.getTime()) / 1000,
      );

      const updates: any = {
        messageCount: (existing.messageCount || 0) + 1,
        endedAt: now,
        durationSeconds,
      };

      if (messageRole === 'user') {
        updates.userMessageCount = (existing.userMessageCount || 0) + 1;
      } else if (messageRole === 'model') {
        updates.botMessageCount = (existing.botMessageCount || 0) + 1;
      }

      if (leadId) {
        updates.leadCaptured = true;
        updates.leadId = leadId;
      }

      await db
        .update(conversationMetrics)
        .set(updates)
        .where(eq(conversationMetrics.id, existing.id));
    } else {
      await db.insert(conversationMetrics).values({
        id: uuidv4(),
        conversationId,
        botId,
        organizationId: organizationId || null,
        startedAt: new Date(),
        endedAt: new Date(),
        durationSeconds: 0,
        messageCount: 1,
        userMessageCount: messageRole === 'user' ? 1 : 0,
        botMessageCount: messageRole === 'model' ? 1 : 0,
        leadCaptured: !!leadId,
        leadId: leadId || null,
        completed: false,
      });
    }
  }

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

  async getConversationAnalytics(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<ConversationAnalytics> {
    const conditions: SQL[] = [
      eq(conversationMetrics.organizationId, organizationId),
    ];

    if (startDate) {
      conditions.push(gte(conversationMetrics.startedAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(conversationMetrics.startedAt, endDate));
    }

    const metrics = await db
      .select()
      .from(conversationMetrics)
      .where(and(...conditions));

    const totalConversations = metrics.length;
    const completedConversations = metrics.filter((m) => m.completed).length;
    const completionRate =
      totalConversations > 0
        ? (completedConversations / totalConversations) * 100
        : 0;

    const totalDuration = metrics.reduce(
      (sum, m) => sum + (m.durationSeconds || 0),
      0,
    );
    const avgDuration =
      totalConversations > 0 ? totalDuration / totalConversations : 0;

    const hourCounts: Record<number, number> = {};
    for (let i = 0; i < 24; i++) {
      hourCounts[i] = 0;
    }

    for (const metric of metrics) {
      if (metric.startedAt) {
        const hour = new Date(metric.startedAt).getHours();
        hourCounts[hour]++;
      }
    }

    const activeHours = Object.entries(hourCounts).map(([hour, count]) => ({
      hour: Number.parseInt(hour),
      count,
    }));

    const peakHour = activeHours.reduce(
      (max, item) => (item.count > max.count ? item : max),
      { hour: 0, count: 0 },
    ).hour;

    return {
      totalConversations,
      avgDuration,
      completionRate,
      activeHours,
      peakHour,
    };
  }

  async getLeadAnalytics(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<LeadAnalytics> {
    const leadConditions: SQL[] = [eq(leads.organizationId, organizationId)];

    if (startDate) {
      leadConditions.push(gte(leads.createdAt, startDate));
    }

    if (endDate) {
      leadConditions.push(lte(leads.createdAt, endDate));
    }

    const allLeads = await db
      .select()
      .from(leads)
      .where(and(...leadConditions));

    const conversationConditions: SQL[] = [
      eq(conversationMetrics.organizationId, organizationId),
    ];

    if (startDate) {
      conversationConditions.push(
        gte(conversationMetrics.startedAt, startDate),
      );
    }

    if (endDate) {
      conversationConditions.push(lte(conversationMetrics.startedAt, endDate));
    }

    const metrics = await db
      .select()
      .from(conversationMetrics)
      .where(and(...conversationConditions));

    const conversationsStarted = metrics.length;
    const conversationsCompleted = metrics.filter((m) => m.completed).length;
    const leadsGenerated = metrics.filter((m) => m.leadCaptured).length;

    const leadsPerBot: { botId: string; botName: string; count: number }[] = [];
    const botCounts: Record<string, number> = {};

    for (const lead of allLeads) {
      const botId = lead.sourceBotId;
      if (botId) {
        botCounts[botId] = (botCounts[botId] || 0) + 1;
      }
    }

    const allBots = await db
      .select()
      .from(bots)
      .where(eq(bots.organizationId, organizationId));

    for (const bot of allBots) {
      const count = botCounts[bot.id] || 0;
      if (count > 0) {
        leadsPerBot.push({
          botId: bot.id,
          botName: bot.name,
          count,
        });
      }
    }

    let excellent = 0;
    let good = 0;
    let average = 0;
    let poor = 0;

    for (const lead of allLeads) {
      const score = lead.score || 0;
      if (score >= 80) excellent++;
      else if (score >= 60) good++;
      else if (score >= 40) average++;
      else poor++;
    }

    const sourceConditions: SQL[] = [
      eq(leadSources.organizationId, organizationId),
    ];

    if (startDate) {
      sourceConditions.push(gte(leadSources.createdAt, startDate));
    }

    if (endDate) {
      sourceConditions.push(lte(leadSources.createdAt, endDate));
    }

    const sources = await db
      .select()
      .from(leadSources)
      .where(and(...sourceConditions));

    const sourceCounts: Record<string, number> = {};
    for (const source of sources) {
      if (source.source) {
        sourceCounts[source.source] = (sourceCounts[source.source] || 0) + 1;
      }
    }

    const sourcesList = Object.entries(sourceCounts).map(([source, count]) => ({
      source,
      count,
    }));

    return {
      leadsPerBot,
      conversionFunnel: {
        conversationsStarted,
        conversationsCompleted,
        leadsGenerated,
      },
      qualityScores: {
        excellent,
        good,
        average,
        poor,
      },
      sources: sourcesList,
    };
  }

  async getPerformanceTrends(
    organizationId: string,
    days = 30,
  ): Promise<PerformanceTrends> {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const currentWeekMetrics = await this.getConversationAnalytics(
      organizationId,
      oneWeekAgo,
      now,
    );
    const previousWeekMetrics = await this.getConversationAnalytics(
      organizationId,
      twoWeeksAgo,
      oneWeekAgo,
    );

    const currentLeads = await this.getLeadAnalytics(
      organizationId,
      oneWeekAgo,
      now,
    );
    const previousLeads = await this.getLeadAnalytics(
      organizationId,
      twoWeeksAgo,
      oneWeekAgo,
    );

    const currentConvRate =
      currentWeekMetrics.totalConversations > 0
        ? (currentLeads.conversionFunnel.leadsGenerated /
            currentWeekMetrics.totalConversations) *
          100
        : 0;

    const previousConvRate =
      previousWeekMetrics.totalConversations > 0
        ? (previousLeads.conversionFunnel.leadsGenerated /
            previousWeekMetrics.totalConversations) *
          100
        : 0;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const dailyTrend: {
      date: string;
      conversations: number;
      leads: number;
      conversionRate: number;
    }[] = [];

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayConversations = await db
        .select({ count: count() })
        .from(conversationMetrics)
        .where(
          and(
            eq(conversationMetrics.organizationId, organizationId),
            gte(conversationMetrics.startedAt, date),
            lte(conversationMetrics.startedAt, nextDate),
          ),
        );

      const dayLeads = await db
        .select({ count: count() })
        .from(conversationMetrics)
        .where(
          and(
            eq(conversationMetrics.organizationId, organizationId),
            eq(conversationMetrics.leadCaptured, true),
            gte(conversationMetrics.startedAt, date),
            lte(conversationMetrics.startedAt, nextDate),
          ),
        );

      const conversations = Number(dayConversations[0]?.count || 0);
      const leadsCount = Number(dayLeads[0]?.count || 0);
      const conversionRate =
        conversations > 0 ? (leadsCount / conversations) * 100 : 0;

      dailyTrend.push({
        date: date.toISOString().split('T')[0],
        conversations,
        leads: leadsCount,
        conversionRate,
      });
    }

    const engagementPattern: {
      day: string;
      avgDuration: number;
      completionRate: number;
    }[] = [];

    const daysOfWeek = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    for (let i = 0; i < 7; i++) {
      const dayMetrics = await db
        .select()
        .from(conversationMetrics)
        .where(eq(conversationMetrics.organizationId, organizationId));

      const dayFiltered = dayMetrics.filter(
        (m) => new Date(m.startedAt).getDay() === i,
      );

      const totalDuration = dayFiltered.reduce(
        (sum, m) => sum + (m.durationSeconds || 0),
        0,
      );
      const avgDuration =
        dayFiltered.length > 0 ? totalDuration / dayFiltered.length : 0;

      const completed = dayFiltered.filter((m) => m.completed).length;
      const completionRate =
        dayFiltered.length > 0 ? (completed / dayFiltered.length) * 100 : 0;

      engagementPattern.push({
        day: daysOfWeek[i],
        avgDuration,
        completionRate,
      });
    }

    return {
      weekOverWeek: {
        conversations: {
          current: currentWeekMetrics.totalConversations,
          previous: previousWeekMetrics.totalConversations,
          change:
            ((currentWeekMetrics.totalConversations -
              previousWeekMetrics.totalConversations) /
              (previousWeekMetrics.totalConversations || 1)) *
            100,
        },
        leads: {
          current: currentLeads.conversionFunnel.leadsGenerated,
          previous: previousLeads.conversionFunnel.leadsGenerated,
          change:
            ((currentLeads.conversionFunnel.leadsGenerated -
              previousLeads.conversionFunnel.leadsGenerated) /
              (previousLeads.conversionFunnel.leadsGenerated || 1)) *
            100,
        },
        conversionRate: {
          current: currentConvRate,
          previous: previousConvRate,
          change:
            ((currentConvRate - previousConvRate) / (previousConvRate || 1)) *
            100,
        },
      },
      dailyTrend,
      engagementPattern,
    };
  }

  async getSatisfactionAnalytics(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<SatisfactionAnalytics> {
    const conditions: SQL[] = [
      eq(satisfactionRatings.organizationId, organizationId),
    ];

    if (startDate) {
      conditions.push(gte(satisfactionRatings.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(satisfactionRatings.createdAt, endDate));
    }

    const ratings = await db
      .select()
      .from(satisfactionRatings)
      .where(and(...conditions));

    const totalRatings = ratings.length;
    const totalRatingSum = ratings.reduce((sum, r) => sum + (r.rating || 0), 0);
    const averageRating = totalRatings > 0 ? totalRatingSum / totalRatings : 0;

    const topComplaints: string[] = [];
    const feedbackTexts = ratings
      .filter((r) => r.feedback && r.rating && r.rating <= 2)
      .map((r) => r.feedback as string);

    for (const feedback of feedbackTexts.slice(0, 5)) {
      topComplaints.push(feedback);
    }

    const metricConditions: SQL[] = [
      eq(conversationMetrics.organizationId, organizationId),
    ];

    if (startDate) {
      metricConditions.push(gte(conversationMetrics.startedAt, startDate));
    }

    if (endDate) {
      metricConditions.push(lte(conversationMetrics.startedAt, endDate));
    }

    const metrics = await db
      .select()
      .from(conversationMetrics)
      .where(and(...metricConditions));

    let positive = 0;
    let neutral = 0;
    let negative = 0;

    for (const metric of metrics) {
      const sentiment = (metric.overallSentiment || 'neutral').toLowerCase();
      if (sentiment === 'positive') positive++;
      else if (sentiment === 'negative') negative++;
      else neutral++;
    }

    const escalatedConversations = metrics.filter(
      (m) => m.completionReason === 'escalated',
    ).length;
    const escalationRate =
      metrics.length > 0 ? (escalatedConversations / metrics.length) * 100 : 0;

    const commonQuestions: { question: string; count: number }[] = [];

    return {
      sentimentBreakdown: {
        positive,
        neutral,
        negative,
      },
      averageRating,
      totalRatings,
      topComplaints,
      commonQuestions,
      escalationRate,
    };
  }
}
