import { Award, DollarSign, RefreshCw, TrendingUp, Users } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { dbService } from '../../../services/dbService';
import { type Column, DataTable } from '../../UI/DataTable';
import { MetricCard } from '../../UI/MetricCard';

interface PartnerMetric {
  partner: {
    id: string;
    name: string;
    email: string;
    companyName: string | null;
    resellerCode: string | null;
    status: string;
    whitelabelEnabled: boolean;
  };
  clientCount: number;
  totalRevenue: number;
  tier: string;
}

interface LeaderboardEntry {
  id: string;
  name: string;
  resellerCode: string;
  clients: number;
  tier: string;
}

interface PartnerMetricRow extends PartnerMetric {
  id: string;
}

interface LeaderboardRow extends LeaderboardEntry {
  rank: number;
}

export const PartnerOversight: React.FC = () => {
  const [partners, setPartners] = useState<PartnerMetric[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch data independently
      const partnersPromise = dbService.getAdminPartners().catch(e => {
        console.error('Partners fetch failed', e);
        return [];
      });
      const leaderboardPromise = dbService.getAdminPartnerLeaderboard().catch(e => {
        console.error('Leaderboard fetch failed', e);
        return [];
      });

      const [partnersData, leaderboardData] = await Promise.all([partnersPromise, leaderboardPromise]);

      setPartners(partnersData);
      setLeaderboard(leaderboardData);
      setError(null);
    } catch (err) {
      console.error('Error fetching partner data:', err);
      setError('Failed to load partner data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const handleApprovePartner = async (partnerId: string) => {
    if (!confirm('Approve this partner?')) return;

    try {
      await dbService.approvePartner(partnerId);
      alert('Partner approved successfully');
      fetchPartners();
    } catch (err) {
      console.error('Error approving partner:', err);
      alert('Failed to approve partner');
    }
  };

  const totalPartners = partners.length;
  const activePartners = partners.filter(
    (p) => p.partner.status === 'Active',
  ).length;
  const totalClients = partners.reduce((sum, p) => sum + p.clientCount, 0);
  const totalRevenue = partners.reduce((sum, p) => sum + p.totalRevenue, 0);

  const partnerRows: PartnerMetricRow[] = partners.map((metric) => ({
    ...metric,
    id: metric.partner.id,
  }));

  const leaderboardRows: LeaderboardRow[] = leaderboard.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));

  const partnerColumns: Column<PartnerMetricRow>[] = [
    {
      key: 'name',
      label: 'Partner',
      sortable: true,
      render: (metric) => (
        <div>
          <div className="font-medium text-slate-900">
            {metric.partner.companyName || metric.partner.name}
          </div>
          <div className="text-xs text-slate-500">{metric.partner.email}</div>
        </div>
      ),
    },
    {
      key: 'resellerCode',
      label: 'Code',
      sortable: true,
      render: (metric) => (
        <code className="px-2 py-1 bg-slate-100 rounded text-xs font-mono">
          {metric.partner.resellerCode || '-'}
        </code>
      ),
    },
    {
      key: 'clientCount',
      label: 'Clients',
      sortable: true,
      render: (metric) => (
        <span className="font-semibold text-slate-900">
          {metric.clientCount}
        </span>
      ),
    },
    {
      key: 'tier',
      label: 'Tier',
      sortable: true,
      render: (metric) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            metric.tier === 'Elite'
              ? 'bg-purple-100 text-purple-800'
              : metric.tier === 'Gold'
                ? 'bg-yellow-100 text-yellow-800'
                : metric.tier === 'Silver'
                  ? 'bg-slate-100 text-slate-800'
                  : 'bg-blue-100 text-blue-800'
          }`}
        >
          {metric.tier}
        </span>
      ),
    },
    {
      key: 'totalRevenue',
      label: 'Revenue',
      sortable: true,
      render: (metric) => (
        <span className="font-semibold text-green-700">
          ${metric.totalRevenue.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (metric) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            metric.partner.status === 'Active'
              ? 'bg-green-100 text-green-800'
              : metric.partner.status === 'Pending'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
          }`}
        >
          {metric.partner.status}
        </span>
      ),
    },
    {
      key: 'whitelabel',
      label: 'Partner Access',
      render: (metric) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            metric.partner.whitelabelEnabled
              ? 'bg-purple-100 text-purple-800'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {metric.partner.whitelabelEnabled ? 'Enabled' : 'Disabled'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (metric) => (
        <div>
          {metric.partner.status === 'Pending' && (
            <button
              type="button"
              onClick={() => handleApprovePartner(metric.partner.id)}
              className="text-green-600 hover:text-green-800 text-xs font-medium"
            >
              Approve
            </button>
          )}
        </div>
      ),
    },
  ];

  const leaderboardColumns: Column<LeaderboardRow>[] = [
    {
      key: 'rank',
      label: 'Rank',
      render: (entry) => (
        <span className="font-bold text-slate-900">#{entry.rank}</span>
      ),
    },
    {
      key: 'name',
      label: 'Partner',
      sortable: true,
    },
    {
      key: 'clients',
      label: 'Clients',
      sortable: true,
      render: (entry) => (
        <span className="font-semibold text-slate-900">{entry.clients}</span>
      ),
    },
    {
      key: 'tier',
      label: 'Tier',
      sortable: true,
      render: (entry) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            entry.tier === 'Elite'
              ? 'bg-purple-100 text-purple-800'
              : entry.tier === 'Gold'
                ? 'bg-yellow-100 text-yellow-800'
                : entry.tier === 'Silver'
                  ? 'bg-slate-100 text-slate-800'
                  : 'bg-blue-100 text-blue-800'
          }`}
        >
          {entry.tier}
        </span>
      ),
    },
  ];

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800">{error}</p>
        <button
          type="button"
          onClick={fetchPartners}
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
        <h2 className="text-2xl font-bold text-slate-900">Partner Oversight</h2>
        <button
          type="button"
          onClick={fetchPartners}
          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center space-x-2"
        >
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          icon={Users}
          label="Total Partners"
          value={totalPartners}
          loading={loading}
        />
        <MetricCard
          icon={TrendingUp}
          label="Active Partners"
          value={activePartners}
          loading={loading}
        />
        <MetricCard
          icon={Award}
          label="Total Clients"
          value={totalClients}
          loading={loading}
        />
        <MetricCard
          icon={DollarSign}
          label="Total Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          loading={loading}
        />
      </div>

      {/* Partner Table */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          All Partners
        </h3>
        <DataTable
          columns={partnerColumns}
          data={partnerRows}
          loading={loading}
          searchable
          searchPlaceholder="Search partners..."
          emptyMessage="No partners found"
        />
      </div>

      {/* Leaderboard */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Partner Leaderboard
        </h3>
        <DataTable
          columns={leaderboardColumns}
          data={leaderboardRows}
          loading={loading}
          emptyMessage="No leaderboard data available"
        />
      </div>
    </div>
  );
};
