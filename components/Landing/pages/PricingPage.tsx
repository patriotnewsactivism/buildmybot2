import { ArrowRight, CheckCircle, Sparkles } from 'lucide-react';
import type React from 'react';
import {
  EXPERT_SETUP_SERVICES,
  PLANS,
  TEMPLATE_MARKETPLACE_PRICING,
  VOICE_AGENT_PRICING,
  VOICE_LAUNCH_PROMO,
} from '../../../constants';
import { PlanType } from '../../../types';
import { SEO, SEOConfig } from '../../SEO/SEO';
import { PageLayout } from './PageLayout';

interface PricingPageProps {
  onLogin?: () => void;
}

const LOGIN_FALLBACK_URL = '/?auth=signup';

export const PricingPage: React.FC<PricingPageProps> = ({ onLogin }) => {
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

  return (
    <PageLayout>
      <SEO
        title={SEOConfig.pricing.title}
        description={SEOConfig.pricing.description}
        keywords={SEOConfig.pricing.keywords}
        ogType="product"
        structuredData={pricingStructuredData}
      />
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 space-y-16">
        <section className="text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-yellow-400 text-slate-900 px-6 py-2 rounded-full text-sm font-bold">
            <span className="w-2 h-2 bg-slate-900 rounded-full animate-pulse"></span>
            BETA TESTING - LAUNCHING SOON
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900">
            Pricing Preview
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            We're currently in beta testing. View our pricing plans below and join our beta program for early access.
          </p>
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 max-w-2xl mx-auto">
            <p className="text-blue-900 font-semibold mb-3">
              🚀 Purchases are currently disabled while we prepare for launch
            </p>
            <p className="text-blue-700 text-sm mb-4">
              Interested in early access? Join our beta testing program and be among the first to experience BuildMyBot.
            </p>
            <a
              href="/contact"
              className="inline-flex items-center gap-2 bg-blue-900 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-950 transition-all"
            >
              Request Beta Access
              <ArrowRight size={18} />
            </a>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
          {Object.entries(PLANS).map(([key, plan]) => {
            const isPopular = key === PlanType.PROFESSIONAL;
            const botsLabel =
              plan.bots >= 9999
                ? 'Unlimited bots'
                : `${plan.bots} bot${plan.bots === 1 ? '' : 's'}`;
            const conversationsLabel = `${plan.conversations.toLocaleString()} conversations/mo`;
            const priceLabel = plan.price === 0 ? 'Free' : `$${plan.price}`;

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
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-extrabold text-slate-900">
                    {priceLabel}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-slate-500">/mo</span>
                  )}
                </div>
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
                  disabled={true}
                  className="w-full py-2 rounded-lg font-bold transition bg-slate-200 text-slate-500 cursor-not-allowed"
                >
                  Coming Soon
                </button>
              </div>
            );
          })}
        </section>

        <section className="space-y-8">
          {/* MASSIVE VOICE AGENT LAUNCH PROMO BANNER */}
          <div className="bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 rounded-3xl p-8 md:p-12 text-center text-white shadow-2xl border-4 border-yellow-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 bg-white text-red-600 px-6 py-3 rounded-full text-sm font-black mb-4 animate-bounce shadow-lg">
                <Sparkles size={20} />
                {VOICE_LAUNCH_PROMO.announcement}
              </div>

              <h2 className="text-4xl md:text-6xl font-black mb-4 drop-shadow-lg">
                50% OFF VOICE PLANS
              </h2>

              <p className="text-2xl md:text-3xl font-bold mb-6 text-yellow-100">
                First 3 Months + FREE Phone Number!
              </p>

              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-6 max-w-2xl mx-auto mb-6">
                <div className="grid md:grid-cols-2 gap-4 text-left">
                  {VOICE_LAUNCH_PROMO.benefits.map((benefit, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <CheckCircle size={24} className="text-green-300 flex-shrink-0" />
                      <span className="font-semibold">{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900 text-white inline-block px-8 py-4 rounded-xl mb-4">
                <p className="text-sm font-semibold mb-2">USE CODE AT CHECKOUT:</p>
                <p className="text-3xl md:text-4xl font-black tracking-wider font-mono">
                  {VOICE_LAUNCH_PROMO.code}
                </p>
              </div>

              <p className="text-yellow-100 font-semibold">
                ⏰ Offer expires {VOICE_LAUNCH_PROMO.expires}
              </p>
            </div>
          </div>

          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold text-slate-900">
              Voice Agent Pricing
            </h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              <span className="text-red-600 font-bold">NOW 50% OFF FOR 3 MONTHS!</span> Choose your plan and enter code VALAUNCH50 at checkout.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-6 border-2 border-red-300 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-red-500 text-white px-4 py-1 rounded-bl-xl font-black text-xs">
                50% OFF!
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-2 mt-4">
                Voice Agent Pricing
              </h3>
              <p className="text-xs text-red-600 font-bold mb-4">
                Use code VALAUNCH50 for 50% off first 3 months!
              </p>
              <ul className="space-y-3 text-sm">
                {VOICE_AGENT_PRICING.map((plan) => {
                  const discountedPrice = Math.round(plan.price * 0.5);
                  return (
                    <li
                      key={plan.id}
                      className="flex items-center justify-between gap-3 bg-white rounded-lg p-3 border border-red-200"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{plan.name}</div>
                        <div className="text-xs text-green-600 font-bold">+ FREE phone number</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-red-600">
                          ${discountedPrice}/mo
                        </div>
                        <div className="text-xs text-slate-500 line-through">
                          ${plan.price}/mo
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 bg-yellow-100 border border-yellow-300 rounded-lg p-3 text-xs text-center">
                <span className="font-bold text-yellow-900">⚡ Then ${VOICE_AGENT_PRICING[0].price}/mo+ after promo period</span>
              </div>
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
                      ${service.price}
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
          <p className="text-sm text-slate-500 text-center">
            Voice plans are billed monthly. Setup services and template packs
            are one-time purchases.
          </p>
        </section>

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
