import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Loader2,
  Mic,
  Phone,
  PhoneForwarded,
  Play,
  Route,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';
import type { User } from '../../types';
import {
  DEFAULT_VOICE_ID,
  VOICE_OPTIONS,
  fetchVoicePreview,
} from './voiceOptions';

interface VoiceSetupWizardProps {
  user: User;
  onComplete: (config: VoiceConfig) => void;
  onCancel: () => void;
}

interface VoiceConfig {
  enabled: boolean;
  voiceId: string;
  introMessage: string;
  delegationLink?: string;
  phoneNumber?: string;
  twilioSid?: string;
}

type SetupMode = 'new' | 'forward' | 'port';
type KnowledgeMode = 'shared' | 'voice_only';
type WizardStep = 1 | 2 | 3 | 4 | 5;

interface KnowledgeBot {
  id: string;
  name: string;
  type: string;
  sharedRecommended?: boolean;
}

interface AvailableNumber {
  phoneNumber: string;
  friendlyName?: string;
  locality?: string;
  region?: string;
}

interface ActivationResult {
  activationId: string;
  mode: SetupMode;
  status: string;
  botId?: string;
  phoneNumber?: string;
  twilioSid?: string;
  sourceNumber?: string;
  forwardingDestination?: string;
  message?: string;
  nextSteps?: string[];
}

const GREETINGS = [
  'Thank you for calling. How can I help you today?',
  "Hi, thanks for calling. I'm the AI assistant for the business. What can I help you with?",
  'Thanks for calling. Tell me what you need and I will help or get the right person involved.',
];

const MODES: Array<{
  id: SetupMode;
  title: string;
  description: string;
  icon: typeof Phone;
  badge?: string;
}> = [
  {
    id: 'new',
    title: 'Get a New Number',
    description:
      'Choose a local number and activate the AI receptionist directly on it.',
    icon: Phone,
    badge: 'Fastest',
  },
  {
    id: 'forward',
    title: 'Use My Existing Number',
    description:
      'Keep the number customers already know and forward calls to a new BuildMyBot destination number.',
    icon: PhoneForwarded,
    badge: 'Recommended for existing businesses',
  },
  {
    id: 'port',
    title: 'Port My Number',
    description:
      'Move the existing number to the BuildMyBot telephony account after carrier authorization and port approval.',
    icon: Route,
  },
];

export const VoiceSetupWizard: React.FC<VoiceSetupWizardProps> = ({
  user,
  onComplete,
  onCancel,
}) => {
  const [step, setStep] = useState<WizardStep>(1);
  const [mode, setMode] = useState<SetupMode>('new');
  const [knowledgeMode, setKnowledgeMode] =
    useState<KnowledgeMode>('shared');
  const [knowledgeBots, setKnowledgeBots] = useState<KnowledgeBot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState('');
  const [loadingBots, setLoadingBots] = useState(true);

  const [config, setConfig] = useState<VoiceConfig>({
    enabled: true,
    voiceId: user.phoneConfig?.voiceId || DEFAULT_VOICE_ID,
    introMessage:
      user.phoneConfig?.introMessage ||
      'Thank you for calling. How can I help you today?',
    phoneNumber: user.phoneConfig?.phoneNumber || '',
    twilioSid: user.phoneConfig?.twilioSid || '',
  });

  const [areaCode, setAreaCode] = useState('');
  const [sourceNumber, setSourceNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>(
    [],
  );
  const [selectedNumber, setSelectedNumber] = useState('');
  const [searchingNumbers, setSearchingNumbers] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [activationResult, setActivationResult] =
    useState<ActivationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voicePlans, setVoicePlans] = useState<
    Record<string, { name?: string; price?: number; minutes?: number }>
  >({});
  const [selectingVoicePlan, setSelectingVoicePlan] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingBots(true);
    fetch(buildApiUrl('/phone/activation/bots'), {
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load knowledge workspaces');
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        const bots = Array.isArray(data?.bots) ? data.bots : [];
        setKnowledgeBots(bots);
        const recommended = bots.find(
          (bot: KnowledgeBot) => bot.sharedRecommended,
        );
        if (recommended?.id) setSelectedBotId(recommended.id);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load knowledge workspaces',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBots(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedVoice = useMemo(
    () =>
      VOICE_OPTIONS.find((voice) => voice.id === config.voiceId) ||
      VOICE_OPTIONS[0],
    [config.voiceId],
  );

  const canContinue = useMemo(() => {
    if (step === 1) return Boolean(mode);
    if (step === 2) {
      return (
        knowledgeMode === 'voice_only' ||
        !knowledgeBots.length ||
        Boolean(selectedBotId)
      );
    }
    if (step === 3) return Boolean(config.voiceId && config.introMessage.trim());
    if (step === 4) {
      if (mode === 'port') return Boolean(sourceNumber.trim());
      if (mode === 'forward') {
        return Boolean(sourceNumber.trim() && selectedNumber);
      }
      return Boolean(selectedNumber);
    }
    return true;
  }, [
    step,
    mode,
    knowledgeMode,
    knowledgeBots.length,
    selectedBotId,
    config.voiceId,
    config.introMessage,
    sourceNumber,
    selectedNumber,
  ]);

  const next = () => {
    setError(null);
    if (step < 5 && canContinue) {
      setStep((step + 1) as WizardStep);
    }
  };

  const back = () => {
    setError(null);
    if (step > 1) setStep((step - 1) as WizardStep);
  };

  const playPreview = async (voiceId: string) => {
    setPlayingVoice(voiceId);
    setError(null);
    try {
      const audio = await fetchVoicePreview(voiceId, config.introMessage);
      audio.addEventListener('ended', () => setPlayingVoice(null), {
        once: true,
      });
      await audio.play();
    } catch (previewError) {
      setPlayingVoice(null);
      setError(
        previewError instanceof Error
          ? previewError.message
          : 'Voice preview is temporarily unavailable',
      );
    }
  };

  const searchNumbers = async () => {
    const normalizedAreaCode = areaCode.replace(/\D/g, '');
    if (normalizedAreaCode.length !== 3) {
      setError('Enter a three-digit area code.');
      return;
    }

    setSearchingNumbers(true);
    setError(null);
    setAvailableNumbers([]);
    setSelectedNumber('');

    try {
      const response = await fetch(
        buildApiUrl(
          `/phone/activation/available?countryCode=US&areaCode=${normalizedAreaCode}`,
        ),
        { credentials: 'include' },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Unable to search phone numbers');
      }
      const numbers = Array.isArray(data) ? data : [];
      setAvailableNumbers(numbers);
      if (numbers[0]?.phoneNumber) {
        setSelectedNumber(numbers[0].phoneNumber);
      }
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : 'Unable to search phone numbers',
      );
    } finally {
      setSearchingNumbers(false);
    }
  };

  const selectVoicePlan = async (voicePlan: string) => {
    setSelectingVoicePlan(voicePlan);
    setError(null);
    try {
      const response = await fetch(buildApiUrl('/phone/voice-plan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ voicePlan }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Unable to select voice plan');
      }
      setVoicePlans({});
    } catch (planError) {
      setError(
        planError instanceof Error
          ? planError.message
          : 'Unable to select voice plan',
      );
    } finally {
      setSelectingVoicePlan(null);
    }
  };

  const activate = async () => {
    setActivating(true);
    setError(null);
    setVoicePlans({});

    try {
      const response = await fetch(buildApiUrl('/phone/activation/provision'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode,
          phoneNumber: mode === 'port' ? undefined : selectedNumber,
          sourceNumber: mode === 'new' ? undefined : sourceNumber,
          carrier: carrier.trim() || undefined,
          botId:
            knowledgeMode === 'shared' && selectedBotId
              ? selectedBotId
              : undefined,
          knowledgeMode,
          friendlyName: `Voice Agent - ${user.companyName || user.name || 'Business'}`,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 402 && data.voicePlanRequired) {
        setVoicePlans(data.voicePlans || {});
        setError(data.error || 'A voice plan is required before activation.');
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Phone activation failed');
      }

      setActivationResult(data as ActivationResult);
    } catch (activationError) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : 'Phone activation failed',
      );
    } finally {
      setActivating(false);
    }
  };

  const finish = () => {
    const result = activationResult;
    onComplete({
      enabled: result?.status === 'active' || result?.mode === 'forward',
      voiceId: config.voiceId,
      introMessage: config.introMessage.trim(),
      phoneNumber:
        result?.phoneNumber ||
        (result?.mode === 'port' ? sourceNumber.trim() : config.phoneNumber),
      twilioSid: result?.twilioSid || config.twilioSid,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 md:p-6">
      <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur md:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-blue-700">
                <Sparkles size={18} />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                  Guided activation
                </span>
              </div>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                Activate Your AI Phone Agent
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Phone setup, knowledge, voice, and routing in one workflow.
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-3 py-1.5 text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close activation wizard"
            >
              ×
            </button>
          </div>

          <div className="mt-4 grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className={`h-1.5 rounded-full ${
                  item <= step ? 'bg-blue-600' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-500">
            <span>Number</span>
            <span>Knowledge</span>
            <span>Voice</span>
            <span>Details</span>
            <span>Activate</span>
          </div>
        </div>

        <div className="p-5 md:p-7">
          {error && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  How do you want calls to reach the agent?
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  You can go live on a new number, keep your current number by
                  forwarding it, or begin a carrier port.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {MODES.map((option) => {
                  const Icon = option.icon;
                  const selected = mode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setMode(option.id);
                        setSelectedNumber('');
                        setAvailableNumbers([]);
                        setError(null);
                      }}
                      className={`rounded-2xl border-2 p-5 text-left transition ${
                        selected
                          ? 'border-blue-600 bg-blue-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
                          <Icon size={22} />
                        </div>
                        {selected && (
                          <CheckCircle2 className="text-blue-600" size={20} />
                        )}
                      </div>
                      <div className="mt-4 font-semibold text-slate-900">
                        {option.title}
                      </div>
                      {option.badge && (
                        <div className="mt-1 text-xs font-medium text-blue-700">
                          {option.badge}
                        </div>
                      )}
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <ShieldCheck
                  size={19}
                  className="mt-0.5 shrink-0 text-emerald-600"
                />
                <p className="text-sm text-slate-600">
                  New activations are isolated in a customer-specific Twilio
                  subaccount. BuildMyBot stores the subaccount credential
                  encrypted server-side; it is never exposed in this browser.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Use the same business knowledge everywhere
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  By default, the voice agent uses the same bot knowledge that
                  powers your chatbot. You can also keep voice knowledge
                  separate.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setKnowledgeMode('shared')}
                  className={`rounded-xl border-2 p-5 text-left ${
                    knowledgeMode === 'shared'
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    <Bot size={19} />
                    Shared chatbot + voice knowledge
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Recommended. One knowledge workspace stays consistent
                    across chat and phone.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setKnowledgeMode('voice_only')}
                  className={`rounded-xl border-2 p-5 text-left ${
                    knowledgeMode === 'voice_only'
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    <Mic size={19} />
                    Separate voice-only knowledge
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Create or reuse a dedicated voice workspace instead of
                    sharing a chatbot.
                  </p>
                </button>
              </div>

              {knowledgeMode === 'shared' && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <label
                    htmlFor="phone-knowledge-bot"
                    className="block text-sm font-medium text-slate-800"
                  >
                    Knowledge workspace
                  </label>
                  {loadingBots ? (
                    <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 size={16} className="animate-spin" />
                      Loading your bots...
                    </div>
                  ) : knowledgeBots.length ? (
                    <select
                      id="phone-knowledge-bot"
                      value={selectedBotId}
                      onChange={(event) => setSelectedBotId(event.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    >
                      {knowledgeBots.map((bot) => (
                        <option key={bot.id} value={bot.id}>
                          {bot.name} · {bot.type}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">
                      No existing chatbot was found. BuildMyBot will create a
                      voice workspace automatically.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Choose the voice and opening greeting
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Production calls use Gemini Live for realtime conversation.
                  These voice options are used for previews and fallback speech.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {VOICE_OPTIONS.map((voice) => (
                  <div
                    key={voice.id}
                    className={`rounded-xl border-2 p-4 ${
                      config.voiceId === voice.id
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setConfig((current) => ({
                          ...current,
                          voiceId: voice.id,
                        }))
                      }
                      className="w-full text-left"
                    >
                      <div className="font-semibold text-slate-900">
                        {voice.name}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {voice.description}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => playPreview(voice.id)}
                      disabled={playingVoice === voice.id}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-blue-300 disabled:opacity-50"
                    >
                      {playingVoice === voice.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Play size={14} />
                      )}
                      Preview
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label
                  htmlFor="phone-agent-greeting"
                  className="block text-sm font-medium text-slate-800"
                >
                  Greeting
                </label>
                <textarea
                  id="phone-agent-greeting"
                  rows={4}
                  value={config.introMessage}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      introMessage: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {GREETINGS.map((greeting, index) => (
                    <button
                      key={greeting}
                      type="button"
                      onClick={() =>
                        setConfig((current) => ({
                          ...current,
                          introMessage: greeting,
                        }))
                      }
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                    >
                      Template {index + 1}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                Selected preview voice:{' '}
                <strong className="text-slate-800">{selectedVoice.name}</strong>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {mode === 'port'
                    ? 'Tell us about the number to port'
                    : 'Choose the BuildMyBot destination number'}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {mode === 'new'
                    ? 'Search a local area code and choose the number callers will dial.'
                    : mode === 'forward'
                      ? 'Your existing business number stays with its carrier. Choose the destination number it will forward to.'
                      : 'A port is not instant. The current carrier remains active until Twilio accepts the request and schedules cutover.'}
                </p>
              </div>

              {(mode === 'forward' || mode === 'port') && (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-800">
                    Existing business number
                    <input
                      type="tel"
                      value={sourceNumber}
                      onChange={(event) => setSourceNumber(event.target.value)}
                      placeholder="+1 555 123 4567"
                      className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-normal focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-800">
                    Current carrier
                    <input
                      type="text"
                      value={carrier}
                      onChange={(event) => setCarrier(event.target.value)}
                      placeholder="Optional for forwarding"
                      className="mt-2 w-full rounded-lg border border-slate-200 p-3 font-normal focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </label>
                </div>
              )}

              {mode !== 'port' && (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={3}
                      value={areaCode}
                      onChange={(event) =>
                        setAreaCode(
                          event.target.value.replace(/\D/g, '').slice(0, 3),
                        )
                      }
                      placeholder="Area code"
                      className="w-full rounded-lg border border-slate-200 p-3 text-sm sm:max-w-40 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                    <button
                      type="button"
                      onClick={searchNumbers}
                      disabled={searchingNumbers}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {searchingNumbers && (
                        <Loader2 size={16} className="animate-spin" />
                      )}
                      Search numbers
                    </button>
                  </div>

                  {availableNumbers.length > 0 && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {availableNumbers.map((number) => (
                        <button
                          key={number.phoneNumber}
                          type="button"
                          onClick={() =>
                            setSelectedNumber(number.phoneNumber)
                          }
                          className={`rounded-xl border-2 p-4 text-left ${
                            selectedNumber === number.phoneNumber
                              ? 'border-blue-600 bg-blue-50'
                              : 'border-slate-200 hover:border-blue-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-slate-900">
                              {number.phoneNumber}
                            </span>
                            {selectedNumber === number.phoneNumber && (
                              <CheckCircle2
                                size={18}
                                className="text-blue-600"
                              />
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {[number.locality, number.region]
                              .filter(Boolean)
                              .join(', ') || 'Local number'}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {mode === 'port' && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  Submitting this step records a port request; it does not claim
                  the carrier transfer is complete. Keep the existing service
                  active until a confirmed port date.
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              {!activationResult ? (
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Review and activate
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      BuildMyBot will provision only after you press the button
                      below. No success state is assumed if Twilio or the
                      database returns an error.
                    </p>
                  </div>

                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                    <SummaryRow
                      label="Phone setup"
                      value={
                        MODES.find((option) => option.id === mode)?.title || mode
                      }
                    />
                    <SummaryRow
                      label="Knowledge"
                      value={
                        knowledgeMode === 'shared'
                          ? knowledgeBots.find(
                              (bot) => bot.id === selectedBotId,
                            )?.name || 'Shared business knowledge'
                          : 'Separate voice-only knowledge'
                      }
                    />
                    <SummaryRow label="Voice" value={selectedVoice.name} />
                    {mode !== 'port' && (
                      <SummaryRow
                        label="Destination"
                        value={selectedNumber || 'Not selected'}
                      />
                    )}
                    {mode !== 'new' && (
                      <SummaryRow
                        label="Existing number"
                        value={sourceNumber || 'Not entered'}
                      />
                    )}
                  </div>

                  {Object.keys(voicePlans).length > 0 && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <p className="font-semibold text-blue-950">
                        Choose a voice plan to continue
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {Object.entries(voicePlans).map(([key, plan]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => selectVoicePlan(key)}
                            disabled={Boolean(selectingVoicePlan)}
                            className="rounded-lg border border-blue-200 bg-white p-3 text-left text-sm hover:border-blue-400 disabled:opacity-60"
                          >
                            <div className="font-semibold text-slate-900">
                              {plan.name || key}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              {plan.minutes
                                ? `${plan.minutes} minutes`
                                : 'Voice minutes'}
                              {typeof plan.price === 'number'
                                ? ` · $${plan.price}/mo`
                                : ''}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={activate}
                    disabled={activating}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                  >
                    {activating ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Sparkles size={18} />
                    )}
                    {mode === 'port'
                      ? 'Start Port Request'
                      : 'Activate AI Phone Agent'}
                  </button>
                </>
              ) : (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                        size={24}
                        className="mt-0.5 shrink-0 text-emerald-600"
                      />
                      <div>
                        <h3 className="text-lg font-semibold text-emerald-950">
                          {activationResult.status === 'active'
                            ? 'Phone agent activated'
                            : activationResult.status === 'awaiting_forwarding'
                              ? 'Destination number is ready'
                              : 'Port request recorded'}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-emerald-900">
                          {activationResult.message}
                        </p>
                      </div>
                    </div>
                  </div>

                  {activationResult.phoneNumber && (
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        BuildMyBot number
                      </div>
                      <div className="mt-1 text-xl font-bold text-slate-900">
                        {activationResult.phoneNumber}
                      </div>
                    </div>
                  )}

                  {activationResult.nextSteps?.length ? (
                    <div className="rounded-xl border border-slate-200 p-5">
                      <h4 className="font-semibold text-slate-900">
                        Required next steps
                      </h4>
                      <ol className="mt-3 space-y-2 text-sm text-slate-600">
                        {activationResult.nextSteps.map((item, index) => (
                          <li key={item} className="flex gap-3">
                            <span className="font-semibold text-slate-900">
                              {index + 1}.
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={finish}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3.5 font-semibold text-white hover:bg-slate-800"
                  >
                    <CheckCircle2 size={18} />
                    Done
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {!activationResult && (
          <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur md:px-7">
            <button
              type="button"
              onClick={step === 1 ? onCancel : back}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft size={16} />
              {step === 1 ? 'Cancel' : 'Back'}
            </button>

            {step < 5 && (
              <button
                type="button"
                onClick={next}
                disabled={!canContinue}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const SummaryRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="text-right font-medium text-slate-900">{value}</span>
  </div>
);
