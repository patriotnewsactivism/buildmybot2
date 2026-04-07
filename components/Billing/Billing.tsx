import {
  CheckCircle,
  CreditCard,
  Crown,
  ExternalLink,
  Loader,
  Shield,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { PLANS } from '../../constants';
import { buildApiUrl } from '../../services/apiConfig';
import { PlanType, type User } from '../../types';

interface BillingProps {
  user?: User;
}

interface StripeProduct {
  id: string;
  name: string;
  description: string;
  metadata: { planKey: string };
  prices: { id: string; unit_amount: number; currency: string }[];
}

interface Plan {
  price: number;
  bots: number;
  conversations: number;
  name: string;
  features: string[];
  overage?: number;
}

export const Billing: React.FC<BillingProps> = ({ user }) => {
  const currentPlan = user?.plan || PlanType.FREE;
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [stripeProducts, setStripeProducts] = useState<StripeProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  useEffect(() => {
    fetchStripeProducts();
  }, []);

  const fetchStripeProducts = async () => {
    try {
      const res = await fetch(buildApiUrl('/stripe/products'));
      const data = await res.json();
      setStripeProducts(data.data || []);
    } catch (error) {
      console.error('Error fetching Stripe products:', error);
    } finally {
      setLoadingProducts(false);
    }
  };

  const getStripePriceId = (planKey: string): string | null => {
    const product = stripeProducts.find((p) => p.metadata?.planKey === planKey);
    return product?.prices?.[0]?.id || null;
  };

  const handleUpgrade = async (planId: string) => {
    if (!user) return;

    if (planId === PlanType.FREE) {
      return;
    }

    const priceId = getStripePriceId(planId);
    if (!priceId) {
      alert(
        'This plan is not available for purchase yet. Please contact support.',
      );
      return;
    }

    setProcessingPlan(planId);

    try {
      const res = await fetch(buildApiUrl('/stripe/checkout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, priceId }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout. Please try again.');
      setProcessingPlan(null);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;

    try {
      const res = await fetch(buildApiUrl('/stripe/portal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('No active subscription found.');
      }
    } catch (error) {
      console.error('Portal error:', error);
      alert('Failed to open billing portal.');
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-[95rem] mx-auto pb-10">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-slate-800">Upgrade your Plan</h2>
        <p className="text-slate-500 mt-2">
          Scale your business with our power-packed tiers. Cancel anytime.
        </p>
        {currentPlan !== PlanType.FREE && (
          <button
            type="button"
            onClick={handleManageSubscription}
            className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
          >
            <CreditCard size={18} /> Manage Subscription{' '}
            <ExternalLink size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
        {Object.entries(PLANS).map(([key, plan]: [string, Plan]) => {
          const isCurrent = key === currentPlan;
          const isEnterprise = key === PlanType.ENTERPRISE;
          const isProfessional = key === PlanType.PROFESSIONAL;
          const isFree = key === PlanType.FREE;

          const displayTitle = isEnterprise
            ? 'Enterprise'
            : plan.name;

          return (
            <div
              key={key}
              className={`relative rounded-2xl p-6 flex flex-col transition-all duration-300 h-full ${
                isProfessional
                  ? 'bg-white border-2 border-blue-900 shadow-xl scale-105 z-10'
                  : isEnterprise
                    ? 'bg-slate-900 border border-slate-800 text-white shadow-lg'
                    : 'bg-white border border-slate-200 hover:shadow-lg'
              }`}
            >
              {isProfessional && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-900 text-white px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide shadow-sm">
                  Most Popular
                </div>
              )}

              {isEnterprise && (
                <div className="mb-4 flex items-center gap-1.5 text-yellow-400 font-bold text-[10px] uppercase tracking-widest">
                  <Crown size={12} fill="currentColor" /> Enterprise
                </div>
              )}

              <div className="mb-6">
                <h3
                  className={`text-lg font-bold ${isEnterprise ? 'text-white' : 'text-slate-900'}`}
                >
                  {displayTitle}
                </h3>
                <div className="flex items-baseline mt-2">
                  <span
                    className={`text-4xl font-extrabold ${isEnterprise ? 'text-white' : 'text-slate-900'}`}
                  >
                    ${plan.price}
                  </span>
                  <span
                    className={`text-sm ml-1 ${isEnterprise ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    /mo
                  </span>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div
                  className={`flex items-center gap-3 text-sm font-medium ${isEnterprise ? 'text-slate-300' : 'text-slate-700'}`}
                >
                  <CheckCircle
                    size={18}
                    className={
                      isEnterprise ? 'text-yellow-400' : 'text-emerald-500'
                    }
                  />
                  <span>
                    {plan.bots >= 9999 ? 'Unlimited' : plan.bots} Bot(s)
                  </span>
                </div>
                <div
                  className={`flex items-center gap-3 text-sm font-medium ${isEnterprise ? 'text-slate-300' : 'text-slate-700'}`}
                >
                  <CheckCircle
                    size={18}
                    className={
                      isEnterprise ? 'text-yellow-400' : 'text-emerald-500'
                    }
                  />
                  <span>
                    {plan.conversations.toLocaleString()} Conversations
                  </span>
                </div>
                <div
                  className={`flex items-center gap-3 text-sm font-medium ${isEnterprise ? 'text-slate-300' : 'text-slate-700'}`}
                >
                  <CheckCircle
                    size={18}
                    className={
                      isEnterprise ? 'text-yellow-400' : 'text-emerald-500'
                    }
                  />
                  <span>
                    {isEnterprise
                      ? 'Enterprise Analytics'
                      : 'Advanced Analytics'}
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <p
                  className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isEnterprise ? 'text-slate-500' : 'text-slate-400'}`}
                >
                  Everything in this plan
                </p>
                <div
                  className={`h-px w-full ${isEnterprise ? 'bg-slate-800' : 'bg-slate-100'}`}
                />
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature: string) => (
                  <li
                    key={feature}
                    className={`flex items-start gap-3 text-xs leading-relaxed ${isEnterprise ? 'text-slate-400' : 'text-slate-600'}`}
                  >
                    <CheckCircle
                      size={14}
                      className={`shrink-0 mt-0.5 ${isEnterprise ? 'text-yellow-500/50' : 'text-emerald-500/50'}`}
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleUpgrade(key)}
                disabled={
                  isCurrent ||
                  isFree ||
                  processingPlan !== null ||
                  loadingProducts
                }
                className={`w-full py-3 rounded-lg font-bold text-sm transition shadow-sm flex items-center justify-center gap-2 ${
                  isCurrent
                    ? 'bg-slate-100 text-slate-400 cursor-default shadow-none border border-slate-200'
                    : isFree
                      ? 'bg-slate-50 text-slate-400 cursor-default border border-slate-200'
                      : isEnterprise
                        ? 'bg-white text-slate-900 hover:bg-slate-200'
                        : isProfessional
                          ? 'bg-blue-900 text-white hover:bg-blue-950 shadow-blue-900/20'
                          : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50'
                }`}
              >
                {processingPlan === key ? (
                  <Loader className="animate-spin" size={16} />
                ) : null}
                {isCurrent
                  ? 'Current Plan'
                  : isFree
                    ? 'Free Forever'
                    : isEnterprise
                      ? 'Get Enterprise'
                      : `Choose ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-12 p-6 bg-slate-100 rounded-xl border border-slate-200 text-center max-w-3xl mx-auto">
        <h4 className="font-bold text-slate-800 mb-2">
          Enterprise Customization
        </h4>
        <p className="text-slate-500 text-sm mb-4">
          Need more than 50,000 conversations? Our Enterprise plan scales with
          you at just <strong>$0.01</strong> per additional conversation. We
          also offer custom SLA and on-premise deployment.
        </p>
        <button
          type="button"
          className="text-blue-900 font-medium text-sm hover:underline flex items-center justify-center gap-1 mx-auto"
        >
          <Shield size={14} /> Contact our Sales Team
        </button>
      </div>
    </div>
  );
};
