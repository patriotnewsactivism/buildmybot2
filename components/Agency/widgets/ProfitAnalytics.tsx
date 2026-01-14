import {
  Calendar,
  DollarSign,
  RefreshCw,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MetricCard } from '../../UI/MetricCard';

interface ProfitStats {
  totalProfitCents: number;
  totalWholesaleCents: number;
  totalRetailCents: number;
  transactionCount: number;
  averageProfitPerEvent: number;
  eventBreakdown: {
    voice_minute: { count: number; profitCents: number };
    chat_token: { count: number; profitCents: number };
  };
}

interface ProfitDataPoint {
  date: string;
  profit: number;
  wholesale: number;
  retail: number;
}

interface EventBreakdown {
  name: string;
  count: number;
  profit: number;
}

const defaultStats: ProfitStats = {
  totalProfitCents: 0,
  totalWholesaleCents: 0,
  totalRetailCents: 0,
  transactionCount: 0,
  averageProfitPerEvent: 0,
  eventBreakdown: {
    voice_minute: { count: 0, profitCents: 0 },
    chat_token: { count: 0, profitCents: 0 },
  },
};

export const ProfitAnalytics: React.FC = () => {
  const [stats, setStats] = useState<ProfitStats>(defaultStats);
  const [timelineData, setTimelineData] = useState<ProfitDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const fetchProfitData = useCallback(async () => {
    setLoading(true);
    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      if (dateRange === '7d') startDate.setDate(endDate.getDate() - 7);
      else if (dateRange === '30d') startDate.setDate(endDate.getDate() - 30);
      else if (dateRange === '90d') startDate.setDate(endDate.getDate() - 90);
      else startDate.setFullYear(2020); // All time

      const response = await fetch(
        `/api/agency/profit-report?start=${startDate.toISOString()}&end=${endDate.toISOString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch profit data');
      }

      const data = await response.json();
      setStats(data.stats || defaultStats);
      setTimelineData(data.timeline || []);
    } catch (err) {
      console.error('Error fetching profit data:', err);
      setStats(defaultStats);
      setTimelineData([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchProfitData();
  }, [fetchProfitData]);

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const eventBreakdownData: EventBreakdown[] = [
    {
      name: 'Voice Minutes',
      count: stats.eventBreakdown.voice_minute.count,
      profit: stats.eventBreakdown.voice_minute.profitCents / 100,
    },
    {
      name: 'Chat Tokens',
      count: stats.eventBreakdown.chat_token.count,
      profit: stats.eventBreakdown.chat_token.profitCents / 100,
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">
          Profit Analytics
        </h2>
        <div className="flex items-center space-x-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>
          <button
            type="button"
            onClick={fetchProfitData}
            disabled={loading}
            className="px-3 md:px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center space-x-2 disabled:opacity-50 text-sm"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Profit Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard
          icon={DollarSign}
          label="Total Profit"
          value={formatCurrency(stats.totalProfitCents)}
          loading={loading}
          status="healthy"
        />
        <MetricCard
          icon={TrendingUp}
          label="Total Revenue (Retail)"
          value={formatCurrency(stats.totalRetailCents)}
          loading={loading}
        />
        <MetricCard
          icon={Zap}
          label="Billable Events"
          value={stats.transactionCount.toLocaleString()}
          loading={loading}
        />
        <MetricCard
          icon={Users}
          label="Avg Profit per Event"
          value={formatCurrency(stats.averageProfitPerEvent || 0)}
          loading={loading}
        />
      </div>

      {/* Profit Timeline Chart */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">
            Profit Over Time
          </h3>
          <Calendar size={20} className="text-slate-400" />
        </div>

        {timelineData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={timelineData}>
              <defs>
                <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                stroke="#94a3b8"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                }}
                formatter={(value: any) => [`$${value.toFixed(2)}`, 'Profit']}
              />
              <Area
                type="monotone"
                dataKey="profit"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#profitGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-64 text-slate-400">
            <div className="text-center">
              <TrendingUp size={48} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">
                {loading ? 'Loading profit data...' : 'No profit data available yet'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Event Type Breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Profit by Event Type
        </h3>

        {eventBreakdownData.some((e) => e.count > 0) ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={eventBreakdownData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" stroke="#94a3b8" style={{ fontSize: '12px' }} />
              <YAxis
                stroke="#94a3b8"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                }}
                formatter={(value: any) => [`$${value.toFixed(2)}`, 'Profit']}
              />
              <Bar dataKey="profit" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-48 text-slate-400">
            <div className="text-center">
              <BarChart size={48} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">No event data available yet</p>
            </div>
          </div>
        )}
      </div>

      {/* Revenue Breakdown */}
      <div className="bg-slate-50 rounded-xl p-4 md:p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">
          Revenue Breakdown
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-600">Client Charges (Retail)</span>
            <span className="font-semibold text-slate-900">
              {formatCurrency(stats.totalRetailCents)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-600">Platform Costs (Wholesale)</span>
            <span className="font-semibold text-red-700">
              -{formatCurrency(stats.totalWholesaleCents)}
            </span>
          </div>
          <div className="border-t border-slate-300 pt-3 flex justify-between items-center">
            <span className="text-sm font-semibold text-slate-700">
              Your Profit (Markup)
            </span>
            <span className="font-bold text-lg text-emerald-700">
              {formatCurrency(stats.totalProfitCents)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
