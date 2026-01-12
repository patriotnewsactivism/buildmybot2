import {
  ArrowRight,
  Clock,
  DollarSign,
  GraduationCap,
  Heart,
  MapPin,
  Users,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { SEO, SEOConfig } from '../../SEO/SEO';
import { PageLayout } from './PageLayout';

const jobOpenings = [
  {
    id: 1,
    title: 'Sales Agent',
    department: 'Sales',
    location: 'Remote',
    type: 'Commission-only',
    compensation: 'Uncapped commission + residuals',
    description:
      'We are hiring sales agents with an excellent uncapped commission and residual structure. Make one sale and get paid on that sale over and over and over on a product that sells itself.',
    requirements: [
      'Self-starter with a consultative sales mindset',
      'Comfortable owning the full sales cycle',
      'Clear communication and follow-up discipline',
      'Experience selling SaaS or digital services is a plus',
    ],
  },
];

export const CareersPage: React.FC = () => {
  return (
    <PageLayout>
      <SEO
        title={SEOConfig.careers.title}
        description={SEOConfig.careers.description}
        keywords={SEOConfig.careers.keywords}
      />
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 space-y-24">
        <section className="text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900">
            Join Our Team
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            We&apos;re building the future of AI-powered business communication.
            We are not currently hiring salaried or in-office positions. Our
            focus is on commission-based sales agents who want to earn residual
            income with a product that sells itself.
          </p>
        </section>

        <section className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-slate-900">
              Why BuildMyBot?
            </h2>
            <div className="space-y-4 text-slate-600 leading-relaxed">
              <p>
                At BuildMyBot, we&apos;re not just building another software
                product—we&apos;re revolutionizing how businesses connect with their
                customers. Our AI handles millions of conversations every month,
                helping companies of all sizes grow.
              </p>
              <p>
                We believe in hiring exceptional people and giving them the
                autonomy to do their best work. Our team is distributed across
                the globe, united by a shared mission and a culture of
                innovation.
              </p>
              <p>
                If you want to work on challenging problems at the intersection
                of AI and business, with a team that values your contributions,
                BuildMyBot is the place for you.
              </p>
            </div>
          </div>
          <div className="bg-gradient-to-br from-blue-900 to-blue-700 rounded-3xl p-10 text-white">
            <h3 className="text-2xl font-bold mb-6">Our Culture</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Zap className="text-yellow-400 mt-1 shrink-0" size={20} />
                <span>
                  <strong>Move Fast:</strong> We ship early and iterate based on
                  real feedback
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Users className="text-blue-300 mt-1 shrink-0" size={20} />
                <span>
                  <strong>Customer First:</strong> Every decision is made with
                  our customers in mind
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Heart className="text-pink-400 mt-1 shrink-0" size={20} />
                <span>
                  <strong>Own It:</strong> We take responsibility and see things
                  through
                </span>
              </li>
              <li className="flex items-start gap-3">
                <GraduationCap
                  className="text-green-400 mt-1 shrink-0"
                  size={20}
                />
                <span>
                  <strong>Always Learning:</strong> We invest in growth, both
                  personal and professional
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className="space-y-12">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Sales Opportunities
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              We&apos;re focused on commission-based sales roles with uncapped
              earnings and recurring residuals.
            </p>
          </div>
          <div className="space-y-6">
            {jobOpenings.map((job) => (
              <div
                key={job.id}
                className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm hover:shadow-lg transition-shadow"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                        {job.department}
                      </span>
                      <span className="text-slate-500 text-sm flex items-center gap-1">
                        <MapPin size={14} /> {job.location}
                      </span>
                      <span className="text-slate-500 text-sm flex items-center gap-1">
                        <Clock size={14} /> {job.type}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">
                      {job.title}
                    </h3>
                    <p className="text-slate-600 mb-4">{job.description}</p>
                    <div className="flex items-center gap-2 text-emerald-600 font-medium">
                      <DollarSign size={18} />
                      {job.compensation}
                    </div>
                  </div>
                  <div className="lg:w-64 shrink-0">
                    <h4 className="font-bold text-slate-900 mb-3">
                      Requirements
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-600">
                      {job.requirements.map((req) => (
                        <li key={req} className="flex items-start gap-2">
                          <span className="text-blue-600 mt-1">•</span>
                          {req}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <button
                    type="button"
                    className="bg-blue-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-800 transition flex items-center gap-2"
                  >
                    Apply Now <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-slate-100 rounded-3xl p-12 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            Ready to Earn Residuals?
          </h2>
          <p className="text-slate-600 mb-6 max-w-xl mx-auto">
            Tell us about your sales experience and the markets you plan to
            target. We&apos;ll follow up with details on onboarding and compensation.
          </p>
          <a
            href="mailto:careers@buildmybot.app"
            className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition"
          >
            Contact Sales Careers
          </a>
        </section>
      </div>
    </PageLayout>
  );
};
