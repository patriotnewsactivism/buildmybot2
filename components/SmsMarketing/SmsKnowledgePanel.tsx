import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';

type KnowledgeBase = {
  id: string;
  name: string;
  published_version_id?: string | null;
};

type BotOption = { id: string; name: string };

type Review = {
  version?: { id: string; status?: string; url?: string; error?: string | null };
  facts?: Array<{ category: string; key: string; value: string }>;
  conflicts?: string[];
  missing?: string[];
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

type Props = {
  businessName: string;
  knowledgeBaseId: string;
  aiEnabled: boolean;
  onKnowledgeBaseId: (id: string) => void;
  onAiEnabled: (enabled: boolean) => void;
};

/** Crawl, review, publish, and attach shared business knowledge for SMS AI replies. */
export const SmsKnowledgePanel: React.FC<Props> = ({
  businessName,
  knowledgeBaseId,
  aiEnabled,
  onKnowledgeBaseId,
  onAiEnabled,
}) => {
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [bots, setBots] = useState<BotOption[]>([]);
  const [botId, setBotId] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [crawlUrl, setCrawlUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadList = useCallback(async () => {
    const data = await smsFetch('/sms/knowledge');
    const nextBases = Array.isArray(data.bases) ? data.bases : [];
    setBases(nextBases);
    setBots(Array.isArray(data.bots) ? data.bots : []);
    return nextBases as KnowledgeBase[];
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      setReview(null);
      return;
    }
    const data = await smsFetch(`/sms/knowledge/${id}`);
    setReview((data.review || null) as Review | null);
  }, []);

  useEffect(() => {
    void loadList().catch((e) =>
      setError(e instanceof Error ? e.message : 'Could not load knowledge'),
    );
  }, [loadList]);

  useEffect(() => {
    void loadDetail(knowledgeBaseId).catch(() => setReview(null));
  }, [knowledgeBaseId, loadDetail]);

  const versionStatus = review?.version?.status || '';
  const crawling =
    versionStatus === 'starting' || versionStatus === 'crawling';

  useEffect(() => {
    if (!knowledgeBaseId || !crawling) return;
    const timer = setInterval(() => {
      void loadDetail(knowledgeBaseId).catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [knowledgeBaseId, crawling, loadDetail]);

  const run = async (work: () => Promise<void>, ok?: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      if (ok) setNotice(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Knowledge update failed');
    } finally {
      setBusy(false);
    }
  };

  const createBase = () =>
    run(async () => {
      const name =
        newName.trim() ||
        (businessName.trim() ? `${businessName.trim()} knowledge` : '');
      if (name.length < 2) {
        throw new Error('Name the knowledge base first');
      }
      const created = await smsFetch('/sms/knowledge', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setNewName('');
      await loadList();
      if (created?.id) onKnowledgeBaseId(created.id);
    }, 'Knowledge base created. Crawl a website next.');

  const crawl = () =>
    run(async () => {
      if (!knowledgeBaseId) throw new Error('Select or create a knowledge base');
      await smsFetch(`/sms/knowledge/${knowledgeBaseId}/crawl`, {
        method: 'POST',
        body: JSON.stringify({ url: crawlUrl }),
      });
      await loadDetail(knowledgeBaseId);
    }, 'Website extraction started. Facts appear here when the crawl finishes.');

  const publish = () =>
    run(async () => {
      const versionId = review?.version?.id;
      if (!knowledgeBaseId || !versionId) {
        throw new Error('Nothing to publish yet');
      }
      await smsFetch(`/sms/knowledge/${knowledgeBaseId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ versionId }),
      });
      await loadList();
      await loadDetail(knowledgeBaseId);
      if (!aiEnabled) onAiEnabled(true);
    }, 'Published. AI replies will use these facts after you save settings.');

  const linkBot = () =>
    run(async () => {
      if (!knowledgeBaseId || !botId) {
        throw new Error('Choose a knowledge base and a bot to link');
      }
      await smsFetch(`/sms/knowledge/${knowledgeBaseId}/link`, {
        method: 'POST',
        body: JSON.stringify({ botId }),
      });
    }, 'Linked to chatbot and matching voice agents.');

  const selected = bases.find((base) => base.id === knowledgeBaseId);
  const factCount = review?.facts?.length || 0;
  const conflicts = review?.conflicts || [];
  const missing = review?.missing || [];

  return (
    <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4 sm:col-span-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          Shared business knowledge
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          Chat, voice, and SMS answers come from the same published facts. Crawl
          your website, publish, then turn on AI replies.
        </p>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-gray-700">Knowledge base</span>
        <select
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          value={knowledgeBaseId}
          onChange={(e) => onKnowledgeBaseId(e.target.value)}
        >
          <option value="">Not linked</option>
          {bases.map((base) => (
            <option key={base.id} value={base.id}>
              {base.name}
              {base.published_version_id ? ' · published' : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New knowledge base name"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void createBase()}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
        >
          Create
        </button>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-gray-700">Website to learn from</span>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={crawlUrl}
            onChange={(e) => setCrawlUrl(e.target.value)}
            placeholder="https://example.com"
          />
          <button
            type="button"
            disabled={busy || !knowledgeBaseId}
            onClick={() => void crawl()}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {crawling ? 'Crawling…' : 'Extract'}
          </button>
        </div>
      </label>

      {selected && (
        <div className="rounded-md bg-white p-3 text-xs text-gray-600 space-y-1">
          <p>
            Status:{' '}
            <span className="font-medium text-gray-800">
              {crawling
                ? 'Extracting pages'
                : selected.published_version_id
                  ? 'Published'
                  : versionStatus || 'Not published'}
            </span>
            {factCount ? ` · ${factCount} facts` : ''}
          </p>
          {review?.version?.error && (
            <p className="text-red-700">{review.version.error}</p>
          )}
          {conflicts.length > 0 && (
            <p className="text-amber-800">
              Resolve {conflicts.length} conflicting fact
              {conflicts.length === 1 ? '' : 's'} before publishing.
            </p>
          )}
          {missing.length > 0 && (
            <p>Still missing: {missing.join(', ')}.</p>
          )}
          <button
            type="button"
            disabled={busy || !review?.version?.id || conflicts.length > 0}
            onClick={() => void publish()}
            className="mt-2 rounded-md border border-indigo-200 px-3 py-1.5 text-sm text-indigo-800 disabled:opacity-50"
          >
            Publish facts
          </button>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={aiEnabled}
          onChange={(e) => onAiEnabled(e.target.checked)}
        />
        <span className="font-medium text-gray-700">
          AI replies from published knowledge
        </span>
      </label>

      {bots.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            value={botId}
            onChange={(e) => setBotId(e.target.value)}
          >
            <option value="">Link a chatbot / voice agent…</option>
            {bots.map((bot) => (
              <option key={bot.id} value={bot.id}>
                {bot.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !knowledgeBaseId || !botId}
            onClick={() => void linkBot()}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
          >
            Share with bot
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
      {notice && <p className="text-sm text-emerald-800">{notice}</p>}
    </div>
  );
};
