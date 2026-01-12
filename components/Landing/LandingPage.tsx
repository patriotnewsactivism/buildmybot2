import {
  ArrowRight,
  Bolt,
  CircuitBoard,
  MagicWand,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type React from 'react';
import { SEO, SEOConfig } from '../SEO/SEO';

interface LandingProps {
  onLogin: () => void;
  onNavigateToPartner?: () => void;
  onAdminLogin?: () => void;
}

const HERO_STATS = [
  { label: 'Avg. build time', value: '4 min' },
  { label: 'Bots launched', value: '2.4K+' },
  { label: 'Avg. CSAT', value: '98%' },
];

const FEATURE_CARDS = [
  {
    title: 'Visual flow builder',
    description: 'Drag and connect intents that feel like building with magnetic blocks. No code, no guesswork.',
    icon: Sparkles,
  },
  {
    title: 'AI-native intelligence',
    description: 'Every bot understands nuance, suggests follow-ups, and keeps evolving with your brand voice.',
    icon: CircuitBoard,
  },
  {
    title: 'One-click deployment',
    description: 'Push to your site, CRM, or WhatsApp with a single snippet and see the magic unfold.',
    icon: Bolt,
  },
  {
    title: 'Operational confidence',
    description: 'Monitoring, alerts, and warm coral signals keep you informed without noise.',
    icon: ShieldCheck,
  },
];

const HOW_IT_WORKS = [
  {
    title: 'Shape your mission',
    detail:
      'Describe who the bot should help, what conversations matter, and add any brand phrases you love.',
    icon: MagicWand,
  },
  {
    title: 'Assemble intelligent components',
    detail:
      'Connect chat bubbles, actions, and automations. The system optimizes responses while you stay creative.',
    icon: CircuitBoard,
  },
  {
    title: 'Deploy instantly',
    detail:
      'Publish to any page or channel, then watch warm teal confirmations and glowing feedback loop you back in.',
    icon: TrendingUp,
  },
];

export const LandingPage: React.FC<LandingProps> = ({
  onLogin,
  onNavigateToPartner,
  onAdminLogin,
}) => {
  const partnerAction = onNavigateToPartner ?? onLogin;

  return (
    <>
      <SEO
        title={SEOConfig.home.title}
        description={SEOConfig.home.description}
        keywords={SEOConfig.home.keywords}
      />

      <div className="bg-midnight text-white min-h-screen">
        <main className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            aria-hidden="true"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-electric-violet/80 via-luminous-teal/20 to-transparent blur-3xl" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/90" />
          </div>

          <section className="relative z-10 px-6 pt-12 pb-20 lg:pb-32">
            <div className="mx-auto max-w-6xl">
              <div className="flex flex-wrap items-center justify-between gap-4 text-xs uppercase tracking-[0.3em] text-soft-gray">
                <span className="text-luminous-teal">Neon Horizon release</span>
                <div className="flex flex-wrap gap-3">
                  {onNavigateToPartner && (
                    <button
                      type="button"
                      onClick={onNavigateToPartner}
                      className="rounded-full border border-white/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.4em] text-white transition hover:border-luminous-teal hover:text-luminous-teal"
                    >
                      Partner Program
                    </button>
                  )}
                  {onAdminLogin && (
                    <button
                      type="button"
                      onClick={onAdminLogin}
                      className="rounded-full border border-white/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.4em] text-white transition hover:border-electric-violet hover:text-electric-violet"
                    >
                      Admin login
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-12 grid items-center gap-12 lg:grid-cols-2">
                <div className="space-y-6">
                  <p className="text-sm uppercase tracking-[0.4em] text-luminous-teal">
                    Democratizing AI automation
                  </p>
                  <h1 className="font-spaceGrotesk text-4xl leading-tight text-white sm:text-5xl lg:text-6xl">
                    Build smart. Chat simply. Launch a bot that feels like part of
                    your team.
                  </h1>
                  <p className="text-soft-gray text-lg leading-relaxed sm:text-xl">
                    BuildMyBot.App now shines with a neon horizon aesthetic that
                    celebrates the joy of creation. Spin up intelligent
                    assistants, guide every conversation, and deliver delight in
                    minutes.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <button
                      type="button"
                      onClick={onLogin}
                      className="flex items-center gap-2 rounded-full bg-electric-violet px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(138,43,226,0.4)]"
                    >
                      Start building for free
                      <ArrowRight size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={partnerAction}
                      className="hidden sm:inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:border-luminous-teal hover:text-luminous-teal"
                    >
                      See the builder in motion
                      <ArrowRight size={18} />
                    </button>
                  </div>

                  <div className="mt-8 flex flex-wrap items-center gap-6 text-sm sm:text-base">
                    {HERO_STATS.map((stat) => (
                      <div key={stat.label}>
                        <p className="text-3xl font-semibold text-white">
                          {stat.value}
                        </p>
                        <p className="text-soft-gray">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 rounded-[32px] border border-electric-violet/40 bg-gradient-to-br from-electric-violet/30 via-transparent to-luminous-teal/20 blur-3xl" />
                  <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-b from-deep-indigo/90 to-midnight p-8 shadow-[0_0_60px_rgba(0,0,0,0.6)]">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-[0.4em] text-soft-gray">
                        Build flow
                      </div>
                      <div className="rounded-full bg-electric-violet/10 px-3 py-1 text-[11px] tracking-[0.3em] text-electric-violet">
                        Live
                      </div>
                    </div>
                    <div className="mt-8 space-y-6">
                      <div className="rounded-2xl border border-luminous-teal/30 bg-midnight/70 p-4">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-soft-gray">
                          Trigger
                        </p>
                        <p className="text-lg font-semibold text-white">
                          Drag speech bubble nodes
                        </p>
                      </div>
                      <div className="rounded-2xl border border-electric-violet/40 bg-deep-indigo p-4">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-soft-gray">
                          Response
                        </p>
                        <p className="text-lg font-semibold text-white">
                          Add intelligence + brand tone in seconds
                        </p>
                      </div>
                      <div className="rounded-2xl border border-luminous-teal/40 bg-midnight/60 p-4">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-soft-gray">
                          Deploy
                        </p>
                        <p className="text-lg font-semibold text-white">
                          One snippet, any channel
                        </p>
                      </div>
                    </div>
                    <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.4em] text-soft-gray">
                      <div className="h-2 w-8 rounded-full bg-luminous-teal" />
                      Live neon horizon
                    </div>
                    <div className="pointer-events-none absolute -right-6 top-8 h-20 w-20 rounded-full bg-electric-violet/40 blur-3xl" />
                    <div className="pointer-events-none absolute -left-6 bottom-10 h-24 w-24 rounded-full bg-luminous-teal/30 blur-3xl" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="relative z-10 px-6 pb-20 lg:pb-28">
            <div className="mx-auto max-w-6xl space-y-6 text-center">
              <p className="text-sm uppercase tracking-[0.4em] text-luminous-teal">
                What makes BuildMyBot exciting
              </p>
              <h2 className="font-spaceGrotesk text-3xl sm:text-4xl lg:text-5xl">
                A neon toolkit for confident creators.
              </h2>
              <p className="text-soft-gray sm:text-lg">
                Every block is designed to feel tactile, every interaction glows
                with clarity, and the builder celebrates your creativity.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-2">
              {FEATURE_CARDS.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="relative overflow-hidden rounded-[28px] border border-electric-violet/30 bg-deep-indigo/70 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-electric-violet/20 via-transparent to-transparent opacity-80" />
                    <div className="relative space-y-4">
                      <span className="inline-flex items-center justify-center rounded-full bg-electric-violet/10 p-2 text-electric-violet">
                        <Icon size={20} />
                      </span>
                      <h3 className="text-xl font-semibold">{feature.title}</h3>
                      <p className="text-sm text-soft-gray">{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="relative z-10 px-6 pb-24 lg:pb-32">
            <div className="mx-auto max-w-6xl">
              <div className="text-center">
                <p className="text-sm uppercase tracking-[0.4em] text-luminous-teal">
                  How it works
                </p>
                <h2 className="mt-4 font-spaceGrotesk text-3xl sm:text-4xl lg:text-5xl">
                  Every step glows with guidance.
                </h2>
                <p className="mt-3 text-soft-gray">
                  A glowing line of intent walks you through concept, creation,
                  and deployment.
                </p>
              </div>

              <div className="relative mt-16">
                <div className="pointer-events-none absolute left-1/2 top-0 hidden h-full w-1 -translate-x-1/2 rounded-full bg-gradient-to-b from-electric-violet to-luminous-teal opacity-30 md:block" />
                <div className="grid gap-10 md:grid-cols-3">
                  {HOW_IT_WORKS.map((step, index) => {
                    const StepIcon = step.icon;
                    return (
                      <div
                        key={step.title}
                        className="relative rounded-[30px] border border-luminous-teal/40 bg-midnight/70 p-6 shadow-[0_20px_45px_rgba(0,0,0,0.6)]"
                      >
                        <span className="text-xs uppercase tracking-[0.4em] text-soft-gray">
                          Step {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className="mt-4 flex items-center gap-3">
                          <span className="rounded-full border border-electric-violet/30 p-3 text-electric-violet">
                            <StepIcon size={18} />
                          </span>
                          <h3 className="font-spaceGrotesk text-lg font-semibold">
                            {step.title}
                          </h3>
                        </div>
                        <p className="mt-4 text-sm text-soft-gray">
                          {step.detail}
                        </p>
                        <div className="pointer-events-none absolute -right-6 top-6 h-16 w-16 rounded-full bg-electric-violet/10 blur-3xl" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="relative z-10 px-6 pb-24">
            <div className="mx-auto max-w-4xl text-center">
              <h2 className="font-spaceGrotesk text-3xl sm:text-4xl lg:text-5xl">
                From idea to intelligent bot in minutes.
              </h2>
              <p className="mt-4 text-soft-gray">
                BuildMyBot.App is your confident partner. We guide you with
                encouraging prompts, strong defaults, and joyful motion across
                every click.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-4">
                <button
                  type="button"
                  onClick={onLogin}
                  className="flex items-center justify-center gap-2 rounded-full bg-electric-violet px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(138,43,226,0.4)]"
                >
                  Start building for free
                  <ArrowRight size={18} />
                </button>
                <button
                  type="button"
                  onClick={partnerAction}
                  className="flex items-center justify-center gap-2 rounded-full border border-luminous-teal px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-luminous-teal transition hover:shadow-[0_0_30px_rgba(0,245,212,0.4)]"
                >
                  Explore the neon builder
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
};
