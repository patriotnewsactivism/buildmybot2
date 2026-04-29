/**
 * Affiliate Dashboard
 *
 * Lightweight referral-only dashboard.
 * Affiliates earn 20% lifetime commission on every referred account.
 */

import {
  Copy,
  DollarSign,
  ExternalLink,
  Gift,
  Link2,
  Share2,
  TrendingUp,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

interface AffiliateStats {
  referralCode: string;
  referralLink: string;
  totalReferrals: number;
  activeReferrals: number;
  totalEarnedCents: number;
  pendingPayoutCents: number;
  lastPayoutDate: string | null;
}

interface Referral {
  id: string;
  referredUserName: string;
  referredUserEmail: string;
  plan: string;
  status: string;
  totalEarnedCents: number;
  createdAt: string;
}

const StatCard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtext?: string;
}> = ({ label, value, icon, color, subtext }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
      {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
    </div>
  </div>
);

export const AffiliateDashboard: React.FC = () => {
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      // TODO: wire to real affiliate API endpoints
      // For now showing the structure with placeholder data
      setStats({
        referralCode: 'REF-XXXXX',
        referralLink: 'https://www.buildmybot.app/ref/XXXXX',
        totalReferrals: 0,
        activeReferrals: 0,
        totalEarnedCents: 0,
        pendingPayoutCents: 0,
        lastPayoutDate: null,
      });
      setReferrals([]);
    } catch (err) {
      console.error('Failed to load affiliate data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const copyLink = () => {
    if (stats?.referralLink) {
      navigator.clipboard.writeText(stats.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Affiliate Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Earn <span className="font-semibold text-emerald-600">20% lifetime</span> commission on every referred account
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Referrals"
          value={stats?.totalReferrals || 0}
          icon={<Users size={20} className="text-blue-600" />}
          color="bg-blue-50"
        />
        <StatCard
          label="Active Accounts"
          value={stats?.activeReferrals || 0}
          icon={<TrendingUp size={20} className="text-emerald-600" />}
          color="bg-emerald-50"
        />
        <StatCard
          label="Total Earned"
          value={formatCurrency(stats?.totalEarnedCents || 0)}
          icon={<DollarSign size={20} className="text-amber-600" />}
          color="bg-amber-50"
        />
        <StatCard
          label="Pending Payout"
          value={formatCurrency(stats?.pendingPayoutCents || 0)}
          icon={<Gift size={20} className="text-purple-600" />}
          color="bg-purple-50"
          subtext="$25 min payout • Monthly"
        />
      </div>

      {/* Referral Link */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Link2 size={18} className="text-blue-600" />
          <h3 className="text-base font-semibold text-slate-900">Your Referral Link</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 font-mono text-sm text-slate-700 truncate">
            {stats?.referralLink || 'Loading...'}
          </div>
          <button
            type="button"
            onClick={copyLink}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              copied
                ? 'bg-emerald-500 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <Copy size={16} />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div className="flex gap-3 mt-3">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 transition-colors"
          >
            <Share2 size={14} />
            Share on social
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 transition-colors"
          >
            <ExternalLink size={14} />
            Open link
          </button>
        </div>
      </div>

      {/* Referrals Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <Users size={18} className="text-blue-600" />
          <h3 className="text-base font-semibold text-slate-900">My Referrals</h3>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {referrals.length}
          </span>
        </div>
        {referrals.length === 0 ? (
          <div className="p-8 text-center">
            <Gift size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 mb-1">No referrals yet</p>
            <p className="text-xs text-slate-400">
              Share your referral link to start earning 20% lifetime commissions
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Referred User</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Plan</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Earned</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {referrals.map((ref) => (
                  <tr key={ref.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{ref.referredUserName}</p>
                      <p className="text-xs text-slate-400">{ref.referredUserEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {ref.plan}
                      </span>
                    </td>
                    <td className="text-center px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          ref.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {ref.status}
                      </span>
                    </td>
                    <td className="text-right px-4 py-3 font-medium text-emerald-600">
                      {formatCurrency(ref.totalEarnedCents)}
                    </td>
                    <td className="text-right px-4 py-3 text-xs text-slate-400">
                      {new Date(ref.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-3">How It Works</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              step: '1',
              title: 'Share Your Link',
              desc: 'Send your unique referral link to anyone who could benefit from BuildMyBot',
            },
            {
              step: '2',
              title: 'They Sign Up',
              desc: 'When they create an account and subscribe, you get credited automatically',
            },
            {
              step: '3',
              title: 'Earn 20% Forever',
              desc: "You earn 20% of their subscription payment every month — for the life of their account",
            },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                {item.step}
              </div>
              <div>
                <p className="font-medium text-slate-900 text-sm">{item.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
