import { Loader, Play, Save, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';
import {
  DEPARTMENT_IDS,
  DEPARTMENT_LABELS,
  LIVE_VOICES,
  type VoiceDepartment,
  type VoiceTeam,
  type VoiceTeamAgent,
  voiceTeamSchema,
} from '../../shared/voice-team';

export function VoiceTeamEditor({ botId }: { botId: string }) {
  const [team, setTeam] = useState<VoiceTeam | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState<VoiceDepartment | null>(null);
  const [dirty, setDirty] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  const previewId = useRef(0);
  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setTeam(null);
    setError('');
    setNotice('');
    setDirty(false);
    fetch(buildApiUrl(`/voice/team?botId=${encodeURIComponent(botId)}`), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || 'Could not load your Voice Team.');
        if (!controller.signal.aborted) {
          setTeam(voiceTeamSchema.parse(data.config));
          setRevision(data.revision);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e.message || 'Could not load your Voice Team.');
      });
    return () => {
      controller.abort();
      previewAbort.current?.abort();
      previewId.current++;
      stopAudio();
    };
  }, [botId, stopAudio]);
  const update = (
    department: VoiceDepartment,
    patch: Partial<VoiceTeamAgent>,
  ) => {
    setTeam((current) =>
      current
        ? { ...current, [department]: { ...current[department], ...patch } }
        : current,
    );
    setDirty(true);
    setNotice('');
  };
  const validation = team ? voiceTeamSchema.safeParse(team) : null;
  const validationErrors =
    validation && !validation.success ? validation.error.issues : [];
  const save = async () => {
    if (!validation?.success) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        buildApiUrl(`/voice/team?botId=${encodeURIComponent(botId)}`),
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: validation.data, revision }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Could not save your Voice Team.');
      setTeam(data.config);
      setRevision(data.revision);
      setDirty(false);
      setNotice('Voice Team saved. New calls will use these agents.');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not save your Voice Team.',
      );
    } finally {
      setSaving(false);
    }
  };
  const preview = async (department: VoiceDepartment) => {
    if (!team) return;
    previewAbort.current?.abort();
    stopAudio();
    const id = ++previewId.current;
    const controller = new AbortController();
    previewAbort.current = controller;
    setPreviewing(department);
    setError('');
    try {
      const response = await fetch(
        buildApiUrl(`/voice/team/preview?botId=${encodeURIComponent(botId)}`),
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(team[department]),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Voice preview unavailable.');
      }
      const blob = await response.blob();
      if (id !== previewId.current) return;
      objectUrl.current = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl.current);
      audioRef.current = audio;
      const finish = () => {
        if (id === previewId.current) {
          stopAudio();
          setPreviewing(null);
        }
      };
      audio.addEventListener('ended', finish, { once: true });
      audio.addEventListener(
        'error',
        () => {
          finish();
          setError('Could not play the voice preview.');
        },
        { once: true },
      );
      await audio.play();
    } catch (e) {
      if (!controller.signal.aborted && id === previewId.current) {
        stopAudio();
        setPreviewing(null);
        setError(e instanceof Error ? e.message : 'Voice preview unavailable.');
      }
    }
  };
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-5 md:p-6 space-y-5"
      aria-label="AI Voice Team"
    >
      <div className="flex items-start gap-3">
        <Users className="text-blue-700 mt-1" size={24} />
        <div>
          <h3 className="text-xl font-bold text-slate-900">AI Voice Team</h3>
          <p className="text-sm text-slate-600 mt-1">
            Four distinct agents. One shared conversation and business knowledge
            base.
          </p>
          <p className="text-sm text-slate-600 mt-1">
            Preview each opening and choose voices that sound clearly different.
            Changes apply to new phone calls.
          </p>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {!team && !error && (
        <output className="text-slate-600">Loading your Voice Team…</output>
      )}
      {team && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {DEPARTMENT_IDS.map((department) => {
              const agent = team[department];
              const issues = validationErrors.filter(
                (issue) => issue.path[0] === department,
              );
              return (
                <fieldset
                  key={department}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 p-4 space-y-3"
                >
                  <legend className="px-1 font-semibold text-slate-900">
                    {DEPARTMENT_LABELS[department]}
                  </legend>
                  <label className="block text-sm text-slate-700">
                    Agent name
                    <input
                      maxLength={60}
                      value={agent.name}
                      onChange={(e) =>
                        update(department, { name: e.target.value })
                      }
                      className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
                    />
                  </label>
                  <label className="block text-sm text-slate-700">
                    Voice
                    <select
                      value={agent.voice.voiceId}
                      onChange={(e) =>
                        update(department, {
                          voice: {
                            provider: 'gemini',
                            voiceId: e.target
                              .value as VoiceTeamAgent['voice']['voiceId'],
                          },
                        })
                      }
                      className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2"
                    >
                      {LIVE_VOICES.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.id} · {voice.description}
                        </option>
                      ))}
                    </select>
                  </label>
                  {issues.map((issue, index) => (
                    <p
                      key={`${String(issue.path[issue.path.length - 1])}-${index}`}
                      role="alert"
                      className="text-sm text-red-700"
                    >
                      {issue.message}
                    </p>
                  ))}
                  <label className="block text-sm text-slate-700">
                    Speaking style
                    <textarea
                      rows={3}
                      maxLength={600}
                      value={agent.speakingStyle}
                      onChange={(e) =>
                        update(department, { speakingStyle: e.target.value })
                      }
                      className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
                    />
                  </label>
                  <label className="block text-sm text-slate-700">
                    Opening message
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={agent.firstMessage}
                      onChange={(e) =>
                        update(department, { firstMessage: e.target.value })
                      }
                      className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
                    />
                  </label>
                  <details>
                    <summary className="cursor-pointer text-sm text-blue-700">
                      Role instructions
                    </summary>
                    <label className="block text-sm text-slate-700 mt-2">
                      Persona
                      <textarea
                        rows={5}
                        maxLength={3000}
                        value={agent.persona}
                        onChange={(e) =>
                          update(department, { persona: e.target.value })
                        }
                        className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
                      />
                    </label>
                  </details>
                  <button
                    type="button"
                    disabled={!!previewing || issues.length > 0}
                    onClick={() => void preview(department)}
                    className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm text-blue-800 disabled:opacity-50"
                  >
                    {previewing === department ? (
                      <Loader size={16} className="animate-spin" />
                    ) : (
                      <Play size={16} />
                    )}
                    Preview {agent.name}
                  </button>
                </fieldset>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={saving || !dirty || validationErrors.length > 0}
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
            >
              {saving ? (
                <Loader size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Save Voice Team
            </button>
            <output className="text-sm text-slate-600">
              {notice ||
                (dirty
                  ? 'Unsaved changes'
                  : 'Each agent keeps its own voice and identity during transfers.')}
            </output>
          </div>
        </>
      )}
    </section>
  );
}
