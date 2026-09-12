import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';
import { PURPOSES } from '../../shared/sms';

type Contact = {
  id: string;
  phone: string;
  name?: string;
  tags?: string[];
  consents?: string[];
  birth_month?: number | null;
  birth_day?: number | null;
  manual_takeover?: boolean;
  created_at?: string;
};

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

export const SmsContactsPanel: React.FC = () => {
  const [rows, setRows] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [consentSource, setConsentSource] = useState('dashboard_import');
  const [consents, setConsents] = useState<string[]>(['marketing']);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await smsFetch('/sms/contacts');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleConsent = (purpose: string) => {
    setConsents((prev) =>
      prev.includes(purpose)
        ? prev.filter((p) => p !== purpose)
        : [...prev, purpose],
    );
  };

  const addContact = async () => {
    setBusy(true);
    setError('');
    try {
      await smsFetch('/sms/contacts', {
        method: 'POST',
        body: JSON.stringify({
          phone,
          name,
          consents,
          consentSource,
          tags: [],
        }),
      });
      setPhone('');
      setName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add contact');
    } finally {
      setBusy(false);
    }
  };

  const setTakeover = async (id: string, manualTakeover: boolean) => {
    setBusy(true);
    setError('');
    try {
      await smsFetch(`/sms/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ manualTakeover }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Contacts</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm text-indigo-600"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Add contact</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Phone (+1…)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <input
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
            placeholder="Consent source (required)"
            value={consentSource}
            onChange={(e) => setConsentSource(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          {PURPOSES.map((purpose) => (
            <label key={purpose} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={consents.includes(purpose)}
                onChange={() => toggleConsent(purpose)}
              />
              {purpose}
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={busy || !phone.trim() || !consentSource.trim()}
          onClick={() => void addContact()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Add contact'}
        </button>
        <p className="text-xs text-gray-500">
          STOP / HELP / START are system keywords handled automatically — never
          overwrite opt-outs on import.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {rows.length === 0 && (
            <li className="px-4 py-6 text-sm text-gray-500">
              No contacts yet.
            </li>
          )}
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">
                  {row.name || 'Unnamed'} · {row.phone}
                </p>
                <p className="text-xs text-gray-500">
                  Consents: {(row.consents || []).join(', ') || 'none'}
                  {row.manual_takeover ? ' · manual takeover' : ''}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                className="text-xs text-indigo-600"
                onClick={() => void setTakeover(row.id, !row.manual_takeover)}
              >
                {row.manual_takeover ? 'Release AI' : 'Manual takeover'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
