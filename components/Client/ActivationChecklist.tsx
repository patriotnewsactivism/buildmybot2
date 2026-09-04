import { ArrowRight, Check, Circle, Loader2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';

interface ActivationStep {
  key: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
}

interface ActivationState {
  steps: ActivationStep[];
  completed: number;
  total: number;
  percent: number;
  activated: boolean;
}

/**
 * Six-step activation checklist, driven entirely by real account state from
 * GET /api/activation (never by local flags a refresh could lose).
 *
 * Hides itself once every step is done — a permanently-visible checklist of
 * ticks is noise, and the dashboard is the wrong place for a trophy case.
 */
export const ActivationChecklist: React.FC<{ onNavigate?: (href: string) => void }> = ({
  onNavigate,
}) => {
  const [state, setState] = useState<ActivationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/activation', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-6 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Checking your setup…</span>
      </div>
    );
  }

  if (!state || state.activated || dismissed) return null;

  const go = (href: string) => {
    if (onNavigate) onNavigate(href);
    else window.location.assign(href);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Finish setting up your AI assistant
          </h2>
          <p className="text-sm text-slate-500">
            {state.completed} of {state.total} steps done — the last steps are
            where the bot starts paying for itself.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          Hide
        </button>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${state.percent}%` }}
        />
      </div>

      <ul className="mt-4 divide-y divide-slate-100">
        {state.steps.map((step) => (
          <li
            key={step.key}
            className="flex items-center gap-3 py-3"
            data-testid={`activation-step-${step.key}`}
          >
            {step.done ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100">
                <Check className="h-4 w-4 text-green-600" />
              </span>
            ) : (
              <Circle className="h-6 w-6 shrink-0 text-slate-300" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium ${step.done ? 'text-slate-400 line-through' : 'text-slate-900'}`}
              >
                {step.label}
              </p>
              {!step.done && (
                <p className="text-xs text-slate-500">{step.description}</p>
              )}
            </div>
            {!step.done && (
              <button
                type="button"
                onClick={() => go(step.href)}
                className="flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                Do it <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ActivationChecklist;
