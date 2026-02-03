import {
  Award,
  Bot,
  Building,
  Calendar,
  CheckCircle,
  CreditCard,
  DollarSign,
  Mail,
  TrendingUp,
  User,
  Users,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { PlayfulMetricCard } from '../UI/PlayfulMetricCard';

interface PartnerDetailModalProps {
  partnerId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface PartnerDetails {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  resellerCode: string | null;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  plan: string;
  whitelabelEnabled: boolean;
}

interface PartnerClient {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: string;
  createdAt: string;
  botCount: number;
  leadCount: number;
}

interface PartnerMetrics {
  totalClients: number;
  activeClients: number;
  churnedClients: number;
  totalRevenue: number;
  commission: number;
}

export const PartnerDetailModal: React.FC<PartnerDetailModalProps> = ({
  partnerId,
  isOpen,
  onClose,
}) => {
  const [partner, setPartner] = useState<PartnerDetails | null>(null);
  const [clients, setClients] = useState<PartnerClient[]>([]);
  const [metrics, setMetrics] = useState<PartnerMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && partnerId) {
      fetchPartnerDetails();
    }
  }, [isOpen, partnerId]);

  const fetchPartnerDetails = async () => {
    setLoading(true);
    try {
      const [partnerRes, clientsRes, metricsRes] = await Promise.all([
        fetch(`/api/admin/partners/${partnerId}`),
        fetch(`/api/admin/partners/${partnerId}/clients`),
        fetch(`/api/admin/partners/${partnerId}/metrics`),
      ]);

      if (partnerRes.ok) setPartner(await partnerRes.json());
      if (clientsRes.ok) setClients(await clientsRes.json());
      if (metricsRes.ok) setMetrics(await metricsRes.json());
    } catch (error) {
      console.error('Error fetching partner details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 transition-opacity bg-slate-900 bg-opacity-75 backdrop-blur-sm"
          onClick={onClose}
        />

        <div className="inline-block align-bottom bg-white rounded-3xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl w-full">
          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 bg-white rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shadow-lg hover:shadow-xl"
          >
            <X size={20} />
          </button>

          <div className="p-0">
            {loading ? (
              <div className="p-8 animate-pulse space-y-6">
                <div className="h-32 bg-slate-200 rounded-2xl" />
                <div className="grid grid-cols-4 gap-4">
                  <div className="h-24 bg-slate-200 rounded-xl" />
                  <div className="h-24 bg-slate-200 rounded-xl" />
                  <div className="h-24 bg-slate-200 rounded-xl" />
                  <div className="h-24 bg-slate-200 rounded-xl" />
                </div>
                <div className="h-64 bg-slate-200 rounded-2xl" />
              </div>
            ) : partner ? (
              <>
                {/* Gradient Header */}
                <div className="relative overflow-hidden p-8 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600">
                  {/* Animated background */}
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-pink-400/30 to-yellow-400/30 rounded-full blur-3xl animate-pulse pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-blue-400/30 to-purple-400/30 rounded-full blur-2xl animate-float pointer-events-none" />

                  <div className="relative z-10 flex items-center gap-6">
                    {/* Large Avatar */}
                    <div className="relative shrink-0">
                      <div className="absolute -inset-2 bg-white/30 rounded-3xl blur-xl" />
                      <div className="relative h-20 w-20 bg-white/20 backdrop-blur-sm rounded-3xl flex items-center justify-center text-white text-3xl font-black border-2 border-white/40 shadow-2xl">
                        {partner.name.charAt(0)}
                      </div>
                    </div>

                    <div className="flex-1">
                      <h2 className="text-3xl font-black text-white mb-2">
                        {partner.companyName || partner.name}
                      </h2>
                      <div className="flex flex-wrap items-center gap-4 text-white/90">
                        <span className="flex items-center gap-2">
                          <Mail size={16} />
                          {partner.email}
                        </span>
                        <span className="flex items-center gap-2">
                          <Calendar size={16} />
                          Joined{' '}
                          {new Date(partner.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="shrink-0">
                      <span
                        className={`px-4 py-2 rounded-xl text-sm font-bold shadow-lg ${
                          partner.status === 'Active'
                            ? 'bg-white/20 backdrop-blur-sm text-white border-2 border-white/40'
                            : 'bg-white/10 backdrop-blur-sm text-white/70 border-2 border-white/20'
                        }`}
                      >
                        {partner.status === 'Active'
                          ? '✓ Active'
                          : '○ Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-8 space-y-8">
                  {/* Playful Metrics */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <PlayfulMetricCard
                      icon={DollarSign}
                      label="Total Revenue"
                      value={`$${((metrics?.totalRevenue || 0) / 100).toLocaleString()}`}
                      gradient="from-emerald-500 to-teal-600"
                      illustration="💰"
                    />
                    <PlayfulMetricCard
                      icon={Users}
                      label="Total Clients"
                      value={metrics?.totalClients || 0}
                      gradient="from-violet-500 to-purple-600"
                      illustration="👥"
                      trend={`${metrics?.activeClients || 0} Active`}
                    />
                    <PlayfulMetricCard
                      icon={Award}
                      label="Reseller Code"
                      value={partner.resellerCode || 'N/A'}
                      gradient="from-amber-500 to-orange-600"
                      illustration="🎟️"
                    />
                    <PlayfulMetricCard
                      icon={Building}
                      label="Whitelabel"
                      value={partner.whitelabelEnabled ? 'Enabled' : 'Disabled'}
                      gradient="from-pink-500 to-rose-600"
                      illustration={partner.whitelabelEnabled ? '🏢' : '🏪'}
                    />
                  </div>

                  {/* Client List */}
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-2xl font-black text-slate-900">
                        Referred Clients
                      </h3>
                      <span className="px-4 py-2 bg-gradient-to-r from-violet-100 to-purple-100 text-violet-700 rounded-xl font-bold text-sm">
                        {clients.length} Total
                      </span>
                    </div>

                    {clients.length === 0 ? (
                      <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        <div className="text-6xl mb-4">👤</div>
                        <p className="text-slate-500 text-lg font-medium">
                          No clients referred yet
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {clients.map((client) => (
                          <div
                            key={client.id}
                            className="group bg-white rounded-2xl p-5 border-2 border-slate-100 hover:border-purple-300 shadow-sm hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300"
                          >
                            {/* Client Header */}
                            <div className="flex items-start gap-3 mb-4">
                              <div className="relative shrink-0">
                                <div className="absolute -inset-0.5 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl opacity-75 blur group-hover:opacity-100 transition-opacity" />
                                <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg font-bold shadow-lg">
                                  {client.name.charAt(0)}
                                </div>
                              </div>

                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-slate-900 truncate">
                                  {client.name}
                                </h4>
                                <p className="text-sm text-slate-500 truncate">
                                  {client.email}
                                </p>
                              </div>

                              <span
                                className={`shrink-0 px-3 py-1 rounded-lg text-xs font-bold ${
                                  client.status === 'Active'
                                    ? 'bg-gradient-to-r from-emerald-400 to-teal-400 text-white'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {client.status}
                              </span>
                            </div>

                            {/* Plan Badge */}
                            <div className="mb-3">
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-700">
                                <CreditCard size={12} />
                                {client.plan}
                              </span>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                              <div className="flex items-center gap-2">
                                <div className="p-2 bg-violet-100 rounded-lg">
                                  <Bot size={16} className="text-violet-600" />
                                </div>
                                <div>
                                  <div className="text-xs text-slate-500">
                                    Bots
                                  </div>
                                  <div className="text-lg font-black text-slate-900">
                                    {client.botCount}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="p-2 bg-pink-100 rounded-lg">
                                  <TrendingUp
                                    size={16}
                                    className="text-pink-600"
                                  />
                                </div>
                                <div>
                                  <div className="text-xs text-slate-500">
                                    Leads
                                  </div>
                                  <div className="text-lg font-black text-slate-900">
                                    {client.leadCount}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Joined Date */}
                            <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
                              Joined{' '}
                              {new Date(client.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-20 text-slate-500">
                <div className="text-6xl mb-4">😕</div>
                <p className="text-lg font-medium">
                  Failed to load partner details
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
