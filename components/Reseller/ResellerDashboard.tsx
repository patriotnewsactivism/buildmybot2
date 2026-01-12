import {
  AlertTriangle,
  Building,
  CheckCircle,
  ChevronRight,
  Copy,
  CreditCard,
  DollarSign,
  Download,
  ExternalLink,
  FileText,
  Gift,
  Image,
  LayoutDashboard,
  Loader,
  Lock,
  Mail,
  Presentation,
  Shield,
  TrendingUp,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  PLANS,
  REFERRAL_REWARDS,
  RESELLER_TIERS,
  WHITELABEL_FEE,
} from '../../constants';
import { buildApiUrl } from '../../services/apiConfig';
import { dbService } from '../../services/dbService';
import type { ResellerStats, User } from '../../types';

interface ResellerProps {
  user: User;
  stats: ResellerStats;
}

type MarketingSection =
  | 'playbook'
  | 'emails'
  | 'objections'
  | 'industries'
  | 'downloads';

const mockEarnings = [
  { month: 'Jan', amount: 1200 },
  { month: 'Feb', amount: 1900 },
  { month: 'Mar', amount: 2400 },
  { month: 'Apr', amount: 3100 },
  { month: 'May', amount: 4500 },
  { month: 'Jun', amount: 5200 },
];

export const ResellerDashboard: React.FC<ResellerProps> = ({
  user,
  stats: initialStats,
}) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'clients' | 'payouts' | 'marketing'
  >('overview');
  const [referredUsers, setReferredUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [realStats, setRealStats] = useState<ResellerStats>(initialStats);
  const [referralCredits, setReferralCredits] = useState<{
    credits: number;
    expiry: Date | null;
  }>({ credits: 0, expiry: null });
  const [whitelabelProcessing, setWhitelabelProcessing] = useState(false);

  if (user.status === 'Pending') {
    return (
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
    );
  }

  const computeFallbackStats = useCallback(
    (usersList: User[]): ResellerStats => {
      const clientCount = usersList.length;
      const totalRev = usersList.reduce((acc, u) => {
        const plan = PLANS[u.plan as keyof typeof PLANS];
        return acc + (plan?.price || 0);
      }, 0);

      const currentTier =
        RESELLER_TIERS.find(
          (t) => clientCount >= t.min && clientCount <= t.max,
        ) || RESELLER_TIERS[0];
      const whitelabelEnabled = Boolean(user.whitelabelEnabled);
      const commissionRate = whitelabelEnabled
        ? WHITELABEL_FEE.commission
        : currentTier.commission;
      const paidThrough = user.whitelabelPaidThrough
        ? new Date(user.whitelabelPaidThrough)
        : null;
      const whitelabelFeeDue =
        whitelabelEnabled &&
        (!paidThrough || paidThrough.getTime() < Date.now());
      const grossCommission = totalRev * commissionRate;
      const whitelabelFeeAmount = whitelabelFeeDue ? WHITELABEL_FEE.price : 0;

      return {
        totalClients: clientCount,
        totalRevenue: totalRev,
        commissionRate,
        grossCommission,
        pendingPayout: Math.max(grossCommission - whitelabelFeeAmount, 0),
        whitelabelFeeDue,
        whitelabelFeeAmount,
        whitelabelPaidThrough: paidThrough
          ? paidThrough.toISOString()
          : undefined,
      };
    },
    [user.whitelabelEnabled, user.whitelabelPaidThrough],
  );

  useEffect(() => {
    if (user.resellerCode) {
      const unsubscribe = dbService.subscribeToResellerSummary(
        user.resellerCode,
        (users, stats) => {
          setReferredUsers(users);

          const nextStats =
            stats && typeof stats.totalClients === 'number'
              ? stats
              : computeFallbackStats(users);

          setRealStats(nextStats);
          setIsLoading(false);
        },
      );
      return () => unsubscribe();
    }
    setIsLoading(false);
  }, [user.resellerCode, computeFallbackStats]);

  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const res = await fetch(buildApiUrl(`/users/${user.id}/credits`));
        if (res.ok) {
          const data = await res.json();
          setReferralCredits({
            credits: data.credits || 0,
            expiry: data.expiry ? new Date(data.expiry) : null,
          });
        }
      } catch (err) {
        console.error('Failed to fetch referral credits:', err);
      }
    };
    fetchCredits();
  }, [user.id]);

  const currentTier =
    RESELLER_TIERS.find(
      (t) => realStats.totalClients >= t.min && realStats.totalClients <= t.max,
    ) || RESELLER_TIERS[0];
  const nextTier = RESELLER_TIERS.find((t) => t.min > realStats.totalClients);
  const progress = nextTier
    ? ((realStats.totalClients - currentTier.min) /
        (nextTier.min - currentTier.min)) *
      100
    : 100;

  const displayDomain =
    user.customDomain ||
    (typeof window !== 'undefined'
      ? window.location.host
      : 'www.buildmybot.app');
  const referralUrl = `https://${displayDomain}/?ref=${user.resellerCode || 'CODE'}`;
  const isWhitelabel = Boolean(user.whitelabelEnabled);
  const whitelabelFeeDue = Boolean(realStats.whitelabelFeeDue);
  const whitelabelFeeAmount = realStats.whitelabelFeeAmount || 0;
  const grossCommission = realStats.grossCommission ?? realStats.pendingPayout;
  const whitelabelPaidThrough = realStats.whitelabelPaidThrough
    ? new Date(realStats.whitelabelPaidThrough)
    : null;

  const handleWhitelabelCheckout = async () => {
    if (!user?.id) {
      return;
    }
    setWhitelabelProcessing(true);
    try {
      const res = await fetch(buildApiUrl('/stripe/whitelabel/checkout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Whitelabel checkout error:', error);
      alert('Failed to start whitelabel checkout. Please try again.');
      setWhitelabelProcessing(false);
    }
  };

  const OverviewTab = () => (
    <div className="space-y-6 animate-fade-in">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <DollarSign size={20} />
            </div>
            <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded">
              Monthly
            </span>
          </div>
          <p className="text-3xl font-bold text-slate-800">
            ${realStats.totalRevenue.toLocaleString()}
          </p>
          <p className="text-sm text-slate-500 mt-1">Total Generated Revenue</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Users size={20} />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-800">
            {realStats.totalClients}
          </p>
          <p className="text-sm text-slate-500 mt-1">Active Referrals</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-cyan-50 text-cyan-600 rounded-lg">
              <TrendingUp size={20} />
            </div>
            <span className="text-xs font-semibold bg-cyan-100 text-cyan-700 px-2 py-1 rounded">
              {realStats.commissionRate * 100}% Split
            </span>
          </div>
          <p className="text-3xl font-bold text-slate-800">
            ${realStats.pendingPayout.toLocaleString()}
          </p>
          <p className="text-sm text-slate-500 mt-1">Estimated Payout (net)</p>
          {grossCommission !== realStats.pendingPayout && (
            <p className="text-xs text-slate-400 mt-1">
              Gross: ${grossCommission.toLocaleString()}
            </p>
          )}
          {whitelabelFeeDue && (
            <p className="text-xs text-amber-700 mt-2">
              Includes $499 whitelabel fee deduction
            </p>
          )}
        </div>

        <div className="bg-gradient-to-br from-blue-900 to-slate-900 p-6 rounded-xl shadow-lg text-white">
          <p className="text-blue-200 text-sm font-medium mb-1">
            Referral Link
          </p>
          <div className="flex items-center gap-2 bg-white/10 p-2 rounded-lg border border-white/20 mb-3">
            <code className="text-xs truncate flex-1">{referralUrl}</code>
            <Copy
              size={14}
              className="cursor-pointer hover:text-blue-300"
              onClick={() => {
                navigator.clipboard.writeText(referralUrl);
                alert('Link copied!');
              }}
            />
          </div>
          <p className="text-xs text-blue-200">
            Share this link to track signups automatically.
          </p>
        </div>
      </div>

      {/* Referral Credits Card */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-6 rounded-xl border border-amber-200 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                <Gift size={20} />
              </div>
              <h3 className="font-bold text-slate-800">Referral Credits</h3>
            </div>
            <p className="text-3xl font-bold text-amber-600">
              ${referralCredits.credits.toFixed(2)}
            </p>
            <p className="text-sm text-slate-600 mt-1">
              Available credit toward your subscription
            </p>
            {referralCredits.expiry && (
              <p className="text-xs text-slate-500 mt-2">
                Expires: {referralCredits.expiry.toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="text-right max-w-xs">
            <p className="text-xs text-slate-600 font-medium mb-2">
              How it works:
            </p>
            <ul className="text-xs text-slate-500 space-y-1">
              {REFERRAL_REWARDS.howItWorks.slice(0, 3).map((step) => (
                <li key={step} className="flex items-start gap-1">
                  <span className="text-amber-500">•</span>
                  {step}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Whitelabel Fee Status */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-800">Whitelabel Program</h3>
            <p className="text-sm text-slate-600 mt-1">
              ${WHITELABEL_FEE.price} billed every 30 days (net 30) for a
              guaranteed 50% revenue split.
            </p>
            {isWhitelabel ? (
              <p
                className={`text-sm mt-2 ${whitelabelFeeDue ? 'text-amber-700' : 'text-emerald-700'}`}
              >
                {whitelabelFeeDue
                  ? 'Payment due. Fee will be deducted from payouts until current.'
                  : `Paid through ${whitelabelPaidThrough ? whitelabelPaidThrough.toLocaleDateString() : 'current period'}.`}
              </p>
            ) : (
              <p className="text-sm text-slate-500 mt-2">
                Not enrolled. Upgrade to lock the 50% split.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleWhitelabelCheckout}
            disabled={whitelabelProcessing}
            className="px-5 py-2 bg-blue-900 text-white rounded-lg text-sm font-bold hover:bg-blue-950 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {whitelabelProcessing
              ? 'Redirecting...'
              : isWhitelabel
                ? 'Pay $499 Now'
                : 'Upgrade to Whitelabel'}
          </button>
        </div>
      </div>

      {/* Tier Progress */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex justify-between mb-2">
          <h3 className="font-semibold text-slate-800">
            Current Tier:{' '}
            <span className="text-blue-900">{currentTier.label}</span>
          </h3>
          <span className="text-sm text-slate-500">
            {realStats.totalClients} / {nextTier ? nextTier.min : 'Max'} Clients
          </span>
        </div>
        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-2">
          <div
            className="bg-blue-900 h-full transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-slate-500">
          {isWhitelabel
            ? 'Whitelabel partners keep a 50% split while the fee is current.'
            : nextTier
              ? `Recruit ${nextTier.min - realStats.totalClients} more clients to unlock ${nextTier.commission * 100}% commission!`
              : "You've reached the top tier!"}
        </p>
      </div>

      {/* Earnings Chart */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-80">
        <h3 className="font-semibold text-slate-800 mb-6">Revenue Growth</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={mockEarnings}>
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              contentStyle={{
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
            />
            <Bar
              dataKey="amount"
              fill="#1e3a8a"
              radius={[4, 4, 0, 0]}
              barSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const ClientsTab = () => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
      <div className="p-6 border-b border-slate-100">
        <h3 className="font-bold text-slate-800">Referral List</h3>
        <p className="text-sm text-slate-500">
          Track all businesses you have onboarded.
        </p>
      </div>
      <div className="md:hidden divide-y divide-slate-100">
        {referredUsers.map((client) => {
          const price = PLANS[client.plan]?.price || 0;
          const commission = price * realStats.commissionRate;

          return (
            <div key={client.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">
                    {client.companyName}
                  </p>
                  <p className="text-sm text-slate-500 truncate">
                    {client.email}
                  </p>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium shrink-0 ${
                    client.plan === 'EXECUTIVE'
                      ? 'bg-blue-100 text-blue-800'
                      : client.plan === 'PROFESSIONAL'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {client.plan}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Commission</span>
                <span className="font-mono font-medium text-slate-700">
                  ${commission.toFixed(2)}/mo
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-emerald-600 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
                <button
                  type="button"
                  className="text-xs flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md transition font-medium"
                >
                  <LayoutDashboard size={14} /> View
                </button>
              </div>
            </div>
          );
        })}
        {referredUsers.length === 0 && (
          <div className="px-6 py-8 text-center text-slate-400">
            No clients referred yet. Share your link to start earning!
          </div>
        )}
      </div>

      <div className="hidden md:block overflow-x-hidden md:overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="px-6 py-4">Business Name</th>
              <th className="px-6 py-4">Plan</th>
              <th className="px-6 py-4">Contact</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Your Commission</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {referredUsers.map((client) => {
              const price = PLANS[client.plan]?.price || 0;
              const commission = price * realStats.commissionRate;

              return (
                <tr key={client.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 font-medium text-slate-800">
                    {client.companyName}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        client.plan === 'EXECUTIVE'
                          ? 'bg-blue-100 text-blue-800'
                          : client.plan === 'PROFESSIONAL'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {client.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{client.email}</td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-1.5 text-emerald-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono font-medium text-slate-700">
                    ${commission.toFixed(2)}/mo
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      className="text-xs flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md transition ml-auto font-medium"
                    >
                      <LayoutDashboard size={14} /> View
                    </button>
                  </td>
                </tr>
              );
            })}
            {referredUsers.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-8 text-center text-slate-400"
                >
                  No clients referred yet. Share your link to start earning!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const MarketingTab = () => {
    const [activeSection, setActiveSection] =
      useState<MarketingSection>('playbook');

    const salesProcess = [
      {
        step: 1,
        title: 'Identify the Right Prospects',
        description:
          'Look for businesses with websites that have contact forms, phone numbers, or chat widgets. Service businesses (contractors, dentists, lawyers, realtors) are ideal because they rely heavily on lead capture.',
      },
      {
        step: 2,
        title: 'Research Before You Reach Out',
        description:
          'Spend 2 minutes on their website. Note: Do they have a chat widget? How fast do they respond to inquiries? What are their Google reviews saying? Use this info to personalize your pitch.',
      },
      {
        step: 3,
        title: 'Make First Contact',
        description:
          'Use email or LinkedIn. Keep it short (3-4 sentences max). Focus on THEIR problem, not your product. Ask a question to start a conversation.',
      },
      {
        step: 4,
        title: 'Book the Discovery Call',
        description:
          'Your only goal in initial contact is to get 15 minutes on their calendar. Offer value: "I\'d love to show you how other [industry] businesses are capturing leads 24/7."',
      },
      {
        step: 5,
        title: 'Run the Discovery Call',
        description:
          'Ask questions (see Discovery Questions below). Listen more than you talk. Identify their pain points around lead capture, response time, and missed opportunities.',
      },
      {
        step: 6,
        title: 'Present the Solution',
        description:
          'Show a live demo of BuildMyBot. Use their actual website in the demo if possible. Connect every feature to a problem they mentioned.',
      },
      {
        step: 7,
        title: 'Handle Objections',
        description:
          'See Objection Handling section below. Stay calm, acknowledge their concern, and pivot to value.',
      },
      {
        step: 8,
        title: 'Close the Deal',
        description:
          'Summarize the value, confirm the plan that fits their needs, and walk them through signup. Offer to set up their first bot together.',
      },
    ];

    const discoveryQuestions = [
      {
        question:
          'How do you currently handle website visitors who have questions outside business hours?',
        why: 'Reveals if they have a lead capture gap',
      },
      {
        question:
          'What happens when someone fills out your contact form? How quickly do you respond?',
        why: 'Most businesses take hours or days - this is your opening',
      },
      {
        question:
          'How many leads do you think you might be missing because people leave your site without reaching out?',
        why: 'Gets them thinking about lost revenue',
      },
      {
        question:
          'What would it mean for your business if you could respond to every website visitor instantly, 24/7?',
        why: 'Paints the vision of the solution',
      },
      {
        question:
          'Have you ever lost a customer because a competitor responded faster?',
        why: 'Creates urgency around speed-to-lead',
      },
      {
        question: "What's your average customer worth to your business?",
        why: 'Sets up the ROI conversation',
      },
    ];

    const objectionHandling = [
      {
        objection: '"We already have a contact form."',
        response:
          "Contact forms are great, but studies show 70% of visitors leave without filling them out. An AI chatbot engages visitors in real-time, answers their questions, and captures their info conversationally. It's like having a salesperson available 24/7.",
        key: 'Highlight the engagement gap',
      },
      {
        objection: '"AI seems impersonal."',
        response:
          "I totally understand that concern. The reality is, today's AI is remarkably human-like. Many visitors can't tell they're chatting with AI. And here's the key: an instant, helpful response feels more personal than waiting hours or days for a human reply.",
        key: 'Flip the script on "personal"',
      },
      {
        objection: '"We tried chatbots before and they didn\'t work."',
        response:
          'Most chatbots are rule-based and frustrating. BuildMyBot uses advanced AI (GPT-4) that actually understands context and has real conversations. Would you be open to a quick demo so you can see the difference?',
        key: 'Differentiate from old chatbots',
      },
      {
        objection: '"It\'s too expensive."',
        response:
          "I hear you. Let me ask: what's one new customer worth to your business? [Wait for answer]. So if this brings you just one extra customer a month, it pays for itself many times over. Most of our clients see ROI within the first week.",
        key: 'Anchor to customer value',
      },
      {
        objection: '"I need to think about it."',
        response:
          "Absolutely, this is an important decision. What specific concerns are you weighing? [Address those]. Many business owners find it helpful to start with our Starter plan - it's low-risk and you can see results within days.",
        key: 'Uncover the real objection',
      },
      {
        objection: '"I don\'t have time to set this up."',
        response:
          "That's exactly why we designed this to be plug-and-play. Setup takes about 5 minutes - you paste one line of code on your site. I can even do it with you right now if you'd like.",
        key: 'Remove the friction',
      },
    ];

    const industryPitches = [
      {
        industry: 'Home Services (HVAC, Plumbing, Roofing)',
        painPoints: [
          'Miss calls when on job sites',
          'Leads go cold waiting for callbacks',
          'After-hours emergencies go unanswered',
        ],
        pitch:
          "When you're on a roof or under a sink, you can't answer the phone. But that homeowner with a leaking pipe? They're calling your competitor right now. With BuildMyBot, your AI assistant answers instantly, qualifies the lead, and books the appointment - so you come home to a full calendar instead of voicemails.",
        roi: 'One new job per week at $500 average = $2,000/month. Cost: $99. ROI: 20x',
      },
      {
        industry: 'Dental & Medical Practices',
        painPoints: [
          'Front desk overwhelmed with calls',
          'Patients want to book after hours',
          'No-shows and last-minute cancellations',
        ],
        pitch:
          'Your front desk is amazing, but they can only answer one call at a time. Meanwhile, patients are booking with the practice that responds first. Our AI handles appointment requests, answers common questions about insurance and services, and even sends reminders to reduce no-shows.',
        roi: 'One extra patient per week at $300 average = $1,200/month. Cost: $99. ROI: 12x',
      },
      {
        industry: 'Real Estate Agents',
        painPoints: [
          'Buyers want instant responses',
          'Leads from Zillow/Realtor go cold',
          "Can't respond while showing properties",
        ],
        pitch:
          'In real estate, the first agent to respond gets the client. Period. When you\'re at a showing and a hot buyer hits your website, our AI engages them instantly, asks about their budget and timeline, and books a call with you. No more "sorry, I went with someone who responded faster."',
        roi: 'One extra transaction per year at $10,000 commission = $833/month. Cost: $99. ROI: 8x',
      },
      {
        industry: 'Law Firms',
        painPoints: [
          'Initial consultations are time-consuming',
          'After-hours inquiries from accident victims',
          'Qualifying leads before attorney time',
        ],
        pitch:
          'Every minute an injured person waits is a minute they might call another firm. Our AI handles intake 24/7, asks the right qualifying questions, and books consultations only with cases that fit your practice. Your attorneys spend time on clients, not tire-kickers.',
        roi: 'One qualified case per month at $5,000 average = $5,000/month. Cost: $199. ROI: 25x',
      },
      {
        industry: 'Restaurants & Hospitality',
        painPoints: [
          'Reservation requests pile up',
          'Common questions about menu, hours, location',
          'Staff too busy during rush',
        ],
        pitch:
          'Your staff is slammed during dinner rush - the worst time to answer the phone. Our AI handles reservations, answers questions about your menu and specials, and even helps with catering inquiries. Your team focuses on the guests in front of them.',
        roi: 'Two extra covers per night at $50 average = $3,000/month. Cost: $29. ROI: 100x',
      },
    ];

    const emailTemplates = [
      {
        name: 'Cold Outreach - Service Business',
        subject: "Quick question about [Business Name]'s website",
        body: `Hi [First Name],

I was checking out [Business Name]'s website and noticed you serve [City/Area]. Quick question - when someone visits your site at 10pm looking for a [service type], what happens?

Most businesses I talk to in [industry] tell me those after-hours visitors just... leave. And probably call a competitor the next morning.

I help businesses like yours capture those leads 24/7 with AI-powered chat that actually has intelligent conversations (not those annoying "click a button" bots).

Would you be open to a quick 10-minute call to see if this could work for [Business Name]?

Best,
[Your Name]`,
      },
      {
        name: 'Follow-Up #1 (3 days later)',
        subject: "Re: Quick question about [Business Name]'s website",
        body: `Hi [First Name],

Just floating this back to the top of your inbox.

I know you're busy running a business, so I'll keep this short: I can show you in 10 minutes how [similar business] increased their lead capture by 40% without adding any work to their plate.

Interested in a quick call this week?

[Your Name]`,
      },
      {
        name: 'Follow-Up #2 (7 days later)',
        subject: 'Closing the loop',
        body: `Hi [First Name],

I'll assume you're buried right now (I get it - running a business is no joke).

I'm going to close this loop, but wanted to leave you with this: the average business misses 67% of potential leads because they can't respond fast enough. In [industry], that's real money walking out the door.

If lead capture ever becomes a priority, I'm here. Just hit reply.

Best,
[Your Name]`,
      },
      {
        name: 'After Demo - No Decision',
        subject: 'Following up from our chat',
        body: `Hi [First Name],

Great talking with you earlier! I really enjoyed learning about [something specific they mentioned].

As promised, here's a quick recap:
- BuildMyBot can start capturing leads for [Business Name] within 5 minutes
- Based on your traffic, we estimated [X] additional leads per month
- At your average deal size of $[X], that's roughly $[X] in potential new revenue

I'd love to get you set up before your busy season. What questions can I answer to help you move forward?

[Your Name]`,
      },
      {
        name: 'Referral Request (Happy Customer)',
        subject: 'Quick favor?',
        body: `Hi [First Name],

I hope you're loving the results from BuildMyBot! Last I checked, you'd captured [X] new leads since we set you up - that's awesome.

I have a quick favor to ask: do you know any other business owners in [City] who might benefit from the same results? I'd love an introduction if anyone comes to mind.

As a thank you, I'll extend your next month free for every referral that becomes a customer.

Thanks for being a great partner!

[Your Name]`,
      },
    ];

    const materials = [
      {
        title: 'Agent Playbook',
        description: 'Full sales playbook for independent reps',
        icon: FileText,
        type: 'PDF',
        size: 'Updated',
        downloadUrl: '/marketing/agent-playbook.pdf',
      },
      {
        title: 'Agent Start Free Course',
        description: 'Step-by-step training for launching pilots',
        icon: FileText,
        type: 'PDF',
        size: 'Updated',
        downloadUrl: '/marketing/agent-start-free-course.pdf',
      },
      {
        title: 'Partner Playbook',
        description: 'Partner positioning, pricing, and sales motion',
        icon: FileText,
        type: 'PDF',
        size: 'Updated',
        downloadUrl: '/marketing/partner-playbook.pdf',
      },
      {
        title: 'Partner Course',
        description: 'Partner enablement program and scaling playbook',
        icon: FileText,
        type: 'PDF',
        size: 'Updated',
        downloadUrl: '/marketing/partner-course.pdf',
      },
      {
        title: 'Revenue Recovery Handbook',
        description: 'Master playbook for speed-to-lead recovery',
        icon: FileText,
        type: 'PDF',
        size: 'Updated',
        downloadUrl: '/marketing/revenue-recovery-handbook.pdf',
      },
      {
        title: 'Field Operations Manual',
        description: 'Execution-first desk guide for reps',
        icon: FileText,
        type: 'PDF',
        size: 'Updated',
        downloadUrl: '/marketing/field-operations-manual.pdf',
      },
      {
        title: 'Ghost Shopper Audit Template',
        description: 'Lethality index for response-time failures',
        icon: FileText,
        type: 'PDF',
        size: 'Updated',
        downloadUrl: '/marketing/ghost-shopper-audit-template.pdf',
      },
      {
        title: 'Ghost Shopper Audit Template (CSV)',
        description: 'Import-ready audit log spreadsheet',
        icon: FileText,
        type: 'CSV',
        size: 'Updated',
        downloadUrl: '/marketing/ghost-shopper-audit-template.csv',
      },
      {
        title: 'Sales Deck',
        description: 'Slide deck for prospect presentations',
        icon: Presentation,
        type: 'PDF',
        size: 'Updated',
        downloadUrl: '/marketing/sales-deck.pdf',
      },
      {
        title: 'One-Pager',
        description: 'Quick summary for prospects',
        icon: FileText,
        type: 'PDF',
        size: 'Updated',
        downloadUrl: '/marketing/one-pager.pdf',
      },
      {
        title: 'ROI Calculator',
        description: 'Spreadsheet for projecting value',
        icon: FileText,
        type: 'CSV',
        size: 'Updated',
        downloadUrl: '/marketing/roi-calculator.csv',
      },
      {
        title: 'Case Study Template',
        description: 'Fill-in template for client success stories',
        icon: FileText,
        type: 'PDF',
        size: 'Updated',
        downloadUrl: '/marketing/case-study-template.pdf',
      },
      {
        title: 'Demo Checklist',
        description: 'Pre, during, and post-demo checklist',
        icon: FileText,
        type: 'PDF',
        size: 'Updated',
        downloadUrl: '/marketing/demo-checklist.pdf',
      },
    ];

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-gradient-to-r from-blue-900 to-slate-900 rounded-2xl p-8 text-white">
          <h3 className="text-2xl font-bold mb-2">
            Sales Playbook & Marketing Materials
          </h3>
          <p className="text-blue-200 max-w-2xl">
            Everything you need to find prospects, run great sales calls, handle
            objections, and close deals. This playbook turns new reps into
            closers.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 bg-white p-2 rounded-xl border border-slate-200">
          {(
            [
              { id: 'playbook', label: 'Sales Playbook' },
              { id: 'emails', label: 'Email Templates' },
              { id: 'objections', label: 'Objection Handling' },
              { id: 'industries', label: 'Industry Pitches' },
              { id: 'downloads', label: 'Downloads' },
            ] as { id: MarketingSection; label: string }[]
          ).map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeSection === tab.id
                  ? 'bg-blue-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeSection === 'playbook' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h4 className="font-bold text-lg text-slate-800 mb-6">
                The 8-Step Sales Process
              </h4>
              <div className="space-y-4">
                {salesProcess.map((item) => (
                  <div
                    key={item.step}
                    className="flex gap-4 p-4 bg-slate-50 rounded-lg"
                  >
                    <div className="w-10 h-10 bg-blue-900 text-white rounded-full flex items-center justify-center font-bold shrink-0">
                      {item.step}
                    </div>
                    <div>
                      <h5 className="font-semibold text-slate-800">
                        {item.title}
                      </h5>
                      <p className="text-sm text-slate-600 mt-1">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h4 className="font-bold text-lg text-slate-800 mb-4">
                Discovery Questions to Ask
              </h4>
              <p className="text-slate-500 text-sm mb-6">
                Use these questions to uncover pain points and build value.
              </p>
              <div className="space-y-4">
                {discoveryQuestions.map((item) => (
                  <div
                    key={item.question}
                    className="border-l-4 border-blue-600 pl-4 py-2"
                  >
                    <p className="font-medium text-slate-800">
                      "{item.question}"
                    </p>
                    <p className="text-sm text-blue-600 mt-1">
                      Why it works: {item.why}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
              <h4 className="font-bold text-amber-900 mb-3">
                Golden Rule of Sales
              </h4>
              <p className="text-amber-800">
                <strong>Listen more than you talk.</strong> On discovery calls,
                aim for 70% listening, 30% talking. The prospect should feel
                heard and understood. When you present the solution, connect
                every feature back to something THEY said was important.
              </p>
            </div>
          </div>
        )}

        {activeSection === 'emails' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <p className="text-blue-800 text-sm">
                <strong>Pro Tip:</strong> Personalize these templates! Mention
                something specific about their business (a Google review, recent
                news, their website). Generic emails get ignored.
              </p>
            </div>
            {emailTemplates.map((template) => (
              <div
                key={template.name}
                className="bg-white rounded-xl border border-slate-200 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
                      {template.name}
                    </span>
                    <p className="text-slate-800 font-medium mt-2">
                      Subject: {template.subject}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `Subject: ${template.subject}\n\n${template.body}`,
                      )
                    }
                    className="flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                  >
                    <Copy size={14} /> Copy Email
                  </button>
                </div>
                <pre className="text-sm text-slate-600 whitespace-pre-wrap font-sans bg-slate-50 p-4 rounded-lg">
                  {template.body}
                </pre>
              </div>
            ))}
          </div>
        )}

        {activeSection === 'objections' && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
              <p className="text-emerald-800 text-sm">
                <strong>Remember:</strong> Objections are buying signals! They
                mean the prospect is engaged and thinking about how this would
                work for them. Stay calm, acknowledge their concern, and guide
                them forward.
              </p>
            </div>
            {objectionHandling.map((item) => (
              <div
                key={item.objection}
                className="bg-white rounded-xl border border-slate-200 p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center shrink-0">
                    <AlertTriangle size={16} />
                  </div>
                  <div className="flex-1">
                    <h5 className="font-bold text-slate-800">
                      Objection: {item.objection}
                    </h5>
                    <div className="mt-3 bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-lg">
                      <p className="text-slate-700">{item.response}</p>
                    </div>
                    <p className="text-sm text-blue-600 mt-3 font-medium">
                      Key: {item.key}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeSection === 'industries' && (
          <div className="space-y-6">
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6">
              <p className="text-purple-800 text-sm">
                <strong>Industry-Specific Selling:</strong> Different industries
                have different pain points. Use these tailored pitches to speak
                directly to what matters most to each prospect.
              </p>
            </div>
            {industryPitches.map((industry) => (
              <div
                key={industry.industry}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden"
              >
                <div className="bg-slate-800 text-white p-4">
                  <h5 className="font-bold text-lg">{industry.industry}</h5>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <h6 className="font-semibold text-slate-700 text-sm uppercase tracking-wider mb-2">
                      Pain Points to Mention
                    </h6>
                    <ul className="list-disc list-inside text-slate-600 text-sm space-y-1">
                      {industry.painPoints.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h6 className="font-semibold text-slate-700 text-sm uppercase tracking-wider mb-2">
                      Your Pitch
                    </h6>
                    <p className="text-slate-700 bg-blue-50 p-4 rounded-lg italic">
                      "{industry.pitch}"
                    </p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <h6 className="font-semibold text-emerald-700 text-sm uppercase tracking-wider mb-1">
                      ROI Story
                    </h6>
                    <p className="text-emerald-800 font-medium">
                      {industry.roi}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeSection === 'downloads' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {materials.map((item) => (
                <div
                  key={item.title}
                  className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-slate-100 rounded-lg group-hover:bg-blue-100 transition">
                      <item.icon
                        size={24}
                        className="text-slate-600 group-hover:text-blue-900 transition"
                      />
                    </div>
                    <span className="text-xs font-mono bg-slate-100 text-slate-500 px-2 py-1 rounded">
                      {item.type}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-800 mb-1">
                    {item.title}
                  </h4>
                  <p className="text-sm text-slate-500 mb-4">
                    {item.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{item.size}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (item.downloadUrl) {
                          window.open(item.downloadUrl, '_blank');
                        }
                      }}
                      className="flex items-center gap-2 text-sm font-medium text-blue-900 hover:text-blue-700 transition"
                    >
                      <Download size={16} /> Download
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <CheckCircle className="text-emerald-600 shrink-0" size={24} />
                <div>
                  <h4 className="font-bold text-emerald-900">
                    Need Custom Materials?
                  </h4>
                  <p className="text-sm text-emerald-700 mt-1">
                    Gold and Platinum partners get access to custom-branded
                    materials. Reach out to your dedicated account manager for
                    personalized sales collateral.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const PayoutsTab = () => (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex gap-4">
        <AlertTriangle className="text-amber-700 shrink-0" size={22} />
        <div>
          <h4 className="font-bold text-amber-900">Whitelabel Fee Terms</h4>
          <p className="text-sm text-amber-800 mt-1">
            The ${WHITELABEL_FEE.price} whitelabel fee is billed every 30 days
            (net 30). If unpaid, the fee is deducted from your monthly payouts.
          </p>
        </div>
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 flex gap-4">
        <Shield className="text-blue-900 shrink-0" size={24} />
        <div>
          <h4 className="font-bold text-blue-900">
            Secure Banking Information
          </h4>
          <p className="text-sm text-blue-700 mt-1">
            Your banking and tax information is stored securely using AES-256
            encryption. This information is required to process your monthly
            commission payouts in compliance with tax regulations.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
          <Building size={20} /> Bank Details (Direct Deposit)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label
              htmlFor="reseller-bank-name"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Bank Name
            </label>
            <input
              id="reseller-bank-name"
              type="text"
              className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
              placeholder="e.g. Chase, Bank of America"
            />
          </div>
          <div>
            <label
              htmlFor="reseller-routing-number"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Routing Number
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-2.5 text-slate-400"
                size={14}
              />
              <input
                id="reseller-routing-number"
                type="text"
                className="w-full pl-9 rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
                placeholder="•••••••••"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="reseller-account-number"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Account Number
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-2.5 text-slate-400"
                size={14}
              />
              <input
                id="reseller-account-number"
                type="text"
                className="w-full pl-9 rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
                placeholder="••••••••••••"
              />
            </div>
          </div>
        </div>

        <hr className="my-8 border-slate-100" />

        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
          <AlertTriangle size={20} /> Tax Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label
              htmlFor="reseller-tax-classification"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Tax Classification
            </label>
            <select
              id="reseller-tax-classification"
              className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
            >
              <option>Individual / Sole Proprietor</option>
              <option>LLC</option>
              <option>Corporation</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="reseller-tax-id"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Tax ID / SSN / EIN
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-2.5 text-slate-400"
                size={14}
              />
              <input
                id="reseller-tax-id"
                type="text"
                className="w-full pl-9 rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
                placeholder="XX-XXXXXXX"
              />
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            className="bg-slate-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-slate-800 transition shadow-sm flex items-center gap-2"
          >
            <Lock size={14} /> Save Securely
          </button>
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className="animate-spin text-blue-900" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Partner/Reseller Dashboard
          </h2>
          <p className="text-slate-500">
            Manage your referrals, payouts, clients, and marketing materials.
          </p>
        </div>
        <div className="flex gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'overview' ? 'bg-blue-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('clients')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'clients' ? 'bg-blue-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            My Clients
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('payouts')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'payouts' ? 'bg-blue-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Payouts & Tax
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('marketing')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'marketing' ? 'bg-blue-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Marketing
          </button>
        </div>
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'clients' && <ClientsTab />}
      {activeTab === 'payouts' && <PayoutsTab />}
      {activeTab === 'marketing' && <MarketingTab />}
    </div>
  );
};
