/**
 * Sales Agent Dashboard — Tier 2
 *
 * Shows the agent their assigned clients, conversations across
 * those clients, prospects/leads, and earnings overview.
 */

import {
  Briefcase,
  DollarSign,
  MessageSquare,
  TrendingUp,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { dbService } from '../../services/dbService';
import {
  ConversationTranscript,
  type Conversation,
} from '../UI/ConversationTranscript';

interface AgentOverview {
  totalClients: number;
  totalBots: number;
  totalLeads: number;
  totalConversations: number;
  partner: { name: string; overrideRate: number } | null;
}

interface ClientRow {
  id: string;
  name: string;
  email: string;
  plan: string;
  botCount: number;
  leadCount: number;
  commissionRate: number;
  createdAt: string;
}

type ActiveTab = 'overview' | 'clients' | 'conversations';

const StatCard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}> = ({ label, value, icon, color }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  </div>
);

export const AgentDashboard: React.FC = () => {
  const [tab, setTab] = useState<ActiveTab>('overview');
  const [overview, setOverview] = useState<AgentOverview | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dbService.getAgentOverview();
      setOverview(data);
    } catch (err) {
      console.error('Failed to load agent overview:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dbService.getAgentClients();
      setClients(data);
    } catch (err) {
      console.error('Failed to load agent clients:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dbService.getAgentConversations({ limit: 100 });
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Failed to load agent conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'overview') loadOverview();
    else if (tab === 'clients') loadClients();
    else if (tab === 'conversations') loadConversations();
  }, [tab, loadOverview, loadClients, loadConversations]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales Agent Dashboard</h1>
          {overview?.partner && (
            <p className="text-sm text-slate-500 mt-1">
              Partner: <span className="font-medium text-slate-700">{overview.partner.name}</span>
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {[
          { id: 'overview' as const, label: 'Overview' },
          { id: 'clients' as const, label: 'My Clients' },
          { id: 'conversations' as const, label: 'Conversations' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Assigned Clients"
            value={overview.totalClients}
            icon={<Users size={20} className="text-blue-600" />}
            color="bg-blue-50"
          />
          <StatCard
            label="Active Bots"
            value={overview.totalBots}
            icon={<Briefcase size={20} className="text-emerald-600" />}
            color="bg-emerald-50"
          />
          <StatCard
            label="Total Leads"
            value={overview.totalLeads}
            icon={<TrendingUp size={20} className="text-amber-600" />}
            color="bg-amber-50"
          />
          <StatCard
            label="Conversations"
            value={overview.totalConversations}
            icon={<MessageSquare size={20} className="text-purple-600" />}
            color="bg-purple-50"
          />
        </div>
      )}

      {/* Clients Tab */}
      {tab === 'clients' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <Users size={18} className="text-blue-600" />
            <h3 className="text-base font-semibold text-slate-900">My Clients</h3>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {clients.length}
            </span>
          </div>
          {clients.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No clients assigned yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Client</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Plan</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-600">Bots</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-600">Leads</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Commission</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Since</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{client.name || 'Unnamed'}</p>
                        <p className="text-xs text-slate-400">{client.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          {client.plan || 'FREE'}
                        </span>
                      </td>
                      <td className="text-center px-4 py-3 text-slate-600">{client.botCount}</td>
                      <td className="text-center px-4 py-3 text-slate-600">{client.leadCount}</td>
                      <td className="text-right px-4 py-3">
                        <span className="text-emerald-600 font-medium">
                          {((client.commissionRate || 0) * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="text-right px-4 py-3 text-slate-400 text-xs">
                        {new Date(client.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Conversations Tab */}
      {tab === 'conversations' && (
        <ConversationTranscript
          conversations={conversations}
          loading={loading}
          showClientColumn={true}
          showBotColumn={true}
          title="Client Conversations"
        />
      )}

      {loading && tab === 'overview' && !overview && (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
};
