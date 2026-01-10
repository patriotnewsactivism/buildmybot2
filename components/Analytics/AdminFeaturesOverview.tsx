import {
  Activity,
  AlertCircle,
  Globe,
  Layout,
  Loader,
  TrendingUp,
  Zap,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../services/apiConfig';

interface PlanStat {
  name: string;
  users: number;
  revenueCents: number;
}

interface AddonStat {
  name: string;
  users: number;
  revenueCents: number;
}

interface UsageStats {
  totalConversations: number;
  totalLeads: number;
  totalBots: number;
  totalUsers: number;
}

interface StatsState {
  plans: PlanStat[];
  addons: AddonStat[];
  usage: UsageStats;
}

const formatCurrency = (cents: number): string => {
  return `$${(cents / 100).toLocaleString()}`;
};

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
};

const getAddonIcon = (name: string) => {
  switch (name.toLowerCase()) {
    case 'whitelabeling':
      return { icon: Globe, color: 'text-blue-500' };
    case 'voice minutes':
      return { icon: Zap, color: 'text-yellow-500' };
    case 'premium templates':
      return { icon: Layout, color: 'text-purple-500' };
    default:
      return { icon: Globe, color: 'text-green-500' };
  }
};

const AdminFeaturesOverview = () => {
  const [stats, setStats] = useState<StatsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(
          `${API_BASE}/admin/financial/features-usage`,
          {
            credentials: 'include',
          },
        );

        if (!response.ok) {
          throw new Error('Failed to fetch feature usage data');
        }

        const data = await response.json();
        setStats(data);
      } catch (err) {
        console.error('Error fetching feature usage:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            Feature Usage & Revenue
          </h2>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            Feature Usage & Revenue
          </h2>
        </div>
        <div className="flex items-center justify-center py-12 text-red-500">
          <AlertCircle className="w-5 h-5 mr-2" />
          {error}
        </div>
      </div>
    );
  }

  const usageItems = stats
    ? [
        {
          name: 'Total Conversations',
          total: formatNumber(stats.usage.totalConversations),
        },
        { name: 'Total Leads', total: formatNumber(stats.usage.totalLeads) },
        { name: 'Active Bots', total: formatNumber(stats.usage.totalBots) },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-600" />
          Feature Usage & Revenue
        </h2>
        <span className="text-sm text-gray-500">Real-time data</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-4">
            Subscription Tiers
          </h3>
          <div className="space-y-4">
            {stats?.plans && stats.plans.length > 0 ? (
              stats.plans.map((plan) => (
                <div
                  key={plan.name}
                  className="flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-900">{plan.name}</p>
                    <p className="text-xs text-gray-500">
                      {plan.users} Active Users
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">
                      {formatCurrency(plan.revenueCents)}/mo
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">
                No subscription data available
              </p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-4">
            Add-ons & Premium Features
          </h3>
          <div className="space-y-4">
            {stats?.addons && stats.addons.length > 0 ? (
              stats.addons.map((addon) => {
                const { icon: Icon, color } = getAddonIcon(addon.name);
                return (
                  <div key={addon.name} className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg bg-gray-50 ${color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{addon.name}</p>
                      <p className="text-xs text-gray-500">
                        {addon.users} Subscriptions
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">
                        {formatCurrency(addon.revenueCents)}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-gray-500 text-sm">No addon data available</p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-4">
            System Usage
          </h3>
          <div className="space-y-6">
            {usageItems.map((item) => (
              <div key={item.name}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-700">
                    {item.name}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-2xl font-bold text-gray-900">
                    {item.total}
                  </span>
                  <TrendingUp className="w-4 h-4 text-green-500 mb-1" />
                </div>
                <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2">
                  <div
                    className="bg-indigo-600 h-1.5 rounded-full"
                    style={{ width: '65%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminFeaturesOverview;
