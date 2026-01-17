import {
  Activity,
  BarChart3,
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
import { PlayfulMetricCard } from '../UI/PlayfulMetricCard';

interface ComprehensiveAnalyticsProps {
  organizationId: string;
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

export const ComprehensiveAnalytics: React.FC<ComprehensiveAnalyticsProps> = ({
  organizationId,
}) => {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('conversations');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);

  const [conversationData, setConversationData] =
    useState<ConversationAnalytics | null>(null);
  const [leadData, setLeadData] = useState<LeadAnalytics | null>(null);
  const [trendsData, setTrendsData] = useState<PerformanceTrends | null>(null);
  const [satisfactionData, setSatisfactionData] =
    useState<SatisfactionAnalytics | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const [conversations, leads, trends, satisfaction] = await Promise.all([
          fetch(`/api/analytics/conversations/${organizationId}`).then((r) =>
            r.json(),
          ),
          fetch(`/api/analytics/leads/${organizationId}`).then((r) => r.json()),
          fetch(`/api/analytics/trends/${organizationId}?days=30`).then((r) =>
            r.json(),
          ),
          fetch(`/api/analytics/satisfaction/${organizationId}`).then((r) =>
            r.json(),
          ),
        ]);

        setConversationData(conversations);
        setLeadData(leads);
        setTrendsData(trends);
        setSatisfactionData(satisfaction);
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    if (organizationId) {
      fetchAnalytics();
    }
  }, [organizationId, dateRange]);

  const tabs: { id: AnalyticsTab; label: string; icon: typeof MessageSquare }[] =
    [
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
        { name: 'Excellent', value: leadData.qualityScores.excellent, fill: '#10b981' },
        { name: 'Good', value: leadData.qualityScores.good, fill: '#3b82f6' },
        { name: 'Average', value: leadData.qualityScores.average, fill: '#f59e0b' },
        { name: 'Poor', value: leadData.qualityScores.poor, fill: '#ef4444' },
      ]
    : [];

  const sentimentChartData = satisfactionData
    ? [
        {
          name: 'Positive',
          value: satisfactionData.sentimentBreakdown.positive,
          fill: '#10b981',
        },
        {
          name: 'Neutral',
          value: satisfactionData.sentimentBreakdown.neutral,
          fill: '#6b7280',
        },
        {
          name: 'Negative',
          value: satisfactionData.sentimentBreakdown.negative,
          fill: '#ef4444',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Playful Header with Gradient */}
      <div className="relative overflow-hidden rounded-3xl p-8 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 shadow-2xl">
        {/* Animated background elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-pink-400/30 to-yellow-400/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-blue-400/30 to-purple-400/30 rounded-full blur-2xl animate-float" />

        {/* Content */}
        <div className="relative z-10">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-2 flex items-center gap-3">
            <BarChart3 size={36} />
            Analytics Dashboard
          </h2>
          <p className="text-purple-100 text-lg">
            Deep insights into your bot performance
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-2xl border-2 border-purple-100 overflow-hidden shadow-sm">
        <div className="flex border-b-2 border-purple-100">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-6 py-4 flex items-center justify-center gap-2 font-semibold transition-all duration-300 ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white border-b-4 border-purple-700'
                  : 'text-slate-600 hover:bg-purple-50 hover:text-purple-700'
              }`}
            >
              <tab.icon
                size={20}
                className={activeTab === tab.id ? 'animate-bounce' : ''}
              />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Conversations Tab */}
          {activeTab === 'conversations' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <PlayfulMetricCard
                  icon={MessageSquare}
                  label="Total Conversations"
                  value={conversationData?.totalConversations || 0}
                  gradient="from-blue-500 to-cyan-500"
                  illustration="💬"
                  loading={loading}
                />
                <PlayfulMetricCard
                  icon={Clock}
                  label="Avg Duration"
                  value={
                    conversationData
                      ? formatDuration(conversationData.avgDuration)
                      : '0m 0s'
                  }
                  gradient="from-emerald-500 to-teal-500"
                  illustration="⏱️"
                  loading={loading}
                />
                <PlayfulMetricCard
                  icon={CheckCircle}
                  label="Completion Rate"
                  value={`${conversationData?.completionRate.toFixed(1) || 0}%`}
                  gradient="from-violet-500 to-purple-600"
                  illustration="✅"
                  loading={loading}
                />
              </div>

              {/* Peak Hours Chart */}
              {conversationData && conversationData.activeHours.length > 0 && (
                <div className="bg-gradient-to-br from-white to-purple-50 rounded-2xl p-6 border-2 border-purple-100">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800">
                    <Activity className="text-purple-600" />
                    Active Hours
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={conversationData.activeHours}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                      <XAxis
                        dataKey="hour"
                        stroke="#64748b"
                        label={{ value: 'Hour of Day', position: 'insideBottom', offset: -5 }}
                      />
                      <YAxis stroke="#64748b" label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '2px solid #8b5cf6',
                          borderRadius: '12px',
                        }}
                      />
                      <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                        {conversationData.activeHours.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              entry.hour === conversationData.peakHour
                                ? '#8b5cf6'
                                : '#c4b5fd'
                            }
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
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <PlayfulMetricCard
                  icon={Users}
                  label="Conversations Started"
                  value={leadData?.conversionFunnel.conversationsStarted || 0}
                  gradient="from-blue-500 to-indigo-600"
                  illustration="🚀"
                  loading={loading}
                />
                <PlayfulMetricCard
                  icon={CheckCircle}
                  label="Conversations Completed"
                  value={leadData?.conversionFunnel.conversationsCompleted || 0}
                  gradient="from-emerald-500 to-teal-600"
                  illustration="✅"
                  loading={loading}
                />
                <PlayfulMetricCard
                  icon={Star}
                  label="Leads Generated"
                  value={leadData?.conversionFunnel.leadsGenerated || 0}
                  gradient="from-pink-500 to-rose-600"
                  illustration="⭐"
                  loading={loading}
                />
              </div>

              {/* Lead Quality Distribution */}
              {leadData && qualityChartData.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-gradient-to-br from-white to-purple-50 rounded-2xl p-6 border-2 border-purple-100">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800">
                      <Star className="text-purple-600" />
                      Lead Quality Distribution
                    </h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={qualityChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => `${entry.name}: ${entry.value}`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {qualityChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Leads Per Bot */}
                  <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl p-6 border-2 border-blue-100">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800">
                      <MessageSquare className="text-blue-600" />
                      Top Performing Bots
                    </h3>
                    <div className="space-y-3">
                      {leadData.leadsPerBot.slice(0, 5).map((bot, index) => (
                        <div
                          key={bot.botId}
                          className="flex items-center justify-between p-3 bg-white rounded-lg border border-blue-100"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                              {index + 1}
                            </div>
                            <span className="font-semibold text-slate-700">
                              {bot.botName}
                            </span>
                          </div>
                          <span className="px-3 py-1 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold text-sm">
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
            <div className="space-y-6">
              {trendsData && (
                <>
                  {/* Week over Week */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <PlayfulMetricCard
                      icon={MessageSquare}
                      label="Conversations Growth"
                      value={`${trendsData.weekOverWeek.conversations.change > 0 ? '+' : ''}${trendsData.weekOverWeek.conversations.change.toFixed(1)}%`}
                      gradient="from-blue-500 to-cyan-500"
                      trend={`${trendsData.weekOverWeek.conversations.current} this week`}
                      illustration="📊"
                      loading={loading}
                    />
                    <PlayfulMetricCard
                      icon={Users}
                      label="Leads Growth"
                      value={`${trendsData.weekOverWeek.leads.change > 0 ? '+' : ''}${trendsData.weekOverWeek.leads.change.toFixed(1)}%`}
                      gradient="from-emerald-500 to-teal-600"
                      trend={`${trendsData.weekOverWeek.leads.current} this week`}
                      illustration="📈"
                      loading={loading}
                    />
                    <PlayfulMetricCard
                      icon={TrendingUp}
                      label="Conversion Rate"
                      value={`${trendsData.weekOverWeek.conversionRate.current.toFixed(1)}%`}
                      gradient="from-violet-500 to-purple-600"
                      trend={`${trendsData.weekOverWeek.conversionRate.change > 0 ? '+' : ''}${trendsData.weekOverWeek.conversionRate.change.toFixed(1)}%`}
                      illustration="🎯"
                      loading={loading}
                    />
                  </div>

                  {/* Daily Trend Chart */}
                  <div className="bg-gradient-to-br from-white to-purple-50 rounded-2xl p-6 border-2 border-purple-100">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800">
                      <TrendingUp className="text-purple-600" />
                      30-Day Trend
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={trendsData.dailyTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                        <XAxis dataKey="date" stroke="#64748b" />
                        <YAxis stroke="#64748b" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'white',
                            border: '2px solid #8b5cf6',
                            borderRadius: '12px',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="conversations"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={{ fill: '#3b82f6' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="leads"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={{ fill: '#10b981' }}
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
            <div className="space-y-6">
              {satisfactionData && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <PlayfulMetricCard
                      icon={Star}
                      label="Average Rating"
                      value={satisfactionData.averageRating.toFixed(1)}
                      gradient="from-amber-500 to-orange-600"
                      illustration="⭐"
                      trend={`${satisfactionData.totalRatings} ratings`}
                      loading={loading}
                    />
                    <PlayfulMetricCard
                      icon={ThumbsUp}
                      label="Positive Sentiment"
                      value={`${((satisfactionData.sentimentBreakdown.positive / (satisfactionData.sentimentBreakdown.positive + satisfactionData.sentimentBreakdown.neutral + satisfactionData.sentimentBreakdown.negative || 1)) * 100).toFixed(0)}%`}
                      gradient="from-emerald-500 to-teal-600"
                      illustration="😊"
                      loading={loading}
                    />
                    <PlayfulMetricCard
                      icon={ThumbsDown}
                      label="Escalation Rate"
                      value={`${satisfactionData.escalationRate.toFixed(1)}%`}
                      gradient="from-rose-500 to-pink-600"
                      illustration="⚠️"
                      loading={loading}
                    />
                  </div>

                  {/* Sentiment Pie Chart */}
                  {sentimentChartData.length > 0 && (
                    <div className="bg-gradient-to-br from-white to-purple-50 rounded-2xl p-6 border-2 border-purple-100">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800">
                        <Activity className="text-purple-600" />
                        Sentiment Breakdown
                      </h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={sentimentChartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(entry) =>
                              `${entry.name}: ${entry.value}`
                            }
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {sentimentChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
