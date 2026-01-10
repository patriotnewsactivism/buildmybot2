import {
  AlertTriangle,
  CreditCard,
  DollarSign,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { dbService } from '../../../services/dbService';
import { type Column, DataTable } from '../../UI/DataTable';
import { MetricCard } from '../../UI/MetricCard';

interface FinancialOverview {
  mrrCents: number;
  arrCents: number;
  churnRate: number;
  activeCustomers: number;
  churnedCustomers: number;
}

interface StripeInvoice {
  id: string;
  customer_email: string;
  amount_due: number;
  amount_paid: number;
  status: string;
  created: number;
  due_date: number | null;
}

interface StripeRefund {
  id: string;
  amount: number;
  status: string;
  reason: string | null;
  created: number;
}

interface Payout {
  id: string;
  partnerId: string;
  amountCents: number;
  status: string;
  method: string;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
}

export const FinancialDashboard: React.FC = () => {
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [invoices, setInvoices] = useState<StripeInvoice[]>([]);
  const [refunds, setRefunds] = useState<StripeRefund[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [stripeHealth, setStripeHealth] = useState<{
    ok: boolean;
    productCount?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFinancialData = useCallback(async () => {
    try {
      const [
        overviewData,
        invoicesData,
        refundsData,
        payoutsData,
        stripeHealthData,
      ] = await Promise.all([
        dbService.getAdminFinancialOverview(),
        dbService.getAdminInvoices(),
        dbService.getAdminRefunds(),
        dbService.getAdminPayouts(),
        dbService.getAdminStripeHealth(),
      ]);

      setOverview(overviewData);
      setInvoices(invoicesData);
      setRefunds(refundsData);
      setPayouts(payoutsData);
      setStripeHealth(stripeHealthData);
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Error fetching financial data:', err);
      setError('Failed to load financial data');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFinancialData();
  }, [fetchFinancialData]);

  const invoiceColumns: Column<StripeInvoice>[] = [
    {
      key: 'customer_email',
      label: 'Customer',
      sortable: true,
    },
    {
      key: 'amount_due',
      label: 'Amount Due',
      sortable: true,
      render: (invoice) => `$${(invoice.amount_due / 100).toFixed(2)}`,
    },
    {
      key: 'amount_paid',
      label: 'Amount Paid',
      sortable: true,
      render: (invoice) => `$${(invoice.amount_paid / 100).toFixed(2)}`,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (invoice) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            invoice.status === 'paid'
              ? 'bg-green-100 text-green-800'
              : invoice.status === 'open'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
          }`}
        >
          {invoice.status}
        </span>
      ),
    },
    {
      key: 'created',
      label: 'Created',
      sortable: true,
      render: (invoice) =>
        new Date(invoice.created * 1000).toLocaleDateString(),
    },
  ];

  const refundColumns: Column<StripeRefund>[] = [
    {
      key: 'id',
      label: 'ID',
      render: (refund) => (
        <code className="text-xs font-mono">
          {refund.id.substring(0, 20)}...
        </code>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      render: (refund) => (
        <span className="font-semibold text-red-700">
          ${(refund.amount / 100).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'reason',
      label: 'Reason',
      render: (refund) => refund.reason || '-',
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (refund) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            refund.status === 'succeeded'
              ? 'bg-green-100 text-green-800'
              : refund.status === 'pending'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
          }`}
        >
          {refund.status}
        </span>
      ),
    },
    {
      key: 'created',
      label: 'Created',
      sortable: true,
      render: (refund) => new Date(refund.created * 1000).toLocaleDateString(),
    },
  ];

  const payoutColumns: Column<Payout>[] = [
    {
      key: 'partnerId',
      label: 'Partner ID',
      render: (payout) => (
        <code className="text-xs font-mono">
          {payout.partnerId.substring(0, 12)}...
        </code>
      ),
    },
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
      key: 'method',
      label: 'Method',
      render: (payout) => (
        <span className="capitalize">{payout.method.replace('_', ' ')}</span>
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
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (payout) => new Date(payout.createdAt).toLocaleDateString(),
    },
  ];

  const displayOverview = overview || {
    mrrCents: 0,
    arrCents: 0,
    churnRate: 0,
    activeCustomers: 0,
    churnedCustomers: 0,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">
          Financial Dashboard
        </h2>
        <div className="flex items-center space-x-4">
          <div
            className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${
              stripeHealth?.ok
                ? 'bg-green-100 text-green-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            <CreditCard size={16} />
            <span className="text-sm font-medium">
              Stripe: {stripeHealth?.ok ? 'Connected' : 'Not configured'}
            </span>
          </div>
          <button
            type="button"
            onClick={fetchFinancialData}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center space-x-2"
          >
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Financial Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <MetricCard
          icon={DollarSign}
          label="Monthly Recurring Revenue"
          value={`$${(displayOverview.mrrCents / 100).toLocaleString()}`}
          loading={loading}
        />
        <MetricCard
          icon={TrendingUp}
          label="Annual Recurring Revenue"
          value={`$${(displayOverview.arrCents / 100).toLocaleString()}`}
          loading={loading}
        />
        <MetricCard
          icon={Users}
          label="Active Customers"
          value={displayOverview.activeCustomers}
          loading={loading}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Churn Rate"
          value={`${displayOverview.churnRate.toFixed(2)}%`}
          status={
            displayOverview.churnRate > 10
              ? 'critical'
              : displayOverview.churnRate > 5
                ? 'warning'
                : 'healthy'
          }
          loading={loading}
        />
        <MetricCard
          icon={Users}
          label="Churned Customers"
          value={displayOverview.churnedCustomers}
          status={displayOverview.churnedCustomers > 10 ? 'warning' : 'healthy'}
          loading={loading}
        />
      </div>

      {/* Recent Invoices */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Recent Invoices
        </h3>
        <DataTable
          columns={invoiceColumns}
          data={invoices}
          loading={loading}
          emptyMessage="No invoices found"
        />
      </div>

      {/* Partner Payouts */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Partner Payouts
        </h3>
        <DataTable
          columns={payoutColumns}
          data={payouts}
          loading={loading}
          emptyMessage="No payouts found"
        />
      </div>

      {/* Recent Refunds */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Recent Refunds
        </h3>
        <DataTable
          columns={refundColumns}
          data={refunds}
          loading={loading}
          emptyMessage="No refunds found"
        />
      </div>
    </div>
  );
};
