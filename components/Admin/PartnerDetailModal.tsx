import {
  Award,
  Building,
  Calendar,
  CheckCircle,
  CreditCard,
  DollarSign,
  Mail,
  User,
  Users,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { DataTable } from '../../UI/DataTable';

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
          className="fixed inset-0 transition-opacity bg-slate-900 bg-opacity-75"
          onClick={onClose}
        />

        <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl w-full">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              type="button"
              onClick={onClose}
              className="bg-white rounded-md text-slate-400 hover:text-slate-500 focus:outline-none"
            >
              <X size={24} />
            </button>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-slate-200 rounded w-1/3" />
                <div className="h-4 bg-slate-200 rounded w-1/4" />
                <div className="grid grid-cols-4 gap-4 mt-8">
                  <div className="h-24 bg-slate-200 rounded" />
                  <div className="h-24 bg-slate-200 rounded" />
                  <div className="h-24 bg-slate-200 rounded" />
                  <div className="h-24 bg-slate-200 rounded" />
                </div>
              </div>
            ) : partner ? (
              <>
                <div className="flex items-center space-x-4 mb-6">
                  <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                    {partner.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">
                      {partner.companyName || partner.name}
                    </h2>
                    <div className="flex items-center space-x-4 text-sm text-slate-500 mt-1">
                      <span className="flex items-center">
                        <Mail size={14} className="mr-1" /> {partner.email}
                      </span>
                      <span className="flex items-center">
                        <Calendar size={14} className="mr-1" /> Joined{' '}
                        {new Date(partner.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="ml-auto">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        partner.status === 'Active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {partner.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-slate-500">
                        Revenue
                      </div>
                      <DollarSign size={16} className="text-green-600" />
                    </div>
                    <div className="text-2xl font-bold text-slate-900">
                      ${((metrics?.totalRevenue || 0) / 100).toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-slate-500">
                        Clients
                      </div>
                      <Users size={16} className="text-blue-600" />
                    </div>
                    <div className="text-2xl font-bold text-slate-900">
                      {metrics?.totalClients || 0}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {metrics?.activeClients} Active
                    </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-slate-500">
                        Reseller Code
                      </div>
                      <Award size={16} className="text-purple-600" />
                    </div>
                    <div className="text-lg font-bold text-slate-900 font-mono">
                      {partner.resellerCode || 'N/A'}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-slate-500">
                        Whitelabel
                      </div>
                      <Building size={16} className="text-orange-600" />
                    </div>
                    <div className="text-lg font-bold text-slate-900">
                      {partner.whitelabelEnabled ? 'Enabled' : 'Disabled'}
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">
                    Referred Clients
                  </h3>
                  <DataTable
                    data={clients}
                    columns={[
                      {
                        key: 'name',
                        label: 'Client Name',
                        render: (row) => (
                          <div>
                            <div className="font-medium text-slate-900">
                              {row.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {row.email}
                            </div>
                          </div>
                        ),
                      },
                      {
                        key: 'plan',
                        label: 'Plan',
                        render: (row) => (
                          <span className="px-2 py-1 bg-slate-100 rounded text-xs font-medium">
                            {row.plan}
                          </span>
                        ),
                      },
                      {
                        key: 'metrics',
                        label: 'Usage',
                        render: (row) => (
                          <div className="text-sm text-slate-600">
                            {row.botCount} Bots • {row.leadCount} Leads
                          </div>
                        ),
                      },
                      {
                        key: 'status',
                        label: 'Status',
                        render: (row) => (
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              row.status === 'Active'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {row.status}
                          </span>
                        ),
                      },
                      {
                        key: 'joined',
                        label: 'Joined',
                        render: (row) =>
                          new Date(row.createdAt).toLocaleDateString(),
                      },
                    ]}
                    searchable
                    searchPlaceholder="Search clients..."
                  />
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-500">
                Failed to load partner details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
