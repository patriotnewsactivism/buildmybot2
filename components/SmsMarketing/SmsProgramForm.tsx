import type React from 'react';
import { useMemo, useState } from 'react';
import {
  KIND_LABELS,
  SYSTEM_KEYWORDS,
  type SmsProgram,
  programSchema,
  smsSegments,
} from '../../shared/sms';

const KINDS: SmsProgram['kind'][] = [
  'campaign',
  'keyword',
  'welcome',
  'after_hours',
  'sequence',
  'contest',
  'birthday',
];

function isoToLocalInput(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

/** Creates the initial editable values for a program of the requested kind. */
const emptyFor = (kind: SmsProgram['kind']): Partial<SmsProgram> => ({
  name: '',
  kind,
  status: 'draft',
  text: '',
  keyword: undefined,
  steps: kind === 'sequence' ? [{ delayMinutes: 60, text: '' }] : [],
  winnerCount: 1,
});

type Props = {
  initial?: Partial<SmsProgram> & { id?: string };
  onSubmit: (program: SmsProgram) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
};

/** Renders and validates the editor used to create or update an SMS program. */
export const SmsProgramForm: React.FC<Props> = ({
  initial,
  onSubmit,
  onCancel,
  busy,
}) => {
  const [form, setForm] = useState<Partial<SmsProgram>>(() => ({
    ...emptyFor(initial?.kind || 'campaign'),
    ...initial,
  }));
  const [error, setError] = useState('');

  const segments = useMemo(() => smsSegments(form.text || ''), [form.text]);

  const set = <K extends keyof SmsProgram>(key: K, value: SmsProgram[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const needsKeyword = ['keyword', 'sequence', 'contest', 'birthday'].includes(
    form.kind || '',
  );

  const handleSave = async () => {
    setError('');
    const parsed = programSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    if (parsed.data.keyword && SYSTEM_KEYWORDS.has(parsed.data.keyword)) {
      setError('This keyword is reserved');
      return;
    }
    try {
      await onSubmit(parsed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Name</span>
          <input
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.name || ''}
            onChange={(e) => set('name', e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Kind</span>
          <select
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.kind}
            onChange={(e) => {
              const kind = e.target.value as SmsProgram['kind'];
              setForm({ ...emptyFor(kind), name: form.name });
            }}
            disabled={Boolean(initial?.id)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {needsKeyword && (
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Keyword</span>
          <input
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm uppercase"
            value={form.keyword || ''}
            onChange={(e) =>
              set(
                'keyword',
                e.target.value.toUpperCase() as SmsProgram['keyword'],
              )
            }
            placeholder="JOIN"
          />
        </label>
      )}

      <label className="block text-sm">
        <span className="font-medium text-gray-700">
          Message ({segments} segment{segments === 1 ? '' : 's'})
        </span>
        <textarea
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          rows={4}
          value={form.text || ''}
          onChange={(e) => set('text', e.target.value)}
          placeholder="Hi {{name}} — thanks for joining!"
        />
      </label>

      {form.kind === 'sequence' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Steps</p>
          {(form.steps || []).map((step, idx) => (
            <div key={idx} className="grid gap-2 sm:grid-cols-[120px_1fr]">
              <input
                type="number"
                min={1}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={step.delayMinutes}
                onChange={(e) => {
                  const steps = [...(form.steps || [])];
                  steps[idx] = {
                    ...steps[idx],
                    delayMinutes: Number(e.target.value),
                  };
                  set('steps', steps);
                }}
                placeholder="Delay min"
              />
              <input
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={step.text}
                onChange={(e) => {
                  const steps = [...(form.steps || [])];
                  steps[idx] = { ...steps[idx], text: e.target.value };
                  set('steps', steps);
                }}
                placeholder="Step text"
              />
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-medium text-indigo-600"
            onClick={() =>
              set('steps', [
                ...(form.steps || []),
                { delayMinutes: 1440, text: '' },
              ])
            }
          >
            + Add step
          </button>
        </div>
      )}

      {form.kind === 'contest' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Opens at</span>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                value={isoToLocalInput(form.opensAt)}
                onChange={(e) => set('opensAt', localInputToIso(e.target.value))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Closes at</span>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                value={isoToLocalInput(form.closesAt)}
                onChange={(e) =>
                  set('closesAt', localInputToIso(e.target.value))
                }
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Prize</span>
            <input
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={form.prize || ''}
              onChange={(e) => set('prize', e.target.value)}
              placeholder="One $50 gift card"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Eligibility</span>
            <textarea
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={2}
              value={form.eligibility || ''}
              onChange={(e) => set('eligibility', e.target.value)}
              placeholder="18+, one entry per person, no purchase necessary"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Official rules URL</span>
              <input
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={form.rulesUrl || ''}
                onChange={(e) => set('rulesUrl', e.target.value)}
                placeholder="https://example.com/rules"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Free-entry URL</span>
              <input
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={form.entryUrl || ''}
                onChange={(e) => set('entryUrl', e.target.value)}
                placeholder="https://example.com/enter"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Winner text</span>
            <textarea
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={2}
              value={form.winnerText || ''}
              onChange={(e) => set('winnerText', e.target.value)}
              placeholder="{{business}}: you were selected. Reply here for prize-claim instructions. STOP to stop."
            />
          </label>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSave()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save draft'}
        </button>
      </div>
    </div>
  );
};
