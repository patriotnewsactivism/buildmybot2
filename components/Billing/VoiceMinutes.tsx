import {
  AlertCircle,
  Check,
  Clock,
  Loader,
  Package,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  RefreshCw,
  Shield,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';

interface VoiceMinutesProps {
  organizationId: string;
}

interface UsageSummary {
  resourceType: string;
  total: number;
  used: number;
  reserved: number;
  available: number;
}

interface VoicePackage {
  id: string;
  name: string;
  description: string | null;
  minutes: number;
  priceCents: number;
  stripePriceId: string | null;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
}

interface CallLog {
  id: string;
  callerId: string | null;
  calleeId: string | null;
  direction: string | null;
  durationSeconds: number;
  minutesUsed: number;
  status: string | null;
  startedAt: string | null;
  createdAt: string;
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

export const VoiceMinutes: React.FC<VoiceMinutesProps> = ({
  organizationId,
}) => {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [packages, setPackages] = useState<VoicePackage[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [autoTopUp, setAutoTopUp] = useState(false);
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
      const [usageRes, packagesRes] = await Promise.all([
        fetch(buildApiUrl(`/revenue/usage/${organizationId}`)),
        fetch(buildApiUrl('/revenue/voice-packages')),
      ]);

      const usageData = await usageRes.json();
      const packagesData = await packagesRes.json();

      const voiceUsage = Array.isArray(usageData)
        ? usageData.find(
            (u: UsageSummary) => u.resourceType === 'voice_minutes',
          )
        : null;

      setUsage(
        voiceUsage || {
          resourceType: 'voice_minutes',
          total: 0,
          used: 0,
          reserved: 0,
          available: 0,
        },
      );
      setPackages(Array.isArray(packagesData) ? packagesData : []);
    } catch (err) {
      console.error('Error fetching voice minutes data:', err);
      setError('Failed to load voice minutes data');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (pkg: VoicePackage) => {
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
            type: 'voice_minutes',
            packageId: pkg.id,
            minutes: pkg.minutes,
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

  const handleAutoTopUpToggle = async () => {
    const newValue = !autoTopUp;
    setAutoTopUp(newValue);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const usagePercentage = usage
    ? Math.min((usage.used / Math.max(usage.total, 1)) * 100, 100)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

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
                  Voice Minutes
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white via-orange-100 to-amber-200 bg-clip-text text-transparent">
                Voice Minutes Balance
              </h1>
              <p className="text-slate-400 mt-2">
                Manage your voice AI calling minutes
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
            <div className="p-3 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl">
              <Phone className="text-white" size={24} />
            </div>
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
              Total
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-slate-900">
              {usage?.total?.toLocaleString() || 0}
            </div>
            <div className="text-sm font-medium text-slate-600 mt-1">
              Total Minutes
            </div>
          </div>
        </PremiumCard>

        <PremiumCard className="p-6">
          <div className="flex items-start justify-between">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl">
              <Clock className="text-white" size={24} />
            </div>
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
              Used
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-slate-900">
              {usage?.used?.toLocaleString() || 0}
            </div>
            <div className="text-sm font-medium text-slate-600 mt-1">
              Minutes Used
            </div>
          </div>
        </PremiumCard>

        <PremiumCard className="p-6">
          <div className="flex items-start justify-between">
            <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl">
              <TrendingUp className="text-white" size={24} />
            </div>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
              Available
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-emerald-600">
              {usage?.available?.toLocaleString() || 0}
            </div>
            <div className="text-sm font-medium text-slate-600 mt-1">
              Minutes Remaining
            </div>
          </div>
        </PremiumCard>
      </div>

      <PremiumCard className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Usage Progress</h3>
            <p className="text-sm text-slate-500">
              Track your voice minutes consumption
            </p>
          </div>
          <div className="text-sm font-medium text-slate-600">
            {usagePercentage.toFixed(1)}% used
          </div>
        </div>

        <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
              usagePercentage > 90
                ? 'bg-gradient-to-r from-red-500 to-red-600'
                : usagePercentage > 70
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-500'
            }`}
            style={{ width: `${usagePercentage}%` }}
          />
        </div>

        <div className="flex justify-between mt-2 text-xs text-slate-400">
          <span>0 minutes</span>
          <span>{usage?.total?.toLocaleString() || 0} minutes</span>
        </div>

        {usagePercentage > 80 && (
          <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle size={16} className="text-amber-600" />
            <span className="text-sm text-amber-800">
              {usagePercentage >= 100
                ? "You've used all your minutes! Purchase more to continue making calls."
                : 'Running low on minutes. Consider purchasing more soon.'}
            </span>
          </div>
        )}
      </PremiumCard>

      <PremiumCard className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Auto Top-up</h3>
            <p className="text-sm text-slate-500">
              Automatically add minutes when balance is low
            </p>
          </div>
          <button
            type="button"
            onClick={handleAutoTopUpToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoTopUp ? 'bg-orange-500' : 'bg-slate-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autoTopUp ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {autoTopUp && (
          <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-xl">
            <div className="flex items-start gap-3">
              <RefreshCw size={20} className="text-orange-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-orange-800">
                  Auto top-up enabled
                </p>
                <p className="text-xs text-orange-600 mt-1">
                  When your balance drops below 100 minutes, we'll automatically
                  purchase 500 additional minutes.
                </p>
              </div>
            </div>
          </div>
        )}
      </PremiumCard>

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-xl font-bold text-slate-900">
              Purchase Voice Minutes
            </h3>
            <p className="text-sm text-slate-500">
              Choose a package that fits your needs
            </p>
          </div>
        </div>

        {packages.length === 0 ? (
          <PremiumCard className="p-8 text-center">
            <Package className="mx-auto text-slate-300" size={48} />
            <h4 className="text-lg font-semibold text-slate-900 mt-4">
              No packages available
            </h4>
            <p className="text-slate-500 mt-2">
              Voice minute packages will appear here once configured.
            </p>
          </PremiumCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {packages.map((pkg) => (
              <PremiumCard
                key={pkg.id}
                className={`relative p-6 flex flex-col ${
                  pkg.isPopular
                    ? 'border-2 border-orange-500 shadow-lg shadow-orange-500/10'
                    : ''
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
                    <Phone
                      size={20}
                      className={
                        pkg.isPopular ? 'text-orange-600' : 'text-slate-600'
                      }
                    />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{pkg.name}</h4>
                    <p className="text-xs text-slate-500">
                      {pkg.description || `${pkg.minutes} minutes package`}
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
                    {pkg.minutes.toLocaleString()} minutes
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    ${(pkg.priceCents / 100 / pkg.minutes).toFixed(3)}/min
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
              </PremiumCard>
            ))}
          </div>
        )}
      </div>

      <PremiumCard className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Recent Call History
            </h3>
            <p className="text-sm text-slate-500">
              Your voice AI call activity
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

        {callLogs.length === 0 ? (
          <div className="text-center py-12">
            <div className="p-4 bg-slate-100 rounded-full w-fit mx-auto mb-4">
              <PhoneCall className="text-slate-400" size={32} />
            </div>
            <h4 className="text-lg font-semibold text-slate-900">
              No calls yet
            </h4>
            <p className="text-slate-500 mt-2 max-w-md mx-auto">
              When you start making voice AI calls, your call history will
              appear here with detailed logs.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">
                    Direction
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">
                    Phone Number
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">
                    Duration
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">
                    Minutes Used
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">
                    Status
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-3 px-4">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {callLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {log.direction === 'outbound' ? (
                          <PhoneOutgoing size={16} className="text-blue-500" />
                        ) : (
                          <PhoneIncoming
                            size={16}
                            className="text-emerald-500"
                          />
                        )}
                        <span className="text-sm font-medium text-slate-700 capitalize">
                          {log.direction || 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {log.direction === 'outbound'
                        ? log.calleeId
                        : log.callerId}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {formatDuration(log.durationSeconds)}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {log.minutesUsed.toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          log.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : log.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {log.status || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500">
                      {formatDate(log.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
