import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Loader2,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Save,
  Users,
  Volume2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';
import type { Bot as BotType } from '../../types';

interface VoiceAgentConfig {
  id?: string;
  enabled: boolean;
  phoneNumber?: string;
  voiceId: string;
  greeting: string;
  transferEnabled: boolean;
  transferNumber: string;
  transferTriggers: string[];
  leadCaptureEnabled: boolean;
  plan: string;
  minutesUsed: number;
  minutesLimit: number;
  language: string;
  endCallPhrase: string;
}

interface VoiceAgentConfigProps {
  bot: BotType;
}

const VOICE_OPTIONS = [
  {
    id: 'professional-female-us',
    name: 'Professional Female (US)',
    description: 'Clear, professional female voice with American accent',
  },
  {
    id: 'professional-male-us',
    name: 'Professional Male (US)',
    description: 'Clear, professional male voice with American accent',
  },
  {
    id: 'professional-female-uk',
    name: 'Professional Female (UK)',
    description: 'Clear, professional female voice with British accent',
  },
  {
    id: 'professional-male-uk',
    name: 'Professional Male (UK)',
    description: 'Clear, professional male voice with British accent',
  },
  {
    id: 'friendly-female',
    name: 'Friendly Female',
    description: 'Warm, approachable female voice',
  },
  {
    id: 'friendly-male',
    name: 'Friendly Male',
    description: 'Warm, approachable male voice',
  },
];

const VOICE_PLANS = [
  { id: 'VOICE_BASIC', name: 'Voice Basic', price: 49, minutes: 150 },
  { id: 'VOICE_STANDARD', name: 'Voice Standard', price: 129, minutes: 450 },
  {
    id: 'VOICE_PROFESSIONAL',
    name: 'Voice Professional',
    price: 199,
    minutes: 1000,
  },
];

export const VoiceAgentConfigComponent: React.FC<VoiceAgentConfigProps> = ({
  bot,
}) => {
  const [config, setConfig] = useState<VoiceAgentConfig>({
    enabled: false,
    voiceId: 'professional-female-us',
    greeting: 'Hello! How can I help you today?',
    transferEnabled: false,
    transferNumber: '',
    transferTriggers: ['speak to human', 'talk to agent', 'representative'],
    leadCaptureEnabled: true,
    plan: 'VOICE_BASIC',
    minutesUsed: 0,
    minutesLimit: 150,
    language: 'en-US',
    endCallPhrase: 'goodbye',
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load voice agent config on mount
  useEffect(() => {
    const loadVoiceConfig = async () => {
      if (!bot.id) return;

      setLoading(true);
      try {
        const response = await fetch(buildApiUrl(`/voice/agents/${bot.id}`), {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setConfig(data);
        }
      } catch (err) {
        console.error('Failed to load voice config:', err);
      } finally {
        setLoading(false);
      }
    };

    loadVoiceConfig();
  }, [bot.id]);

  const handleSave = async () => {
    if (!bot.id) {
      setError('Please save the bot first before configuring voice agent');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(buildApiUrl(`/voice/agents/${bot.id}`), {
        method: config.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error('Failed to save voice agent configuration');
      }

      const data = await response.json();
      setConfig(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    const newEnabled = !config.enabled;
    setConfig({ ...config, enabled: newEnabled });

    if (newEnabled && !config.phoneNumber) {
      // If enabling and no phone number, provision one
      setSaving(true);
      try {
        const response = await fetch(
          buildApiUrl(`/voice/agents/${bot.id}/provision`),
          {
            method: 'POST',
            credentials: 'include',
          },
        );
        if (response.ok) {
          const data = await response.json();
          setConfig({
            ...config,
            enabled: true,
            phoneNumber: data.phoneNumber,
          });
        }
      } catch (err) {
        setError('Failed to provision phone number');
        setConfig({ ...config, enabled: false });
      } finally {
        setSaving(false);
      }
    }
  };

  const selectedVoice = VOICE_OPTIONS.find((v) => v.id === config.voiceId);
  const selectedPlan = VOICE_PLANS.find((p) => p.id === config.plan);
  const usagePercent = (config.minutesUsed / config.minutesLimit) * 100;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Phone className="w-5 h-5 text-blue-600" />
            Voice Agent Configuration
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            Enable AI-powered phone calls with automatic lead capture
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
          <CheckCircle2 className="w-4 h-4" />
          Voice agent configuration saved successfully
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config.enabled ? (
              <PhoneIncoming className="w-6 h-6 text-green-600" />
            ) : (
              <PhoneOff className="w-6 h-6 text-slate-400" />
            )}
            <div>
              <h4 className="font-semibold text-slate-900">
                Voice Agent {config.enabled ? 'Enabled' : 'Disabled'}
              </h4>
              <p className="text-sm text-slate-600">
                {config.enabled
                  ? 'Your bot can receive and make phone calls'
                  : 'Enable to start receiving calls'}
              </p>
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.enabled ? 'bg-blue-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {config.phoneNumber && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-900 font-medium">
              Assigned Phone Number
            </p>
            <p className="text-lg font-bold text-blue-600 mt-1">
              {config.phoneNumber}
            </p>
          </div>
        )}
      </div>

      {config.enabled && (
        <>
          {/* Voice Selection */}
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <h4 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <Volume2 className="w-5 h-5 text-blue-600" />
              Voice Selection
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {VOICE_OPTIONS.map((voice) => (
                <button
                  key={voice.id}
                  onClick={() => setConfig({ ...config, voiceId: voice.id })}
                  className={`text-left p-3 rounded-md border-2 transition-all ${
                    config.voiceId === voice.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="font-medium text-slate-900">{voice.name}</p>
                  <p className="text-xs text-slate-600 mt-1">
                    {voice.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Greeting Message */}
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <h4 className="font-semibold text-slate-900 mb-4">
              Greeting Message
            </h4>
            <textarea
              value={config.greeting}
              onChange={(e) =>
                setConfig({ ...config, greeting: e.target.value })
              }
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Hello! How can I help you today?"
            />
            <p className="text-xs text-slate-600 mt-2">
              This message will be spoken when a caller first connects
            </p>
          </div>

          {/* Transfer to Human */}
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Transfer to Human Agent
              </h4>
              <button
                onClick={() =>
                  setConfig({
                    ...config,
                    transferEnabled: !config.transferEnabled,
                  })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.transferEnabled ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.transferEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {config.transferEnabled && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Transfer Phone Number
                  </label>
                  <input
                    type="tel"
                    value={config.transferNumber}
                    onChange={(e) =>
                      setConfig({ ...config, transferNumber: e.target.value })
                    }
                    placeholder="+1 (555) 123-4567"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Trigger Words (comma separated)
                  </label>
                  <input
                    type="text"
                    value={config.transferTriggers.join(', ')}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        transferTriggers: e.target.value
                          .split(',')
                          .map((t) => t.trim()),
                      })
                    }
                    placeholder="speak to human, talk to agent, representative"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-600 mt-2">
                    Call will transfer when caller says these phrases
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Lead Capture */}
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-slate-900">
                  Automatic Lead Capture
                </h4>
                <p className="text-sm text-slate-600 mt-1">
                  Extract name, email, and phone from conversations
                </p>
              </div>
              <button
                onClick={() =>
                  setConfig({
                    ...config,
                    leadCaptureEnabled: !config.leadCaptureEnabled,
                  })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.leadCaptureEnabled ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.leadCaptureEnabled
                      ? 'translate-x-6'
                      : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Usage & Billing */}
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <h4 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-blue-600" />
              Usage & Billing
            </h4>

            {/* Current Plan */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Current Plan
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {VOICE_PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() =>
                      setConfig({
                        ...config,
                        plan: plan.id,
                        minutesLimit: plan.minutes,
                      })
                    }
                    className={`text-left p-3 rounded-md border-2 transition-all ${
                      config.plan === plan.id
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="font-medium text-slate-900">{plan.name}</p>
                    <p className="text-lg font-bold text-blue-600 mt-1">
                      ${plan.price}/mo
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      {plan.minutes} minutes
                    </p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-600 mt-2">
                Overage: $0.50 per minute
              </p>
            </div>

            {/* Usage Bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  Minutes Used
                </span>
                <span className="text-sm text-slate-600">
                  {config.minutesUsed} / {config.minutesLimit} minutes
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    usagePercent > 90
                      ? 'bg-red-600'
                      : usagePercent > 75
                        ? 'bg-yellow-600'
                        : 'bg-blue-600'
                  }`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
