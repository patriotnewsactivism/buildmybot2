import {
  AlertCircle,
  Check,
  Clock,
  HardDrive,
  Loader,
  Mail,
  MessageSquare,
  Package,
  RefreshCw,
  Settings,
  Shield,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';

interface UsageCreditsProps {
  organizationId: string;
}

interface UsageSummary {
  resourceType: string;
  total: number;
  used: number;
  reserved: number;
  available: number;
}

interface CreditPackage {
  id: string;
  name: string;
  description: string | null;
  resourceType: string;
  credits: number;
  priceCents: number;
  stripePriceId: string | null;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
}

interface UsageHistoryEntry {
  id: string;
  resourceType: string;
  amount: number;
  balanceAfter: number | null;
  operationType: string;
  description: string | null;
  createdAt: string;
}

interface AutoTopUpSettings {
  enabled: boolean;
  threshold: number;
  topUpAmount: number;
}

const PremiumCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}
  >
    {children}
  </div>
);

const resourceTypeConfig: Record<
  string,
  {
    icon: React.ElementType;
    label: string;
    unit: string;
    color: string;
    gradient: string;
  }
> = {
  sms_credits: {
    icon: MessageSquare,
    label: 'SMS Credits',
    unit: 'messages',
    color: 'text-blue-600',
    gradient: 'from-blue-500 to-indigo-500',
  },
  email_credits: {
    icon: Mail,
    label: 'Email Credits',
    unit: 'emails',
    color: 'text-purple-600',
    gradient: 'from-purple-500 to-pink-500',
  },
  storage_mb: {
    icon: HardDrive,
    label: 'Storage',
    unit: 'MB',
    color: 'text-emerald-600',
    gradient: 'from-emerald-500 to-teal-500',
  },
};

const topUpAmountOptions = [100, 500, 1000, 2500, 5000];

export const UsageCredits: React.FC<UsageCreditsProps> = ({
  organizationId,
}) => {
  const [usage, setUsage] = useState<UsageSummary[]>([]);
  const [smsPackages, setSmsPackages] = useState<CreditPackage[]>([]);
  const [emailPackages, setEmailPackages] = useState<CreditPackage[]>([]);
  const [storagePackages, setStoragePackages] = useState<CreditPackage[]>([]);
  const [usageHistory, setUsageHistory] = useState<UsageHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'sms_credits' | 'email_credits' | 'storage_mb'
  >('sms_credits');
  const [autoTopUp, setAutoTopUp] = useState<Record<string, AutoTopUpSettings>>(
    {
      sms_credits: { enabled: false, threshold: 100, topUpAmount: 500 },
      email_credits: { enabled: false, threshold: 100, topUpAmount: 500 },
      storage_mb: { enabled: false, threshold: 100, topUpAmount: 500 },
    },
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId) {
      fetchData();
    }
  }, [organizationId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usageRes, smsRes, emailRes, storageRes] = await Promise.all([
        fetch(buildApiUrl(`/revenue/usage/${organizationId}`)),
        fetch(buildApiUrl('/revenue/credit-packages?resourceType=sms_credits')),
        fetch(
          buildApiUrl('/revenue/credit-packages?resourceType=email_credits'),
        ),
        fetch(buildApiUrl('/revenue/credit-packages?resourceType=storage_mb')),
      ]);

      const usageData = await usageRes.json();
      const smsData = await smsRes.json();
      const emailData = await emailRes.json();
      const storageData = await storageRes.json();

      setUsage(Array.isArray(usageData) ? usageData : []);
      setSmsPackages(Array.isArray(smsData) ? smsData : []);
      setEmailPackages(Array.isArray(emailData) ? emailData : []);
      setStoragePackages(Array.isArray(storageData) ? storageData : []);
    } catch (err) {
      console.error('Error fetching usage credits data:', err);
      setError('Failed to load usage credits data');
    } finally {
      setLoading(false);
    }
  };

  const getUsageForType = (resourceType: string): UsageSummary => {
    const found = usage.find((u) => u.resourceType === resourceType);
    return (
      found || { resourceType, total: 0, used: 0, reserved: 0, available: 0 }
    );
  };

  const getPackagesForType = (resourceType: string): CreditPackage[] => {
    switch (resourceType) {
      case 'sms_credits':
        return smsPackages;
      case 'email_credits':
        return emailPackages;
      case 'storage_mb':
        return storagePackages;
      default:
        return [];
    }
  };

  const handlePurchase = async (pkg: CreditPackage) => {
    if (!pkg.stripePriceId) {
      alert(
        'This package is not available for purchase yet. Please contact support.',
      );
      return;
    }

    setPurchasing(pkg.id);

    try {
      const res = await fetch(buildApiUrl('/stripe/checkout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          priceId: pkg.stripePriceId,
          mode: 'payment',
          metadata: {
            type: pkg.resourceType,
            packageId: pkg.id,
            credits: pkg.credits,
          },
        }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setPurchasing(null);
    }
  };

  const handleAutoTopUpToggle = (resourceType: string) => {
    setAutoTopUp((prev) => ({
      ...prev,
      [resourceType]: {
        ...prev[resourceType],
        enabled: !prev[resourceType].enabled,
      },
    }));
  };

  const handleThresholdChange = (resourceType: string, threshold: number) => {
    setAutoTopUp((prev) => ({
      ...prev,
      [resourceType]: {
        ...prev[resourceType],
        threshold,
      },
    }));
  };

  const handleTopUpAmountChange = (
    resourceType: string,
    topUpAmount: number,
  ) => {
    setAutoTopUp((prev) => ({
      ...prev,
      [resourceType]: {
        ...prev[resourceType],
        topUpAmount,
      },
    }));
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getUsagePercentage = (u: UsageSummary): number => {
    return u.total > 0 ? Math.min((u.used / u.total) * 100, 100) : 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  const smsUsage = getUsageForType('sms_credits');
  const emailUsage = getUsageForType('email_credits');
  const storageUsage = getUsageForType('storage_mb');
  const activePackages = getPackagesForType(activeTab);
  const activeConfig = resourceTypeConfig[activeTab];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 md:p-8">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-transparent to-amber-500/10" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-500/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-amber-500/20 to-transparent rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-sm font-medium">
                  Usage Credits
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white via-orange-100 to-amber-200 bg-clip-text text-transparent">
                SMS, Email & Storage Credits
              </h1>
              <p className="text-slate-400 mt-2">
                Manage your messaging and storage resources
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-slate-400 text-sm">
                <Shield size={16} className="text-emerald-400" />
                <span>Secure Billing</span>
              </div>
              <div className="w-px h-4 bg-slate-700 hidden md:block" />
              <div className="flex items-center space-x-2 text-slate-400 text-sm hidden md:flex">
                <Zap size={16} className="text-amber-400" />
                <span>Instant Top-up</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PremiumCard className="p-6">
          <div className="flex items-start justify-between">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl">
              <MessageSquare className="text-white" size={24} />
            </div>
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
              SMS
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-slate-900">
              {smsUsage.available.toLocaleString()}
            </div>
            <div className="text-sm font-medium text-slate-600 mt-1">
              Credits Remaining
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{smsUsage.used.toLocaleString()} used</span>
              <span>{smsUsage.total.toLocaleString()} total</span>
            </div>
            <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                  getUsagePercentage(smsUsage) > 90
                    ? 'bg-gradient-to-r from-red-500 to-red-600'
                    : getUsagePercentage(smsUsage) > 70
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                      : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                }`}
                style={{ width: `${getUsagePercentage(smsUsage)}%` }}
              />
            </div>
          </div>
        </PremiumCard>

        <PremiumCard className="p-6">
          <div className="flex items-start justify-between">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
              <Mail className="text-white" size={24} />
            </div>
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
              Email
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-slate-900">
              {emailUsage.available.toLocaleString()}
            </div>
            <div className="text-sm font-medium text-slate-600 mt-1">
              Credits Remaining
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{emailUsage.used.toLocaleString()} used</span>
              <span>{emailUsage.total.toLocaleString()} total</span>
            </div>
            <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                  getUsagePercentage(emailUsage) > 90
                    ? 'bg-gradient-to-r from-red-500 to-red-600'
                    : getUsagePercentage(emailUsage) > 70
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                      : 'bg-gradient-to-r from-purple-500 to-pink-500'
                }`}
                style={{ width: `${getUsagePercentage(emailUsage)}%` }}
              />
            </div>
          </div>
        </PremiumCard>

        <PremiumCard className="p-6">
          <div className="flex items-start justify-between">
            <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl">
              <HardDrive className="text-white" size={24} />
            </div>
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
              Storage
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-slate-900">
              {storageUsage.available.toLocaleString()}{' '}
              <span className="text-lg font-normal text-slate-500">MB</span>
            </div>
            <div className="text-sm font-medium text-slate-600 mt-1">
              Available Storage
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{storageUsage.used.toLocaleString()} MB used</span>
              <span>{storageUsage.total.toLocaleString()} MB limit</span>
            </div>
            <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                  getUsagePercentage(storageUsage) > 90
                    ? 'bg-gradient-to-r from-red-500 to-red-600'
                    : getUsagePercentage(storageUsage) > 70
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                }`}
                style={{ width: `${getUsagePercentage(storageUsage)}%` }}
              />
            </div>
          </div>
        </PremiumCard>
      </div>

      <PremiumCard className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Purchase Credits
            </h3>
            <p className="text-sm text-slate-500">
              Choose a package that fits your needs
            </p>
          </div>
          <div className="flex bg-slate-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setActiveTab('sms_credits')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'sms_credits'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare size={16} />
              <span className="hidden sm:inline">SMS</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('email_credits')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'email_credits'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail size={16} />
              <span className="hidden sm:inline">Email</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('storage_mb')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'storage_mb'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HardDrive size={16} />
              <span className="hidden sm:inline">Storage</span>
            </button>
          </div>
        </div>

        {activePackages.length === 0 ? (
          <div className="text-center py-12">
            <Package className="mx-auto text-slate-300" size={48} />
            <h4 className="text-lg font-semibold text-slate-900 mt-4">
              No packages available
            </h4>
            <p className="text-slate-500 mt-2">
              {activeConfig.label} packages will appear here once configured.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {activePackages.map((pkg) => {
              const Icon = activeConfig.icon;
              return (
                <div
                  key={pkg.id}
                  className={`relative p-6 bg-white rounded-xl border flex flex-col ${
                    pkg.isPopular
                      ? 'border-2 border-orange-500 shadow-lg shadow-orange-500/10'
                      : 'border-slate-200'
                  }`}
                >
                  {pkg.isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-sm flex items-center gap-1">
                      <Star size={12} fill="currentColor" /> Popular
                    </div>
                  )}

                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={`p-2 rounded-lg ${pkg.isPopular ? 'bg-orange-100' : 'bg-slate-100'}`}
                    >
                      <Icon
                        size={20}
                        className={
                          pkg.isPopular ? 'text-orange-600' : activeConfig.color
                        }
                      />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">{pkg.name}</h4>
                      <p className="text-xs text-slate-500">
                        {pkg.description ||
                          `${pkg.credits} ${activeConfig.unit}`}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-baseline">
                      <span className="text-3xl font-extrabold text-slate-900">
                        ${(pkg.priceCents / 100).toFixed(2)}
                      </span>
                      <span className="text-slate-500 ml-1 text-sm">
                        one-time
                      </span>
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      {pkg.credits.toLocaleString()} {activeConfig.unit}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      ${(pkg.priceCents / 100 / pkg.credits).toFixed(4)}/
                      {activeTab === 'storage_mb' ? 'MB' : 'credit'}
                    </div>
                  </div>

                  <div className="mt-auto">
                    <button
                      type="button"
                      onClick={() => handlePurchase(pkg)}
                      disabled={purchasing !== null}
                      className={`w-full py-3 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                        pkg.isPopular
                          ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/25'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {purchasing === pkg.id ? (
                        <Loader className="animate-spin" size={16} />
                      ) : (
                        <Check size={16} />
                      )}
                      {purchasing === pkg.id ? 'Processing...' : 'Purchase'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PremiumCard>

      <PremiumCard className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Usage History</h3>
            <p className="text-sm text-slate-500">
              Recent credit consumption and additions
            </p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {usageHistory.length === 0 ? (
          <div className="text-center py-12">
            <div className="p-4 bg-slate-100 rounded-full w-fit mx-auto mb-4">
              <Clock className="text-slate-400" size={32} />
            </div>
            <h4 className="text-lg font-semibold text-slate-900">
              No usage history yet
            </h4>
            <p className="text-slate-500 mt-2 max-w-md mx-auto">
              When you use SMS, email, or storage credits, your usage history
              will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="md:hidden space-y-3">
              {usageHistory.map((entry) => {
                const config =
                  resourceTypeConfig[entry.resourceType] ||
                  resourceTypeConfig.sms_credits;
                const Icon = config.icon;
                return (
                  <div
                    key={entry.id}
                    className="border border-slate-200 rounded-lg p-4 bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-1.5 rounded-lg bg-gradient-to-br ${config.gradient}`}
                        >
                          <Icon size={14} className="text-white" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-700">
                            {config.label}
                          </div>
                          <div className="text-xs text-slate-500">
                            {entry.description || 'Usage'}
                          </div>
                        </div>
                      </div>
                      <div
                        className={`text-sm font-semibold ${
                          entry.amount > 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {entry.amount > 0 ? '+' : ''}
                        {entry.amount.toLocaleString()}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-400">
                          Balance After
                        </div>
                        <div className="text-slate-700 font-medium">
                          {entry.balanceAfter?.toLocaleString() ?? '-'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-400">
                          Date
                        </div>
                        <div className="text-slate-700 font-medium">
                          {formatDate(entry.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">
                      Type
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">
                      Description
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">
                      Amount
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">
                      Balance After
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usageHistory.map((entry) => {
                    const config =
                      resourceTypeConfig[entry.resourceType] ||
                      resourceTypeConfig.sms_credits;
                    const Icon = config.icon;
                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div
                              className={`p-1.5 rounded-lg bg-gradient-to-br ${config.gradient}`}
                            >
                              <Icon size={14} className="text-white" />
                            </div>
                            <span className="text-sm font-medium text-slate-700">
                              {config.label}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">
                          {entry.description || 'Usage'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-sm font-medium ${
                              entry.amount > 0
                                ? 'text-emerald-600'
                                : 'text-red-600'
                            }`}
                          >
                            {entry.amount > 0 ? '+' : ''}
                            {entry.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">
                          {entry.balanceAfter?.toLocaleString() ?? '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-500">
                          {formatDate(entry.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PremiumCard>

      <PremiumCard className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Settings size={20} className="text-orange-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Auto Top-up Settings
            </h3>
            <p className="text-sm text-slate-500">
              Automatically add credits when balance is low
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {(['sms_credits', 'email_credits', 'storage_mb'] as const).map(
            (resourceType) => {
              const config = resourceTypeConfig[resourceType];
              const Icon = config.icon;
              const settings = autoTopUp[resourceType];
              const thresholdId = `auto-topup-threshold-${resourceType}`;
              const topUpId = `auto-topup-amount-${resourceType}`;

              return (
                <div
                  key={resourceType}
                  className={`p-4 rounded-xl border transition-colors ${
                    settings.enabled
                      ? 'border-orange-200 bg-orange-50'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg bg-gradient-to-br ${config.gradient}`}
                      >
                        <Icon size={18} className="text-white" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900">
                          {config.label}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {settings.enabled
                            ? `Top up ${settings.topUpAmount} when below ${settings.threshold}`
                            : 'Auto top-up disabled'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAutoTopUpToggle(resourceType)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                        settings.enabled ? 'bg-orange-500' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {settings.enabled && (
                    <div className="mt-4 pt-4 border-t border-orange-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor={thresholdId}
                          className="block text-sm font-medium text-slate-700 mb-2"
                        >
                          Threshold (trigger when below)
                        </label>
                        <input
                          id={thresholdId}
                          type="number"
                          min="1"
                          value={settings.threshold}
                          onChange={(e) =>
                            handleThresholdChange(
                              resourceType,
                              Number.parseInt(e.target.value) || 0,
                            )
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                          placeholder="e.g., 100"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={topUpId}
                          className="block text-sm font-medium text-slate-700 mb-2"
                        >
                          Top-up Amount
                        </label>
                        <select
                          id={topUpId}
                          value={settings.topUpAmount}
                          onChange={(e) =>
                            handleTopUpAmountChange(
                              resourceType,
                              Number.parseInt(e.target.value),
                            )
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        >
                          {topUpAmountOptions.map((amount) => (
                            <option key={amount} value={amount}>
                              {amount.toLocaleString()}{' '}
                              {resourceType === 'storage_mb' ? 'MB' : 'credits'}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              );
            },
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <AlertCircle size={16} className="text-blue-600 flex-shrink-0" />
          <span className="text-sm text-blue-800">
            Auto top-up will automatically purchase the selected amount when
            your balance falls below the threshold.
          </span>
        </div>
      </PremiumCard>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
          <AlertCircle className="text-red-600" size={20} />
          <span className="text-red-800">{error}</span>
        </div>
      )}
    </div>
  );
};
