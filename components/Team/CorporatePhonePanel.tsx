import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../../services/apiConfig';
import { VoiceTeamEditor } from '../PhoneAgent/VoiceTeamEditor';
interface CallRow {
  id: number;
  called_number: string;
  status: string;
  metadata: { objective: string };
}
export function CorporatePhonePanel() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [phone, setPhone] = useState('');
  const [objective, setObjective] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceBotId, setVoiceBotId] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`${API_BASE}/corporate-phone/calls`, {
      credentials: 'include',
    });
    if (r.ok) {
      setAllowed(true);
      setCalls(await r.json());
      const team = await fetch(`${API_BASE}/corporate-phone/voice-team-bot`, {
        credentials: 'include',
      });
      if (team.ok) setVoiceBotId((await team.json()).botId);
    }
  }, []);
  useEffect(() => {
    void load().catch(() => {});
  }, [load]);
  const act = async (path: string, body: unknown) => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`${API_BASE}/corporate-phone/calls${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || 'Call request failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Call request failed');
    } finally {
      setBusy(false);
    }
  };
  if (!allowed) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
      <h3 className="font-bold text-lg">
        Corporate sales phone · (346) 646-0065
      </h3>
      <p className="text-sm text-slate-600">
        Inbound calls reach Reception, then the right AI specialist. Each
        outbound call needs your approval below. Approval places one call
        immediately, for up to 10 minutes.
      </p>
      {voiceBotId && <VoiceTeamEditor key={voiceBotId} botId={voiceBotId} />}
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act('', { phone, objective });
        }}
      >
        <label className="text-sm">
          Destination (+1 format)
          <input
            className="block border rounded p-2"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            pattern="\+1[2-9][0-9]{9}"
          />
        </label>
        <label className="text-sm flex-1">
          Call purpose
          <input
            className="block border rounded p-2 w-full"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            minLength={5}
            maxLength={1200}
            required
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="self-end rounded bg-slate-800 text-white px-4 py-2 disabled:opacity-50"
        >
          Create request
        </button>
      </form>
      {error && (
        <p role="alert" className="text-red-700 text-sm">
          {error}
        </p>
      )}
      {calls.map((call) => (
        <div key={call.id} className="border-t pt-3 space-y-2">
          <p className="font-medium">
            {call.called_number} · {call.status.replace(/_/g, ' ')}
          </p>
          <p className="text-sm text-slate-600">{call.metadata?.objective}</p>
          {call.status === 'awaiting_approval' && (
            <div className="flex gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(`/${call.id}/approve`, {
                    confirmPhone: call.called_number,
                  })
                }
                className="rounded bg-blue-700 text-white px-3 py-2 disabled:opacity-50"
              >
                Approve and call {call.called_number}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(`/${call.id}/reject`, {})}
                className="rounded border px-3 py-2"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
