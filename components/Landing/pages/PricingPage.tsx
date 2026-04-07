import { ArrowRight, CheckCircle } from 'lucide-react';
import type React from 'react';
import {
  EXPERT_SETUP_SERVICES,
  PLANS,
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
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            Choose the plan that fits your business. Start free, upgrade as you grow. No hidden fees.
          </p>
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

        <section className="space-y-8">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold text-slate-900">
              Voice Agent Add-On
            </h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              Add AI-powered phone agents to any plan. Handle inbound calls, qualify leads, and book appointments automatically.
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
                      <div className="font-semibold text-slate-900">{plan.name}</div>
                      <div className="text-xs text-slate-500">{plan.minutesIncluded} min/mo included</div>
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
