import {
  ArrowRight,
  CheckCircle,
  DollarSign,
  Rocket,
  Shield,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import {
  ANNUAL_PLAN_PRICING,
  COMMISSION_ACCELERATORS,
  EXPERT_SETUP_SERVICES,
  PLANS,
  PREMIUM_ADDONS,
  PREMIUM_SERVICES,
  SALES_AGENT_TIERS,
  TEMPLATE_MARKETPLACE_PRICING,
  VOICE_AGENT_PRICING,
} from '../../../constants';
import { PlanType } from '../../../types';
import { SEO, SEOConfig } from '../../SEO/SEO';
import { PageLayout } from './PageLayout';

interface PricingPageProps {
  onLogin?: () => void;
}

const LOGIN_FALLBACK_URL = '/?auth=signup';

export const PricingPage: React.FC<PricingPageProps> = ({ onLogin }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>(
    'monthly',
  );
  const [addonFilter, setAddonFilter] = useState('all');

  const handleLogin = () => {
    if (onLogin) {
      onLogin();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.href = LOGIN_FALLBACK_URL;
    }
  };

  const siteUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://buildmybot.app';
  const planValues = Object.values(PLANS);
  const priceValues = planValues.map((plan) => plan.price);
  const planOffers = planValues.map((plan) => ({
    '@type': 'Offer',
    name: plan.name,
    price: plan.price.toString(),
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    url: `${siteUrl}/pricing`,
  }));
  const pricingStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'BuildMyBot',
    description: SEOConfig.pricing.description,
    brand: {
      '@type': 'Brand',
      name: 'BuildMyBot',
    },
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: Math.min(...priceValues),
      highPrice: Math.max(...priceValues),
      priceCurrency: 'USD',
      offerCount: planOffers.length,
      offers: planOffers,
    },
  };

  const addonCategories = [
    'all',
    ...Array.from(new Set(PREMIUM_ADDONS.map((a) => a.category))),
  ];
  const filteredAddons =
    addonFilter === 'all'
      ? PREMIUM_ADDONS
      : PREMIUM_ADDONS.filter((a) => a.category === addonFilter);

  return (
    <PageLayout>
      <SEO
        title={SEOConfig.pricing.title}
        description={SEOConfig.pricing.description}
        keywords={SEOConfig.pricing.keywords}
        ogType="product"
        structuredData={pricingStructuredData}
      />
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 space-y-20">
        {/* ── Header ── */}
        <section className="text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            Choose the plan that fits your business. Start free, upgrade as you
            grow. No hidden fees.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-3 bg-slate-100 rounded-full p-1">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition ${
                billingCycle === 'monthly'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('annual')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition ${
                billingCycle === 'annual'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Annual{' '}
              <span className="text-emerald-600 font-bold">Save 17%</span>
            </button>
          </div>
        </section>

        {/* ── Core Plans ── */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
          {Object.entries(PLANS).map(([key, plan]) => {
            const isPopular = key === PlanType.PROFESSIONAL;
            const botsLabel =
              plan.bots >= 9999
                ? 'Unlimited bots'
                : `${plan.bots} bot${plan.bots === 1 ? '' : 's'}`;
            const conversationsLabel = `${plan.conversations.toLocaleString()} conversations/mo`;

            const annualInfo =
              ANNUAL_PLAN_PRICING[key as keyof typeof ANNUAL_PLAN_PRICING];
            const showAnnual =
              billingCycle === 'annual' && annualInfo && plan.price > 0;
            const displayPrice = showAnnual
              ? Math.round(annualInfo.annual / 12)
              : plan.price;
            const priceLabel =
              plan.price === 0 ? 'Free' : `$${displayPrice}`;
            const savings = showAnnual
              ? annualInfo.monthly * 12 - annualInfo.annual
              : 0;

            return (
              <div
                key={key}
                className={`relative bg-white rounded-2xl p-6 border-2 shadow-sm transition-shadow hover:shadow-lg ${
                  isPopular
                    ? 'border-blue-900 ring-2 ring-blue-900/10'
                    : 'border-slate-200'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-900 text-white text-xs font-bold px-3 py-1 rounded-full">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="font-bold text-lg text-slate-900 mb-1">
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-extrabold text-slate-900">
                    {priceLabel}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-slate-500">/mo</span>
                  )}
                </div>
                {showAnnual && savings > 0 && (
                  <div className="text-xs font-semibold text-emerald-600 mb-3">
                    Billed ${annualInfo.annual}/yr — Save ${savings}
                  </div>
                )}
                {!showAnnual && plan.price > 0 && (
                  <div className="text-xs text-slate-400 mb-3">
                    Billed monthly
                  </div>
                )}
                {plan.price === 0 && <div className="mb-3" />}
                <div className="text-sm text-slate-600 mb-4">
                  {botsLabel} / {conversationsLabel}
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-slate-600"
                    >
                      <CheckCircle
                        size={16}
                        className="text-emerald-500 shrink-0 mt-0.5"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                {'overage' in plan && plan.overage && (
                  <div className="text-xs text-slate-500 mb-4">
                    ${plan.overage} per additional conversation
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleLogin}
                  className={`w-full py-2 rounded-lg font-bold transition ${
                    isPopular
                      ? 'bg-blue-900 text-white hover:bg-blue-950'
                      : plan.price === 0
                        ? 'bg-slate-900 text-white hover:bg-slate-800'
                        : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  {plan.price === 0 ? 'Get Started Free' : 'Get Started'}
                </button>
              </div>
            );
          })}
        </section>

        {/* ── Premium Add-Ons ── */}
        <section className="space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-semibold">
              <Zap size={16} />
              Power-Ups
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Premium Add-Ons
            </h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              Supercharge any plan with professional add-ons. Stack multiple
              for maximum impact.
            </p>
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap justify-center gap-2">
            {addonCategories.map((cat) => (
              <button
                type="button"
                key={cat}
                onClick={() => setAddonFilter(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition capitalize ${
                  addonFilter === cat
                    ? 'bg-blue-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAddons.map((addon) => (
              <div
                key={addon.id}
                className={`relative bg-white rounded-2xl p-6 border-2 shadow-sm hover:shadow-lg transition ${
                  addon.popular
                    ? 'border-purple-300 ring-1 ring-purple-200'
                    : 'border-slate-200'
                }`}
              >
                {addon.popular && (
                  <div className="absolute -top-2.5 right-4 bg-purple-600 text-white text-xs font-bold px-3 py-0.5 rounded-full">
                    POPULAR
                  </div>
                )}
                <h3 className="font-bold text-lg text-slate-900 mb-1">
                  {addon.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-2xl font-extrabold text-slate-900">
                    ${addon.price}
                  </span>
                  <span className="text-slate-500">/mo</span>
                </div>
                <p className="text-sm text-slate-600 mb-4">
                  {addon.description}
                </p>
                <ul className="space-y-1.5 mb-5">
                  {addon.features.slice(0, 5).map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-slate-600"
                    >
                      <CheckCircle
                        size={14}
                        className="text-emerald-500 shrink-0 mt-0.5"
                      />
                      {f}
                    </li>
                  ))}
                  {addon.features.length > 5 && (
                    <li className="text-xs text-slate-400 pl-5">
                      +{addon.features.length - 5} more
                    </li>
                  )}
                </ul>
                <div className="text-xs text-slate-400 mb-3">
                  Available on:{' '}
                  {addon.applicablePlans
                    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
                    .join(', ')}
                </div>
                <button
                  type="button"
                  onClick={handleLogin}
                  className="w-full py-2 bg-slate-100 text-slate-900 rounded-lg font-bold hover:bg-slate-200 transition"
                >
                  Add to Plan
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── Voice Agent Plans ── */}
        <section className="space-y-8">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold text-slate-900">
              Voice Agent Add-On
            </h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              Add AI-powered phone agents to any plan. Handle inbound calls,
              qualify leads, and book appointments automatically.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <h3 className="font-bold text-lg text-slate-900 mb-4">
                Voice Agent Plans
              </h3>
              <ul className="space-y-3 text-sm">
                {VOICE_AGENT_PRICING.map((plan) => (
                  <li
                    key={plan.id}
                    className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg p-3 border border-slate-200"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">
                        {plan.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {plan.minutesIncluded} min/mo included
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-slate-900">
                        ${plan.price}/mo
                      </div>
                      <div className="text-xs text-slate-500">
                        ${plan.overagePerMinute}/min overage
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <h3 className="font-bold text-lg text-slate-900 mb-4">
                Expert Setup Services
              </h3>
              <ul className="space-y-2 text-sm text-slate-600">
                {EXPERT_SETUP_SERVICES.map((service) => (
                  <li
                    key={service.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span>{service.name}</span>
                    <span className="font-semibold text-slate-900">
                      ${service.price.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500 mt-3">
                Delivery ranges from 3 to 14 days.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <h3 className="font-bold text-lg text-slate-900 mb-4">
                Template Marketplace
              </h3>
              <ul className="space-y-2 text-sm text-slate-600">
                {TEMPLATE_MARKETPLACE_PRICING.map((tier) => (
                  <li
                    key={tier.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span>{tier.name}</span>
                    <span className="font-semibold text-slate-900">
                      {tier.price === 0 ? 'Free' : `$${tier.price}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── High-Ticket Professional Services ── */}
        <section className="space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-4 py-2 rounded-full text-sm font-semibold">
              <Shield size={16} />
              Done-For-You
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Professional Services
            </h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              Enterprise-grade services for businesses that need custom
              solutions. White-glove delivery by our expert team.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PREMIUM_SERVICES.map((service) => (
              <div
                key={service.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-lg transition"
              >
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-5">
                  <h3 className="font-bold text-lg text-white">
                    {service.name}
                  </h3>
                  <div className="text-slate-300 text-sm mt-1">
                    Starting at{' '}
                    <span className="text-white font-bold text-lg">
                      ${service.priceTiers[0].price.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  {service.priceTiers.map((tier) => (
                    <div
                      key={tier.id}
                      className="bg-slate-50 rounded-lg p-3 border border-slate-200"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm text-slate-900">
                          {tier.name}
                        </span>
                        <span className="font-bold text-emerald-700">
                          ${tier.price.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mb-2">
                        {tier.description}
                      </p>
                      <div className="text-xs text-slate-400">
                        📅 {tier.deliveryDays}-day delivery
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleLogin}
                    className="w-full py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition mt-2"
                  >
                    Get Started
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Sales Agent / Partner Commission Opportunity ── */}
        <section className="space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-sm font-semibold">
              <DollarSign size={16} />
              Earn Big
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Sales Agent Commission Program
            </h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              Earn up to 50% recurring commissions on every deal. Plus bonuses,
              spiffs, and milestone rewards that stack.
            </p>
          </div>

          {/* Commission tiers */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {SALES_AGENT_TIERS.map((t) => {
              const colors: Record<string, string> = {
                Bronze:
                  'from-amber-700 to-amber-600 border-amber-300',
                Silver:
                  'from-slate-500 to-slate-400 border-slate-300',
                Gold: 'from-yellow-500 to-amber-400 border-yellow-300',
                Platinum:
                  'from-slate-900 to-slate-700 border-slate-400',
              };
              return (
                <div
                  key={t.tier}
                  className={`rounded-2xl overflow-hidden border-2 ${colors[t.tier]?.split(' ').pop() || 'border-slate-200'} shadow-sm hover:shadow-lg transition`}
                >
                  <div
                    className={`bg-gradient-to-br ${colors[t.tier]?.split(' ').slice(0, 2).join(' ') || ''} p-5 text-white`}
                  >
                    <h3 className="text-xl font-extrabold">{t.tier}</h3>
                    <div className="text-sm opacity-90">
                      {t.clients} clients
                    </div>
                    <div className="text-3xl font-extrabold mt-2">
                      {t.baseCommission}
                    </div>
                    <div className="text-sm opacity-80">
                      recurring commission
                    </div>
                  </div>
                  <div className="bg-white p-5 space-y-2">
                    <div className="text-xs text-slate-500 mb-2">
                      Add-on commission: {t.addonCommission} | Services:{' '}
                      {t.servicesCommission}
                    </div>
                    {t.perks.map((perk) => (
                      <div
                        key={perk}
                        className="flex items-start gap-2 text-sm text-slate-600"
                      >
                        <CheckCircle
                          size={14}
                          className="text-emerald-500 shrink-0 mt-0.5"
                        />
                        {perk}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Revenue milestone bonuses */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-8 text-white">
            <div className="flex items-center gap-3 mb-6">
              <Rocket size={24} className="text-yellow-400" />
              <h3 className="text-2xl font-bold">
                Revenue Milestone Bonuses
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {COMMISSION_ACCELERATORS.milestones.map((m) => (
                <div
                  key={m.id}
                  className="bg-white/10 backdrop-blur rounded-xl p-4 text-center"
                >
                  <div className="text-3xl mb-2">{m.badge}</div>
                  <div className="font-bold text-lg">{m.label}</div>
                  <div className="text-2xl font-extrabold text-yellow-400 my-1">
                    ${m.bonus.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-300">
                    at ${(m.revenueTarget / 1000).toFixed(0)}K MRR
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Deal spiffs */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <Star size={24} className="text-amber-500" />
              <h3 className="text-2xl font-bold text-slate-900">
                Deal Spiffs & Bonus Payouts
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {COMMISSION_ACCELERATORS.spiffs.map((s) => (
                <div
                  key={s.id}
                  className="bg-slate-50 rounded-xl p-4 border border-slate-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-900">
                      {s.name}
                    </span>
                    <span className="text-lg font-extrabold text-emerald-600">
                      +${s.bonus}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{s.condition}</p>
                </div>
              ))}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-900">
                    Annual Upsell Bonus
                  </span>
                  <span className="text-lg font-extrabold text-blue-600">
                    +5%
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  Extra 5% commission on every annual plan deal you close
                </p>
              </div>
            </div>
          </div>

          {/* Earnings examples */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp size={24} className="text-emerald-600" />
              <h3 className="text-2xl font-bold text-slate-900">
                What You Could Earn
              </h3>
            </div>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">
                      Scenario
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">
                      Description
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600">
                      Commission
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600">
                      Monthly
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600">
                      Annual
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMMISSION_ACCELERATORS.earningsExamples.map((ex) => (
                    <tr
                      key={ex.scenario}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {ex.scenario}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {ex.description}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600">
                        {(ex.commissionRate * 100).toFixed(0)}%
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-700">
                        ${ex.monthlyEarnings.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-700">
                        ${ex.annualEarnings.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-4">
              * Earnings examples are illustrative. Actual earnings depend on
              client mix, plan selection, and add-on adoption. Milestone bonuses
              and spiffs are not included in the above figures.
            </p>
          </div>

          {/* CTA */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/partner';
                }
              }}
              className="inline-flex items-center gap-2 bg-emerald-700 text-white px-8 py-4 rounded-xl font-bold hover:bg-emerald-800 transition-all text-lg"
            >
              Become a Sales Agent
              <ArrowRight size={20} />
            </button>
          </div>
        </section>

        {/* ── Custom plan CTA ── */}
        <section className="bg-slate-900 text-white rounded-2xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-2">
              Need a custom plan?
            </h2>
            <p className="text-slate-300 max-w-2xl">
              We can tailor pricing for high-volume teams, agencies, and
              enterprises with special requirements.
            </p>
          </div>
          <a
            href="/contact"
            className="inline-flex items-center gap-2 bg-white text-slate-900 px-6 py-3 rounded-xl font-bold hover:bg-slate-100 transition-all"
          >
            Contact sales
            <ArrowRight size={18} />
          </a>
        </section>
      </div>
    </PageLayout>
  );
};
