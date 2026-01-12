import {
  Award,
  CreditCard,
  DollarSign,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { dbService } from '../../../services/dbService';
import { type Column, DataTable } from '../../UI/DataTable';
import { MetricCard } from '../../UI/MetricCard';

interface CommissionStats {
  totalClients: number;
  totalRevenue: number;
  commissionRate: number;
  grossCommission: number;
  pendingPayout: number;
  whitelabelFeeDue: boolean;
  whitelabelFeeAmount: number;
}

interface Tier {
  label: string;
  min: number;
  max: number;
  commission: number;
}

interface Payout {
  id: string;
  amountCents: number;
  status: string;
  method: string;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
}

const defaultStats: CommissionStats = {
  totalClients: 0,
  totalRevenue: 0,
  commissionRate: 0.2,
  grossCommission: 0,
  pendingPayout: 0,
  whitelabelFeeDue: false,
  whitelabelFeeAmount: 0,
};

const defaultTier: Tier = {
  label: 'Starter',
  min: 0,
  max: 10,
  commission: 0.2,
};

export const CommissionsEarnings: React.FC = () => {
  const [stats, setStats] = useState<CommissionStats>(defaultStats);
  const [tier, setTier] = useState<Tier>(defaultTier);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCommissions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dbService.getPartnerCommissions();
      setStats(data.stats || defaultStats);
      setTier(data.tier || defaultTier);
      setPayouts(data.payouts || []);
    } catch (err) {
      console.error('Error fetching commissions:', err);
      setStats(defaultStats);
      setTier(defaultTier);
      setPayouts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCommissions();
  }, [fetchCommissions]);

  const payoutColumns: Column<Payout>[] = [
    {
      key: 'amountCents',
      label: 'Amount',
      sortable: true,
      render: (payout) => (
        <span className="font-semibold text-green-700">
          ${(payout.amountCents / 100).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (payout) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            payout.status === 'completed'
              ? 'bg-green-100 text-green-800'
              : payout.status === 'pending'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
          }`}
        >
          {payout.status}
        </span>
      ),
    },
    {
      key: 'method',
      label: 'Method',
      render: (payout) => (
        <span className="capitalize">{payout.method.replace('_', ' ')}</span>
      ),
    },
    {
      key: 'periodStart',
      label: 'Period',
      render: (payout) => {
        if (!payout.periodStart || !payout.periodEnd) return '-';
        return `${new Date(payout.periodStart).toLocaleDateString()} - ${new Date(payout.periodEnd).toLocaleDateString()}`;
      },
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (payout) => new Date(payout.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">
          Commissions & Earnings
        </h2>
        <button
          type="button"
          onClick={fetchCommissions}
          disabled={loading}
          className="px-3 md:px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center space-x-2 disabled:opacity-50 text-sm self-start sm:self-auto"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Commission Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard
          icon={DollarSign}
          label="Total Revenue"
          value={`$${stats.totalRevenue.toLocaleString()}`}
          loading={loading}
        />
        <MetricCard
          icon={TrendingUp}
          label="Gross Commission"
          value={`$${stats.grossCommission.toLocaleString()}`}
          loading={loading}
        />
        <MetricCard
          icon={CreditCard}
          label="Pending Payout"
          value={`$${stats.pendingPayout.toLocaleString()}`}
          status="healthy"
          loading={loading}
        />
        <MetricCard
          icon={Award}
          label="Commission Rate"
          value={`${(stats.commissionRate * 100).toFixed(0)}%`}
          loading={loading}
        />
      </div>

      {/* Current Tier */}
      <div className="bg-gradient-to-r from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-4 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-base md:text-lg font-semibold text-slate-900 mb-2">
              Current Tier: {tier.label}
            </h3>
            <p className="text-xs md:text-sm text-slate-700">
              You're earning{' '}
              <span className="font-bold text-orange-600">
                {(tier.commission * 100).toFixed(0)}%
              </span>{' '}
              commission on all client revenue
            </p>
            <p className="text-xs text-slate-600 mt-2">
              Tier range: {tier.min}-{tier.max === 999999 ? '∞' : tier.max}{' '}
              clients
            </p>
          </div>
          <Award
            size={40}
            className="text-orange-600 flex-shrink-0 md:w-12 md:h-12"
          />
        </div>
      </div>

      {/* Whitelabel Fee Notice */}
      {stats.whitelabelFeeDue && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 md:p-4">
          <div className="flex items-center space-x-2">
            <CreditCard className="text-yellow-600" size={20} />
            <div>
              <p className="text-sm font-medium text-yellow-900">
                Whitelabel Fee Due: ${stats.whitelabelFeeAmount.toFixed(2)}
              </p>
              <p className="text-xs text-yellow-700">
                This fee will be deducted from your next payout
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Payout History */}
      <div>
        <h3 className="text-base md:text-lg font-semibold text-slate-900 mb-3 md:mb-4">
          Payout History
        </h3>
        <DataTable
          columns={payoutColumns}
          data={payouts}
          loading={loading}
          emptyMessage="No payouts yet. Keep referring clients to earn commissions!"
        />
      </div>

      {/* Commission Breakdown */}
      {stats.grossCommission > 0 && (
        <div className="bg-slate-50 rounded-lg p-4 md:p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 md:mb-4">
            Commission Breakdown
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Client Revenue</span>
              <span className="font-medium text-slate-900">
                ${stats.totalRevenue.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Commission Rate</span>
              <span className="font-medium text-slate-900">
                {(stats.commissionRate * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Gross Commission</span>
              <span className="font-medium text-green-700">
                ${stats.grossCommission.toLocaleString()}
              </span>
            </div>
            {stats.whitelabelFeeDue && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Whitelabel Fee</span>
                <span className="font-medium text-red-700">
                  -${stats.whitelabelFeeAmount.toFixed(2)}
                </span>
              </div>
            )}
            <div className="border-t border-slate-300 pt-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-700">
                Pending Payout
              </span>
              <span className="font-bold text-lg text-green-700">
                ${stats.pendingPayout.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
