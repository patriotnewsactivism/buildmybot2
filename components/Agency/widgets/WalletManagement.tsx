import {
  AlertCircle,
  CheckCircle,
  CreditCard,
  DollarSign,
  Plus,
  RefreshCw,
  Settings,
  Wallet,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { type Column, DataTable } from '../../UI/DataTable';
import { MetricCard } from '../../UI/MetricCard';

interface WalletData {
  balanceCents: number;
  autoRechargeEnabled: boolean;
  autoRechargeThresholdCents: number;
  autoRechargeAmountCents: number;
  lastRechargeAt: string | null;
  totalRecharged: number;
}

interface Transaction {
  id: string;
  type: 'debit' | 'credit' | 'recharge';
  amountCents: number;
  description: string;
  createdAt: string;
}

const defaultWallet: WalletData = {
  balanceCents: 0,
  autoRechargeEnabled: false,
  autoRechargeThresholdCents: 5000, // $50
  autoRechargeAmountCents: 10000, // $100
  lastRechargeAt: null,
  totalRecharged: 0,
};

export const WalletManagement: React.FC = () => {
  const [wallet, setWallet] = useState<WalletData>(defaultWallet);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [rechargeAmount, setRechargeAmount] = useState('100');
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [autoRechargeSettings, setAutoRechargeSettings] = useState({
    threshold: '50',
    amount: '100',
  });

  const fetchWalletData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/agency/wallet');
      if (!response.ok) throw new Error('Failed to fetch wallet');

      const data = await response.json();
      setWallet(data.wallet || defaultWallet);
      setTransactions(data.transactions || []);
    } catch (err) {
      console.error('Error fetching wallet:', err);
      setWallet(defaultWallet);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const handleRecharge = async () => {
    try {
      const response = await fetch('/api/agency/wallet/recharge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: Number.parseFloat(rechargeAmount) * 100,
        }),
      });

      if (!response.ok) throw new Error('Recharge failed');

      await fetchWalletData();
      setShowRechargeModal(false);
      setRechargeAmount('100');
    } catch (err) {
      console.error('Recharge error:', err);
      alert('Failed to recharge wallet. Please try again.');
    }
  };

  const handleAutoRechargeToggle = async () => {
    try {
      const response = await fetch('/api/agency/wallet/auto-recharge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: !wallet.autoRechargeEnabled,
          thresholdCents:
            Number.parseFloat(autoRechargeSettings.threshold) * 100,
          amountCents: Number.parseFloat(autoRechargeSettings.amount) * 100,
        }),
      });

      if (!response.ok) throw new Error('Failed to update auto-recharge');

      await fetchWalletData();
    } catch (err) {
      console.error('Auto-recharge error:', err);
      alert('Failed to update auto-recharge settings.');
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const balanceStatus =
    wallet.balanceCents < wallet.autoRechargeThresholdCents
      ? 'warning'
      : 'healthy';

  const transactionColumns: Column<Transaction>[] = [
    {
      key: 'type',
      label: 'Type',
      render: (tx) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            tx.type === 'credit' || tx.type === 'recharge'
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          {tx.type === 'recharge'
            ? 'Recharge'
            : tx.type === 'credit'
              ? 'Credit'
              : 'Usage'}
        </span>
      ),
    },
    {
      key: 'amountCents',
      label: 'Amount',
      sortable: true,
      render: (tx) => (
        <span
          className={`font-semibold ${
            tx.type === 'debit' ? 'text-red-700' : 'text-green-700'
          }`}
        >
          {tx.type === 'debit' ? '-' : '+'}
          {formatCurrency(tx.amountCents)}
        </span>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      render: (tx) => (
        <span className="text-sm text-slate-600">{tx.description}</span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (tx) => (
        <span className="text-sm text-slate-500">
          {new Date(tx.createdAt).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">
          Wallet & Balance
        </h2>
        <button
          type="button"
          onClick={fetchWalletData}
          disabled={loading}
          className="px-3 md:px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center space-x-2 disabled:opacity-50 text-sm self-start sm:self-auto"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Wallet Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard
          icon={Wallet}
          label="Current Balance"
          value={formatCurrency(wallet.balanceCents)}
          loading={loading}
          status={balanceStatus}
        />
        <MetricCard
          icon={DollarSign}
          label="Total Recharged"
          value={formatCurrency(wallet.totalRecharged)}
          loading={loading}
        />
        <MetricCard
          icon={Zap}
          label="Auto-Recharge"
          value={wallet.autoRechargeEnabled ? 'Enabled' : 'Disabled'}
          loading={loading}
          status={wallet.autoRechargeEnabled ? 'healthy' : undefined}
        />
        <MetricCard
          icon={CreditCard}
          label="Last Recharge"
          value={
            wallet.lastRechargeAt
              ? new Date(wallet.lastRechargeAt).toLocaleDateString()
              : 'Never'
          }
          loading={loading}
        />
      </div>

      {/* Balance Warning */}
      {wallet.balanceCents < wallet.autoRechargeThresholdCents && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="text-yellow-600 flex-shrink-0" size={20} />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-900">
              Low Balance Warning
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              Your wallet balance is below the auto-recharge threshold of{' '}
              {formatCurrency(wallet.autoRechargeThresholdCents)}.
              {wallet.autoRechargeEnabled
                ? ' Auto-recharge will trigger soon.'
                : ' Consider enabling auto-recharge.'}
            </p>
          </div>
        </div>
      )}

      {/* Recharge Card */}
      <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              Add Funds
            </h3>
            <p className="text-sm text-slate-600">
              Recharge your wallet to continue using platform services
            </p>
          </div>
          <Plus size={24} className="text-emerald-600" />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="number"
            value={rechargeAmount}
            onChange={(e) => setRechargeAmount(e.target.value)}
            placeholder="Amount (USD)"
            className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            min="10"
            step="10"
          />
          <button
            type="button"
            onClick={handleRecharge}
            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-blue-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
          >
            Recharge ${rechargeAmount}
          </button>
        </div>
      </div>

      {/* Auto-Recharge Settings */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Settings size={20} className="text-slate-600" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Auto-Recharge Settings
              </h3>
              <p className="text-sm text-slate-600">
                Automatically add funds when balance drops below threshold
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAutoRechargeToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              wallet.autoRechargeEnabled ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                wallet.autoRechargeEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="recharge-threshold"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Trigger Threshold
            </label>
            <div className="relative">
              <DollarSign
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="recharge-threshold"
                type="number"
                value={autoRechargeSettings.threshold}
                onChange={(e) =>
                  setAutoRechargeSettings((prev) => ({
                    ...prev,
                    threshold: e.target.value,
                  }))
                }
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                min="10"
                step="10"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Recharge when balance drops below this amount
            </p>
          </div>

          <div>
            <label
              htmlFor="recharge-amount"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Recharge Amount
            </label>
            <div className="relative">
              <DollarSign
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="recharge-amount"
                type="number"
                value={autoRechargeSettings.amount}
                onChange={(e) =>
                  setAutoRechargeSettings((prev) => ({
                    ...prev,
                    amount: e.target.value,
                  }))
                }
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                min="10"
                step="10"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Amount to add each time recharge triggers
            </p>
          </div>
        </div>

        {wallet.autoRechargeEnabled && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start space-x-2">
            <CheckCircle className="text-emerald-600 flex-shrink-0" size={16} />
            <p className="text-xs text-emerald-800">
              Auto-recharge is active. When your balance drops below{' '}
              {formatCurrency(wallet.autoRechargeThresholdCents)}, we'll
              automatically add {formatCurrency(wallet.autoRechargeAmountCents)}{' '}
              to your wallet.
            </p>
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Transaction History
        </h3>
        <DataTable
          columns={transactionColumns}
          data={transactions}
          loading={loading}
          emptyMessage="No transactions yet. Add funds to get started!"
        />
      </div>
    </div>
  );
};
