import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Bot,
  Cake,
  CalendarClock,
  CheckCircle2,
  Gift,
  Hash,
  MessageSquare,
  MessagesSquare,
  Repeat,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { SMS_MARKETING_PRICING } from '../../constants';
import { SEO, SEOConfig } from '../SEO/SEO';

const CAPABILITIES = [
  {
    icon: MessagesSquare,
    title: 'Two-way campaigns',
    description:
      'Send a one-time blast or run an ongoing drip sequence. Customers can reply and get an instant, on-brand response back — not a one-way broadcast.',
  },
  {
    icon: Hash,
    title: 'Keyword auto-replies',
    description:
      'Pick a keyword like SAVE10 or HOURS and reply automatically the moment someone texts it in, day or night.',
  },
  {
    icon: Gift,
    title: 'Text-to-Win contests',
    description:
      'Run entry-based contests and giveaways with automatic entry confirmation, eligibility rules, and a fair, logged draw.',
  },
  {
    icon: Cake,
    title: 'Birthday & loyalty clubs',
    description:
      'Automated birthday texts and loyalty check-ins that bring customers back on their own — you set it up once.',
  },
  {
    icon: CalendarClock,
    title: 'Appointment reminders',
    description:
      'Cut no-shows with reminders sent at the right time before every appointment, synced to your booking flow.',
  },
  {
    icon: ShieldCheck,
    title: 'Built-in compliance',
    description:
      'STOP, HELP, and START keywords are handled automatically, so every campaign stays opt-out compliant without extra work.',
  },
];

const USE_CASES = [
  'Med spas & salons',
  'Restaurants & cafes',
  'Gyms & studios',
  'Retail & e-commerce',
  'Real estate',
  'Home services',
  'Auto dealerships & repair',
  'Law firms',
];

export function SmsMarketingLandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <SEO
        title={SEOConfig.smsMarketing.title}
        description={SEOConfig.smsMarketing.description}
        keywords={SEOConfig.smsMarketing.keywords}
      />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_5%,_rgba(16,185,129,0.20),_transparent_35%),radial-gradient(circle_at_90%_20%,_rgba(37,99,235,0.16),_transparent_30%),radial-gradient(circle_at_50%_100%,_rgba(20,184,166,0.14),_transparent_36%)]" />

      <div className="relative">
        <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
            <Link
              to="/"
              className="flex items-center gap-3 font-black tracking-tight"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 shadow-lg shadow-emerald-600/25">
                <Bot size={22} />
              </span>
              <span className="text-xl">BuildMyBot</span>
            </Link>
            <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-300 md:flex">
              <a href="#capabilities" className="transition hover:text-white">
                Capabilities
              </a>
              <a href="#crm" className="transition hover:text-white">
                CRM &amp; handoff
              </a>
              <a href="#pricing" className="transition hover:text-white">
                Pricing
              </a>
            </nav>
            <div className="flex items-center gap-2">
              <Link
                to="/?auth=login"
                className="hidden rounded-xl px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white sm:inline-flex"
              >
                Log in
              </Link>
              <Link
                to="/?auth=signup"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-500"
              >
                Start free <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </header>

        <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-28 lg:pt-20">
          <div>
            <Link
              to="/"
              className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-white"
            >
              <ArrowLeft size={16} /> Back to BuildMyBot
            </Link>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200">
              <Sparkles size={16} /> Flagship Feature: SMS Marketing
            </div>
            <h1 className="max-w-4xl text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              The channel your customers{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                actually open.
              </span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
              Two-way campaigns, keyword auto-replies, Text-to-Win contests,
              birthday clubs, and appointment reminders — on your own dedicated
              business number. Every reply feeds the same knowledge base and CRM
              as your chatbot and voice receptionist.
            </p>

            <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold text-slate-300">
              {[
                'Two-way campaigns',
                'Keyword auto-replies',
                'Text-to-Win contests',
                'STOP/HELP built in',
              ].map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2"
                >
                  <CheckCircle2 size={15} className="text-emerald-400" /> {item}
                </span>
              ))}
            </div>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/?auth=signup"
                className="inline-flex items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-7 py-4 text-base font-bold shadow-xl shadow-emerald-600/25 transition hover:bg-emerald-500"
              >
                <MessageSquare size={20} /> Start texting your customers
              </Link>
              <a
                href="#pricing"
                className="inline-flex items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-7 py-4 text-base font-bold transition hover:bg-white/10"
              >
                See SMS pricing
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 rounded-[3rem] bg-emerald-600/10 blur-3xl" />
            <div className="relative mx-auto max-w-sm rounded-[2rem] border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-emerald-950/50 backdrop-blur-xl sm:p-6">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                  <MessageSquare size={18} />
                </span>
                <div>
                  <p className="font-bold">Your Business</p>
                  <p className="text-xs text-slate-400">(555) 010-0142</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-emerald-600 px-4 py-2.5 text-sm">
                  🎉 Text WIN to enter this week's giveaway. Reply STOP to opt
                  out anytime.
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-4 py-2.5 text-sm">
                  WIN
                </div>
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-emerald-600 px-4 py-2.5 text-sm">
                  You're entered! We'll text the winner Friday. Want 15% off
                  today too? Reply YES.
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-4 py-2.5 text-sm">
                  YES
                </div>
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-emerald-600 px-4 py-2.5 text-sm">
                  Awesome — here's your code: SAVE15. See you soon!
                </div>
              </div>
              <p className="mt-4 text-center text-xs text-slate-500">
                Illustrative example — sent and answered automatically.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.03]">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-5 py-8 sm:grid-cols-4 sm:px-8">
            {[
              ['24/7', 'Campaigns & auto-replies'],
              ['1', 'Number for chat, voice & text'],
              ['0', 'Leads lost between channels'],
              ['5 min', 'Setup time'],
            ].map(([value, label]) => (
              <div key={label} className="px-4 py-4 text-center">
                <p className="text-3xl font-black text-white">{value}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="capabilities"
          className="mx-auto max-w-7xl px-5 py-24 sm:px-8"
        >
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-400">
              More than a broadcast list
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
              SMS marketing built to do business, not just send texts.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-400">
              Every campaign, reply, and reminder runs on the same platform as
              your chatbot and voice receptionist — trained on your business,
              not a generic template.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition hover:-translate-y-1 hover:border-emerald-400/25 hover:bg-white/[0.06]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
                  <Icon size={23} />
                </div>
                <h3 className="mt-5 text-xl font-bold">{title}</h3>
                <p className="mt-3 leading-7 text-slate-400">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="crm" className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
          <div className="overflow-hidden rounded-[2rem] border border-blue-400/20 bg-gradient-to-br from-blue-500/10 via-slate-900 to-emerald-500/10 p-7 sm:p-10 lg:p-12">
            <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-400/10 px-4 py-2 text-sm font-semibold text-blue-200">
                  <UserCheck size={16} /> One CRM for every channel
                </div>
                <h2 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
                  Chat, voice, and text all feed the same pipeline.
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-300">
                  A reply doesn't just sit in a text thread. It updates the same
                  Lead CRM your chatbot and voice receptionist write to — so
                  nothing depends on which channel a customer happened to use.
                  Set the buying signals or triggers that matter to your
                  business, and let the AI watch for them on every channel at
                  once.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  ['1', 'A text shows strong buying intent'],
                  ['2', 'BuildMyBot scores and updates the lead in your CRM'],
                  ['3', 'The right person gets an immediate hot-lead alert'],
                  ['4', 'They follow up with full context — no cold start'],
                ].map(([number, copy]) => (
                  <div
                    key={number}
                    className="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 font-black">
                      {number}
                    </span>
                    <p className="font-semibold text-slate-200">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.025]">
          <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-400">
                  Built for repeat business
                </p>
                <h2 className="mt-4 text-4xl font-black tracking-tight">
                  Perfect for businesses customers come back to.
                </h2>
                <p className="mt-5 leading-7 text-slate-400">
                  Promos, reminders, and loyalty texts trained on your business,
                  your voice, and your offers.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {USE_CASES.map((useCase) => (
                  <span
                    key={useCase}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-300"
                  >
                    {useCase}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-400">
              Simple, standalone pricing
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
              Add SMS marketing to any plan.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-400">
              Works on its own or alongside your chatbot and voice receptionist.
              No bundling required.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {SMS_MARKETING_PRICING.map((plan) => (
              <div
                key={plan.id}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-7"
              >
                <h3 className="text-lg font-bold">{plan.name}</h3>
                <div className="mt-3 text-3xl font-black">
                  ${plan.price}
                  <span className="text-base font-normal text-slate-400">
                    /mo
                  </span>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-slate-300">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckCircle2
                        size={16}
                        className="mt-0.5 shrink-0 text-emerald-400"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-slate-500">
            Sending unlocks once your organization completes required
            phone-carrier registration for business texting — a standard
            requirement for any business texting platform, not a BuildMyBot
            limitation.
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-24 text-center sm:px-8 sm:py-28">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 shadow-xl shadow-emerald-600/30">
            <Bell size={26} />
          </div>
          <h2 className="mt-7 text-4xl font-black tracking-tight sm:text-5xl">
            Your next customer is one text away.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-400">
            Set up your first campaign, connect your number, and decide exactly
            which signals should route straight to your team.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/?auth=signup"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-7 py-4 font-bold shadow-xl shadow-emerald-600/25 transition hover:bg-emerald-500"
            >
              Start building free <ArrowRight size={18} />
            </Link>
            <Link
              to="/features"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-7 py-4 font-bold transition hover:bg-white/10"
            >
              <Repeat size={18} /> See how it connects to chat &amp; voice
            </Link>
          </div>
        </section>

        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p>
              © 2026 BuildMyBot. AI chatbots, voice agents, and SMS marketing
              for businesses.
            </p>
            <div className="flex gap-5">
              <Link to="/privacy" className="transition hover:text-slate-300">
                Privacy
              </Link>
              <Link to="/contact" className="transition hover:text-slate-300">
                Contact
              </Link>
              <Link to="/faq" className="transition hover:text-slate-300">
                FAQ
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
