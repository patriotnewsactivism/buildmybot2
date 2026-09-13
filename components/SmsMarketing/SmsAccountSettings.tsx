import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  SMS_MARKETING_PRICING,
  SMS_MARKETING_REGISTRATION_FEE,
} from '../../constants';
import { buildApiUrl } from '../../services/apiConfig';
import { SmsKnowledgePanel } from './SmsKnowledgePanel';

type Account = {
  business_name?: string;
  timezone?: string;
  spend_limit_micros?: number;
  ai_enabled?: boolean;
  knowledge_base_id?: string | null;
  quiet_start?: number;
  quiet_end?: number;
  ready?: boolean;
  paid_until?: string | null;
  plan_key?: string | null;
};

/** Sends an authenticated request to an SMS account endpoint. */
async function smsFetch(path: string, init?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** Renders billing, compliance, and delivery settings for an SMS account. */
export const SmsAccountSettings: React.FC = () => {
  const [account, setAccount] = useState<Account | null>(null);
  const [launchEnabled, setLaunchEnabled] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [spendLimit, setSpendLimit] = useState(50);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState('');
  const [quietStart, setQuietStart] = useState(9);
  const [quietEnd, setQuietEnd] = useState(20);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [bookingSecret, setBookingSecret] = useState<{
    secret: string;
    path: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await smsFetch('/sms/account');
      const a = (data.account || {}) as Account;
      setAccount(a);
      setLaunchEnabled(Boolean(data.launchEnabled));
      setBusinessName(a.business_name || '');
      setTimezone(a.timezone || 'America/Chicago');
      setSpendLimit(
        typeof a.spend_limit_micros === 'number'
          ? a.spend_limit_micros / 1_000_000
          : 50,
      );
      setAiEnabled(Boolean(a.ai_enabled));
      setKnowledgeBaseId(a.knowledge_base_id || '');
      setQuietStart(a.quiet_start ?? 9);
      setQuietEnd(a.quiet_end ?? 20);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load account');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await smsFetch('/sms/account', {
        method: 'PATCH',
        body: JSON.stringify({
          businessName,
          timezone,
          spendLimit,
          aiEnabled,
          knowledgeBaseId: knowledgeBaseId.trim() || null,
          quietStart,
          quietEnd,
        }),
      });
      setNotice('Settings saved.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const checkout = async (plan: string) => {
    setBusy(true);
    setError('');
    try {
      const data = await smsFetch('/sms/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('Checkout URL missing');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setBusy(false);
    }
  };

  const mintBookingSecret = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await smsFetch('/sms/booking-secret', { method: 'POST' });
      setBookingSecret({ secret: data.secret, path: data.path });
      setNotice(
        'Booking secret generated — copy it now; it won’t be shown again.',
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not mint booking secret',
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading account…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Account settings
        </h2>
        {account?.ready ? (
          <p className="text-xs text-emerald-700">
            Sender ready
            {account.paid_until
              ? ` · paid through ${new Date(account.paid_until).toLocaleDateString()}`
              : ''}
            {account.plan_key ? ` · ${account.plan_key}` : ''}
          </p>
        ) : (
          <p className="text-xs text-amber-700">
            Sender not ready yet — finish registration / approval before
            activating programs.
          </p>
        )}
        {!launchEnabled && (
          <p className="text-xs text-amber-700">
            SMS launch flag is off in this environment (`SMS_LAUNCH_ENABLED`).
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-gray-700">Business name</span>
            <input
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Timezone</span>
            <input
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/Chicago"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Spend limit ($)</span>
            <input
              type="number"
              min={0}
              max={1000}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={spendLimit}
              onChange={(e) => setSpendLimit(Number(e.target.value))}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">
              Quiet start (hour)
            </span>
            <input
              type="number"
              min={9}
              max={19}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={quietStart}
              onChange={(e) => setQuietStart(Number(e.target.value))}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Quiet end (hour)</span>
            <input
              type="number"
              min={10}
              max={20}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={quietEnd}
              onChange={(e) => setQuietEnd(Number(e.target.value))}
            />
          </label>
          <SmsKnowledgePanel
            businessName={businessName}
            knowledgeBaseId={knowledgeBaseId}
            aiEnabled={aiEnabled}
            onKnowledgeBaseId={setKnowledgeBaseId}
            onAiEnabled={setAiEnabled}
          />
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-amber-900">
            Compliance & consent
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-xs text-amber-900/90">
            <li>
              <strong>STOP</strong> opts the contact out of marketing SMS
              immediately. Never re-add without fresh consent.
            </li>
            <li>
              <strong>HELP</strong> returns your support info;{' '}
              <strong>START</strong> / <strong>UNSTOP</strong> re-opts in only
              when allowed by your brand rules.
            </li>
            <li>
              Quiet hours and spend limits above apply to automated sends.
              Manual inbox replies still respect opt-outs.
            </li>
            <li>
              Record a consent source whenever you import contacts or schedule
              reminders (Contacts & Appointments tabs).
            </li>
          </ul>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
        <h3 className="text-base font-semibold text-gray-900">Plan checkout</h3>
        <p className="text-xs text-gray-500">
          <s>${SMS_MARKETING_REGISTRATION_FEE.listPrice}</s>{' '}
          <span className="font-semibold text-gray-800">
            ${SMS_MARKETING_REGISTRATION_FEE.price}
          </span>{' '}
          registration — for a limited time only. Non-refundable.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {SMS_MARKETING_PRICING.map((plan) => (
            <button
              key={plan.planKey}
              type="button"
              disabled={busy}
              onClick={() => void checkout(plan.planKey)}
              className="rounded-md border border-gray-200 p-3 text-left hover:border-indigo-300 disabled:opacity-50"
            >
              <p className="text-sm font-semibold text-gray-900">{plan.name}</p>
              <p className="text-sm text-gray-600">${plan.price}/mo</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
        <h3 className="text-base font-semibold text-gray-900">
          Booking webhook
        </h3>
        <button
          type="button"
          disabled={busy}
          onClick={() => void mintBookingSecret()}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          Generate booking secret
        </button>
        {bookingSecret && (
          <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900 space-y-1 break-all">
            <p>
              <strong>Secret:</strong> {bookingSecret.secret}
            </p>
            <p>
              <strong>Path:</strong> {bookingSecret.path}
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}
    </div>
  );
};
