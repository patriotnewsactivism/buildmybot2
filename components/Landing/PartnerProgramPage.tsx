import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  CheckCircle,
  Crown,
  DollarSign,
  Globe,
  LayoutDashboard,
  Rocket,
  Shield,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { RESELLER_TIERS, WHITELABEL_FEE } from '../../constants';
import { SEO, SEOConfig } from '../SEO/SEO';

interface PartnerProps {
  onBack: () => void;
  onLogin: () => void;
  onSignup: () => void;
}

const PAYOUT_BAR_DATA = [
  { id: 'payout-1', height: 40 },
  { id: 'payout-2', height: 60 },
  { id: 'payout-3', height: 45 },
  { id: 'payout-4', height: 70 },
  { id: 'payout-5', height: 85 },
  { id: 'payout-6', height: 60 },
  { id: 'payout-7', height: 95 },
];

export const PartnerProgramPage: React.FC<PartnerProps> = ({
  onBack,
  onLogin,
  onSignup,
}) => {
  // Calculator State
  const [clientCount, setClientCount] = useState(25);
  const [avgPrice, setAvgPrice] = useState(99);

  const clampNumber = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const handleClientCountChange = (value: string) => {
    const next = Number.parseInt(value, 10);
    setClientCount(Number.isNaN(next) ? 1 : clampNumber(next, 1, 500));
  };

  const handleAvgPriceChange = (value: string) => {
    const next = Number.parseInt(value, 10);
    setAvgPrice(Number.isNaN(next) ? 49 : clampNumber(next, 49, 499));
  };

  // Calculate earnings based on tiers
  const currentTier =
    RESELLER_TIERS.find((t) => clientCount >= t.min && clientCount <= t.max) ||
    RESELLER_TIERS[RESELLER_TIERS.length - 1];
  const monthlyRevenue = clientCount * avgPrice;
  const partnerCommission = monthlyRevenue * currentTier.commission;
  const annualIncome = partnerCommission * 12;

  return (
    <>
      <SEO
        title={SEOConfig.partnerProgram.title}
        description={SEOConfig.partnerProgram.description}
        keywords={SEOConfig.partnerProgram.keywords}
      />
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Nav */}
      <nav className="fixed w-full bg-white/90 backdrop-blur-md z-30 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 font-bold text-xl text-slate-900"
            aria-label="Back to Home"
          >
            <ArrowLeft
              size={20}
              className="text-slate-500 hover:text-blue-900"
            />
            <span className="hidden md:inline">Back to Home</span>
          </button>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onLogin}
              className="text-sm font-medium text-slate-600 hover:text-blue-900"
            >
              Log in
            </button>
            <button
              type="button"
              onClick={onSignup}
              className="px-5 py-2 bg-blue-900 text-white rounded-lg text-sm font-bold hover:bg-blue-950 transition shadow-lg shadow-blue-900/30"
            >
              Apply Now
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-blue-600/10 rounded-l-full blur-3xl" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/50 border border-blue-500/50 text-blue-300 text-xs font-bold uppercase tracking-wide mb-6">
            Partner Program
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            Build Your Own AI Agency. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              Keep up to 50% Revenue.
            </span>
          </h1>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto">
            White-label our technology. You sell the solution to local
            businesses, we handle the AI infrastructure. Zero coding required.
          </p>
          <button
            type="button"
            onClick={onSignup}
            className="px-8 py-4 bg-white text-slate-900 rounded-xl text-lg font-bold hover:bg-slate-100 transition shadow-xl flex items-center justify-center gap-2 mx-auto"
          >
            Start Your Agency <ArrowRight size={20} />
          </button>
        </div>
      </section>

      {/* Dashboard Preview Section */}
      <section className="py-12 bg-slate-900">
        <div className="max-w-6xl mx-auto px-6">
          <div className="relative rounded-xl overflow-hidden border border-slate-700 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent z-10" />
            <div className="bg-[#0f172a] p-4 flex items-center gap-2 border-b border-slate-800">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <div className="bg-slate-800 text-slate-400 text-xs px-3 py-1 rounded text-center w-64 mx-auto font-mono">
                partner.buildmybot.app/dashboard
              </div>
            </div>
            {/* Mock Dashboard UI */}
            <div className="bg-slate-50 p-8 grid grid-cols-1 md:grid-cols-4 gap-6 h-[400px]">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 col-span-1">
                <p className="text-slate-500 text-xs uppercase font-bold mb-2">
                  Total Revenue
                </p>
                <p className="text-3xl font-bold text-slate-800">$12,450</p>
                <div className="mt-4 h-2 w-full bg-slate-100 rounded-full">
                  <div className="w-3/4 h-full bg-blue-900 rounded-full" />
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 col-span-1">
                <p className="text-slate-500 text-xs uppercase font-bold mb-2">
                  Active Clients
                </p>
                <p className="text-3xl font-bold text-slate-800">42</p>
                <div className="mt-4 flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white"
                    />
                  ))}
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 col-span-2">
                <p className="text-slate-500 text-xs uppercase font-bold mb-4">
                  Commission Payouts
                </p>
                <div className="flex items-end gap-2 h-32">
                  {PAYOUT_BAR_DATA.map((bar) => (
                    <div
                      key={bar.id}
                      className="flex-1 bg-emerald-100 rounded-t-sm relative group"
                    >
                      <div
                        className="absolute bottom-0 w-full bg-emerald-500 rounded-t-sm transition-all group-hover:bg-emerald-600"
                        style={{ height: `${bar.height}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="bg-slate-900/80 backdrop-blur-sm p-6 rounded-2xl border border-white/10 text-center">
                <h3 className="text-2xl font-bold text-white mb-2">
                  Partner Dashboard
                </h3>
                <p className="text-slate-300 mb-4">
                  Track clients, commissions, and payouts in real-time.
                </p>
                <button
                  type="button"
                  onClick={onSignup}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-500 transition"
                >
                  View Live Demo
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Two Paths Section */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Choose Your Path to 50% Commission
            </h2>
            <p className="text-lg text-slate-600">
              Two ways to build your AI agency - pick what works for you.
            </p>
          </div>

          {/* Path Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
            {/* Free Path - Tiered */}
            <div className="bg-slate-50 rounded-2xl p-8 border border-slate-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <TrendingUp size={24} className="text-blue-700" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    Growth Path
                  </h3>
                  <p className="text-slate-500 text-sm">
                    Free to start, earn your way up
                  </p>
                </div>
              </div>

              <div className="text-3xl font-extrabold text-slate-900 mb-2">
                $0{' '}
                <span className="text-lg font-normal text-slate-500">
                  to start
                </span>
              </div>
              <p className="text-slate-600 mb-6">
                Start earning 20% immediately. Grow your client base to unlock
                higher commission tiers—up to 50%.
              </p>

              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between py-2 border-b border-slate-200">
                  <span className="text-slate-700">0-49 clients</span>
                  <span className="font-bold text-blue-700">
                    20% commission
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-200">
                  <span className="text-slate-700">50-149 clients</span>
                  <span className="font-bold text-blue-700">
                    30% commission
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-200">
                  <span className="text-slate-700">150-249 clients</span>
                  <span className="font-bold text-blue-700">
                    40% commission
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-700">250+ clients</span>
                  <span className="font-bold text-emerald-600">
                    50% commission
                  </span>
                </div>
              </div>

              <ul className="space-y-2 text-sm text-slate-600 mb-6">
                <li className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-600" /> No
                  upfront investment
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-600" /> Zero
                  risk to get started
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-600" /> Grow at
                  your own pace
                </li>
              </ul>

              <button
                type="button"
                onClick={onSignup}
                className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition"
              >
                Start Free
              </button>
            </div>

            {/* Whitelabel Path - Instant 50% */}
            <div className="bg-gradient-to-br from-blue-900 to-slate-900 rounded-2xl p-8 border border-blue-700 relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                <Crown size={12} /> BEST VALUE
              </div>

              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-white/10 rounded-xl">
                  <Rocket size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">
                    Whitelabel Partner
                  </h3>
                  <p className="text-blue-300 text-sm">
                    Skip the tiers, 50% split while current
                  </p>
                </div>
              </div>

              <div className="text-3xl font-extrabold text-white mb-2">
                ${WHITELABEL_FEE.price}{' '}
                <span className="text-lg font-normal text-blue-300">
                  / 30 days
                </span>
              </div>
              <p className="text-blue-200 mb-6">
                Billed every 30 days (net 30). Keep a 50% split while the fee is
                current. If unpaid, $499 is deducted from payouts.
              </p>

              <div className="bg-white/10 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-blue-200">Your commission rate</span>
                  <span className="text-3xl font-extrabold text-emerald-400">
                    50%
                  </span>
                </div>
                <p className="text-blue-300 text-sm mt-1">
                  From day one, on every client
                </p>
              </div>

              <ul className="space-y-2 text-sm text-blue-100 mb-6">
                {WHITELABEL_FEE.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-emerald-400" />{' '}
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={onSignup}
                className="w-full py-3 bg-white text-slate-900 rounded-xl font-bold hover:bg-blue-50 transition flex items-center justify-center gap-2"
              >
                Unlock Whitelabel <ArrowRight size={16} />
              </button>
            </div>
          </div>

          {/* Tier Detail Cards (smaller, below) */}
          <div className="text-center mb-8">
            <h3 className="text-xl font-bold text-slate-700">
              Growth Path Tier Details
            </h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {RESELLER_TIERS.map((tier) => (
              <div
                key={tier.label}
                className={`p-6 rounded-xl border text-center ${
                  tier.label === 'Platinum'
                    ? 'bg-slate-900 text-white border-slate-700'
                    : 'bg-white border-slate-200'
                }`}
              >
                <h4
                  className={`font-bold text-sm mb-1 ${tier.label === 'Platinum' ? 'text-blue-400' : 'text-slate-500'}`}
                >
                  {tier.label}
                </h4>
                <div className="text-2xl font-extrabold mb-1">
                  {tier.commission * 100}%
                </div>
                <div
                  className={`text-xs ${tier.label === 'Platinum' ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  {tier.max > 100000
                    ? `${tier.min}+`
                    : `${tier.min}-${tier.max}`}{' '}
                  clients
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Earnings Calculator */}
      <section className="py-20 px-6 bg-slate-50 border-y border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wide mb-6">
                <Calculator size={14} /> Revenue Calculator
              </div>
              <h2 className="text-3xl font-bold text-slate-900 mb-6">
                Calculate Your Potential
              </h2>
              <p className="text-slate-600 mb-8">
                See exactly how much recurring revenue you can generate. Enter
                your numbers to model your growth.
              </p>

              <div className="space-y-8">
                <div>
                  <label
                    htmlFor="partner-client-count"
                    className="font-bold text-slate-700"
                  >
                    Active Clients
                  </label>
                  <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-3">
                    <input
                      id="partner-client-count"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="500"
                      step="1"
                      value={clientCount}
                      onChange={(e) => handleClientCountChange(e.target.value)}
                      className="w-full sm:w-40 px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-900 focus:border-blue-900"
                    />
                    <span className="text-xs text-slate-400">
                      Min 1, max 500 clients
                    </span>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="partner-avg-price"
                    className="font-bold text-slate-700"
                  >
                    Avg. Monthly Price You Charge
                  </label>
                  <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="relative w-full sm:w-40">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        $
                      </span>
                      <input
                        id="partner-avg-price"
                        type="number"
                        inputMode="numeric"
                        min="49"
                        max="499"
                        step="1"
                        value={avgPrice}
                        onChange={(e) => handleAvgPriceChange(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                    <span className="text-xs text-slate-400">
                      Min $49, max $499 per month
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-100 to-transparent rounded-bl-full opacity-50" />

              <div className="mb-8">
                <p className="text-slate-500 font-medium mb-1">
                  Your Commission Tier
                </p>
                <div className="text-2xl font-bold text-blue-900 flex items-center gap-2">
                  {currentTier.label}{' '}
                  <span className="text-lg text-slate-400 font-normal">
                    ({currentTier.commission * 100}%)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 mb-8 pb-8 border-b border-slate-100">
                <div>
                  <p className="text-slate-500 text-sm mb-1">Total Generated</p>
                  <p className="text-xl font-bold text-slate-900">
                    ${monthlyRevenue.toLocaleString()}
                    <span className="text-xs text-slate-400 font-normal">
                      /mo
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-sm mb-1">Platform Cost</p>
                  <p className="text-xl font-bold text-slate-400">
                    ${(monthlyRevenue - partnerCommission).toLocaleString()}
                    <span className="text-xs text-slate-300 font-normal">
                      /mo
                    </span>
                  </p>
                </div>
              </div>

              <div>
                <p className="text-slate-600 font-bold mb-2">
                  Your Take Home Income
                </p>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-5xl font-extrabold text-emerald-600">
                    ${partnerCommission.toLocaleString()}
                  </span>
                  <span className="text-slate-500 font-medium">/ month</span>
                </div>
                <p className="text-sm text-slate-400">
                  That's{' '}
                  <span className="font-bold text-slate-600">
                    ${annualIncome.toLocaleString()}
                  </span>{' '}
                  per year.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-50 border-t border-slate-200 py-12 px-6 text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">
          Ready to launch?
        </h2>
        <p className="text-slate-500 mb-8">
          Join our growing network of partner agencies.
        </p>
        <button
          type="button"
          onClick={onSignup}
          className="px-8 py-3 bg-blue-900 text-white rounded-lg font-bold hover:bg-blue-950 shadow-lg"
        >
          Create Partner Account
        </button>
        <div className="mt-8 pt-8 border-t border-slate-200 text-xs text-slate-400">
          © 2025 BuildMyBot.app. All rights reserved. • Houston, TX
        </div>
      </footer>
      </div>
    </>
  );
};
