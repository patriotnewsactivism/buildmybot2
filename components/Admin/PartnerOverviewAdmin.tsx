import {
  Award,
  DollarSign,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { DataTable } from '../../UI/DataTable';
import { MetricCard } from '../../UI/MetricCard';
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
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  const fetchPartners = async () => {
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
  };

  useEffect(() => {
    fetchPartners();
  }, []);

  const totalPartners = partners.length;
  const activePartners = partners.filter(
    (p) => p.partner.status === 'Active',
  ).length;
  const totalClients = partners.reduce((sum, p) => sum + p.clientCount, 0);
  const totalRevenue = partners.reduce((sum, p) => sum + p.totalRevenue, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Partner Ecosystem</h2>
        <button
          onClick={fetchPartners}
          className="p-2 text-slate-500 hover:text-slate-900 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-semibold text-slate-900">Partner Directory</h3>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="text"
              placeholder="Search partners..."
              className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
            />
          </div>
        </div>

        <DataTable
          data={partners}
          loading={loading}
          columns={[
            {
              key: 'partner',
              label: 'Partner',
              render: (row) => (
                <div 
                  className="flex items-center space-x-3 cursor-pointer group"
                  onClick={() => setSelectedPartnerId(row.partner.id)}
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                    {row.partner.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                      {row.partner.companyName || row.partner.name}
                    </div>
                    <div className="text-xs text-slate-500">{row.partner.email}</div>
                  </div>
                </div>
              ),
            },
            {
              key: 'code',
              label: 'Reseller Code',
              render: (row) => (
                <code className="px-2 py-1 bg-slate-100 rounded text-xs font-mono text-slate-600">
                  {row.partner.resellerCode || '-'}
                </code>
              ),
            },
            {
              key: 'stats',
              label: 'Performance',
              render: (row) => (
                <div className="text-sm">
                  <span className="font-medium text-slate-900">{row.clientCount}</span> Clients •{' '}
                  <span className="font-medium text-green-600">${row.totalRevenue.toLocaleString()}</span> Rev
                </div>
              ),
            },
            {
              key: 'tier',
              label: 'Tier',
              render: (row) => (
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    row.tier === 'Elite'
                      ? 'bg-purple-100 text-purple-800'
                      : row.tier === 'Gold'
                        ? 'bg-amber-100 text-amber-800'
                        : row.tier === 'Silver'
                          ? 'bg-slate-100 text-slate-800'
                          : 'bg-blue-50 text-blue-800'
                  }`}
                >
                  {row.tier}
                </span>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              render: (row) => (
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    row.partner.status === 'Active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {row.partner.status}
                </span>
              ),
            },
            {
                key: 'actions',
                label: '',
                render: (row) => (
                    <button 
                        onClick={() => setSelectedPartnerId(row.partner.id)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                        View Details
                    </button>
                )
            }
          ]}
        />
      </div>

      <PartnerDetailModal
        partnerId={selectedPartnerId || ''}
        isOpen={!!selectedPartnerId}
        onClose={() => setSelectedPartnerId(null)}
      />
    </div>
  );
};
