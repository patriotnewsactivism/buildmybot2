import {
  DollarSign,
  MessageSquare,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';

interface QuickMetrics {
  totalConversations: number;
  totalLeads: number;
  conversionRate: number;
  estimatedValue: number;
  conversationGrowth?: number;
  leadGrowth?: number;
}

interface QuickMetricsWidgetProps {
  averageLeadValue?: number;
}

export const QuickMetricsWidget: React.FC<QuickMetricsWidgetProps> = ({
  averageLeadValue = 100,
}) => {
  const [metrics, setMetrics] = useState<QuickMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch('/api/clients/overview', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setMetrics({
            totalConversations: data.stats?.totalConversations || 0,
            totalLeads: data.stats?.leadCount || 0,
            conversionRate: data.stats?.conversionRate || 0,
            estimatedValue: (data.stats?.leadCount || 0) * averageLeadValue,
            conversationGrowth: data.stats?.conversationGrowth,
            leadGrowth: data.stats?.leadGrowth,
          });
        }
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [averageLeadValue]);

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-1/3 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-slate-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const metricCards = [
    {
      label: 'Conversations',
      value: metrics?.totalConversations?.toLocaleString() || '0',
      icon: MessageSquare,
      color: 'from-blue-500 to-blue-600',
      growth: metrics?.conversationGrowth,
    },
    {
      label: 'Leads Captured',
      value: metrics?.totalLeads?.toLocaleString() || '0',
      icon: Users,
      color: 'from-emerald-500 to-emerald-600',
      growth: metrics?.leadGrowth,
    },
    {
      label: 'Conversion Rate',
      value: `${(metrics?.conversionRate || 0).toFixed(1)}%`,
      icon: Target,
      color: 'from-purple-500 to-purple-600',
    },
    {
      label: 'Est. Lead Value',
      value: `$${(metrics?.estimatedValue || 0).toLocaleString()}`,
      icon: DollarSign,
      color: 'from-amber-500 to-amber-600',
    },
  ];

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-4 md:p-6 text-white">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-emerald-400" />
          <h3 className="font-bold text-lg">Performance Snapshot</h3>
        </div>
        <span className="text-xs text-slate-400">Last 30 days</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {metricCards.map((metric) => (
          <div
            key={metric.label}
            className="bg-white/5 rounded-lg p-3 md:p-4 border border-white/10"
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`p-1.5 rounded-lg bg-gradient-to-br ${metric.color}`}
              >
                <metric.icon size={14} className="text-white" />
              </div>
              <span className="text-xs text-slate-400">{metric.label}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xl md:text-2xl font-bold">
                {metric.value}
              </span>
              {metric.growth !== undefined && (
                <span
                  className={`text-xs font-medium ${
                    metric.growth > 0
                      ? 'text-emerald-400'
                      : metric.growth < 0
                        ? 'text-red-400'
                        : 'text-slate-400'
                  }`}
                >
                  {metric.growth > 0 ? '+' : ''}
                  {metric.growth.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">
            Your bots are generating value for your business
          </span>
          <a
            href="/analytics"
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            View Details
          </a>
        </div>
      </div>
    </div>
  );
};

export default QuickMetricsWidget;
