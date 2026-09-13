import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';
import { KIND_LABELS, type SmsProgram } from '../../shared/sms';
import { SmsProgramForm } from './SmsProgramForm';

type ProgramRow = {
  id: string;
  name: string;
  kind: string;
  status: string;
  config?: SmsProgram;
};

/** Sends an authenticated request to an SMS programs endpoint. */
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

/** Displays tenant SMS programs and coordinates their editing and status changes. */
export const SmsProgramsPanel: React.FC<{
  seedDraft?: Partial<SmsProgram> | null;
  onSeedConsumed?: () => void;
}> = ({ seedDraft, onSeedConsumed }) => {
  const [rows, setRows] = useState<ProgramRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ProgramRow | 'new' | null>(null);
  const [template, setTemplate] = useState<Partial<SmsProgram> | undefined>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await smsFetch('/sms/programs');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load programs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (seedDraft) setEditing('new');
  }, [seedDraft]);

  const save = async (program: SmsProgram) => {
    setBusy(true);
    try {
      const id = editing && editing !== 'new' ? editing.id : null;
      await smsFetch(id ? `/sms/programs/${id}` : '/sms/programs', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(program),
      });
      setEditing(null);
      onSeedConsumed?.();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (
    row: ProgramRow,
    status: 'active' | 'paused' | 'draft',
  ) => {
    const config = (row.config || row) as SmsProgram;
    setBusy(true);
    setError('');
    try {
      await smsFetch(`/sms/programs/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...config, status }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status update failed');
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    const initial =
      editing === 'new'
        ? seedDraft || undefined
        : {
            ...(editing.config || (editing as unknown as SmsProgram)),
            id: editing.id,
          };
    return (
      <SmsProgramForm
        key={
          editing === 'new'
            ? `new-${seedDraft?.keyword || seedDraft?.name || 'blank'}`
            : editing.id
        }
        initial={initial}
        busy={busy}
        onCancel={() => {
          setEditing(null);
          onSeedConsumed?.();
        }}
        onSubmit={save}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Programs</h2>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white"
        >
          New program
        </button>
      </div>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          No programs yet — create a draft first.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">{row.name}</p>
                <p className="text-xs text-gray-500">
                  {(KIND_LABELS as Record<string, string>)[row.kind] ||
                    row.kind}{' '}
                  · {row.status}
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-indigo-600"
                onClick={() => setEditing(row)}
              >
                Edit
              </button>
              {row.status !== 'active' ? (
                <button
                  type="button"
                  disabled={busy}
                  className="text-sm text-emerald-700"
                  onClick={() => void setStatus(row, 'active')}
                >
                  Activate
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className="text-sm text-amber-700"
                  onClick={() => void setStatus(row, 'paused')}
                >
                  Pause
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
