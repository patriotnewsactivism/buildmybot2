import {
  Bot as BotIcon,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Save,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import type { Bot } from '../../types';
import { Button } from '../UI/Button';
import { Input } from '../UI/Input';
import { Label } from '../UI/Label';
import { Select } from '../UI/Select';
import { Textarea } from '../UI/Textarea';
import SimplifiedBotWizard from './SimplifiedBotWizard';

const MODEL_OPTIONS = [
  { value: 'gpt-5o-mini', label: 'GPT-5o Mini (fast, default)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4o', label: 'GPT-4o (complex reasoning)' },
];

interface BotBuilderProps {
  bots: Bot[];
  onSave: (bot: Bot) => Promise<Bot>;
  customDomain?: string;
  /** Reserved for the embedded chat preview; not used by the current editor. */
  onLeadDetected?: (email: string) => void;
  onRefresh?: () => Promise<void>;
}

interface WizardPayload {
  name?: string;
  description?: string;
  systemPrompt?: string;
  welcomeMessage?: string;
  configuration?: { model?: string; temperature?: number };
  knowledgeBase?: { source: string; type: string }[];
}

const BotBuilder: React.FC<BotBuilderProps> = ({
  bots,
  onSave,
  customDomain,
  onRefresh,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(
    bots[0]?.id ?? null,
  );
  const [showWizard, setShowWizard] = useState(bots.length === 0);
  const [draft, setDraft] = useState<Bot | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Load the selected bot into the edit form whenever selection changes or
  // the bot list refreshes underneath us.
  useEffect(() => {
    const selected = bots.find((b) => b.id === selectedId) ?? bots[0] ?? null;
    setDraft(selected ? { ...selected } : null);
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id);
    }
  }, [bots, selectedId]);

  const updateDraft = <K extends keyof Bot>(field: K, value: Bot[K]) => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
    setSavedAt(null);
  };

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setSaveError('Bot name is required.');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = await onSave(draft);
      setSelectedId(saved.id);
      setSavedAt(Date.now());
    } catch {
      setSaveError('Failed to save bot. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleWizardComplete = async (payload: WizardPayload) => {
    setShowWizard(false);
    const newBot: Bot = {
      id: 'new',
      name: payload.name || 'New Bot',
      type: 'assistant',
      systemPrompt: payload.systemPrompt || 'You are a helpful AI assistant.',
      model: payload.configuration?.model || 'gpt-5o-mini',
      temperature: payload.configuration?.temperature ?? 0.7,
      knowledgeBase: (payload.knowledgeBase ?? []).map((k) => k.source),
      active: true,
      conversationsCount: 0,
      themeColor: '#4f46e5',
    };
    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = await onSave(newBot);
      setSelectedId(saved.id);
      await onRefresh?.();
    } catch {
      setSaveError('Failed to create bot. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const embedHost = customDomain || 'www.buildmybot.app';
  const embedSnippet = draft
    ? `<script src="https://${embedHost}/embed.js" data-bot-id="${draft.id}" async></script>`
    : '';
  const chatUrl =
    draft?.id && draft.id !== 'new'
      ? `https://${embedHost}/chat/${draft.id}`
      : '';

  const handleCopyLink = async () => {
    if (!chatUrl) return;
    try {
      await navigator.clipboard.writeText(chatUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — no-op, the URL
      // is still visible/selectable in the input for manual copy.
    }
  };

  if (showWizard) {
    return (
      <SimplifiedBotWizard
        onComplete={handleWizardComplete}
        onCancel={() => setShowWizard(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 lg:flex-row">
      {/* Bot list */}
      <aside className="w-full shrink-0 lg:w-64">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Bots</h2>
          <Button size="sm" onClick={() => setShowWizard(true)}>
            <Plus className="mr-1 h-4 w-4" /> New
          </Button>
        </div>
        <ul className="space-y-1">
          {bots.map((bot) => (
            <li key={bot.id}>
              <button
                type="button"
                onClick={() => setSelectedId(bot.id)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  bot.id === selectedId
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <BotIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{bot.name}</span>
                {!bot.active && (
                  <span className="ml-auto text-xs text-gray-400">paused</span>
                )}
              </button>
            </li>
          ))}
          {bots.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500">
              No bots yet — create your first one.
            </li>
          )}
        </ul>
      </aside>

      {/* Editor */}
      <section className="min-w-0 flex-1">
        {draft ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold">Edit Bot</h1>
              <div className="flex items-center gap-3">
                {savedAt && (
                  <span className="text-sm text-green-600">Saved</span>
                )}
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1 h-4 w-4" />
                  )}
                  Save changes
                </Button>
              </div>
            </div>

            {saveError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {saveError}
              </p>
            )}

            {chatUrl ? (
              <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50 p-5 shadow-sm dark:border-indigo-900 dark:from-indigo-950 dark:to-blue-950">
                <div className="mb-2 flex items-center gap-2">
                  <ExternalLink className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-base font-bold text-indigo-900 dark:text-indigo-200">
                    Share this bot
                  </span>
                </div>
                <p className="mb-3 text-sm text-indigo-700 dark:text-indigo-300">
                  Send this link to anyone by text, email, or DM — they'll chat
                  with this bot instantly, no app or signup needed.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    readOnly
                    value={chatUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 bg-white font-mono text-sm dark:bg-gray-900"
                  />
                  <Button
                    onClick={handleCopyLink}
                    className="shrink-0 bg-indigo-600 hover:bg-indigo-700"
                  >
                    {linkCopied ? (
                      <>
                        <Check className="mr-1 h-4 w-4" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1 h-4 w-4" /> Copy Link
                      </>
                    )}
                  </Button>
                  <a
                    href={chatUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900"
                  >
                    <ExternalLink className="h-4 w-4" /> Open
                  </a>
                </div>
              </div>
            ) : (
              <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-gray-900">
                Save this bot to generate its shareable chat link.
              </p>
            )}

            <div>
              <Label htmlFor="bot-name">Name</Label>
              <Input
                id="bot-name"
                value={draft.name}
                onChange={(e) => updateDraft('name', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="bot-system-prompt">System prompt</Label>
              <Textarea
                id="bot-system-prompt"
                rows={6}
                value={draft.systemPrompt}
                onChange={(e) => updateDraft('systemPrompt', e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="bot-model">Model</Label>
                <Select
                  id="bot-model"
                  value={draft.model}
                  onChange={(e) => updateDraft('model', e.target.value)}
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                  {!MODEL_OPTIONS.some((m) => m.value === draft.model) && (
                    <option value={draft.model}>{draft.model}</option>
                  )}
                </Select>
              </div>
              <div>
                <Label htmlFor="bot-temperature">
                  Temperature ({draft.temperature.toFixed(1)})
                </Label>
                <input
                  id="bot-temperature"
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={draft.temperature}
                  onChange={(e) =>
                    updateDraft('temperature', Number(e.target.value))
                  }
                  className="mt-3 w-full"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="bot-active"
                type="checkbox"
                checked={draft.active}
                onChange={(e) => updateDraft('active', e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="bot-active">Active</Label>
            </div>

            <div>
              <Label htmlFor="bot-embed">Embed on your website</Label>
              <pre
                id="bot-embed"
                className="mt-1 overflow-x-auto rounded-md bg-gray-100 p-3 text-xs dark:bg-gray-900"
              >
                {embedSnippet}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center text-gray-500">
            Select a bot or create a new one to get started.
          </div>
        )}
      </section>
    </div>
  );
};

export default BotBuilder;
