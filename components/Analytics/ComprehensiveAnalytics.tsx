import {
  Activity,
  CheckCircle,
  Clock,
  MessageSquare,
  Star,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { HudMetric } from '../UI/HudMetric';
import { Panel } from '../UI/Panel';

interface ComprehensiveAnalyticsProps {
  organizationId?: string;
}

type AnalyticsTab = 'conversations' | 'leads' | 'performance' | 'satisfaction';

interface ConversationAnalytics {
  totalConversations: number;
  avgDuration: number;
  completionRate: number;
  activeHours: { hour: number; count: number }[];
  peakHour: number;
}

interface LeadAnalytics {
  leadsPerBot: { botId: string; botName: string; count: number }[];
  conversionFunnel: {
    conversationsStarted: number;
    conversationsCompleted: number;
    leadsGenerated: number;
  };
  qualityScores: {
    excellent: number;
    good: number;
    average: number;
    poor: number;
  };
  sources: { source: string; count: number }[];
}

interface PerformanceTrends {
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

interface SatisfactionAnalytics {
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

// Command-center chart palette: cyan is the primary series, green the
// secondary comparison series, amber/red reserved for warning/critical
// states in pie breakdowns. No rainbow per-item coloring.
const CHART_CYAN = '#2DE2E6';
const CHART_GREEN = '#39FF88';
const CHART_AMBER = '#F5B942';
const CHART_RED = '#FF4D5E';
const CHART_MUTED = '#6B7280';
const CHART_BORDER = '#232830';

export const ComprehensiveAnalytics: React.FC<ComprehensiveAnalyticsProps> = ({
  organizationId,
}) => {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('conversations');
  const [loading, setLoading] = useState(true);

  const [conversationData, setConversationData] =
    useState<ConversationAnalytics | null>(null);
  const [leadData, setLeadData] = useState<LeadAnalytics | null>(null);
  const [trendsData, setTrendsData] = useState<PerformanceTrends | null>(null);
  const [satisfactionData, setSatisfactionData] =
    useState<SatisfactionAnalytics | null>(null);

  useEffect(() => {
    // NOTE: the backend currently returns simpler raw shapes for these
    // endpoints (e.g. /trends returns a plain day-count array, not
    // { weekOverWeek, dailyTrend, engagementPattern }) rather than the rich
    // objects this component's interfaces declare. Normalizing every
    // response into safe, fully-populated defaults here means a shape
    // mismatch can never throw mid-render and blank the whole admin page --
    // it was previously possible to hit "Cannot read properties of
    // undefined (reading 'toFixed')" this way.
    const safeConversationData = (raw: any): ConversationAnalytics => ({
      totalConversations: raw?.totalConversations ?? 0,
      avgDuration: raw?.avgDuration ?? 0,
      completionRate: raw?.completionRate ?? 0,
      activeHours: Array.isArray(raw?.activeHours) ? raw.activeHours : [],
      peakHour: raw?.peakHour ?? 0,
    });
    const safeLeadData = (raw: any): LeadAnalytics => ({
      leadsPerBot: Array.isArray(raw?.leadsPerBot) ? raw.leadsPerBot : [],
      conversionFunnel: {
        conversationsStarted: raw?.conversionFunnel?.conversationsStarted ?? 0,
        conversationsCompleted:
          raw?.conversionFunnel?.conversationsCompleted ?? 0,
        leadsGenerated: raw?.conversionFunnel?.leadsGenerated ?? 0,
      },
      qualityScores: {
        excellent: raw?.qualityScores?.excellent ?? 0,
        good: raw?.qualityScores?.good ?? 0,
        average: raw?.qualityScores?.average ?? 0,
        poor: raw?.qualityScores?.poor ?? 0,
      },
      sources: Array.isArray(raw?.sources) ? raw.sources : [],
    });
    const zeroTrend = { current: 0, previous: 0, change: 0 };
    const safeTrendsData = (raw: any): PerformanceTrends => ({
      weekOverWeek: {
        conversations: raw?.weekOverWeek?.conversations ?? zeroTrend,
        leads: raw?.weekOverWeek?.leads ?? zeroTrend,
        conversionRate: raw?.weekOverWeek?.conversionRate ?? zeroTrend,
      },
      dailyTrend: Array.isArray(raw?.dailyTrend) ? raw.dailyTrend : [],
      engagementPattern: Array.isArray(raw?.engagementPattern)
        ? raw.engagementPattern
        : [],
    });
    const safeSatisfactionData = (raw: any): SatisfactionAnalytics => ({
      sentimentBreakdown: {
        positive: raw?.sentimentBreakdown?.positive ?? 0,
        neutral: raw?.sentimentBreakdown?.neutral ?? 0,
        negative: raw?.sentimentBreakdown?.negative ?? 0,
      },
      averageRating: raw?.averageRating ?? 0,
      totalRatings: raw?.totalRatings ?? 0,
      topComplaints: Array.isArray(raw?.topComplaints) ? raw.topComplaints : [],
      commonQuestions: Array.isArray(raw?.commonQuestions)
        ? raw.commonQuestions
        : [],
      escalationRate: raw?.escalationRate ?? 0,
    });

    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const [conversations, leads, trends, satisfaction] = await Promise.all([
          fetch(`/api/analytics/conversations/${organizationId}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch(`/api/analytics/leads/${organizationId}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch(`/api/analytics/trends/${organizationId}?days=30`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch(`/api/analytics/satisfaction/${organizationId}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);

        setConversationData(safeConversationData(conversations));
        setLeadData(safeLeadData(leads));
        setTrendsData(safeTrendsData(trends));
        setSatisfactionData(safeSatisfactionData(satisfaction));
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    if (organizationId) {
      fetchAnalytics();
    } else {
      setLoading(false);
    }
  }, [organizationId]);

  const tabs: {
    id: AnalyticsTab;
    label: string;
    icon: typeof MessageSquare;
  }[] = [
    { id: 'conversations', label: 'Conversations', icon: MessageSquare },
    { id: 'leads', label: 'Leads', icon: Users },
    { id: 'performance', label: 'Performance', icon: TrendingUp },
    { id: 'satisfaction', label: 'Satisfaction', icon: Star },
  ];

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  const qualityChartData = leadData
    ? [
        { name: 'Excellent', value: leadData.qualityScores.excellent, fill: CHART_GREEN },
        { name: 'Good', value: leadData.qualityScores.good, fill: CHART_CYAN },
        { name: 'Average', value: leadData.qualityScores.average, fill: CHART_AMBER },
        { name: 'Poor', value: leadData.qualityScores.poor, fill: CHART_RED },
      ]
    : [];

  const sentimentChartData = satisfactionData
    ? [
        { name: 'Positive', value: satisfactionData.sentimentBreakdown.positive, fill: CHART_GREEN },
        { name: 'Neutral', value: satisfactionData.sentimentBreakdown.neutral, fill: CHART_MUTED },
        { name: 'Negative', value: satisfactionData.sentimentBreakdown.negative, fill: CHART_RED },
      ]
    : [];

  const tooltipStyle = {
    backgroundColor: '#12151B',
    border: `1px solid ${CHART_BORDER}`,
    borderRadius: '2px',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '12px',
    color: '#D8DDE4',
  };

  return (
    <Panel eyebrow="Deep insights into bot performance" title="Analytics Dashboard" bodyClassName="p-0">
      {/* Tab Navigation */}
      <div className="flex border-b border-console-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs uppercase tracking-wide transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-accent-cyan text-accent-cyan'
                : 'text-console-muted hover:text-console-text'
            }`}
          >
            <tab.icon size={14} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {/* Conversations Tab */}
        {activeTab === 'conversations' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <HudMetric
                icon={MessageSquare}
                label="Total Conversations"
                value={conversationData?.totalConversations || 0}
                accent="cyan"
                loading={loading}
              />
              <HudMetric
                icon={Clock}
                label="Avg Duration"
                value={
                  conversationData ? formatDuration(conversationData.avgDuration) : '0m 0s'
                }
                accent="cyan"
                loading={loading}
              />
              <HudMetric
                icon={CheckCircle}
                label="Completion Rate"
                value={`${conversationData?.completionRate.toFixed(1) ?? 0}%`}
                accent="green"
                loading={loading}
              />
            </div>

            {conversationData && conversationData.activeHours.length > 0 && (
              <div className="border border-console-border bg-console-surface p-4">
                <h3 className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-console-muted">
                  <Activity size={14} className="text-accent-cyan" />
                  Active Hours
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={conversationData.activeHours}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_BORDER} />
                    <XAxis
                      dataKey="hour"
                      stroke={CHART_MUTED}
                      tick={{ fontFamily: 'JetBrains Mono', fontSize: 11 }}
                      label={{ value: 'Hour of Day', position: 'insideBottom', offset: -5, fill: CHART_MUTED }}
                    />
                    <YAxis
                      stroke={CHART_MUTED}
                      tick={{ fontFamily: 'JetBrains Mono', fontSize: 11 }}
                      label={{ value: 'Count', angle: -90, position: 'insideLeft', fill: CHART_MUTED }}
                    />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(45,226,230,0.06)' }} />
                    <Bar dataKey="count" radius={[0, 0, 0, 0]}>
                      {conversationData.activeHours.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.hour === conversationData.peakHour ? CHART_CYAN : CHART_BORDER}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Leads Tab */}
        {activeTab === 'leads' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <HudMetric
                icon={Users}
                label="Conversations Started"
                value={leadData?.conversionFunnel.conversationsStarted || 0}
                accent="cyan"
                loading={loading}
              />
              <HudMetric
                icon={CheckCircle}
                label="Conversations Completed"
                value={leadData?.conversionFunnel.conversationsCompleted || 0}
                accent="green"
                loading={loading}
              />
              <HudMetric
                icon={Star}
                label="Leads Generated"
                value={leadData?.conversionFunnel.leadsGenerated || 0}
                accent="cyan"
                loading={loading}
              />
            </div>

            {leadData && qualityChartData.length > 0 && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="border border-console-border bg-console-surface p-4">
                  <h3 className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-console-muted">
                    <Star size={14} className="text-accent-cyan" />
                    Lead Quality Distribution
                  </h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={qualityChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => `${entry.name}: ${entry.value}`}
                        outerRadius={80}
                        dataKey="value"
                        stroke="none"
                      >
                        {qualityChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="border border-console-border bg-console-surface p-4">
                  <h3 className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-console-muted">
                    <MessageSquare size={14} className="text-accent-cyan" />
                    Top Performing Bots
                  </h3>
                  <div className="space-y-1.5">
                    {leadData.leadsPerBot.slice(0, 5).map((bot, index) => (
                      <div
                        key={bot.botId}
                        className="flex items-center justify-between border border-console-border px-3 py-2"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-6 w-6 items-center justify-center border border-accent-cyan/40 font-mono text-xs text-accent-cyan">
                            {index + 1}
                          </div>
                          <span className="font-mono text-sm text-console-text">
                            {bot.botName}
                          </span>
                        </div>
                        <span className="font-mono text-sm font-semibold text-accent-cyan">
                          {bot.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === 'performance' && (
          <div className="space-y-4">
            {trendsData && (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <HudMetric
                    icon={MessageSquare}
                    label="Conversations Growth"
                    value={`${trendsData.weekOverWeek.conversations.change > 0 ? '+' : ''}${trendsData.weekOverWeek.conversations.change.toFixed(1)}%`}
                    sublabel={`${trendsData.weekOverWeek.conversations.current} this week`}
                    accent="cyan"
                    loading={loading}
                  />
                  <HudMetric
                    icon={Users}
                    label="Leads Growth"
                    value={`${trendsData.weekOverWeek.leads.change > 0 ? '+' : ''}${trendsData.weekOverWeek.leads.change.toFixed(1)}%`}
                    sublabel={`${trendsData.weekOverWeek.leads.current} this week`}
                    accent="green"
                    loading={loading}
                  />
                  <HudMetric
                    icon={TrendingUp}
                    label="Conversion Rate"
                    value={`${trendsData.weekOverWeek.conversionRate.current.toFixed(1)}%`}
                    sublabel={`${trendsData.weekOverWeek.conversionRate.change > 0 ? '+' : ''}${trendsData.weekOverWeek.conversionRate.change.toFixed(1)}% change`}
                    accent="cyan"
                    loading={loading}
                  />
                </div>

                <div className="border border-console-border bg-console-surface p-4">
                  <h3 className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-console-muted">
                    <TrendingUp size={14} className="text-accent-cyan" />
                    30-Day Trend
                  </h3>
                  <div className="mb-2 flex gap-4 font-mono text-[11px] text-console-muted">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan" /> conversations
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent-green" /> leads
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={trendsData.dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_BORDER} />
                      <XAxis dataKey="date" stroke={CHART_MUTED} tick={{ fontFamily: 'JetBrains Mono', fontSize: 11 }} />
                      <YAxis stroke={CHART_MUTED} tick={{ fontFamily: 'JetBrains Mono', fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line
                        type="monotone"
                        dataKey="conversations"
                        stroke={CHART_CYAN}
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="leads"
                        stroke={CHART_GREEN}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}

        {/* Satisfaction Tab */}
        {activeTab === 'satisfaction' && (
          <div className="space-y-4">
            {satisfactionData && (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <HudMetric
                    icon={Star}
                    label="Average Rating"
                    value={satisfactionData.averageRating.toFixed(1)}
                    sublabel={`${satisfactionData.totalRatings} ratings`}
                    accent="amber"
                    loading={loading}
                  />
                  <HudMetric
                    icon={ThumbsUp}
                    label="Positive Sentiment"
                    value={`${(
                      (satisfactionData.sentimentBreakdown.positive /
                        (satisfactionData.sentimentBreakdown.positive +
                          satisfactionData.sentimentBreakdown.neutral +
                          satisfactionData.sentimentBreakdown.negative || 1)) *
                      100
                    ).toFixed(0)}%`}
                    accent="green"
                    loading={loading}
                  />
                  <HudMetric
                    icon={ThumbsDown}
                    label="Escalation Rate"
                    value={`${satisfactionData.escalationRate.toFixed(1)}%`}
                    accent="red"
                    loading={loading}
                  />
                </div>

                {sentimentChartData.length > 0 && (
                  <div className="border border-console-border bg-console-surface p-4">
                    <h3 className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-console-muted">
                      <Activity size={14} className="text-accent-cyan" />
                      Sentiment Breakdown
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={sentimentChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => `${entry.name}: ${entry.value}`}
                          outerRadius={100}
                          dataKey="value"
                          stroke="none"
                        >
                          {sentimentChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
};
