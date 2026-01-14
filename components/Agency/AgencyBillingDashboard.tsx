import {
  BarChart3,
  CreditCard,
  DollarSign,
  Settings,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import type { User } from '../../types';
import { ProfitAnalytics } from './widgets/ProfitAnalytics';
import { PricingConfigurator } from './widgets/PricingConfigurator';
import { WalletManagement } from './widgets/WalletManagement';
import { ClientUsageBreakdown } from './widgets/ClientUsageBreakdown';

export type AgencyBillingTab =
  | 'profit'
  | 'wallet'
  | 'pricing'
  | 'clients';

interface AgencyBillingDashboardProps {
  user: User;
  activeTab?: AgencyBillingTab;
  onTabChange?: (tab: AgencyBillingTab) => void;
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

export const AgencyBillingDashboard: React.FC<
  AgencyBillingDashboardProps
> = ({ user, activeTab: controlledTab, onTabChange }) => {
  const [internalTab, setInternalTab] = useState<AgencyBillingTab>('profit');

  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: AgencyBillingTab) => {
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

  const tabs = [
    { id: 'profit' as AgencyBillingTab, label: 'Profit Analytics', icon: TrendingUp },
    {
      id: 'wallet' as AgencyBillingTab,
      label: 'Wallet & Balance',
      icon: Wallet,
    },
    {
      id: 'pricing' as AgencyBillingTab,
      label: 'Pricing Configuration',
      icon: Settings,
    },
    {
      id: 'clients' as AgencyBillingTab,
      label: 'Client Usage',
      icon: BarChart3,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-4 md:space-y-6 animate-fade-in px-2 md:px-0">
      {/* Premium Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl md:rounded-2xl p-4 md:p-8">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-transparent to-blue-500/10" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-emerald-500/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-blue-500/20 to-transparent rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-emerald-400 text-sm font-medium">
              Billing Arbitrage Active
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white via-emerald-100 to-blue-200 bg-clip-text text-transparent">
            Agency Billing Dashboard
          </h1>
          <p className="text-slate-300 mt-2 text-lg">
            Welcome back, {user.name || 'Agency'}
          </p>
          <p className="text-slate-400 mt-1">{currentDate}</p>
          <div className="flex items-center space-x-4 mt-4">
            <div className="flex items-center space-x-2 text-slate-400 text-sm">
              <DollarSign size={16} className="text-emerald-400" />
              <span>Profit from Markup</span>
            </div>
            <div className="w-px h-4 bg-slate-700" />
            <div className="flex items-center space-x-2 text-slate-400 text-sm">
              <Zap size={16} className="text-blue-400" />
              <span>Usage-Based Billing</span>
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
                    ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white font-semibold shadow-lg shadow-emerald-500/25'
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
        {activeTab === 'profit' && <ProfitAnalytics />}
        {activeTab === 'wallet' && <WalletManagement />}
        {activeTab === 'pricing' && <PricingConfigurator />}
        {activeTab === 'clients' && <ClientUsageBreakdown />}
      </div>
    </div>
  );
};
