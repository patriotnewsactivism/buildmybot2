import { Heart, Lightbulb, Shield, Target } from 'lucide-react';
import type React from 'react';
import { SEO, SEOConfig } from '../../SEO/SEO';
import { PageLayout } from './PageLayout';

const values = [
  {
    icon: Target,
    title: 'Customer Obsession',
    description:
      'Every decision we make starts with our customers. Their success is our success.',
  },
  {
    icon: Lightbulb,
    title: 'Innovation First',
    description:
      'We push the boundaries of AI to deliver solutions that feel like magic.',
  },
  {
    icon: Shield,
    title: 'Trust & Security',
    description:
      'We treat your data with the utmost care and maintain enterprise-grade security.',
  },
  {
    icon: Heart,
    title: 'Human-Centered AI',
    description:
      "Our AI enhances human capabilities—it doesn't replace the human touch.",
  },
];

export const AboutPage: React.FC = () => {
  return (
    <PageLayout>
      <SEO
        title={SEOConfig.about.title}
        description={SEOConfig.about.description}
        keywords={SEOConfig.about.keywords}
      />
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 space-y-24">
        <section className="text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900">
            About BuildMyBot
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            We're on a mission to help businesses never miss another lead. Our
            AI-powered platform works 24/7 so you can focus on what matters
            most—growing your business.
          </p>
        </section>

        <section className="space-y-12">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Our Mission
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              To empower every business with AI that works as hard as they
              do—capturing every opportunity, nurturing every lead, and never
              taking a day off.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value) => (
              <div
                key={value.title}
                className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg transition-shadow"
              >
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700 mb-4">
                  <value.icon size={24} />
                </div>
                <h3 className="font-bold text-lg text-slate-900 mb-2">
                  {value.title}
                </h3>
                <p className="text-slate-600 text-sm">{value.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gradient-to-br from-blue-600 to-blue-900 rounded-3xl p-12 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-blue-100 mb-8 max-w-2xl mx-auto text-lg">
            Join thousands of businesses using AI to automate customer
            conversations, capture more leads, and grow revenue — all on
            autopilot.
          </p>
          <a
            href="/?auth=signup"
            className="inline-flex items-center gap-2 bg-white text-blue-900 px-8 py-4 rounded-xl font-bold hover:bg-blue-50 transition shadow-xl"
          >
            Start Building Free
          </a>
        </section>
      </div>
    </PageLayout>
  );
};
