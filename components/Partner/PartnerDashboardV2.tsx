import {
  AlertTriangle,
  BarChart3,
  Briefcase,
  CheckCircle,
  Clock,
  DollarSign,
  FileText,
  ListChecks,
  Percent,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import type { User } from '../../types';
import { ClientManagement } from './widgets/ClientManagement';
import { CommissionsEarnings } from './widgets/CommissionsEarnings';
import { MarketingMaterials } from './widgets/MarketingMaterials';

export type PartnerTab =
  | 'clients'
  | 'commissions'
  | 'marketing'
  | 'analytics'
  | 'collaboration';

interface PartnerDashboardV2Props {
  user: User;
  onImpersonate: (userId: string, reason: string) => void;
  activeTab?: PartnerTab;
  onTabChange?: (tab: PartnerTab) => void;
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

const CollaborationStatCard: React.FC<{
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

export const PartnerDashboardV2: React.FC<PartnerDashboardV2Props> = ({
  user,
  onImpersonate,
  activeTab: controlledTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<PartnerTab>('clients');

  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: PartnerTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (user.status === 'Pending') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-col items-center justify-center h-96 text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle size={32} className="text-orange-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            Application Pending
          </h2>
          <p className="text-slate-500 max-w-md mb-6">
            Your partner application is currently under review. You'll receive
            full access to the partner dashboard once your application is
            approved.
          </p>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 max-w-md">
            <p className="text-sm text-orange-800">
              <strong>What's next?</strong> Our team typically reviews
              applications within 24-48 hours. You'll receive an email
              notification when your account is activated.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'clients' as PartnerTab, label: 'Client Management', icon: Users },
    {
      id: 'commissions' as PartnerTab,
      label: 'Commissions & Earnings',
      icon: DollarSign,
    },
    {
      id: 'marketing' as PartnerTab,
      label: 'Marketing Materials',
      icon: FileText,
    },
    {
      id: 'analytics' as PartnerTab,
      label: 'Performance Analytics',
      icon: BarChart3,
    },
    {
      id: 'collaboration' as PartnerTab,
      label: 'Collaboration',
      icon: ListChecks,
    },
  ];

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
              Partner Active
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white via-orange-100 to-amber-200 bg-clip-text text-transparent">
            Partner Dashboard
          </h1>
          <p className="text-slate-300 mt-2 text-lg">
            Welcome back, {user.name || 'Partner'}
          </p>
          <p className="text-slate-400 mt-1">{currentDate}</p>
          <div className="flex items-center space-x-4 mt-4">
            <div className="flex items-center space-x-2 text-slate-400 text-sm">
              <Briefcase size={16} className="text-orange-400" />
              <span>Partner Program</span>
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
        <div className="flex overflow-x-auto gap-1 scrollbar-hide">
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
        {activeTab === 'clients' && (
          <ClientManagement onImpersonate={onImpersonate} />
        )}
        {activeTab === 'commissions' && <CommissionsEarnings />}
        {activeTab === 'marketing' && <MarketingMaterials />}

        {activeTab === 'analytics' && (
          <div className="space-y-4 md:space-y-6">
            <PremiumCard className="p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 md:mb-6">
                <div>
                  <h3 className="text-lg md:text-xl font-bold text-slate-900">
                    Performance Analytics
                  </h3>
                  <p className="text-xs md:text-sm text-slate-500 mt-1">
                    Track your referral performance and client metrics
                  </p>
                </div>
                <div className="px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-600 self-start sm:self-auto">
                  All Time
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <AnalyticsMetricCard
                  icon={TrendingUp}
                  label="Total Referrals"
                  value="0"
                  subtext="Start referring to grow"
                />
                <AnalyticsMetricCard
                  icon={Percent}
                  label="Conversion Rate"
                  value="0%"
                  subtext="No conversions yet"
                />
                <AnalyticsMetricCard
                  icon={UserCheck}
                  label="Active Clients"
                  value="0"
                  subtext="No active clients"
                />
                <AnalyticsMetricCard
                  icon={DollarSign}
                  label="Avg Revenue per Client"
                  value="$0"
                  subtext="Revenue tracking"
                />
              </div>
            </PremiumCard>

            <PremiumCard className="p-4 md:p-6">
              <div className="flex flex-col items-center justify-center py-8 md:py-12 text-center">
                <div className="p-3 md:p-4 bg-slate-100 rounded-full mb-3 md:mb-4">
                  <BarChart3 className="text-slate-400" size={28} />
                </div>
                <h4 className="text-base md:text-lg font-semibold text-slate-900 mb-2">
                  Analytics will appear here
                </h4>
                <p className="text-sm md:text-base text-slate-500 max-w-md px-2">
                  Once you start referring clients, detailed analytics about
                  your referral funnel, conversion rates, and revenue trends
                  will be displayed here.
                </p>
              </div>
            </PremiumCard>
          </div>
        )}

        {activeTab === 'collaboration' && (
          <div className="space-y-4 md:space-y-6">
            <PremiumCard className="p-4 md:p-6">
              <div className="mb-4 md:mb-6">
                <h3 className="text-lg md:text-xl font-bold text-slate-900">
                  Collaboration Hub
                </h3>
                <p className="text-xs md:text-sm text-slate-500 mt-1">
                  Coordinate campaigns and tasks with your team
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
                <CollaborationStatCard
                  icon={Target}
                  label="Shared Campaigns"
                  value={0}
                  color="bg-blue-500"
                />
                <CollaborationStatCard
                  icon={Clock}
                  label="Pending Tasks"
                  value={0}
                  color="bg-amber-500"
                />
                <CollaborationStatCard
                  icon={CheckCircle}
                  label="Completed This Month"
                  value={0}
                  color="bg-emerald-500"
                />
              </div>

              <div className="flex flex-col items-center justify-center py-8 md:py-12 text-center border-t border-slate-100">
                <div className="p-3 md:p-4 bg-orange-50 rounded-full mb-3 md:mb-4">
                  <ListChecks className="text-orange-500" size={28} />
                </div>
                <h4 className="text-base md:text-lg font-semibold text-slate-900 mb-2">
                  Ready to collaborate
                </h4>
                <p className="text-sm md:text-base text-slate-500 max-w-md mb-4 md:mb-6 px-2">
                  Create joint campaigns, assign tasks, and track progress with
                  your team. Collaboration tools help you maximize your
                  partnership potential.
                </p>
                <button
                  type="button"
                  className="px-5 md:px-6 py-2.5 md:py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm md:text-base font-semibold rounded-lg shadow-lg shadow-orange-500/25 hover:shadow-xl hover:shadow-orange-500/30 transition-all duration-200"
                >
                  Start a Campaign
                </button>
              </div>
            </PremiumCard>
          </div>
        )}
      </div>
    </div>
  );
};
