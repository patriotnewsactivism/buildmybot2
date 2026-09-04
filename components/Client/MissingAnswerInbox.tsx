import { AlertTriangle, Check, Loader2, Send } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

interface InboxItem {
  id: string;
  botId: string;
  question: string;
  answer: string;
  reason: string | null;
  confidence: number | null;
  feedback: 'up' | 'down' | null;
  channel: string;
  createdAt: string;
}

interface InboxResponse {
  items: InboxItem[];
  summary: { open: number; resolved: number; total: number };
}

const REASON_LABEL: Record<string, string> = {
  no_knowledge: 'Nothing in your knowledge base matched',
  deflected: 'Bot said it didn’t know',
  thin_answer: 'Answer was very short',
  negative_feedback: 'Visitor gave it a thumbs down',
};

/**
 * The missing-answer inbox: every question the bot fumbled, with a box to
 * type the right answer. Submitting a correction appends it to the bot's
 * knowledge base, so this list is the fastest training loop in the product —
 * not a read-only report.
 */
export const MissingAnswerInbox: React.FC = () => {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/answers?status=open', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setError('Could not load the inbox.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const submit = async (item: InboxItem) => {
    const answer = (drafts[item.id] || '').trim();
    if (!answer) return;
    setSaving(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/answers/${item.id}/resolve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      });
      if (!res.ok) throw new Error('failed');
      // Drop the row locally instead of refetching: the owner is mid-triage
      // and a full reload would lose their place in the list.
      setData((prev) =>
        prev
          ? {
              items: prev.items.filter((i) => i.id !== item.id),
              summary: {
                ...prev.summary,
                open: Math.max(0, prev.summary.open - 1),
                resolved: prev.summary.resolved + 1,
              },
            }
          : prev,
      );
    } catch {
      setError('Could not save that correction. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 p-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading missing answers…
      </div>
    );
  }

  if (!data) return null;

  if (!data.items.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          <Check className="w-4 h-4 text-emerald-500" /> No missing answers
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Every question your bot has been asked was answered from your
          knowledge base.
          {data.summary.resolved > 0 &&
            ` You’ve corrected ${data.summary.resolved} so far.`}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Questions your bot couldn’t answer
        </h3>
        <span className="text-xs text-slate-500">
          {data.summary.open} open · {data.summary.resolved} fixed
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Answer one and it’s added to your bot’s knowledge — it won’t miss that
        question again.
      </p>

      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}

      <div className="space-y-4">
        {data.items.map((item) => (
          <div
            key={item.id}
            className="border border-slate-200 rounded-lg p-3 bg-slate-50/60"
          >
            <div className="text-sm font-medium text-slate-800">
              “{item.question}”
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {REASON_LABEL[item.reason || ''] || 'Low confidence answer'} ·{' '}
              {new Date(item.createdAt).toLocaleDateString()} · {item.channel}
            </div>
            {item.answer && (
              <div className="text-xs text-slate-400 mt-2 line-clamp-3">
                Bot said: {item.answer}
              </div>
            )}
            <div className="mt-3 flex items-start gap-2">
              <textarea
                value={drafts[item.id] || ''}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [item.id]: e.target.value }))
                }
                placeholder="The correct answer…"
                rows={2}
                className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                disabled={saving === item.id || !(drafts[item.id] || '').trim()}
                onClick={() => submit(item)}
                className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-40 flex items-center gap-1.5"
              >
                {saving === item.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Teach
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MissingAnswerInbox;
