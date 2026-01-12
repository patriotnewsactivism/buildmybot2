import {
  Bot,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { dbService } from '../../../services/dbService';
import { type Column, DataTable } from '../../UI/DataTable';
import { MetricCard } from '../../UI/MetricCard';

interface Client {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  plan: string;
  status: string;
  mrrCents: number;
  botCount: number;
  leadCount: number;
  lastActiveAt: string;
  accessLevel: string;
  canImpersonate: boolean;
}

interface ClientManagementProps {
  onImpersonate: (userId: string, reason: string) => void;
}

export const ClientManagement: React.FC<ClientManagementProps> = ({
  onImpersonate,
}) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    try {
      const data = await dbService.getPartnerClients();
      setClients(data);
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Error fetching clients:', err);
      setError('Failed to load clients');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const totalClients = clients.length;
  const activeClients = clients.filter((c) => c.status === 'Active').length;
  const totalMRR = clients.reduce((sum, c) => sum + c.mrrCents, 0);
  const totalBots = clients.reduce((sum, c) => sum + c.botCount, 0);
  const totalLeads = clients.reduce((sum, c) => sum + c.leadCount, 0);

  const handleImpersonate = async (clientId: string, clientName: string) => {
    const reason = prompt(`Enter reason for impersonating ${clientName}:`);
    if (!reason) return;

    try {
      await onImpersonate(clientId, reason);
    } catch (err) {
      console.error('Error starting impersonation:', err);
      alert('Failed to start impersonation session');
    }
  };

  const columns: Column<Client>[] = [
    {
      key: 'name',
      label: 'Client',
      sortable: true,
      render: (client) => (
        <div>
          <div className="font-medium text-slate-900">
            {client.companyName || client.name}
          </div>
          <div className="text-xs text-slate-500">{client.email}</div>
        </div>
      ),
    },
    {
      key: 'plan',
      label: 'Plan',
      sortable: true,
      render: (client) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            client.plan === 'FREE'
              ? 'bg-slate-100 text-slate-800'
              : client.plan === 'STARTER'
                ? 'bg-green-100 text-green-800'
                : client.plan === 'PRO'
                  ? 'bg-orange-100 text-orange-800'
                  : 'bg-purple-100 text-purple-800'
          }`}
        >
          {client.plan}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (client) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            client.status === 'Active'
              ? 'bg-green-100 text-green-800'
              : client.status === 'Suspended'
                ? 'bg-red-100 text-red-800'
                : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {client.status}
        </span>
      ),
    },
    {
      key: 'mrrCents',
      label: 'MRR',
      sortable: true,
      render: (client) => (
        <span className="font-semibold text-green-700">
          ${(client.mrrCents / 100).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'botCount',
      label: 'Bots',
      sortable: true,
      render: (client) => (
        <div className="flex items-center space-x-1">
          <Bot size={14} className="text-slate-500" />
          <span>{client.botCount}</span>
        </div>
      ),
    },
    {
      key: 'leadCount',
      label: 'Leads',
      sortable: true,
      render: (client) => (
        <div className="flex items-center space-x-1">
          <MessageSquare size={14} className="text-slate-500" />
          <span>{client.leadCount}</span>
        </div>
      ),
    },
    {
      key: 'lastActiveAt',
      label: 'Last Active',
      sortable: true,
      render: (client) => new Date(client.lastActiveAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (client) => (
        <div className="flex space-x-2">
          {client.canImpersonate && (
            <button
              type="button"
              onClick={() => handleImpersonate(client.id, client.name)}
              className="text-blue-600 hover:text-blue-800 text-xs flex items-center space-x-1"
              title="Impersonate client"
            >
              <ExternalLink size={14} />
              <span>Login</span>
            </button>
          )}
        </div>
      ),
    },
  ];

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800">{error}</p>
        <button
          type="button"
          onClick={fetchClients}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <RefreshCw size={16} className="inline mr-2" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">
          Client Management
        </h2>
        <button
          type="button"
          onClick={fetchClients}
          className="px-3 md:px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center space-x-2 text-sm self-start sm:self-auto"
        >
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        <MetricCard
          icon={Users}
          label="Total Clients"
          value={totalClients}
          loading={loading}
        />
        <MetricCard
          icon={Users}
          label="Active Clients"
          value={activeClients}
          loading={loading}
        />
        <MetricCard
          icon={Bot}
          label="Total Bots"
          value={totalBots}
          loading={loading}
        />
        <MetricCard
          icon={MessageSquare}
          label="Total Leads"
          value={totalLeads}
          loading={loading}
        />
        <MetricCard
          icon={RefreshCw}
          label="Total MRR"
          value={`$${(totalMRR / 100).toLocaleString()}`}
          loading={loading}
        />
      </div>

      {/* Client Table */}
      <div className="overflow-x-auto">
        <DataTable
          columns={columns}
          data={clients}
          loading={loading}
          searchable
          searchPlaceholder="Search clients..."
          emptyMessage="No clients found. Share your referral link to start earning commissions!"
        />
      </div>
    </div>
  );
};
