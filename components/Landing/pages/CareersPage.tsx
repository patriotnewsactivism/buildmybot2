import {
  ArrowRight,
  Clock,
  Coffee,
  DollarSign,
  GraduationCap,
  Heart,
  Laptop,
  MapPin,
  Plane,
  Users,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { PageLayout } from './PageLayout';

const jobOpenings = [
  {
    id: 1,
    title: 'Senior AI Engineer',
    department: 'Engineering',
    location: 'San Francisco, CA (Hybrid)',
    type: 'Full-time',
    salary: '$180,000 - $250,000',
    description:
      "Join our core AI team to build and improve our conversational AI models. You'll work on natural language understanding, dialogue systems, and voice synthesis.",
    requirements: [
      '5+ years of experience in ML/AI engineering',
      'Strong Python skills and experience with PyTorch or TensorFlow',
      'Experience with LLMs and prompt engineering',
      'MS or PhD in Computer Science, AI, or related field preferred',
    ],
  },
  {
    id: 2,
    title: 'Customer Success Manager',
    department: 'Customer Success',
    location: 'Remote (US)',
    type: 'Full-time',
    salary: '$90,000 - $130,000',
    description:
      "Help our customers succeed with BuildMyBot. You'll onboard new clients, provide strategic guidance, and ensure they're getting maximum value from our platform.",
    requirements: [
      '3+ years in customer success or account management',
      'Experience with SaaS products and technical concepts',
      'Excellent communication and presentation skills',
      'Track record of improving customer retention and satisfaction',
    ],
  },
  {
    id: 3,
    title: 'Product Designer',
    department: 'Design',
    location: 'San Francisco, CA or Remote',
    type: 'Full-time',
    salary: '$140,000 - $180,000',
    description:
      "Shape the future of our product experience. You'll design intuitive interfaces for both our dashboard and the chatbot builder, working closely with engineering and product teams.",
    requirements: [
      '4+ years of product design experience',
      'Strong portfolio demonstrating SaaS/B2B design work',
      'Proficiency in Figma and prototyping tools',
      'Experience with design systems and accessibility',
    ],
  },
];

const perks = [
  {
    icon: Heart,
    title: 'Health & Wellness',
    description:
      'Comprehensive health, dental, and vision insurance for you and your family',
  },
  {
    icon: DollarSign,
    title: 'Competitive Pay',
    description: 'Top-of-market salaries plus equity in a fast-growing company',
  },
  {
    icon: Laptop,
    title: 'Remote Flexible',
    description: 'Work from anywhere with flexible hours that fit your life',
  },
  {
    icon: Plane,
    title: 'Unlimited PTO',
    description:
      'Take the time you need to recharge. We trust you to manage your schedule',
  },
  {
    icon: GraduationCap,
    title: 'Learning Budget',
    description:
      '$2,000 annual budget for courses, conferences, and professional development',
  },
  {
    icon: Coffee,
    title: 'Team Events',
    description: 'Quarterly team retreats and monthly virtual social events',
  },
];

export const CareersPage: React.FC = () => {
  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 space-y-24">
        <section className="text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900">
            Join Our Team
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            We're building the future of AI-powered business communication. If
            you're passionate about AI and want to make a real impact, we'd love
            to hear from you.
          </p>
        </section>

        <section className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-slate-900">
              Why BuildMyBot?
            </h2>
            <div className="space-y-4 text-slate-600 leading-relaxed">
              <p>
                At BuildMyBot, we're not just building another software
                product—we're revolutionizing how businesses connect with their
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
              Perks & Benefits
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              We take care of our team so they can focus on doing their best
              work.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {perks.map((perk) => (
              <div
                key={perk.title}
                className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg transition-shadow"
              >
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700 mb-4">
                  <perk.icon size={24} />
                </div>
                <h3 className="font-bold text-lg text-slate-900 mb-2">
                  {perk.title}
                </h3>
                <p className="text-slate-600 text-sm">{perk.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-12">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Open Positions
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Find your next opportunity. We're always looking for talented
              people to join our team.
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
                      {job.salary}
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
            Don't See Your Role?
          </h2>
          <p className="text-slate-600 mb-6 max-w-xl mx-auto">
            We're always looking for exceptional talent. Send us your resume and
            tell us why you'd be a great fit for BuildMyBot.
          </p>
          <a
            href="mailto:careers@buildmybot.app"
            className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition"
          >
            Send Your Resume
          </a>
        </section>
      </div>
    </PageLayout>
  );
};
