import {
  ArrowUpRight,
  BookOpen,
  Bot,
  MessageCircle,
  MessageSquare,
  Mic,
  Phone,
  Plus,
  RefreshCw,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { dbService } from '../../services/dbService';
import type { User } from '../../types';
import { type Column, DataTable } from '../UI/DataTable';
import { MetricCard } from '../UI/MetricCard';
import { PlayfulMetricCard } from '../UI/PlayfulMetricCard';
import { QuickMetricsWidget } from '../UI/QuickMetricsWidget';
import { ReferralBanner } from '../UI/ReferralBanner';
import { OnboardingWizard } from './OnboardingWizard';

interface ClientOverviewProps {
  user?: User | null;
  onCreateBot?: () => void;
  onOpenLeads?: () => void;
}

interface ClientStats {
  botCount: number;
  leadCount: number;
  conversionRate: number;
  averageLeadScore: number;
}

interface UsageData {
  plan: string;
  conversationsUsed: number;
  conversationsLimit: number;
  botsUsed: number;
  botsLimit: number;
}

interface VoiceStatus {
  enabled: boolean;
  minutesUsed: number;
  minutesLimit: number;
}

interface TrendPoint {
  date: string;
  count: number;
}

interface BotData {
  id: string;
  name: string;
  active: boolean;
  voiceId: string | null;
  createdAt: string;
}

interface LeadData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  score: number | null;
  createdAt: string;
}

/** Tiny inline sparkline component — pure SVG, no dependencies */
const Sparkline: React.FC<{ data: number[]; color?: string; height?: number }> = ({
  data,
  color = '#3b82f6',
  height = 40,
}) => {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const width = 120;
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts.join(' ')} />
      {/* Dot on last point */}
      {pts.length > 0 && (() => {
        const [lx, ly] = pts[pts.length - 1].split(',');
        return <circle cx={lx} cy={ly} r="3" fill={color} />;
      })()}
    </svg>
  );
};

/** Usage bar component */
const UsageBar: React.FC<{
  label: string;
  used: number;
  limit: number;
  icon: React.ElementType;
  unit?: string;
}> = ({ label, used, limit, icon: Icon, unit = '' }) => {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isHigh = pct >= 80;
  const isFull = pct >= 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Icon size={14} className={isFull ? 'text-red-500' : isHigh ? 'text-amber-500' : 'text-slate-400'} />
          {label}
        </div>
        <span className={`text-xs font-semibold ${isFull ? 'text-red-600' : isHigh ? 'text-amber-600' : 'text-slate-500'}`}>
          {used.toLocaleString()}{unit} / {limit >= 9999 ? '∞' : limit.toLocaleString()}{unit}
        </span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${isFull ? 'bg-red-500' : isHigh ? 'bg-amber-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export const ClientOverview: React.FC<ClientOverviewProps> = ({
  user,
  onCreateBot,
  onOpenLeads,
}) => {
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [voice, setVoice] = useState<VoiceStatus | null>(null);
  const [conversationTrend, setConversationTrend] = useState<TrendPoint[]>([]);
  const [recentBots, setRecentBots] = useState<BotData[]>([]);
  const [recentLeads, setRecentLeads] = useState<LeadData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(
    Boolean(user && !user.preferences?.onboardingComplete),
  );
  const fetchOverview = useCallback(async () => {
    try {
      const data = await dbService.getClientOverview();
      setStats(data.stats);
      setUsage(data.usage || null);
      setVoice(data.voice || null);
      setConversationTrend(data.conversationTrend || []);
      setRecentBots(data.recentBots);
      setRecentLeads(data.recentLeads);
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Error fetching overview:', err);
      setError('Failed to load dashboard data');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleCreateBot = () => {
    if (onCreateBot) {
      onCreateBot();
      return;
    }
    window.location.pathname = '/bots';
  };

  const botColumns: Column<BotData>[] = [
    {
      key: 'name',
      label: 'Bot Name',
      sortable: true,
      render: (bot) => (
        <div className="flex items-center space-x-2">
          <Bot size={16} className="text-orange-600" />
          <span className="font-medium text-slate-900">{bot.name}</span>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (bot) => {
        const statusLabel = bot.active ? 'active' : 'paused';
        return (
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              statusLabel === 'active'
                ? 'bg-green-100 text-green-800'
                : statusLabel === 'paused'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-slate-100 text-slate-800'
            }`}
          >
            {statusLabel}
          </span>
        );
      },
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (bot) => new Date(bot.createdAt).toLocaleDateString(),
    },
  ];

  const leadColumns: Column<LeadData>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (lead) => (
        <div>
          <div className="font-medium text-slate-900">{lead.name}</div>
          <div className="text-xs text-slate-500">{lead.email}</div>
        </div>
      ),
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (lead) => lead.phone || '-',
    },
    {
      key: 'score',
      label: 'Score',
      sortable: true,
      render: (lead) => {
        if (!lead.score) return '-';
        const scorePercent = Math.round(lead.score);
        return (
          <div className="flex items-center space-x-2">
            <div className="w-16 bg-slate-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  scorePercent >= 80
                    ? 'bg-green-600'
                    : scorePercent >= 50
                      ? 'bg-yellow-600'
                      : 'bg-red-600'
                }`}
                style={{ width: `${scorePercent}%` }}
              />
            </div>
            <span className="text-xs font-medium text-slate-700">
              {scorePercent}%
            </span>
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (lead) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            lead.status === 'New'
              ? 'bg-blue-100 text-blue-800'
              : lead.status === 'Contacted'
                ? 'bg-yellow-100 text-yellow-800'
                : lead.status === 'Qualified'
                  ? 'bg-green-100 text-green-800'
                  : lead.status === 'Closed'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-slate-100 text-slate-800'
          }`}
        >
          {lead.status}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (lead) => new Date(lead.createdAt).toLocaleDateString(),
    },
  ];

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800">{error}</p>
        <button
          type="button"
          onClick={fetchOverview}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <RefreshCw size={16} className="inline mr-2" />
          Retry
        </button>
      </div>
    );
  }

  const resellerCode = user?.resellerCode;

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      <QuickMetricsWidget />
      {resellerCode ? <ReferralBanner user={user as User} /> : null}
      {showOnboarding && (
        <OnboardingWizard
          existingBotId={recentBots[0]?.id}
          onSkip={() => setShowOnboarding(false)}
          onComplete={async () => {
            await dbService.completeOnboarding();
            setShowOnboarding(false);
          }}
        />
      )}

      {/* Professional Header */}
      <div className="relative overflow-hidden rounded-lg p-6 md:p-8 mb-6 bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg border border-blue-800">
        {/* Content */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-white mb-2">
              Welcome back, {user?.name || 'there'}
            </h1>
            <p className="text-blue-100 text-base md:text-lg">
              Your AI automation platform. Reduce costs and improve efficiency.
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handleCreateBot}
              className="px-4 py-3 bg-white text-blue-700 rounded-md hover:bg-blue-50 font-semibold flex items-center gap-2 text-sm shadow-sm hover:shadow-md transition-all"
            >
              <Plus size={18} />
              <span>Create Bot</span>
            </button>
            <button
              type="button"
              onClick={fetchOverview}
              className="px-4 py-3 bg-white/20 text-white rounded-xl hover:bg-white/30 backdrop-blur-sm font-semibold flex items-center gap-2 text-sm transition-all hover:scale-105"
            >
              <RefreshCw size={18} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Key Metrics - Playful Design */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <PlayfulMetricCard
            icon={Bot}
            label="Active Bots"
            value={stats.botCount}
            gradient="from-violet-500 to-purple-600"
            illustration="🤖"
            trend={stats.botCount > 0 ? `${stats.botCount} total` : undefined}
            loading={loading}
          />
          <PlayfulMetricCard
            icon={MessageSquare}
            label="Total Leads"
            value={stats.leadCount}
            gradient="from-pink-500 to-rose-600"
            illustration="💼"
            trend={stats.leadCount > 0 ? `${stats.leadCount} captured` : undefined}
            loading={loading}
            onClick={onOpenLeads}
          />
          <PlayfulMetricCard
            icon={TrendingUp}
            label="Conversion Rate"
            value={`${stats.conversionRate.toFixed(1)}%`}
            gradient="from-emerald-500 to-teal-600"
            illustration="📈"
            trend={
              stats.conversionRate > 20
                ? '🔥 Hot'
                : stats.conversionRate > 10
                  ? '👍 Good'
                  : '⚠️ Low'
            }
            loading={loading}
          />
          <PlayfulMetricCard
            icon={Star}
            label="Lead Quality"
            value={`${stats.averageLeadScore.toFixed(0)}%`}
            gradient="from-amber-500 to-orange-600"
            illustration="⭐"
            loading={loading}
          />
        </div>
      )}

      {/* Plan Usage & Activity */}
      {usage && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Usage Meters */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap size={18} className="text-blue-600" />
                <h3 className="text-sm md:text-base font-semibold text-slate-900">Plan Usage</h3>
              </div>
              <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
                {usage.plan} Plan
              </span>
            </div>
            <div className="space-y-4">
              <UsageBar
                label="Conversations"
                used={usage.conversationsUsed}
                limit={usage.conversationsLimit}
                icon={MessageSquare}
                unit=""
              />
              <UsageBar
                label="Bots"
                used={usage.botsUsed}
                limit={usage.botsLimit}
                icon={Bot}
                unit=""
              />
              {voice && (
                <UsageBar
                  label="Voice Minutes"
                  used={voice.minutesUsed}
                  limit={voice.minutesLimit}
                  icon={Phone}
                  unit=" min"
                />
              )}
            </div>
            {usage.conversationsUsed >= usage.conversationsLimit * 0.8 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                <p className="text-xs text-amber-800">
                  You're approaching your conversation limit. Upgrade for more.
                </p>
                <button
                  type="button"
                  onClick={() => (window.location.pathname = '/billing')}
                  className="text-xs font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1"
                >
                  Upgrade <ArrowUpRight size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Conversation Trend (7-day sparkline) */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={18} className="text-emerald-600" />
                <h3 className="text-sm md:text-base font-semibold text-slate-900">7-Day Activity</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">Conversations per day</p>
            </div>
            <div className="flex items-end justify-between gap-4">
              <Sparkline data={conversationTrend.map((t) => t.count)} color="#10b981" height={48} />
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-900">
                  {conversationTrend.reduce((s, t) => s + t.count, 0)}
                </div>
                <div className="text-xs text-slate-500">this week</div>
              </div>
            </div>
            {voice && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${voice.enabled ? 'bg-green-500' : 'bg-slate-300'}`} />
                <span className="text-xs text-slate-600">
                  Voice Agent {voice.enabled ? 'Active' : 'Inactive'}
                </span>
                {voice.enabled && (
                  <span className="text-xs text-slate-400 ml-auto">
                    {voice.minutesUsed}/{voice.minutesLimit} min
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Start Guide for New Users */}
      {stats && stats.botCount === 0 && (
        <div className="bg-gradient-to-r from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-4 md:p-6">
          <h3 className="text-base md:text-lg font-semibold text-slate-900 mb-3">
            Get Started with BuildMyBot
          </h3>
          <p className="text-xs md:text-sm text-slate-700 mb-4">
            Create your first AI voice bot in 3 simple steps:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-4">
            <div className="bg-white rounded-lg p-3 md:p-4 border border-orange-200">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-5 md:w-6 h-5 md:h-6 bg-orange-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                  1
                </div>
                <span className="font-medium text-slate-900 text-sm md:text-base">
                  Create a Bot
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Give your bot a name and choose a voice
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 md:p-4 border border-orange-200">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-5 md:w-6 h-5 md:h-6 bg-orange-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                  2
                </div>
                <span className="font-medium text-slate-900 text-sm md:text-base">
                  Configure Settings
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Set up your bot's behavior and prompts
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 md:p-4 border border-orange-200">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-5 md:w-6 h-5 md:h-6 bg-orange-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                  3
                </div>
                <span className="font-medium text-slate-900 text-sm md:text-base">
                  Start Capturing Leads
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Deploy and watch the leads roll in
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCreateBot}
            className="px-4 md:px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center space-x-2 text-sm"
          >
            <Plus size={16} />
            <span>Create Your First Bot</span>
          </button>
        </div>
      )}

      {/* Recent Bots */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base md:text-lg font-semibold text-slate-900">
            Recent Bots
          </h3>
          {recentBots.length > 0 && (
            <button
              type="button"
              onClick={handleCreateBot}
              className="text-sm text-orange-600 hover:text-orange-700"
            >
              View all {'>'}
            </button>
          )}
        </div>
        <DataTable
          columns={botColumns}
          data={recentBots}
          loading={loading}
          emptyMessage="No bots created yet. Click 'Create Bot' to get started!"
        />
      </div>

      {/* Recent Leads */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base md:text-lg font-semibold text-slate-900">
            Recent Leads
          </h3>
          {recentLeads.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenLeads?.()}
              className="text-sm text-orange-600 hover:text-orange-700"
            >
              View all {'>'}
            </button>
          )}
        </div>
        <DataTable
          columns={leadColumns}
          data={recentLeads}
          loading={loading}
          emptyMessage="No leads captured yet. Create and deploy a bot to start collecting leads!"
        />
      </div>

      {/* Onboarding & Resources */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen size={20} className="text-blue-600" />
          <h3 className="text-base md:text-lg font-semibold text-slate-900">
            Getting Started &amp; Resources
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          <button
            type="button"
            onClick={() => window.open('/marketing/quick-start-guide.pdf', '_blank')}
            className="text-left bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <BookOpen size={16} className="text-white" />
              </div>
              <span className="font-semibold text-slate-900 text-sm">Quick Start Guide</span>
            </div>
            <p className="text-xs text-slate-600">
              Your first chatbot in 5 minutes — step-by-step setup, deployment, and voice agent activation.
            </p>
          </button>
          <button
            type="button"
            onClick={() => window.open('/marketing/one-pager.pdf', '_blank')}
            className="text-left bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <Star size={16} className="text-white" />
              </div>
              <span className="font-semibold text-slate-900 text-sm">Product Overview</span>
            </div>
            <p className="text-xs text-slate-600">
              One-page summary of everything BuildMyBot can do — features, pricing, and key stats.
            </p>
          </button>
          <button
            type="button"
            onClick={() => window.open('/marketing/roi-calculator.xlsx', '_blank')}
            className="text-left bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-amber-600 rounded-lg flex items-center justify-center">
                <TrendingUp size={16} className="text-white" />
              </div>
              <span className="font-semibold text-slate-900 text-sm">ROI Calculator</span>
            </div>
            <p className="text-xs text-slate-600">
              See exactly how much BuildMyBot saves your business — plug in your numbers and get instant results.
            </p>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-2 text-slate-700">
            <BookOpen size={16} className="md:w-[18px] md:h-[18px]" />
            <span className="font-medium text-sm md:text-base">
              Knowledge Base
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-2">
            Add FAQs, docs, and scripts so your bot answers accurately.
          </p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-2 text-slate-700">
            <MessageCircle size={16} className="md:w-[18px] md:h-[18px]" />
            <span className="font-medium text-sm md:text-base">Support</span>
          </div>
          <p className="text-xs text-slate-600 mt-2">
            Need help? Reach our team for setup, optimization, and billing.
          </p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-2 text-slate-700">
            <TrendingUp size={16} className="md:w-[18px] md:h-[18px]" />
            <span className="font-medium text-sm md:text-base">
              Weekly Insights
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-2">
            Monitor conversions and leads in a simple weekly summary.
          </p>
        </div>
      </div>

      {/* Floating Action Button - Playful Design */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={handleCreateBot}
          className="group relative w-16 h-16 rounded-full bg-blue-600 shadow-lg hover:shadow-xl hover:bg-blue-700 transition-all duration-300 flex items-center justify-center"
        >
          <Plus className="text-white" size={28} />

          {/* Tooltip */}
          <div className="absolute right-full mr-3 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Create New Bot
          </div>
        </button>
      </div>
    </div>
  );
};
