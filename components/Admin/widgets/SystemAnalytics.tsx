import { MessageSquare, RefreshCw, TrendingUp, Users } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { dbService } from '../../../services/dbService';
import { MetricCard } from '../../UI/MetricCard';

interface AnalyticsSummary {
  totalConversations: number;
  totalLeads: number;
  conversionRate: number;
}

export const SystemAnalytics: React.FC = () => {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await dbService.getAdminAnalyticsSummary();
      setSummary(data);
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Analytics summary error:', err);
      setError('Failed to load analytics summary');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800">{error}</p>
        <button
          type="button"
          onClick={fetchSummary}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <RefreshCw size={16} className="inline mr-2" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">System Analytics</h2>
        <button
          type="button"
          onClick={fetchSummary}
          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center space-x-2"
        >
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            icon={MessageSquare}
            label="Total Conversations"
            value={summary.totalConversations}
            loading={loading}
          />
          <MetricCard
            icon={Users}
            label="Total Leads"
            value={summary.totalLeads}
            loading={loading}
          />
          <MetricCard
            icon={TrendingUp}
            label="Conversion Rate"
            value={`${summary.conversionRate.toFixed(1)}%`}
            status={
              summary.conversionRate > 20
                ? 'healthy'
                : summary.conversionRate > 10
                  ? 'warning'
                  : 'critical'
            }
            loading={loading}
          />
        </div>
      )}
    </div>
  );
};
