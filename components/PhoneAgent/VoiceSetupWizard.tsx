import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Key,
  Loader,
  MessageSquare,
  Mic,
  Phone,
  Play,
  Save,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import type { User } from '../../types';

interface VoiceSetupWizardProps {
  user: User;
  onComplete: (config: VoiceConfig) => void;
  onCancel: () => void;
}

interface VoiceConfig {
  enabled: boolean;
  voiceId: string;
  introMessage: string;
  cartesiaApiKey: string;
  delegationLink?: string;
  phoneNumber?: string;
  twilioSid?: string;
}

const VOICE_OPTIONS = [
  {
    id: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    name: 'Katie',
    description: 'Professional female voice',
    personality: 'Clear, professional, trustworthy',
    bestFor: 'Customer support, professional services',
  },
  {
    id: 'f786b574-daa5-4673-aa0c-cbe3e8534c02',
    name: 'Sarah',
    description: 'Warm, conversational',
    personality: 'Friendly, approachable, helpful',
    bestFor: 'Sales, hospitality, general inquiries',
  },
  {
    id: '79a125e8-cd45-4c13-8a67-188112f4dd22',
    name: 'British Lady',
    description: 'British accent',
    personality: 'Sophisticated, polished, refined',
    bestFor: 'Luxury brands, travel, consulting',
  },
  {
    id: '421b3369-f63f-4b03-8980-37a44df1d4e8',
    name: 'Confident Man',
    description: 'Professional male',
    personality: 'Authoritative, confident, clear',
    bestFor: 'Finance, legal, technical support',
  },
  {
    id: '87748186-23bb-4158-a1eb-332911b0b708',
    name: 'Friendly Man',
    description: 'Approachable male',
    personality: 'Casual, friendly, energetic',
    bestFor: 'Fitness, retail, casual services',
  },
  {
    id: 'c2ac25f9-efd4-4f5d-8545-4e4212d7a5e5',
    name: 'Storyteller',
    description: 'Engaging narrator',
    personality: 'Expressive, engaging, dynamic',
    bestFor: 'Education, entertainment, marketing',
  },
];

const GREETING_TEMPLATES = [
  {
    name: 'Professional',
    text: 'Thank you for calling. This is your AI assistant. How may I help you today?',
  },
  {
    name: 'Friendly',
    text: "Hi there! Thanks for calling. I'm your AI assistant, and I'm here to help. What can I do for you?",
  },
  {
    name: 'Business',
    text: "Good [morning/afternoon/evening]. You've reached our AI assistant. How can I assist you with your inquiry today?",
  },
  {
    name: 'Casual',
    text: 'Hey! Thanks for calling. What brings you in today?',
  },
  {
    name: 'Custom',
    text: '',
  },
];

type WizardStep = 1 | 2 | 3 | 4 | 5;

export const VoiceSetupWizard: React.FC<VoiceSetupWizardProps> = ({
  user,
  onComplete,
  onCancel,
}) => {
  const [step, setStep] = useState<WizardStep>(1);
  const [config, setConfig] = useState<VoiceConfig>({
    enabled: true,
    voiceId:
      user.phoneConfig?.voiceId || 'a0e99841-438c-4a64-b679-ae501e7d6091',
    introMessage: user.phoneConfig?.introMessage || GREETING_TEMPLATES[0].text,
    cartesiaApiKey: user.phoneConfig?.cartesiaApiKey || '',
    delegationLink: user.phoneConfig?.delegationLink || '',
    phoneNumber: user.phoneConfig?.phoneNumber || '',
    twilioSid: user.phoneConfig?.twilioSid || '',
  });
  const [isPlayingPreview, setIsPlayingPreview] = useState<string | null>(null);
  const [testCallStatus, setTestCallStatus] = useState<
    'idle' | 'calling' | 'success'
  >('idle');

  // Phone number purchase state
  const [searchAreaCode, setSearchAreaCode] = useState('');
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const selectedVoice =
    VOICE_OPTIONS.find((v) => v.id === config.voiceId) || VOICE_OPTIONS[0];

  const handlePlayPreview = async (voiceId: string) => {
    if (!config.cartesiaApiKey) {
      alert('Please enter your Cartesia API key first on Step 1');
      return;
    }

    setIsPlayingPreview(voiceId);
    try {
      const response = await fetch('https://api.cartesia.ai/tts/bytes', {
        method: 'POST',
        headers: {
          'Cartesia-Version': '2024-06-10',
          'X-API-Key': config.cartesiaApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: 'sonic-2',
          transcript:
            'Hello! This is a preview of how I sound. How can I help you today?',
          voice: { mode: 'id', id: voiceId },
          output_format: {
            container: 'mp3',
            encoding: 'mp3',
            sample_rate: 44100,
          },
        }),
      });

      if (!response.ok) throw new Error('Voice preview failed');

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsPlayingPreview(null);
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
    } catch (err) {
      console.error(err);
      alert('Voice preview failed. Please check your Cartesia API key.');
      setIsPlayingPreview(null);
    }
  };

  const handleTestCall = async () => {
    if (!config.cartesiaApiKey) {
      alert('Please enter your Cartesia API key first');
      return;
    }

    setTestCallStatus('calling');
    try {
      const response = await fetch('https://api.cartesia.ai/tts/bytes', {
        method: 'POST',
        headers: {
          'Cartesia-Version': '2024-06-10',
          'X-API-Key': config.cartesiaApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: 'sonic-2',
          transcript: config.introMessage,
          voice: { mode: 'id', id: config.voiceId },
          output_format: {
            container: 'mp3',
            encoding: 'mp3',
            sample_rate: 44100,
          },
        }),
      });

      if (!response.ok) throw new Error('Test call failed');

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setTestCallStatus('success');
        URL.revokeObjectURL(audioUrl);
        setTimeout(() => setTestCallStatus('idle'), 2000);
      };
      await audio.play();
    } catch (err) {
      console.error(err);
      alert('Test call failed. Please verify your configuration.');
      setTestCallStatus('idle');
    }
  };

  const handleSearchNumbers = async () => {
    if (!searchAreaCode && searchAreaCode.length < 3) {
      alert('Please enter a valid 3-digit area code');
      return;
    }

    setIsSearching(true);
    setAvailableNumbers([]);
    setPurchaseError(null);

    try {
      const response = await fetch(
        `/api/phone/available?countryCode=US&areaCode=${searchAreaCode}`,
      );
      if (!response.ok) throw new Error('Failed to search numbers');
      const data = await response.json();
      setAvailableNumbers(data);
    } catch (err: any) {
      setPurchaseError(err.message || 'Error searching for numbers');
    } finally {
      setIsSearching(false);
    }
  };

  const handlePurchaseNumber = async (phoneNumber: string) => {
    if (
      !confirm(
        `Are you sure you want to purchase ${phoneNumber}? This will be billed to your account.`,
      )
    ) {
      return;
    }

    setIsPurchasing(true);
    setPurchaseError(null);

    try {
      const response = await fetch('/api/phone/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          friendlyName: `Voice Agent - ${user.companyName || 'Bot'}`,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to purchase number');
      }

      const data = await response.json();
      setConfig({
        ...config,
        phoneNumber: data.phoneNumber,
        twilioSid: data.sid,
      });
      alert('Phone number purchased successfully!');
    } catch (err: any) {
      setPurchaseError(err.message || 'Error purchasing number');
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleReleaseNumber = async () => {
    if (
      !confirm(
        'Are you sure you want to release this phone number? You will lose access to it.',
      )
    ) {
      return;
    }

    try {
      const response = await fetch('/api/phone/release', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to release number');
      setConfig({ ...config, phoneNumber: '', twilioSid: '' });
      setAvailableNumbers([]);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleNext = () => {
    if (step === 1 && !config.cartesiaApiKey) {
      alert('Please enter your Cartesia API key to continue');
      return;
    }
    if (step < 5) {
      const nextStep = Math.min(step + 1, 5) as WizardStep;
      setStep(nextStep);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      const prevStep = Math.max(step - 1, 1) as WizardStep;
      setStep(prevStep);
    }
  };

  const handleFinish = () => {
    onComplete(config);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Phone className="text-blue-600" size={24} />
              Voice Agent Setup
            </h2>
            <p className="text-sm text-slate-500 mt-1">Step {step} of 5</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`flex-1 h-2 rounded-full transition-all ${
                  s <= step ? 'bg-blue-600' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>API Key</span>
            <span>Voice</span>
            <span>Greeting</span>
            <span>Phone</span>
            <span>Test</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: API Key */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <Key size={20} className="text-blue-600" />
                  Connect Cartesia AI
                </h3>
                <p className="text-sm text-slate-600">
                  Cartesia provides ultra-realistic voice synthesis. You'll need
                  an API key to enable phone calls.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Shield className="text-blue-600 shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      Secure Setup
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      Your API key is encrypted and never shared. We use it only
                      to generate voice responses.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="voice-setup-api-key"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Cartesia API Key
                </label>
                <input
                  id="voice-setup-api-key"
                  type="password"
                  value={config.cartesiaApiKey}
                  onChange={(e) =>
                    setConfig({ ...config, cartesiaApiKey: e.target.value })
                  }
                  placeholder="sk-..."
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-600 focus:border-transparent font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Don't have an API key?{' '}
                  <a
                    href="https://cartesia.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Sign up at Cartesia.ai
                  </a>
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h4 className="font-medium text-slate-900 mb-2">
                  What you'll get:
                </h4>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle
                      size={16}
                      className="text-green-600 shrink-0 mt-0.5"
                    />
                    Natural-sounding AI voice with human-like intonation
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle
                      size={16}
                      className="text-green-600 shrink-0 mt-0.5"
                    />
                    24/7 automated phone support for your business
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle
                      size={16}
                      className="text-green-600 shrink-0 mt-0.5"
                    />
                    Sub-second response times for better caller experience
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle
                      size={16}
                      className="text-green-600 shrink-0 mt-0.5"
                    />
                    Reduce phone support costs by up to 80%
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 2: Voice Selection */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <Mic size={20} className="text-blue-600" />
                  Choose Your Voice
                </h3>
                <p className="text-sm text-slate-600">
                  Select the voice that best represents your brand. Click the
                  play button to preview.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {VOICE_OPTIONS.map((voice) => (
                  <button
                    type="button"
                    key={voice.id}
                    onClick={() => setConfig({ ...config, voiceId: voice.id })}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      config.voiceId === voice.id
                        ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-slate-200 hover:border-blue-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          {voice.name}
                          {config.voiceId === voice.id && (
                            <CheckCircle size={16} className="text-blue-600" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {voice.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayPreview(voice.id);
                        }}
                        disabled={isPlayingPreview === voice.id}
                        className="p-2 bg-slate-100 hover:bg-blue-600 hover:text-white rounded-lg transition disabled:opacity-50"
                      >
                        {isPlayingPreview === voice.id ? (
                          <Loader size={16} className="animate-spin" />
                        ) : (
                          <Volume2 size={16} />
                        )}
                      </button>
                    </div>
                    <div className="text-xs text-slate-600 mb-1">
                      <span className="font-medium">Personality:</span>{' '}
                      {voice.personality}
                    </div>
                    <div className="text-xs text-slate-600">
                      <span className="font-medium">Best for:</span>{' '}
                      {voice.bestFor}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Greeting Script */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <MessageSquare size={20} className="text-blue-600" />
                  Create Greeting Script
                </h3>
                <p className="text-sm text-slate-600">
                  What should your AI say when someone calls? Choose a template
                  or write your own.
                </p>
              </div>

              <div>
                <p className="block text-sm font-medium text-slate-700 mb-2">
                  Quick Templates
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {GREETING_TEMPLATES.map((template) => (
                    <button
                      type="button"
                      key={template.name}
                      onClick={() =>
                        setConfig({
                          ...config,
                          introMessage: template.text || config.introMessage,
                        })
                      }
                      className="px-3 py-2 text-sm rounded-lg border border-slate-200 hover:border-blue-600 hover:bg-blue-50 transition"
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="voice-setup-greeting"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Greeting Message
                </label>
                <textarea
                  id="voice-setup-greeting"
                  value={config.introMessage}
                  onChange={(e) =>
                    setConfig({ ...config, introMessage: e.target.value })
                  }
                  rows={4}
                  placeholder="Thank you for calling..."
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Keep it concise (under 30 seconds when spoken)
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h4 className="font-medium text-slate-900 mb-3">
                  Preview with {selectedVoice.name}:
                </h4>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handlePlayPreview(config.voiceId)}
                    disabled={
                      isPlayingPreview === config.voiceId ||
                      !config.introMessage
                    }
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
                  >
                    {isPlayingPreview === config.voiceId ? (
                      <>
                        <Loader size={16} className="animate-spin" />
                        Playing...
                      </>
                    ) : (
                      <>
                        <Play size={16} />
                        Play Greeting
                      </>
                    )}
                  </button>
                  <span className="text-sm text-slate-600">
                    Using{' '}
                    <span className="font-medium">{selectedVoice.name}</span>{' '}
                    voice
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Phone Number Setup */}
          {step === 4 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <Phone size={20} className="text-blue-600" />
                  Phone Number Setup
                </h3>
                <p className="text-sm text-slate-600">
                  Get a dedicated phone number for your AI voice agent.
                </p>
              </div>

              {purchaseError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-200">
                  {purchaseError}
                </div>
              )}

              {config.phoneNumber ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="text-green-600" size={24} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 mb-1">
                    {config.phoneNumber}
                  </h4>
                  <p className="text-sm text-slate-600 mb-4">
                    Active and routed to your voice agent
                  </p>
                  <button
                    type="button"
                    onClick={handleReleaseNumber}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Release Number
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label htmlFor="area-code" className="sr-only">
                        Area Code
                      </label>
                      <input
                        id="area-code"
                        type="text"
                        value={searchAreaCode}
                        onChange={(e) =>
                          setSearchAreaCode(
                            e.target.value.replace(/\D/g, '').slice(0, 3),
                          )
                        }
                        placeholder="Area Code (e.g. 415)"
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSearchNumbers}
                      disabled={isSearching || searchAreaCode.length < 3}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSearching ? (
                        <Loader size={16} className="animate-spin" />
                      ) : (
                        <Search size={16} />
                      )}
                      Search
                    </button>
                  </div>

                  {availableNumbers.length > 0 && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                      {availableNumbers.map((num) => (
                        <div
                          key={num.phoneNumber}
                          className="flex items-center justify-between p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50"
                        >
                          <div>
                            <p className="font-medium text-slate-900">
                              {num.friendlyName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {num.locality}, {num.region}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handlePurchaseNumber(num.phoneNumber)
                            }
                            disabled={isPurchasing}
                            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            <ShoppingBag size={14} />
                            Buy
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-slate-500 mt-2 text-center">
                    Phone numbers are provided via Twilio. Standard rates apply.
                  </div>
                </>
              )}

              <div className="border-t border-slate-200 pt-4 mt-4">
                <label
                  htmlFor="voice-setup-delegation-link"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Call Delegation URL (Optional)
                </label>
                <input
                  id="voice-setup-delegation-link"
                  type="url"
                  value={config.delegationLink || ''}
                  onChange={(e) =>
                    setConfig({ ...config, delegationLink: e.target.value })
                  }
                  placeholder="https://example.com/call-me"
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Redirect complex calls to this URL for human handoff
                </p>
              </div>
            </div>
          )}

          {/* Step 5: Test & Deploy */}
          {step === 5 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <Sparkles size={20} className="text-blue-600" />
                  Test & Deploy
                </h3>
                <p className="text-sm text-slate-600">
                  Test your voice agent before going live.
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
                <div className="text-center mb-6">
                  <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Phone size={32} className="text-blue-600" />
                  </div>
                  <h4 className="font-semibold text-slate-900 mb-2">
                    Your Voice Agent
                  </h4>
                  <p className="text-sm text-slate-600">
                    Voice:{' '}
                    <span className="font-medium">{selectedVoice.name}</span> •
                    Greeting: {config.introMessage.substring(0, 40)}...
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleTestCall}
                  disabled={testCallStatus === 'calling'}
                  className="w-full px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2 text-lg font-medium"
                >
                  {testCallStatus === 'calling' ? (
                    <>
                      <Loader size={20} className="animate-spin" />
                      Calling...
                    </>
                  ) : testCallStatus === 'success' ? (
                    <>
                      <CheckCircle size={20} />
                      Call Successful!
                    </>
                  ) : (
                    <>
                      <Phone size={20} />
                      Start Test Call
                    </>
                  )}
                </button>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle
                    className="text-green-600 shrink-0 mt-0.5"
                    size={20}
                  />
                  <div>
                    <p className="text-sm font-medium text-green-900">
                      Ready to Deploy!
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      Your voice agent is configured and ready to handle calls
                      24/7.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={step === 1 ? onCancel : handleBack}
            className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          <div className="flex gap-2">
            {step < 5 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={step === 1 && !config.cartesiaApiKey}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2 transition"
              >
                Next
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2 transition"
              >
                <Save size={16} />
                Save & Deploy
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
