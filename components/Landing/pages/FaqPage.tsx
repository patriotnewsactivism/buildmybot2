import {
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  HelpCircle,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { PageLayout } from './PageLayout';

interface FaqPageProps {
  onLogin?: () => void;
}

const LOGIN_FALLBACK_URL = 'https://login.buildmybot.app/?auth=signup';

const faqs = [
  {
    q: 'How quickly can I get started?',
    a: "Most businesses are live in minutes. Paste your website URL, customize your bot's tone, and install a single line of code.",
  },
  {
    q: 'Will the AI sound robotic to my customers?',
    a: 'No. We use advanced models and optional voice synthesis so the experience feels natural and human.',
  },
  {
    q: "What happens if the AI cannot answer a question?",
    a: 'The bot captures contact info and escalates the lead to your team with full context so nothing is lost.',
  },
  {
    q: 'Can I integrate with my CRM and tools?',
    a: 'Yes. We support popular CRMs and calendar tools, and we provide API access for custom workflows.',
  },
  {
    q: 'Is my data secure?',
    a: 'Yes. We follow enterprise-grade security practices and never train models on your private data.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Absolutely. You can cancel whenever you want. Paid plans also include a 14-day money-back guarantee.',
  },
];

export const FaqPage: React.FC<FaqPageProps> = ({ onLogin }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleLogin = () => {
    if (onLogin) {
      onLogin();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.href = LOGIN_FALLBACK_URL;
    }
  };

  return (
    <PageLayout>
      <div className="max-w-5xl mx-auto px-6 lg:px-12 py-16 space-y-16">
        <section className="text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-full text-sm font-semibold">
            <HelpCircle size={16} />
            Support and answers
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900">
            Frequently asked questions
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            Everything you need to know about BuildMyBot and how it helps you
            capture leads, automate conversations, and grow faster.
          </p>
        </section>

        <section className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={faq.q}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full flex items-center justify-between p-5 sm:p-6 text-left hover:bg-slate-50 transition gap-4"
              >
                <span className="font-semibold text-base sm:text-lg text-slate-900">
                  {faq.q}
                </span>
                {openFaq === index ? (
                  <ChevronUp size={20} className="shrink-0" />
                ) : (
                  <ChevronDown size={20} className="shrink-0" />
                )}
              </button>
              {openFaq === index && (
                <div className="px-5 sm:px-6 pb-5 sm:pb-6 text-slate-600 text-sm sm:text-base leading-relaxed">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </section>

        <section className="bg-slate-900 text-white rounded-2xl p-8 md:p-12 text-center space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold">
            Still have questions?
          </h2>
          <p className="text-slate-300 max-w-2xl mx-auto">
            Our team is ready to help you choose the right plan and get up and
            running fast.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              type="button"
              onClick={handleLogin}
              className="inline-flex items-center gap-2 bg-white text-slate-900 px-6 py-3 rounded-xl font-bold hover:bg-slate-100 transition-all"
            >
              Start free
              <ArrowRight size={18} />
            </button>
            <a
              href="/contact"
              className="inline-flex items-center gap-2 border border-white/40 text-white px-6 py-3 rounded-xl font-bold hover:bg-white/10 transition-all"
            >
              Contact support
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-300">
            <span className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-400" /> Fast setup
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-400" /> 24/7
              coverage
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-400" /> Secure
              by design
            </span>
          </div>
        </section>
      </div>
    </PageLayout>
  );
};
