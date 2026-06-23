import {
  Activity,
  AlertCircle,
  BarChart3,
  Bell,
  Briefcase,
  CheckCircle,
  Clock,
  Copy,
  Database,
  DollarSign,
  Eye,
  Gift,
  Headphones,
  Link2,
  Loader,
  MessageSquare,
  Server,
  Settings,
  Shield,
  Ticket,
  TrendingDown,
  UserCheck,
  Users,
  Wifi,
  Zap,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';
import AdminFeaturesOverview from '../Analytics/AdminFeaturesOverview';
import { ComprehensiveAnalytics } from '../Analytics/ComprehensiveAnalytics';
import { NotificationComposer } from './NotificationComposer';
import { PartnerOverviewAdmin } from './PartnerOverviewAdmin';
import { FinancialDashboard } from './widgets/FinancialDashboard';
import { QuickMetricsWidget } from '../UI/QuickMetricsWidget';
import { ErrorRecoveryDashboard } from './ErrorRecoveryDashboard';

interface AdminDashboardMetrics {
  totalUsers: number;
  activeBots: number;
  totalRevenue: number;
  newSignupsToday: number;
  apiCallsLast24h: number;
  supportTicketsOpen: number;
  systemHealthScore: number;
  averageResponseTime: number;
  conversionRate: number;
  totalLeads: number;
  totalConversations: number;
}

type AdminTab = 'overview' | 'system-health';

export const AdminDashboardV2: React.FC = () => {
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(true);
  const [errorMetrics, setErrorMetrics] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  const fetchAdminMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    setErrorMetrics(null);
    try {
      const response = await fetch(buildApiUrl('/admin/metrics'));
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch admin metrics');
      }
      const data: AdminDashboardMetrics = await response.json();
      setMetrics(data);
    } catch (error) {
      console.error('Error fetching admin metrics:', error);
      setErrorMetrics(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminMetrics();
  }, [fetchAdminMetrics]);

  const tabs: { id: AdminTab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'system-health', label: 'System Health', icon: AlertTriangle },
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <h1 className="mb-6 text-3xl font-bold text-gray-900">Admin Dashboard V2</h1>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex space-x-4" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="mb-8 flex items-center justify-between">
            <p className="text-gray-600">Overview of system health, user activity, and financial performance.</p>
            <button
              onClick={fetchAdminMetrics}
              className={`flex items-center rounded-md bg-blue-600 px-4 py-2 text-white shadow-md transition-colors hover:bg-blue-700 ${loadingMetrics ? 'cursor-not-allowed opacity-70' : ''}`}
              disabled={loadingMetrics}
            >
              {loadingMetrics ? (
                <Loader className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Zap className="mr-2 h-5 w-5" />
              )}
              Refresh Metrics
            </button>
          </div>

          {errorMetrics && (
            <div className="mb-4 flex items-center rounded-md bg-red-100 p-3 text-red-700 shadow-sm">
              <AlertCircle className="mr-2 h-5 w-5" />
              <p>Error: {errorMetrics}</p>
            </div>
          )}

          {/* Quick Metrics Section */}
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <QuickMetricsWidget
              totalConversations={metrics?.totalConversations}
              totalLeads={metrics?.totalLeads}
              conversionRate={metrics?.conversionRate}
              estimatedValue={metrics?.totalRevenue}
              loading={loadingMetrics}
              error={errorMetrics}
            />
            {/* Additional Admin-specific Quick Metrics */}
            <MetricCard
              icon={Users}
              title="Total Users"
              value={loadingMetrics ? '...' : metrics?.totalUsers?.toLocaleString() || 'N/A'}
              description="All registered users"
              color="text-indigo-600"
              bgColor="bg-indigo-50"
            />
            <MetricCard
              icon={Zap}
              title="Active Bots"
              value={loadingMetrics ? '...' : metrics?.activeBots?.toLocaleString() || 'N/A'}
              description="Currently deployed bots"
              color="text-green-600"
              bgColor="bg-green-50"
            />
            <MetricCard
              icon={DollarSign}
              title="Total Revenue"
              value={loadingMetrics ? '...' : `$${metrics?.totalRevenue?.toLocaleString() || '0'}`}
              description="All-time platform revenue"
              color="text-purple-600"
              bgColor="bg-purple-50"
            />
            <MetricCard
              icon={UserCheck}
              title="New Signups Today"
              value={loadingMetrics ? '...' : metrics?.newSignupsToday?.toLocaleString() || 'N/A'}
              description="Users joined in the last 24h"
              color="text-blue-600"
              bgColor="bg-blue-50"
            />
            <MetricCard
              icon={Server}
              title="API Calls (24h)"
              value={loadingMetrics ? '...' : metrics?.apiCallsLast24h?.toLocaleString() || 'N/A'}
              description="Total API requests"
              color="text-yellow-600"
              bgColor="bg-yellow-50"
            />
            <MetricCard
              icon={Ticket}
              title="Open Support Tickets"
              value={loadingMetrics ? '...' : metrics?.supportTicketsOpen?.toLocaleString() || 'N/A'}
              description="Tickets awaiting resolution"
              color="text-orange-600"
              bgColor="bg-orange-50"
            />
            <MetricCard
              icon={Shield}
              title="System Health Score"
              value={loadingMetrics ? '...' : `${metrics?.systemHealthScore || 'N/A'}%`}
              description="Overall system operational status"
              color="text-teal-600"
              bgColor="bg-teal-50"
            />
            <MetricCard
              icon={Clock}
              title="Avg. Response Time"
              value={loadingMetrics ? '...' : `${metrics?.averageResponseTime || 'N/A'} ms`}
              description="Average bot response time"
              color="text-pink-600"
              bgColor="bg-pink-50"
            />
          </div>

          {/* Main Dashboard Widgets */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            <div className="lg:col-span-2 xl:col-span-2">
              <FinancialDashboard />
            </div>
            <div>
              <PartnerOverviewAdmin />
            </div>
            <div className="lg:col-span-2 xl:col-span-3">
              <ComprehensiveAnalytics />
            </div>
            <div className="xl:col-span-1">
              <NotificationComposer />
            </div>
            <div className="xl:col-span-2">
              <AdminFeaturesOverview />
            </div>
          </div>
        </>
      )}

      {activeTab === 'system-health' && (
        <ErrorRecoveryDashboard />
      )}
    </div>
  );
};

// Placeholder for MetricCard - assuming it exists elsewhere or needs to be created
interface MetricCardProps {
  icon: React.ElementType;
  title: string;
  value: string;
  description: string;
  color: string;
  bgColor: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ icon: Icon, title, value, description, color, bgColor }) => (
  <div className={`rounded-lg p-5 shadow-sm ${bgColor}`}>
    <div className={`flex items-center justify-between`}>
      <Icon className={`h-8 w-8 ${color}`} />
      <span className="text-2xl font-bold text-gray-800">{value}</span>
    </div>
    <h3 className="mt-3 text-lg font-medium text-gray-700">{title}</h3>
    <p className="text-sm text-gray-500">{description}</p>
  </div>
);