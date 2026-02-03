import {
  BarChart3,
  DollarSign,
  MessageSquare,
  Phone,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { type Column, DataTable } from '../../UI/DataTable';

interface ClientUsage {
  id: string;
  clientOrganizationId: string;
  clientName: string;
  voiceMinutes: number;
  chatTokens: number;
  totalProfitCents: number;
  wholesaleCostCents: number;
  retailChargeCents: number;
  lastActivityAt: string;
}

const COLORS = [
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
];

export const ClientUsageBreakdown: React.FC = () => {
  const [clients, setClients] = useState<ClientUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'profit' | 'usage'>('profit');

  const fetchClientUsage = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/agency/client-usage');
      if (!response.ok) throw new Error('Failed to fetch client usage');

      const data = await response.json();
      setClients(data.clients || []);
    } catch (err) {
      console.error('Error fetching client usage:', err);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClientUsage();
  }, [fetchClientUsage]);

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const totalProfit = clients.reduce(
    (sum, client) => sum + client.totalProfitCents,
    0,
  );
  const totalRevenue = clients.reduce(
    (sum, client) => sum + client.retailChargeCents,
    0,
  );
  const totalVoiceMinutes = clients.reduce(
    (sum, client) => sum + client.voiceMinutes,
    0,
  );
  const totalChatTokens = clients.reduce(
    (sum, client) => sum + client.chatTokens,
    0,
  );

  const sortedClients = [...clients].sort((a, b) => {
    if (sortBy === 'profit') {
      return b.totalProfitCents - a.totalProfitCents;
    }
    return b.voiceMinutes + b.chatTokens - (a.voiceMinutes + a.chatTokens);
  });

  const topClients = sortedClients.slice(0, 6);

  const profitChartData = topClients.map((client) => ({
    name: client.clientName,
    profit: client.totalProfitCents / 100,
  }));

  const usagePieData = topClients.map((client) => ({
    name: client.clientName,
    value: client.voiceMinutes + client.chatTokens / 1000,
  }));

  const columns: Column<ClientUsage>[] = [
    {
      key: 'clientName',
      label: 'Client',
      sortable: true,
      render: (client) => (
        <div>
          <p className="font-medium text-slate-900">{client.clientName}</p>
          <p className="text-xs text-slate-500">
            Last active: {new Date(client.lastActivityAt).toLocaleDateString()}
          </p>
        </div>
      ),
    },
    {
      key: 'voiceMinutes',
      label: 'Voice',
      sortable: true,
      render: (client) => (
        <div className="flex items-center space-x-2">
          <Phone size={14} className="text-emerald-600" />
          <span className="text-sm">{client.voiceMinutes.toFixed(0)} min</span>
        </div>
      ),
    },
    {
      key: 'chatTokens',
      label: 'Chat',
      sortable: true,
      render: (client) => (
        <div className="flex items-center space-x-2">
          <MessageSquare size={14} className="text-blue-600" />
          <span className="text-sm">
            {(client.chatTokens / 1000).toFixed(1)}k tokens
          </span>
        </div>
      ),
    },
    {
      key: 'retailChargeCents',
      label: 'Revenue',
      sortable: true,
      render: (client) => (
        <span className="font-medium text-slate-900">
          {formatCurrency(client.retailChargeCents)}
        </span>
      ),
    },
    {
      key: 'wholesaleCostCents',
      label: 'Cost',
      sortable: true,
      render: (client) => (
        <span className="text-sm text-red-700">
          {formatCurrency(client.wholesaleCostCents)}
        </span>
      ),
    },
    {
      key: 'totalProfitCents',
      label: 'Profit',
      sortable: true,
      render: (client) => (
        <span className="font-semibold text-emerald-700">
          {formatCurrency(client.totalProfitCents)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">
          Client Usage Breakdown
        </h2>
        <div className="flex items-center space-x-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
          >
            <option value="profit">Sort by Profit</option>
            <option value="usage">Sort by Usage</option>
          </select>
          <button
            type="button"
            onClick={fetchClientUsage}
            disabled={loading}
            className="px-3 md:px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center space-x-2 disabled:opacity-50 text-sm"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <Users className="text-slate-600" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {clients.length}
          </div>
          <div className="text-sm text-slate-600 mt-1">Active Clients</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="text-emerald-600" size={20} />
          </div>
          <div className="text-2xl font-bold text-emerald-700">
            {formatCurrency(totalProfit)}
          </div>
          <div className="text-sm text-slate-600 mt-1">Total Profit</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <Phone className="text-blue-600" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {totalVoiceMinutes.toFixed(0)}
          </div>
          <div className="text-sm text-slate-600 mt-1">Voice Minutes</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <MessageSquare className="text-purple-600" size={20} />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {(totalChatTokens / 1000).toFixed(1)}k
          </div>
          <div className="text-sm text-slate-600 mt-1">Chat Tokens</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Profit by Client */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Profit by Client
            </h3>
            <TrendingUp size={20} className="text-emerald-600" />
          </div>

          {profitChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={profitChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  style={{ fontSize: '11px' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
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
                <Bar dataKey="profit" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-400">
              <div className="text-center">
                <BarChart3 size={48} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">No client data available</p>
              </div>
            </div>
          )}
        </div>

        {/* Usage Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Usage Distribution
            </h3>
            <Users size={20} className="text-blue-600" />
          </div>

          {usagePieData.length > 0 && usagePieData.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={usagePieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => entry.name}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {usagePieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  formatter={(value: any) => [value.toFixed(1), 'Usage Units']}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-400">
              <div className="text-center">
                <Users size={48} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">No usage data available</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Client Table */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          All Clients
        </h3>
        <DataTable
          columns={columns}
          data={sortedClients}
          loading={loading}
          emptyMessage="No clients with usage data yet"
        />
      </div>
    </div>
  );
};
