import { useState } from 'react';
import { CAMPAIGN_IDEAS, campaignDraft } from '../../shared/sms-campaign-ideas';
import { type SmsProgram, smsSegments } from '../../shared/sms';

export function SmsCampaignIdeas({
  onUseTemplate,
}: {
  onUseTemplate?: (draft: Partial<SmsProgram>) => void;
}) {
  const [selected, setSelected] = useState(CAMPAIGN_IDEAS[0]);
  const [visible, setVisible] = useState(1);
  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
      aria-label="Campaign ideas and message demo"
    >
      <div className="bg-slate-950 p-6 text-white sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">
          Seeing is believing
        </p>
        <h2 className="mt-2 text-2xl font-bold">
          A sign starts it. Your business takes it from there.
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Explore the customer journey from keyword to reply, repeat visit or
          booking. These are simulated examples; no texts are sent.
        </p>
        <div
          className="mt-5 flex flex-wrap gap-2"
          aria-label="Choose a business example"
        >
          {CAMPAIGN_IDEAS.map((idea) => (
            <button
              type="button"
              key={idea.id}
              aria-pressed={selected.id === idea.id}
              onClick={() => {
                setSelected(idea);
                setVisible(1);
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                selected.id === idea.id
                  ? 'bg-emerald-300 text-slate-950'
                  : 'bg-slate-800 text-white hover:bg-slate-700'
              }`}
            >
              {idea.audience}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[0.8fr_1fr_1fr]">
        <img
          src={selected.image}
          alt={`${selected.audience} example poster. Printed offers and number are demonstration content.`}
          width={1103}
          height={1426}
          className="mx-auto w-full max-w-64 rounded-xl object-contain shadow-md"
          loading="lazy"
        />
        <div className="min-w-0 space-y-4">
          <h3 className="text-xl font-bold text-slate-900">{selected.title}</h3>
          <p className="text-sm text-slate-600">{selected.goal}</p>
          {(
            [
              ['Put it where people see it', selected.placement],
              ['The next visit', selected.followUp],
              ['Measure what matters', selected.measure],
            ] as const
          ).map(([title, body]) => (
            <div key={title}>
              <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
              <p className="mt-1 text-sm text-slate-600">{body}</p>
            </div>
          ))}
          {onUseTemplate && (
            <button
              type="button"
              onClick={() => onUseTemplate(campaignDraft(selected))}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Customize this draft
            </button>
          )}
          <p className="text-xs text-slate-500">
            Use your assigned number and approved offer terms before printing.
            Contest entry and marketing consent are separate.
          </p>
        </div>
        <div className="min-w-0 rounded-3xl border-4 border-slate-800 bg-slate-50 p-4">
          <p className="border-b border-slate-200 pb-3 text-center text-sm font-semibold text-slate-800">
            Your business number{' '}
            <span className="block text-xs font-normal text-slate-500">
              Interactive simulation
            </span>
          </p>
          <div className="min-h-64 space-y-3 py-4" aria-live="polite">
            {selected.steps.slice(0, visible).map((message, index) => (
              <div
                key={`${selected.id}-${index}`}
                className={`w-fit max-w-[95%] rounded-2xl px-3 py-2 text-sm ${
                  message.from === 'customer'
                    ? 'ml-auto bg-indigo-600 text-white'
                    : 'bg-white text-slate-800 shadow-sm'
                }`}
              >
                <span className="mb-1 block text-[10px] font-semibold uppercase opacity-70">
                  {message.from}
                </span>
                {message.text}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setVisible(visible < selected.steps.length ? visible + 1 : 1)
            }
            className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          >
            {visible < selected.steps.length
              ? 'See what happens next'
              : 'Replay demo'}
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">
            Draft reply estimate:{' '}
            {smsSegments(selected.draft.text || '')} segments before
            personalization.
          </p>
        </div>
      </div>
    </section>
  );
}
