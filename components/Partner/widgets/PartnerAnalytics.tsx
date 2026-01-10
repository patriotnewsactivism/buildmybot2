import { RefreshCw, Target, TrendingUp, Users } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { dbService } from '../../../services/dbService';
import { MetricCard } from '../../UI/MetricCard';

interface FunnelData {
  clicks: number;
  signups: number;
  paid: number;
}

interface RetentionData {
  active: number;
  churned: number;
}

export const PartnerAnalytics: React.FC = () => {
  const [funnel, setFunnel] = useState<FunnelData>({
    clicks: 0,
    signups: 0,
    paid: 0,
  });
  const [retention, setRetention] = useState<RetentionData>({
    active: 0,
    churned: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      const data = await dbService.getPartnerAnalytics();
      setFunnel(data.funnel);
      setRetention(data.retention);
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Partner analytics error:', err);
      setError('Failed to load analytics');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800">{error}</p>
        <button
          type="button"
          onClick={fetchAnalytics}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <RefreshCw size={16} className="inline mr-2" />
          Retry
        </button>
      </div>
    );
  }

  const conversionRate =
    funnel.clicks > 0 ? (funnel.signups / funnel.clicks) * 100 : 0;
  const paidRate =
    funnel.signups > 0 ? (funnel.paid / funnel.signups) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">
          Performance Analytics
        </h2>
        <button
          type="button"
          onClick={fetchAnalytics}
          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center space-x-2"
        >
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          icon={Target}
          label="Clicks"
          value={funnel.clicks}
          loading={loading}
        />
        <MetricCard
          icon={Users}
          label="Signups"
          value={funnel.signups}
          loading={loading}
        />
        <MetricCard
          icon={TrendingUp}
          label="Paid"
          value={funnel.paid}
          loading={loading}
        />
        <MetricCard
          icon={TrendingUp}
          label="Signup Conversion"
          value={`${conversionRate.toFixed(1)}%`}
          status={
            conversionRate > 10
              ? 'healthy'
              : conversionRate > 5
                ? 'warning'
                : 'critical'
          }
          loading={loading}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Retention Snapshot
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm text-slate-700">
          <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
            <span>Active Clients</span>
            <span className="font-semibold">{retention.active}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
            <span>Churned Clients</span>
            <span className="font-semibold">{retention.churned}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <span>Paid Conversion</span>
            <span className="font-semibold">{paidRate.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <span>Net Active</span>
            <span className="font-semibold">
              {retention.active - retention.churned}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
