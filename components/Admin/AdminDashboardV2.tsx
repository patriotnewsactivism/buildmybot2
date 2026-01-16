import {
  Activity,
  AlertCircle,
  BarChart3,
  Bell,
  Briefcase,
  CheckCircle,
  Clock,
  Database,
  DollarSign,
  Eye,
  Headphones,
  Server,
  Settings,
  Shield,
  Ticket,
  TrendingDown,
  UserCheck,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import AdminFeaturesOverview from '../Analytics/AdminFeaturesOverview';
import { ComprehensiveAnalytics } from '../Analytics/ComprehensiveAnalytics';
import { PartnerOverviewAdmin } from './PartnerOverviewAdmin';
import { NotificationComposer } from './NotificationComposer';
import { FinancialDashboard } from './widgets/FinancialDashboard';
import { LiveMetrics } from './widgets/LiveMetrics';
import { PartnerOversight } from './widgets/PartnerOversight';
import { UserManagement } from './widgets/UserManagement';

export type AdminTab =
  | 'metrics'
  | 'users'
  | 'partners'
  | 'financial'
  | 'analytics'
  | 'notifications'
  | 'support'
  | 'system';

interface AdminDashboardV2Props {
  onImpersonate: (userId: string, reason: string) => void;
  activeTab?: AdminTab;
  onTabChange?: (tab: AdminTab) => void;
}

const PremiumCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}
  >
    {children}
  </div>
);

const AnalyticsMetricCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
}> = ({ icon: Icon, label, value, subtext }) => (
  <PremiumCard className="p-4 md:p-6">
    <div className="flex items-start justify-between">
      <div className="p-2 md:p-3 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg">
        <Icon className="text-white" size={20} />
      </div>
    </div>
    <div className="mt-3 md:mt-4">
      <div className="text-2xl md:text-3xl font-bold text-slate-900">
        {value}
      </div>
      <div className="text-xs md:text-sm font-medium text-slate-600 mt-1">
        {label}
      </div>
      {subtext && <div className="text-xs text-slate-400 mt-1">{subtext}</div>}
    </div>
  </PremiumCard>
);

const SupportStatCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}> = ({ icon: Icon, label, value, color }) => (
  <div className="flex items-center space-x-3 md:space-x-4 p-3 md:p-4 bg-slate-50 rounded-lg">
    <div className={`p-2 md:p-3 rounded-lg ${color}`}>
      <Icon className="text-white" size={18} />
    </div>
    <div>
      <div className="text-xl md:text-2xl font-bold text-slate-900">
        {value}
      </div>
      <div className="text-xs md:text-sm text-slate-600">{label}</div>
    </div>
  </div>
);

const SystemStatusItem: React.FC<{
  label: string;
  status: 'operational' | 'degraded' | 'down';
  description: string;
}> = ({ label, status, description }) => {
  const statusStyles = {
    operational: {
      dot: 'bg-emerald-500',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      label: 'Operational',
    },
    degraded: {
      dot: 'bg-amber-500',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      label: 'Degraded',
    },
    down: {
      dot: 'bg-red-500',
      bg: 'bg-red-50',
      text: 'text-red-700',
      label: 'Down',
    },
  };
  const style = statusStyles[status];

  return (
    <div className="flex items-center justify-between p-3 md:p-4 bg-slate-50 rounded-lg gap-2">
      <div className="flex items-center space-x-2 md:space-x-3 min-w-0 flex-1">
        <div
          className={`w-2.5 md:w-3 h-2.5 md:h-3 rounded-full ${style.dot} animate-pulse flex-shrink-0`}
        />
        <div className="min-w-0">
          <div className="font-medium text-slate-900 text-sm md:text-base">
            {label}
          </div>
          <div className="text-xs md:text-sm text-slate-500 truncate">
            {description}
          </div>
        </div>
      </div>
      <span
        className={`px-2 md:px-3 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text} flex-shrink-0`}
      >
        {style.label}
      </span>
    </div>
  );
};

export const AdminDashboardV2: React.FC<AdminDashboardV2Props> = ({
  onImpersonate,
  activeTab: controlledTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<AdminTab>('metrics');

  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: AdminTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  const tabs = [
    { id: 'metrics' as AdminTab, label: 'Live Metrics', icon: Activity },
    { id: 'users' as AdminTab, label: 'User Management', icon: Users },
    { id: 'partners' as AdminTab, label: 'Partner Oversight', icon: Briefcase },
    { id: 'financial' as AdminTab, label: 'Financial', icon: DollarSign },
    { id: 'analytics' as AdminTab, label: 'Analytics', icon: BarChart3 },
    { id: 'notifications' as AdminTab, label: 'Notifications', icon: Bell },
    { id: 'support' as AdminTab, label: 'Support', icon: Headphones },
    { id: 'system' as AdminTab, label: 'System', icon: Settings },
  ];

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="max-w-7xl mx-auto space-y-4 md:space-y-6 animate-fade-in px-2 md:px-0">
      {/* Premium Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl md:rounded-2xl p-4 md:p-8">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-transparent to-amber-500/10" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-500/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-amber-500/20 to-transparent rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-emerald-400 text-sm font-medium">
              System Active
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white via-orange-100 to-amber-200 bg-clip-text text-transparent">
            Admin Control Center
          </h1>
          <p className="text-slate-400 mt-2 text-lg">{currentDate}</p>
          <div className="flex items-center space-x-4 mt-4">
            <div className="flex items-center space-x-2 text-slate-400 text-sm">
              <Shield size={16} className="text-emerald-400" />
              <span>Secure Connection</span>
            </div>
            <div className="w-px h-4 bg-slate-700" />
            <div className="flex items-center space-x-2 text-slate-400 text-sm">
              <Zap size={16} className="text-amber-400" />
              <span>Full Access</span>
            </div>
          </div>
        </div>
      </div>

      {/* Premium Tab Navigation */}
      <div className="bg-slate-900 rounded-xl p-1.5 md:p-2 shadow-lg overflow-hidden">
        <div className="flex flex-wrap md:flex-nowrap gap-1 overflow-x-hidden">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-1.5 md:space-x-2 px-3 md:px-5 py-2.5 md:py-3 rounded-lg transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold shadow-lg shadow-orange-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon size={16} className="md:w-[18px] md:h-[18px]" />
                <span className="text-xs md:text-sm">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="animate-fade-in">
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            <AdminFeaturesOverview />
            <LiveMetrics />
          </div>
        )}
        {activeTab === 'users' && (
          <UserManagement onImpersonate={onImpersonate} />
        )}
        {activeTab === 'partners' && <PartnerOverviewAdmin />}
        {activeTab === 'financial' && <FinancialDashboard />}

        {activeTab === 'analytics' && <ComprehensiveAnalytics />}

        {activeTab === 'notifications' && <NotificationComposer />}

        {activeTab === 'support' && (
          <div className="space-y-4 md:space-y-6">
            <PremiumCard className="p-4 md:p-6">
              <div className="mb-4 md:mb-6">
                <h3 className="text-lg md:text-xl font-bold text-slate-900">
                  Support Overview
                </h3>
                <p className="text-xs md:text-sm text-slate-500 mt-1">
                  Ticket management and customer support metrics
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
                <SupportStatCard
                  icon={Ticket}
                  label="Open Tickets"
                  value={0}
                  color="bg-blue-500"
                />
                <SupportStatCard
                  icon={AlertCircle}
                  label="Pending"
                  value={0}
                  color="bg-amber-500"
                />
                <SupportStatCard
                  icon={CheckCircle}
                  label="Resolved Today"
                  value={0}
                  color="bg-emerald-500"
                />
              </div>

              <div className="flex flex-col items-center justify-center py-8 md:py-12 text-center border-t border-slate-100">
                <div className="p-3 md:p-4 bg-emerald-50 rounded-full mb-3 md:mb-4">
                  <CheckCircle className="text-emerald-500" size={28} />
                </div>
                <h4 className="text-base md:text-lg font-semibold text-slate-900 mb-2">
                  All caught up!
                </h4>
                <p className="text-sm md:text-base text-slate-500 max-w-md px-2">
                  No support tickets require your attention. When customers
                  submit requests, they will appear here for review and
                  resolution.
                </p>
              </div>
            </PremiumCard>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="space-y-4 md:space-y-6">
            <PremiumCard className="p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
                <div>
                  <h3 className="text-lg md:text-xl font-bold text-slate-900">
                    System Status
                  </h3>
                  <p className="text-xs md:text-sm text-slate-500 mt-1">
                    Infrastructure health and service monitoring
                  </p>
                </div>
                <div className="flex items-center space-x-2 px-3 md:px-4 py-1.5 md:py-2 bg-emerald-50 rounded-full self-start sm:self-auto">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-xs md:text-sm font-medium text-emerald-700">
                    All Systems Operational
                  </span>
                </div>
              </div>

              <div className="mb-6">
                <a
                  href="/status"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
                >
                  <Activity size={16} />
                  <span>View Public Status Page</span>
                </a>
              </div>

              <div className="space-y-3">
                <SystemStatusItem
                  label="API Gateway"
                  status="operational"
                  description="REST & GraphQL endpoints responding normally"
                />
                <SystemStatusItem
                  label="Database Cluster"
                  status="operational"
                  description="PostgreSQL primary and replicas healthy"
                />
                <SystemStatusItem
                  label="CDN & Static Assets"
                  status="operational"
                  description="Global edge nodes active"
                />
                <SystemStatusItem
                  label="Authentication Services"
                  status="operational"
                  description="OAuth and session management active"
                />
                <SystemStatusItem
                  label="Background Workers"
                  status="operational"
                  description="Job queues processing normally"
                />
              </div>
            </PremiumCard>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              <PremiumCard className="p-4 md:p-6">
                <div className="flex items-center space-x-3 mb-3 md:mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Server className="text-blue-600" size={18} />
                  </div>
                  <span className="font-semibold text-slate-900 text-sm md:text-base">
                    API Health
                  </span>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-emerald-600 mb-1">
                  100%
                </div>
                <div className="text-xs md:text-sm text-slate-500">
                  Uptime last 30 days
                </div>
              </PremiumCard>

              <PremiumCard className="p-4 md:p-6">
                <div className="flex items-center space-x-3 mb-3 md:mb-4">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Database className="text-purple-600" size={18} />
                  </div>
                  <span className="font-semibold text-slate-900 text-sm md:text-base">
                    DB Health
                  </span>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-emerald-600 mb-1">
                  100%
                </div>
                <div className="text-xs md:text-sm text-slate-500">
                  Queries optimized
                </div>
              </PremiumCard>

              <PremiumCard className="p-4 md:p-6">
                <div className="flex items-center space-x-3 mb-3 md:mb-4">
                  <div className="p-2 bg-teal-100 rounded-lg">
                    <Wifi className="text-teal-600" size={18} />
                  </div>
                  <span className="font-semibold text-slate-900 text-sm md:text-base">
                    Network
                  </span>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-emerald-600 mb-1">
                  100%
                </div>
                <div className="text-xs md:text-sm text-slate-500">
                  Connection stability
                </div>
              </PremiumCard>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
