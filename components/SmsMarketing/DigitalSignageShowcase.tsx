import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Palette,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../../services/apiConfig';

export const SMS_SIGN_SAMPLES = [
  {
    id: 'boutique',
    src: '/sms-signs/urban-bloom-boutique.jpg',
    businessName: 'Urban Bloom Boutique',
    category: 'Retail & fashion',
    keyword: 'BLOOM',
    incentive: 'Win $100 every month',
    idea: 'A monthly VIP drawing — one keyword, automatic entry, repeat visits.',
    alt: 'Urban Bloom Boutique poster inviting shoppers to text BLOOM to 346-646-0065 to join a VIP text club and enter a $100 monthly drawing.',
  },
  {
    id: 'coffee',
    src: '/sms-signs/main-street-coffee.jpg',
    businessName: 'Main Street Coffee',
    category: 'Cafés & hospitality',
    keyword: 'COFFEE',
    incentive: 'Free coffee, instantly',
    idea: 'A first-visit reward that turns a walk-in into a regular before they leave the counter.',
    alt: 'Main Street Coffee poster inviting guests to text COFFEE to 346-646-0065 for a free coffee through the VIP text club.',
  },
  {
    id: 'medspa',
    src: '/sms-signs/glow-med-spa.jpg',
    businessName: 'Glow Med Spa',
    category: 'Med spa & wellness',
    keyword: 'GLOW',
    incentive: '$25 off your first visit',
    idea: 'A high-ticket welcome offer delivered by text — exclusive, early, and on-brand.',
    alt: 'Glow Med Spa poster inviting clients to text GLOW to 346-646-0065 for $25 off a first visit and VIP beauty offers.',
  },
  {
    id: 'pizza',
    src: '/sms-signs/bella-slice-pizza.jpg',
    businessName: 'Bella Slice Pizza',
    category: 'Restaurants',
    keyword: 'PIZZA',
    incentive: 'Free appetizer',
    idea: 'An irresistible table-tent offer: text once, get a reward, come back hungry.',
    alt: 'Bella Slice Pizza poster inviting diners to text PIZZA to 346-646-0065 for a free appetizer from the VIP text club.',
  },
] as const;

const NUMBER = '+13466460065';
const DISPLAY_NUMBER = '(346) 646-0065';

export const SIGN_STUDIO_BENEFIT =
  'Active SMS Marketing clients receive complimentary custom digital sign design — up to 3 unique designs each month — for as long as they remain a client.';

type ShowcaseVariant = 'full' | 'mosaic' | 'studio';

export function DigitalSignageShowcase({
  variant = 'full',
}: {
  variant?: ShowcaseVariant;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [liveSms, setLiveSms] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

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

  const step = (delta: number) => {
    setActiveId((current) => {
      const index = SMS_SIGN_SAMPLES.findIndex((sign) => sign.id === current);
      const next =
        (index + delta + SMS_SIGN_SAMPLES.length) % SMS_SIGN_SAMPLES.length;
      return SMS_SIGN_SAMPLES[next].id;
    });
  };

  useEffect(() => {
    if (!activeId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveId(null);
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [activeId]);

  const activeIndex = SMS_SIGN_SAMPLES.findIndex(
    (sign) => sign.id === activeId,
  );
  const active = activeIndex >= 0 ? SMS_SIGN_SAMPLES[activeIndex] : null;

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

  const gallery = (
    <div
      className={
        variant === 'full'
          ? 'grid gap-5 sm:grid-cols-2 xl:grid-cols-4'
          : 'grid grid-cols-2 gap-3 sm:gap-4'
      }
    >
      {SMS_SIGN_SAMPLES.map((sign, index) => (
        <button
          key={sign.id}
          type="button"
          onClick={() => setActiveId(sign.id)}
          className="group relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-slate-950 text-left shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)] transition duration-500 hover:-translate-y-1 hover:border-amber-300/40 hover:shadow-[0_32px_90px_-28px_rgba(212,175,55,0.35)]"
        >
          <span className="pointer-events-none absolute inset-0 rounded-[1.35rem] ring-1 ring-inset ring-white/10" />
          <img
            src={sign.src}
            alt={sign.alt}
            width={1103}
            height={1426}
            loading={index < 2 ? 'eager' : 'lazy'}
            decoding="async"
            className="aspect-[4/5] w-full object-cover transition duration-700 group-hover:scale-[1.03]"
          />
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-3 sm:p-4">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-200/90">
              {sign.category}
            </span>
            <span className="mt-1 block text-sm font-bold text-white sm:text-base">
              {sign.incentive}
            </span>
            <span className="mt-1 hidden font-mono text-xs text-white/80 sm:block">
              TEXT {sign.keyword}
            </span>
          </span>
        </button>
      ))}
    </div>
  );

  const lightbox = active ? (
    <dialog
      open
      className="fixed inset-0 z-[80] m-0 flex h-full max-h-none w-full max-w-none items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-8"
      aria-label={`${active.businessName} sign preview`}
      onClick={() => setActiveId(null)}
    >
      <button
        type="button"
        ref={closeButtonRef}
        onClick={() => setActiveId(null)}
        className="absolute right-4 top-4 rounded-full border border-white/15 bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Close sign preview"
      >
        <X size={18} />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          step(-1);
        }}
        className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/15 bg-white/10 p-2 text-white hover:bg-white/20 sm:inline-flex"
        aria-label="Previous sign"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          step(1);
        }}
        className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/15 bg-white/10 p-2 text-white hover:bg-white/20 sm:inline-flex"
        aria-label="Next sign"
      >
        <ChevronRight size={22} />
      </button>
      <figure
        className="max-h-[92vh] w-full max-w-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <img
          src={active.src}
          alt={active.alt}
          className="max-h-[78vh] w-full rounded-2xl object-contain shadow-2xl"
        />
        <figcaption className="mt-4 text-center text-sm text-slate-200">
          <span className="font-semibold text-white">
            {active.businessName}
          </span>
          {' — '}
          {active.idea}
        </figcaption>
      </figure>
    </dialog>
  ) : null;

  if (variant === 'mosaic') {
    return (
      <div>
        {gallery}
        <p className="mt-4 text-center text-xs leading-relaxed text-white/70">
          Sample campaigns for boutique, café, med spa, and restaurant — the
          same caliber of sign we design for your business.
        </p>
        {lightbox}
      </div>
    );
  }

  if (variant === 'studio') {
    return (
      <section className="overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 p-5 text-white shadow-xl sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-200">
              <Palette size={14} /> Complimentary creative studio
            </p>
            <h2 className="mt-2 text-lg font-black tracking-tight sm:text-xl">
              Free digital sign design while you remain a client
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              {SIGN_STUDIO_BENEFIT} Print, TV, counter, and table-tent files —
              branded, keyword-ready, and built around your offer.
            </p>
          </div>
          <Link
            to="/sms-marketing#digital-signage"
            className="shrink-0 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-xs font-bold text-amber-100 hover:bg-amber-300/20"
          >
            View sample signs
          </Link>
        </div>
        {gallery}
        {lightbox}
      </section>
    );
  }

  return (
    <section
      id="digital-signage"
      className="relative overflow-hidden border-t border-white/10 bg-[#07090f] py-24 text-white"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(212,175,55,0.16),transparent_32%),radial-gradient(circle_at_90%_18%,rgba(244,114,182,0.12),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.12),transparent_34%)]" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">
            <Sparkles size={14} /> Complimentary creative studio
          </div>
          <h2 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Signs that stop foot traffic.
            <span className="block bg-gradient-to-r from-amber-200 via-white to-rose-200 bg-clip-text text-transparent">
              Keywords that start conversations.
            </span>
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            These are the caliber of in-store posters we produce for SMS clients
            — boutique, café, med spa, restaurant. Your offer. Your brand. Your
            keyword. Designed to look inevitable on a counter, a window, or a
            65-inch lobby display.
          </p>
        </div>

        <div className="mb-12 overflow-hidden rounded-[2rem] border border-amber-300/20 bg-gradient-to-br from-amber-950/40 via-slate-950/80 to-slate-950 p-6 sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-200">
                Included with every SMS Marketing plan
              </p>
              <h3 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Free digital sign design.
                <span className="block text-amber-100">
                  Three originals, every month.
                </span>
              </h3>
              <p className="mt-4 max-w-2xl text-base leading-8 text-slate-300">
                {SIGN_STUDIO_BENEFIT} Bring the offer — a drawing, a first-visit
                gift, a free appetizer — and we tailor print-ready and
                screen-ready artwork to your logo, colors, keyword, and number.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                'Up to 3 unique designs / month',
                'Yours for as long as you stay a client',
                'TV, tablet, window & table-tent files',
                'Keywords, QR, and compliance footer',
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100"
                >
                  <CheckCircle2
                    size={18}
                    className="mt-0.5 shrink-0 text-amber-300"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {gallery}

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {SMS_SIGN_SAMPLES.map((sign) => (
            <article
              key={`${sign.id}-idea`}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200/90">
                Incentive idea
              </p>
              <h3 className="mt-2 font-bold text-white">{sign.businessName}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {sign.idea}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copy(sign.keyword, sign.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
                >
                  {copied === sign.id ? (
                    <Check size={13} />
                  ) : (
                    <Copy size={13} />
                  )}
                  {copied === sign.id ? 'Copied' : `Copy ${sign.keyword}`}
                </button>
                {liveSms && (
                  <a
                    href={`sms:${NUMBER}?body=${sign.keyword}`}
                    className="rounded-lg border border-amber-300/30 px-3 py-1.5 text-xs font-semibold text-amber-100"
                  >
                    Text this demo
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>

        {copyError && (
          <output className="mt-4 block text-center text-sm text-amber-300">
            {copyError}
          </output>
        )}

        <p className="mx-auto mt-10 max-w-3xl text-center text-xs leading-6 text-slate-500">
          Sample artwork for illustration. These demos do not issue rewards,
          enroll subscribers, or enter a real contest. Live campaigns use your
          approved number, offer terms, eligibility, and consent language.
          Message and data rates may apply. Text STOP to stop; HELP for help.
        </p>
      </div>
      {lightbox}
    </section>
  );
}
