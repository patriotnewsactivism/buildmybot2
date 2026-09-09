import {
  Check,
  CheckCircle2,
  Copy,
  Dumbbell,
  Flame,
  Gift,
  Palette,
  Smartphone,
  Sparkles,
  Trophy,
  Tv,
  Wrench,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../services/apiConfig';

const EXAMPLES = [
  {
    id: 'bbq',
    category: 'Restaurant & Hospitality',
    businessName: 'The Rusty Oak Smokehouse',
    tagline: 'Slow-Smoked Texas BBQ',
    icon: Flame,
    gradient: 'from-amber-600 to-orange-700',
    keyword: 'BBQGIFT',
    headline: 'LUNCH ON US TODAY?',
    reward: 'A free order of smoked brisket queso',
    prize: 'A $150 monthly Pitmaster Feast',
    placement: 'Countertop kiosk / table tent',
  },
  {
    id: 'spa',
    category: 'Salon & Wellness',
    businessName: 'Lumière Aesthetics & MedSpa',
    tagline: 'Luxury Skin & Wellness',
    icon: Sparkles,
    gradient: 'from-rose-500 to-purple-600',
    keyword: 'GLOWVIP',
    headline: 'GET YOUR GLOW BACK',
    reward: 'A $25 voucher toward your next facial',
    prize: 'A $350 deluxe spa day package',
    placement: 'Reception TV / waiting lounge',
  },
  {
    id: 'gym',
    category: 'Gym & Athletics',
    businessName: 'IronPeak Athletic Club',
    tagline: 'Strength & Conditioning',
    icon: Dumbbell,
    gradient: 'from-teal-600 to-cyan-700',
    keyword: 'PEAKPASS',
    headline: 'CRUSH YOUR NEXT GOAL',
    reward: 'A free 7-day pass and recovery smoothie',
    prize: 'A one-year gym membership',
    placement: 'Lobby display / pro shop screen',
  },
  {
    id: 'auto',
    category: 'Automotive Care',
    businessName: 'Apex Precision Auto Care',
    tagline: 'Certified Service & Repair',
    icon: Wrench,
    gradient: 'from-blue-600 to-indigo-600',
    keyword: 'SAVE20',
    headline: 'SAVE ON SERVICE TODAY',
    reward: 'A $20 credit on an eligible oil or brake service',
    prize: 'A set of four all-season tires',
    placement: 'Service counter / waiting room TV',
  },
];
const NUMBER = '+13466460065';
const DISPLAY_NUMBER = '(346) 646-0065';
export function DigitalSignageShowcase() {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [liveSms, setLiveSms] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let mounted = true;
    fetch(`${API_BASE}/corporate-phone`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (mounted) setLiveSms(s?.smsReady === true && s.number === NUMBER);
      })
      .catch(() => {});
    return () => {
      mounted = false;
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);
  const copy = async (keyword: string, id: string) => {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(
        `Demo example: text ${keyword} to ${DISPLAY_NUMBER}. Sample offer only; no reward or contest entry is issued.`,
      );
      setCopied(id);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 2500);
    } catch {
      setCopyError(
        `Copy unavailable. Demo keyword: ${keyword}. Number: ${DISPLAY_NUMBER}.`,
      );
    }
  };
  return (
    <section
      id="digital-signage"
      className="relative overflow-hidden border-t border-slate-800 bg-slate-900 py-20 text-slate-100"
    >
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-blue-300">
            <Tv size={15} /> In-store customer connections
          </div>
          <h2 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
            Turn foot traffic into repeat buyers with{' '}
            <span className="text-sky-300">digital signage.</span>
          </h2>
          <p className="mt-5 text-slate-400">
            Put your SMS opt-in on counter tablets, TVs, and table tents.
            Customers text a keyword to your business number to request an offer
            or enter an eligible giveaway.
          </p>
        </div>
        <div className="mb-12 flex flex-col gap-6 rounded-2xl border border-blue-500/30 bg-slate-950/50 p-6 sm:p-8 lg:flex-row lg:items-center">
          <Palette className="h-12 w-12 shrink-0 text-blue-300" />
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-300">
              Included free with every SMS package
            </p>
            <h3 className="mt-2 text-xl font-bold">
              Complimentary custom digital sign design
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Our team will tailor print-and-screen-ready signs with your logo,
              business colors, QR codes, and opt-in keywords at no additional
              charge. Bring your offer; we’ll help it look right on screen and
              in store.
            </p>
          </div>
          <ul className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-1">
            {[
              'High-resolution TV displays',
              'Counter tablets',
              'Table tents',
              'QR codes and opt-in keywords',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-sky-300" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="mb-6 text-center text-sm text-slate-400">
          Illustrative brands and offers. These demos do not issue rewards,
          enroll subscribers, or enter a real contest.
        </p>
        <div className="grid gap-8 md:grid-cols-2">
          {EXAMPLES.map((sign) => {
            const Icon = sign.icon;
            return (
              <article
                key={sign.id}
                className="flex flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 shadow-xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-5 py-3 text-[11px] text-slate-400">
                  <span className="font-mono uppercase">
                    Sign preview · {sign.placement}
                  </span>
                  <span>{sign.category}</span>
                </div>
                <div className="flex flex-1 flex-col p-6 sm:p-8">
                  <div className="mb-6 flex items-center gap-3 border-b border-slate-800 pb-5">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${sign.gradient}`}
                    >
                      <Icon size={25} />
                    </div>
                    <div>
                      <h4 className="font-bold leading-snug">
                        {sign.businessName}
                      </h4>
                      <p className="mt-1 text-xs text-slate-400">
                        {sign.tagline}
                      </p>
                    </div>
                  </div>
                  <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Example VIP offer
                  </p>
                  <h3 className="mb-6 mt-2 text-center text-2xl font-black leading-tight sm:text-3xl">
                    {sign.headline}
                  </h3>
                  <div className="mb-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                      <Gift className="mb-2 text-sky-300" size={21} />
                      <p className="text-xs font-bold uppercase text-sky-300">
                        Get something
                      </p>
                      <p className="mt-2 text-sm text-slate-200">
                        {sign.reward}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                      <Trophy className="mb-2 text-amber-300" size={21} />
                      <p className="text-xs font-bold uppercase text-amber-300">
                        Enter to win
                      </p>
                      <p className="mt-2 text-sm text-slate-200">
                        {sign.prize}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto rounded-2xl border border-blue-500/40 bg-blue-950/30 p-5 text-center">
                    <p className="mb-3 inline-flex items-center gap-2 text-xs text-slate-300">
                      <Smartphone size={16} /> Example text-to-join sign
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <strong className="rounded-lg bg-blue-600 px-3 py-2 font-mono text-xl">
                        {sign.keyword}
                      </strong>
                      <span className="text-sm">to</span>
                      <strong className="font-mono text-lg text-sky-300">
                        {DISPLAY_NUMBER}
                      </strong>
                    </div>
                    <p className="mt-3 text-[11px] text-slate-400">
                      Your custom sign uses your approved business number and
                      offer.
                    </p>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setSelected(selected === sign.id ? null : sign.id)
                      }
                      aria-expanded={selected === sign.id}
                      aria-controls={`preview-${sign.id}`}
                      className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold hover:bg-slate-700"
                    >
                      Preview the reply
                    </button>
                    <button
                      type="button"
                      onClick={() => void copy(sign.keyword, sign.id)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs"
                    >
                      {copied === sign.id ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}{' '}
                      {copied === sign.id ? 'Copied' : 'Copy demo keyword'}
                    </button>
                    {liveSms && (
                      <a
                        href={`sms:${NUMBER}?body=${sign.keyword}`}
                        className="rounded-lg border border-blue-500/40 px-3 py-2 text-xs text-sky-300"
                      >
                        Text this demo
                      </a>
                    )}
                  </div>
                  {selected === sign.id && (
                    <div
                      id={`preview-${sign.id}`}
                      className="mt-4 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300"
                      aria-live="polite"
                    >
                      <p className="mb-2 text-[10px] font-bold uppercase text-sky-300">
                        Example reply · no message sent
                      </p>
                      <p>
                        {sign.businessName}: Thanks for joining our demo! Your
                        sample reward is {sign.reward.toLowerCase()}. A real
                        campaign can also confirm entry for{' '}
                        {sign.prize.toLowerCase()}. Reply STOP to stop or HELP
                        for help.
                      </p>
                    </div>
                  )}
                  <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
                    Sample design only. Live campaigns use their own offer
                    terms, eligibility, entry dates, official rules, and consent
                    language. Message and data rates may apply. STOP to stop;
                    HELP for help.
                  </p>
                </div>
              </article>
            );
          })}
        </div>
        {copyError && (
          <p role="status" className="mt-4 text-center text-sm text-amber-300">
            {copyError}
          </p>
        )}
        <div className="mt-12 space-y-3 text-center">
          <p className="text-sm text-slate-300">
            {liveSms ? (
              <a
                href={`sms:${NUMBER}?body=DEMO`}
                className="font-semibold text-sky-300"
              >
                Text DEMO or WINNER to {DISPLAY_NUMBER} for a sample reply.
              </a>
            ) : (
              'Explore the previews above. Live SMS demos will appear after carrier activation.'
            )}
          </p>
          <p className="text-xs text-slate-400">
            BuildMyBot.App developer contact:{' '}
            <a href="tel:+18328804970" className="text-slate-200 underline">
              (832) 880-4970
            </a>
          </p>
          <a
            href="#pricing"
            className="inline-flex rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-500"
          >
            Explore SMS packages
          </a>
        </div>
      </div>
    </section>
  );
}
