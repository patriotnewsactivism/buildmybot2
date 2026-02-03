import {
  Award,
  Building,
  DollarSign,
  Mail,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { PlayfulMetricCard } from '../UI/PlayfulMetricCard';
import { PartnerDetailModal } from './PartnerDetailModal';

interface PartnerRow {
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

export const PartnerOverviewAdmin: React.FC = () => {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState('');

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/partners');
      if (response.ok) {
        const data = await response.json();
        setPartners(data);
      }
    } catch (error) {
      console.error('Error fetching partners:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const totalPartners = partners.length;
  const activePartners = partners.filter(
    (p) => p.partner.status === 'Active',
  ).length;
  const totalClients = partners.reduce((sum, p) => sum + p.clientCount, 0);
  const totalRevenue = partners.reduce((sum, p) => sum + p.totalRevenue, 0);

  const filteredPartners = partners.filter(
    (p) =>
      p.partner.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.partner.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.partner.companyName?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const getTierGradient = (tier: string) => {
    switch (tier) {
      case 'Elite':
        return 'from-purple-500 to-indigo-600';
      case 'Gold':
        return 'from-amber-500 to-orange-600';
      case 'Silver':
        return 'from-slate-400 to-slate-600';
      default:
        return 'from-blue-500 to-cyan-600';
    }
  };

  const getTierEmoji = (tier: string) => {
    switch (tier) {
      case 'Elite':
        return '👑';
      case 'Gold':
        return '⭐';
      case 'Silver':
        return '🥈';
      default:
        return '🚀';
    }
  };

  return (
    <div className="space-y-6">
      {/* Gradient Hero Header */}
      <div className="relative overflow-hidden rounded-3xl p-6 md:p-8 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 shadow-2xl">
        {/* Animated background elements */}
        <div className="absolute top-0 right-0 w-48 md:w-64 h-48 md:h-64 bg-gradient-to-br from-pink-400/30 to-yellow-400/30 rounded-full blur-3xl animate-pulse pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 md:w-48 h-32 md:h-48 bg-gradient-to-tr from-blue-400/30 to-purple-400/30 rounded-full blur-2xl animate-float pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-black text-white mb-2 flex items-center gap-3">
              <span className="animate-wiggle">🤝</span>
              Partner Ecosystem
            </h1>
            <p className="text-purple-100 text-base md:text-lg">
              Manage your partner network and track performance
            </p>
          </div>
          <button
            type="button"
            onClick={fetchPartners}
            className="self-start sm:self-auto px-6 py-3 bg-white/20 backdrop-blur-sm rounded-xl text-white font-bold hover:bg-white/30 transition-all duration-300 hover:scale-105 shadow-lg flex items-center gap-2"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Playful Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <PlayfulMetricCard
          icon={Users}
          label="Total Partners"
          value={totalPartners}
          gradient="from-violet-500 to-purple-600"
          illustration="🤝"
          loading={loading}
        />
        <PlayfulMetricCard
          icon={TrendingUp}
          label="Active Partners"
          value={activePartners}
          gradient="from-emerald-500 to-teal-600"
          illustration="📈"
          trend={`${Math.round((activePartners / totalPartners) * 100) || 0}% Active`}
          loading={loading}
        />
        <PlayfulMetricCard
          icon={Award}
          label="Total Clients"
          value={totalClients}
          gradient="from-amber-500 to-orange-600"
          illustration="💼"
          loading={loading}
        />
        <PlayfulMetricCard
          icon={DollarSign}
          label="Total Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          gradient="from-pink-500 to-rose-600"
          illustration="💰"
          loading={loading}
        />
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          size={20}
        />
        <input
          type="text"
          placeholder="Search partners by name, email, or company..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-4 text-base border-2 border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 transition-all shadow-sm"
        />
      </div>

      {/* Partner Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading ? (
          // Loading skeletons
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-6 border-2 border-slate-100 shadow-md animate-pulse"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-slate-200 rounded w-2/3" />
                  <div className="h-4 bg-slate-200 rounded w-1/2" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-4 bg-slate-200 rounded" />
                <div className="h-4 bg-slate-200 rounded w-3/4" />
              </div>
            </div>
          ))
        ) : filteredPartners.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-slate-500 text-lg">
              {searchQuery
                ? 'No partners match your search'
                : 'No partners found'}
            </p>
          </div>
        ) : (
          filteredPartners.map((row) => (
            <div
              key={row.partner.id}
              onClick={() => setSelectedPartnerId(row.partner.id)}
              className="group bg-white rounded-2xl p-6 border-2 border-slate-100 hover:border-purple-300 shadow-md hover:shadow-2xl hover:shadow-purple-500/20 transition-all duration-300 hover:-translate-y-1 cursor-pointer"
            >
              {/* Partner Header */}
              <div className="flex items-start gap-4 mb-4">
                {/* Avatar with gradient */}
                <div className="relative shrink-0">
                  <div
                    className={`absolute -inset-1 bg-gradient-to-br ${getTierGradient(row.tier)} rounded-2xl opacity-75 blur group-hover:opacity-100 transition-opacity`}
                  />
                  <div
                    className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br ${getTierGradient(row.tier)} flex items-center justify-center text-white text-2xl font-bold shadow-xl`}
                  >
                    {row.partner.name.charAt(0)}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 text-lg truncate group-hover:text-purple-600 transition-colors">
                    {row.partner.companyName || row.partner.name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                    <Mail size={14} />
                    <span className="truncate">{row.partner.email}</span>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="shrink-0">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      row.partner.status === 'Active'
                        ? 'bg-gradient-to-r from-emerald-400 to-teal-400 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {row.partner.status === 'Active'
                      ? '● Active'
                      : '○ Inactive'}
                  </span>
                </div>
              </div>

              {/* Tier Badge */}
              <div className="mb-4">
                <span
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r ${getTierGradient(row.tier)} text-white shadow-lg`}
                >
                  <span className="text-lg">{getTierEmoji(row.tier)}</span>
                  {row.tier} Partner
                </span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <div className="text-xs text-slate-500 font-medium mb-1">
                    Clients
                  </div>
                  <div className="text-xl font-black text-slate-900">
                    {row.clientCount}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <div className="text-xs text-slate-500 font-medium mb-1">
                    Revenue
                  </div>
                  <div className="text-xl font-black text-green-600">
                    ${row.totalRevenue.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                {row.partner.resellerCode ? (
                  <code className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-mono text-slate-600">
                    {row.partner.resellerCode}
                  </code>
                ) : (
                  <span className="text-xs text-slate-400">No code</span>
                )}
                {row.partner.whitelabelEnabled && (
                  <div className="flex items-center gap-1 text-xs text-orange-600 font-medium">
                    <Building size={14} />
                    Whitelabel
                  </div>
                )}
              </div>

              {/* Hover Action */}
              <div className="mt-4 pt-4 border-t border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  className="w-full py-2 px-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold rounded-xl hover:from-violet-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
                >
                  View Details
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Partner Detail Modal */}
      <PartnerDetailModal
        partnerId={selectedPartnerId || ''}
        isOpen={!!selectedPartnerId}
        onClose={() => setSelectedPartnerId(null)}
      />
    </div>
  );
};
