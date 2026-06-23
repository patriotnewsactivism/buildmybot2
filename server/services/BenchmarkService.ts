import { db } from '../db';
import { conversations, messages, bots } from '../../shared/schema';
import { eq, avg, count, sql, and, gte, lte, isNotNull, isNull, sum, asc, desc } from 'drizzle-orm';
import { AnalyticsService } from './AnalyticsService';

interface BenchmarkMetrics {
  averageResponseTime: number | null;
  completionRate: number | null;
  errorRate: number | null;
  totalConversations: number;
  totalMessages: number;
}

interface ComparativeBenchmark {
  currentPeriod: BenchmarkMetrics;
  previousPeriod: BenchmarkMetrics;
  gapAnalysis: {
    responseTimeChange: number | null;
    completionRateChange: number | null;
    errorRateChange: number | null;
  };
}

export class BenchmarkService {
  private analyticsService: AnalyticsService;

  constructor() {
    this.analyticsService = new AnalyticsService(); // Assuming AnalyticsService can be instantiated like this
  }

  /**
   * Calculates anonymized performance metrics for a given organization and bot.
   * @param organizationId The ID of the organization.
   * @param botId Optional: The ID of a specific bot to filter by.
   * @param startDate Optional: Start date for the period.
   * @param endDate Optional: End date for the period.
   * @returns BenchmarkMetrics object.
   */
  public async getPerformanceMetrics(
    organizationId: string,
    botId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<BenchmarkMetrics> {
    const conditions = [
      eq(conversations.organizationId, organizationId),
      botId ? eq(conversations.botId, botId) : undefined,
      startDate ? gte(conversations.createdAt, startDate) : undefined,
      endDate ? lte(conversations.createdAt, endDate) : undefined,
    ].filter(Boolean);

    // Average Response Time (using message timestamps)
    const responseTimeResult = await db.select({
      avgResponseTime: avg(sql<number>`EXTRACT(EPOCH FROM (${messages.createdAt} - ${messages.previousMessageCreatedAt}))`),
    })
      .from(messages)
      .leftJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(and(
        ...conditions.map(cond => cond as any),
        isNotNull(messages.previousMessageCreatedAt),
        eq(messages.role, 'assistant') // Only consider assistant responses
      ));

    const averageResponseTime = responseTimeResult[0]?.avgResponseTime ? parseFloat(responseTimeResult[0].avgResponseTime.toFixed(2)) : null;

    // Completion Rate (conversations marked as 'completed' or 'resolved')
    const totalConversationsResult = await db.select({
      count: count(conversations.id),
    })
      .from(conversations)
      .where(and(...conditions));

    const completedConversationsResult = await db.select({
      count: count(conversations.id),
    })
      .from(conversations)
      .where(and(
        ...conditions,
        eq(conversations.status, 'completed') // Assuming a 'completed' status
      ));

    const totalConversations = totalConversationsResult[0]?.count || 0;
    const completedConversations = completedConversationsResult[0]?.count || 0;
    const completionRate = totalConversations > 0 ? parseFloat(((completedConversations / totalConversations) * 100).toFixed(2)) : null;

    // Error Rate (conversations with an 'error' status or specific error flags)
    const errorConversationsResult = await db.select({
      count: count(conversations.id),
    })
      .from(conversations)
      .where(and(
        ...conditions,
        eq(conversations.status, 'error') // Assuming an 'error' status
      ));

    const errorConversations = errorConversationsResult[0]?.count || 0;
    const errorRate = totalConversations > 0 ? parseFloat(((errorConversations / totalConversations) * 100).toFixed(2)) : null;

    // Total Messages
    const totalMessagesResult = await db.select({
      count: count(messages.id),
    })
      .from(messages)
      .leftJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(and(...conditions.map(cond => cond as any)));

    const totalMessages = totalMessagesResult[0]?.count || 0;

    return {
      averageResponseTime,
      completionRate,
      errorRate,
      totalConversations,
      totalMessages,
    };
  }

  /**
   * Performs a comparative benchmark between two periods.
   * @param organizationId The ID of the organization.
   * @param botId Optional: The ID of a specific bot to filter by.
   * @param currentPeriodStart Start date for the current period.
   * @param currentPeriodEnd End date for the current period.
   * @param previousPeriodStart Start date for the previous period.
   * @param previousPeriodEnd End date for the previous period.
   * @returns ComparativeBenchmark object.
   */
  public async getComparativeBenchmark(
    organizationId: string,
    botId: string | undefined,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    previousPeriodStart: Date,
    previousPeriodEnd: Date
  ): Promise<ComparativeBenchmark> {
    const currentPeriodMetrics = await this.getPerformanceMetrics(
      organizationId,
      botId,
      currentPeriodStart,
      currentPeriodEnd
    );

    const previousPeriodMetrics = await this.getPerformanceMetrics(
      organizationId,
      botId,
      previousPeriodStart,
      previousPeriodEnd
    );

    const calculateChange = (current: number | null, previous: number | null): number | null => {
      if (current === null || previous === null || previous === 0) {
        return null;
      }
      return parseFloat((((current - previous) / previous) * 100).toFixed(2));
    };

    const gapAnalysis = {
      responseTimeChange: calculateChange(currentPeriodMetrics.averageResponseTime, previousPeriodMetrics.averageResponseTime),
      completionRateChange: calculateChange(currentPeriodMetrics.completionRate, previousPeriodMetrics.completionRate),
      errorRateChange: calculateChange(currentPeriodMetrics.errorRate, previousPeriodMetrics.errorRate),
    };

    return {
      currentPeriod: currentPeriodMetrics,
      previousPeriod: previousPeriodMetrics,
      gapAnalysis,
    };
  }

  /**
   * Generates optimization suggestions based on gap analysis.
   * This is a simplified example and would be expanded with more sophisticated AI/rule-based logic.
   * @param comparativeBenchmark The comparative benchmark data.
   * @returns An array of optimization suggestions.
   */
  public generateOptimizationSuggestions(comparativeBenchmark: ComparativeBenchmark): string[] {
    const suggestions: string[] = [];
    const { gapAnalysis, currentPeriod } = comparativeBenchmark;

    if (gapAnalysis.responseTimeChange !== null && gapAnalysis.responseTimeChange > 10) {
      suggestions.push(
        `Average response time increased by ${gapAnalysis.responseTimeChange}% in the current period. Investigate potential bottlenecks in bot processing or external API calls.`
      );
    } else if (gapAnalysis.responseTimeChange !== null && gapAnalysis.responseTimeChange < -5) {
      suggestions.push(
        `Great job! Average response time decreased by ${Math.abs(gapAnalysis.responseTimeChange)}%. Consider documenting these improvements.`
      );
    }

    if (gapAnalysis.completionRateChange !== null && gapAnalysis.completionRateChange < -5) {
      suggestions.push(
        `Completion rate decreased by ${Math.abs(gapAnalysis.completionRateChange)}%. Review conversation flows and knowledge base content to improve bot effectiveness.`
      );
    } else if (gapAnalysis.completionRateChange !== null && gapAnalysis.completionRateChange > 5) {
      suggestions.push(
        `Excellent! Completion rate increased by ${gapAnalysis.completionRateChange}%. Your bot is becoming more effective.`
      );
    }

    if (gapAnalysis.errorRateChange !== null && gapAnalysis.errorRateChange > 5) {
      suggestions.push(
        `Error rate increased by ${gapAnalysis.errorRateChange}%. Analyze recent error logs and conversation transcripts to identify common failure points.`
      );
    } else if (gapAnalysis.errorRateChange !== null && gapAnalysis.errorRateChange < -5) {
      suggestions.push(
        `Good news! Error rate decreased by ${Math.abs(gapAnalysis.errorRateChange)}%. Keep up the good work on stability.`
      );
    }

    if (currentPeriod.totalConversations < 100) {
      suggestions.push(
        `Consider increasing bot engagement to gather more data for robust benchmarking. Promote your bot more actively!`
      );
    }

    if (suggestions.length === 0) {
      suggestions.push("Performance is stable. Continue monitoring for optimal results.");
    }

    return suggestions;
  }
}
