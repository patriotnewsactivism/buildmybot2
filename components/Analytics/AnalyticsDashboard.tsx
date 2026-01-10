import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Calendar,
  DollarSign,
  Loader,
  MessageSquare,
  TrendingUp,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { buildApiUrl } from '../../services/apiConfig';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  color: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  icon,
  color,
}) => {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-lg ${color}`}>{icon}</div>
        {change !== undefined && (
          <div
            className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-emerald-600' : isNegative ? 'text-red-600' : 'text-slate-500'}`}
          >
            {isPositive && <ArrowUp size={16} />}
            {isNegative && <ArrowDown size={16} />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-sm text-slate-500 mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
};

interface AnalyticsMetrics {
  totalConversations: number;
  totalLeads: number;
  conversionRate: number;
  avgResponseTime: number;
}

interface TimeSeriesDataPoint {
  date: string;
  conversations: number;
  leads: number;
}

interface BotPerformance {
  botId: string;
  botName: string;
  conversationCount: number;
  leadCount: number;
  conversionRate?: number;
  avgMessages?: number;
}

interface AnalyticsDashboardProps {
  organizationId?: string;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  organizationId,
}) => {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(30);
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<
    TimeSeriesDataPoint[] | null
  >(null);
  const [performance, setPerformance] = useState<BotPerformance[] | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch metrics
      const metricsRes = await fetch(
        buildApiUrl(`/analytics/metrics/${organizationId}`),
      );
      const metricsData = await metricsRes.json();
      setMetrics(metricsData);

      // Fetch time series
      const timeSeriesRes = await fetch(
        buildApiUrl(
          `/analytics/timeseries/${organizationId}?days=${timeRange}`,
        ),
      );
      const timeSeriesData = await timeSeriesRes.json();
      setTimeSeriesData(timeSeriesData);

      // Fetch performance
      const performanceRes = await fetch(
        buildApiUrl(`/analytics/performance/${organizationId}`),
      );
      const performanceData = await performanceRes.json();
      setPerformance(performanceData);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId, timeRange]);

  useEffect(() => {
    if (organizationId) {
      fetchAnalytics();
    }
  }, [organizationId, fetchAnalytics]);

  const getChartData = () => {
    if (!timeSeriesData || !timeSeriesData.length) {
      return {
        labels: [],
        datasets: [],
      };
    }

    return {
      labels: timeSeriesData.map((d) =>
        new Date(d.date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
      ),
      datasets: [
        {
          label: 'Conversations',
          data: timeSeriesData.map((d) => d.conversations || 0),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
        },
        {
          label: 'Leads',
          data: timeSeriesData.map((d) => d.leads || 0),
          borderColor: 'rgb(16, 185, 129)',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4,
        },
      ],
    };
  };

  const getBotPerformanceData = () => {
    if (!performance || !performance.length) {
      return {
        labels: [],
        datasets: [],
      };
    }

    return {
      labels: performance.map((p) => p.botName),
      datasets: [
        {
          label: 'Conversations',
          data: performance.map((p) => p.conversationCount || 0),
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
        },
        {
          label: 'Leads',
          data: performance.map((p) => p.leadCount || 0),
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
        },
      },
    },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-900" />
          <p className="text-slate-500">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Activity size={48} className="mx-auto mb-4 text-slate-300" />
          <p className="text-slate-500">
            Please select an organization to view analytics
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Analytics Dashboard
          </h2>
          <p className="text-slate-500">
            Track your bot performance and conversions
          </p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((days) => (
            <button
              type="button"
              key={days}
              onClick={() => setTimeRange(days)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                timeRange === days
                  ? 'bg-blue-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {days} Days
            </button>
          ))}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Conversations"
          value={metrics?.totalConversations?.toLocaleString() || '0'}
          change={metrics?.conversationGrowth}
          icon={<MessageSquare size={24} />}
          color="bg-blue-50 text-blue-900"
        />
        <MetricCard
          title="Total Leads"
          value={metrics?.totalLeads?.toLocaleString() || '0'}
          change={metrics?.leadGrowth}
          icon={<Users size={24} />}
          color="bg-emerald-50 text-emerald-900"
        />
        <MetricCard
          title="Conversion Rate"
          value={`${metrics?.conversionRate?.toFixed(1) || '0'}%`}
          change={metrics?.conversionRateChange}
          icon={<TrendingUp size={24} />}
          color="bg-purple-50 text-purple-900"
        />
        <MetricCard
          title="Active Bots"
          value={metrics?.activeBots || '0'}
          icon={<Activity size={24} />}
          color="bg-amber-50 text-amber-900"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Time Series Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-blue-50 text-blue-900 rounded-lg">
              <BarChart3 size={18} />
            </div>
            <h3 className="font-bold text-slate-800">Activity Over Time</h3>
          </div>
          <div style={{ height: '300px' }}>
            <Line data={getChartData()} options={chartOptions} />
          </div>
        </div>

        {/* Bot Performance Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-emerald-50 text-emerald-900 rounded-lg">
              <Activity size={18} />
            </div>
            <h3 className="font-bold text-slate-800">Bot Performance</h3>
          </div>
          <div style={{ height: '300px' }}>
            <Bar data={getBotPerformanceData()} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Performance Table */}
      {performance && performance.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 size={18} className="text-blue-900" />
              Detailed Bot Performance
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Bot Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Conversations
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Leads
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Conversion Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Avg. Messages
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {performance.map((bot) => (
                  <tr
                    key={bot.botId || bot.botName}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-slate-900">
                        {bot.botName}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                      {bot.conversationCount || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                      {bot.leadCount || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-emerald-100 text-emerald-800 rounded-full">
                        {bot.conversionRate
                          ? `${bot.conversionRate.toFixed(1)}%`
                          : '0%'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                      {bot.avgMessages ? bot.avgMessages.toFixed(1) : '0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
