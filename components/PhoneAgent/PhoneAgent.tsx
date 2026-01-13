import {
  AlertCircle,
  CheckCircle,
  ExternalLink,
  HelpCircle,
  Key,
  Loader,
  Mic,
  Phone,
  PlayCircle,
  Save,
  Settings,
  Sparkles,
  Voicemail,
  Volume2,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import type { User } from '../../types';
import { VoiceSetupWizard } from './VoiceSetupWizard';

const cartesiaVoices = [
  {
    id: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    name: 'Katie',
    description: 'Professional female',
  },
  {
    id: 'f786b574-daa5-4673-aa0c-cbe3e8534c02',
    name: 'Sarah',
    description: 'Warm, conversational',
  },
  {
    id: '79a125e8-cd45-4c13-8a67-188112f4dd22',
    name: 'British Lady',
    description: 'British accent',
  },
  {
    id: '421b3369-f63f-4b03-8980-37a44df1d4e8',
    name: 'Confident Man',
    description: 'Professional male',
  },
  {
    id: '87748186-23bb-4158-a1eb-332911b0b708',
    name: 'Friendly Man',
    description: 'Approachable male',
  },
  {
    id: 'c2ac25f9-efd4-4f5d-8545-4e4212d7a5e5',
    name: 'Storyteller',
    description: 'Engaging narrator',
  },
];

interface PhoneAgentProps {
  user?: User;
  onUpdate?: (user: User) => void;
}

export const PhoneAgent: React.FC<PhoneAgentProps> = ({ user, onUpdate }) => {
  const [showWizard, setShowWizard] = useState(false);
  const [enabled, setEnabled] = useState(user?.phoneConfig?.enabled || false);
  const [voice, setVoice] = useState(
    user?.phoneConfig?.voiceId || 'a0e99841-438c-4a64-b679-ae501e7d6091',
  );
  const [introMessage, setIntroMessage] = useState(
    user?.phoneConfig?.introMessage ||
      'Hi! Thanks for calling. This is your AI assistant. How can I help you today?',
  );
  const [cartesiaApiKey, setCartesiaApiKey] = useState(
    user?.phoneConfig?.cartesiaApiKey || '',
  );
  const [delegationLink, setDelegationLink] = useState(
    user?.phoneConfig?.delegationLink || '',
  );
  const [showApiKey, setShowApiKey] = useState(false);

  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationStatus, setSimulationStatus] = useState('Ready to test');
  const [isSaving, setIsSaving] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'setup' | 'config'>(
    cartesiaApiKey ? 'config' : 'setup',
  );

  useEffect(() => {
    if (user?.phoneConfig) {
      setEnabled(user.phoneConfig.enabled);
      if (user.phoneConfig.voiceId) setVoice(user.phoneConfig.voiceId);
      if (user.phoneConfig.introMessage) setIntroMessage(user.phoneConfig.introMessage);
      if (user.phoneConfig.cartesiaApiKey) setCartesiaApiKey(user.phoneConfig.cartesiaApiKey);
      if (user.phoneConfig.delegationLink) setDelegationLink(user.phoneConfig.delegationLink);
    }
  }, [user?.phoneConfig]);

  const getApiKey = () => {
    return cartesiaApiKey;
  };

  const playVoicePreview = async (voiceId: string) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      alert('Please enter your Cartesia API key first.');
      setActiveTab('setup');
      return;
    }

    setIsPlayingPreview(voiceId);
    try {
      const response = await fetch('https://api.cartesia.ai/tts/bytes', {
        method: 'POST',
        headers: {
          'Cartesia-Version': '2024-06-10',
          'X-API-Key': apiKey,
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

  const startSimulation = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      alert('Please enter your Cartesia API key first.');
      setActiveTab('setup');
      return;
    }

    setIsSimulating(true);
    setSimulationStatus('Generating voice...');

    try {
      const response = await fetch('https://api.cartesia.ai/tts/bytes', {
        method: 'POST',
        headers: {
          'Cartesia-Version': '2024-06-10',
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: 'sonic-2',
          transcript: introMessage,
          voice: { mode: 'id', id: voice },
          output_format: {
            container: 'mp3',
            encoding: 'mp3',
            sample_rate: 44100,
          },
        }),
      });

      if (!response.ok) throw new Error('Voice generation failed');

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setSimulationStatus('Call ended');
        setIsSimulating(false);
        URL.revokeObjectURL(audioUrl);
      };
      setSimulationStatus('AI Speaking...');
      await audio.play();
    } catch (err) {
      console.error(err);
      alert('Voice simulation failed. Please check your Cartesia API key.');
      setIsSimulating(false);
      setSimulationStatus('Error occurred');
    }
  };

  const endSimulation = () => {
    setIsSimulating(false);
    setSimulationStatus('Call ended');
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      if (onUpdate && user) {
        onUpdate({
          ...user,
          phoneConfig: {
            enabled,
            voiceId: voice,
            introMessage,
            cartesiaApiKey,
            delegationLink,
          },
        });
      }
      setIsSaving(false);
    }, 1000);
  };

  const hasApiKey = !!getApiKey();

  return (
    <div className="max-w-4xl mx-auto animate-fade-in space-y-6">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">AI Voice Agent</h2>
          <p className="text-slate-500">
            Deploy an AI receptionist with ultra-realistic voice.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!hasApiKey && (
            <button
              type="button"
              onClick={() => setShowWizard(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center gap-2 shadow-sm"
            >
              <Sparkles size={16} />
              Quick Setup Wizard
            </button>
          )}
          <span
            className={`text-sm font-medium ${enabled ? 'text-emerald-600' : 'text-slate-500'}`}
          >
            {enabled ? 'Agent Active' : 'Agent Disabled'}
          </span>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
          >
            <div
              className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${enabled ? 'left-7' : 'left-1'}`}
            />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('setup')}
          className={`pb-3 text-sm font-medium border-b-2 transition ${
            activeTab === 'setup'
              ? 'border-blue-900 text-blue-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Key size={16} className="inline mr-2" />
          Setup & API Key
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('config')}
          className={`pb-3 text-sm font-medium border-b-2 transition ${
            activeTab === 'config'
              ? 'border-blue-900 text-blue-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Settings size={16} className="inline mr-2" />
          Voice Configuration
        </button>
      </div>

      {activeTab === 'setup' && (
        <div className="space-y-6 animate-fade-in">
          {/* Quick Start Guide */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-100">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <HelpCircle size={20} className="text-blue-600" />
              Quick Start Guide
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-lg border border-blue-100">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold mb-3">
                  1
                </div>
                <h4 className="font-semibold text-slate-800 mb-1">
                  Get Your API Key
                </h4>
                <p className="text-sm text-slate-600">
                  Sign up at Cartesia.ai and get your API key from the
                  dashboard.
                </p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-blue-100">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold mb-3">
                  2
                </div>
                <h4 className="font-semibold text-slate-800 mb-1">
                  Enter Key Below
                </h4>
                <p className="text-sm text-slate-600">
                  Paste your API key in the field below to connect your account.
                </p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-blue-100">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold mb-3">
                  3
                </div>
                <h4 className="font-semibold text-slate-800 mb-1">
                  Choose a Voice
                </h4>
                <p className="text-sm text-slate-600">
                  Preview voices, customize your greeting, and you're ready!
                </p>
              </div>
            </div>
          </div>

          {/* API Key Entry */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <Key size={18} />
                </div>
                <h3 className="font-bold text-slate-800">Cartesia API Key</h3>
              </div>
              {hasApiKey && (
                <span className="flex items-center gap-1 text-sm text-emerald-600">
                  <CheckCircle size={16} /> Connected
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="cartesia-api-key"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Your API Key
                </label>
                <div className="relative">
                  <input
                    id="cartesia-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={cartesiaApiKey}
                    onChange={(e) => setCartesiaApiKey(e.target.value)}
                    placeholder="Enter your Cartesia API key..."
                    className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900 pr-24 p-3"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-sm text-slate-500 hover:text-slate-700"
                  >
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Your API key is stored securely and used only for voice
                  generation.
                </p>
              </div>

              {!hasApiKey && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle
                    size={20}
                    className="text-amber-600 shrink-0 mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      API Key Required
                    </p>
                    <p className="text-sm text-amber-700 mt-1">
                      You need a Cartesia API key to use voice features. Get one
                      free at cartesia.ai
                    </p>
                  </div>
                </div>
              )}

              <a
                href="https://play.cartesia.ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-blue-700 hover:text-blue-800 text-sm font-medium"
              >
                <ExternalLink size={16} />
                Get your API key at Cartesia.ai
              </a>
            </div>
          </div>

          {/* Delegated Account Info */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <ExternalLink size={18} />
              </div>
              <h3 className="font-bold text-slate-800">
                Delegated Account (Optional)
              </h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              If you're working with a partner or have a delegated Cartesia
              account, enter your connection details here.
            </p>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="cartesia-delegation-link"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Delegation Link (Optional)
                </label>
                <input
                  id="cartesia-delegation-link"
                  type="url"
                  value={delegationLink}
                  onChange={(e) => setDelegationLink(e.target.value)}
                  placeholder="https://api.cartesia.ai/delegate/..."
                  className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900 p-3"
                />
                <p className="text-xs text-slate-500 mt-1">
                  If your account manager provided a delegation link, paste it
                  here.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
          {/* Main Config */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-blue-50 text-blue-900 rounded-lg">
                  <Settings size={18} />
                </div>
                <h3 className="font-bold text-slate-800">Greeting Message</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="cartesia-intro-message"
                    className="block text-sm font-medium text-slate-700 mb-2"
                  >
                    What your AI will say when answering
                  </label>
                  <textarea
                    id="cartesia-intro-message"
                    value={introMessage}
                    onChange={(e) => setIntroMessage(e.target.value)}
                    className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900 h-24 p-3 text-sm"
                    placeholder="Hi! Thanks for calling. How can I help you today?"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-blue-50 text-blue-900 rounded-lg">
                  <Mic size={18} />
                </div>
                <h3 className="font-bold text-slate-800">Select Voice</h3>
                <span className="text-xs text-slate-500 ml-auto">
                  Powered by Cartesia AI
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {cartesiaVoices.map((v) => (
                  <div
                    key={v.id}
                    className={`p-3 rounded-lg border hover:border-blue-300 transition ${
                      voice === v.id
                        ? 'border-blue-900 bg-blue-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <button
                        type="button"
                        onClick={() => setVoice(v.id)}
                        className="flex-1 text-left"
                      >
                        <span className="font-medium text-slate-700">
                          {v.name}
                        </span>
                        <p className="text-xs text-slate-500">
                          {v.description}
                        </p>
                      </button>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-blue-900 p-1"
                        onClick={() => playVoicePreview(v.id)}
                        disabled={isPlayingPreview === v.id}
                      >
                        {isPlayingPreview === v.id ? (
                          <Loader size={16} className="animate-spin" />
                        ) : (
                          <Volume2 size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar / Status */}
          <div className="space-y-6">
            {/* Call Simulator */}
            <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg relative overflow-hidden">
              <div className="relative z-10 text-center">
                <h3 className="font-bold text-lg mb-4">Test Your Voice</h3>

                <button
                  type="button"
                  className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-4 transition-all duration-500 ${isSimulating ? 'bg-red-500 animate-pulse' : 'bg-emerald-500 hover:scale-105'}`}
                  onClick={isSimulating ? endSimulation : startSimulation}
                  aria-label="Toggle call simulation"
                >
                  {isSimulating ? (
                    <Phone size={32} className="rotate-135" />
                  ) : (
                    <PlayCircle size={32} />
                  )}
                </button>

                <p className="text-sm font-medium">{simulationStatus}</p>
                <p className="text-xs text-slate-400 mt-2">
                  Click to hear your greeting
                </p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Voicemail size={18} className="text-blue-900" /> Recent Calls
              </h3>
              <div className="space-y-3">
                {[
                  {
                    from: '(415) 555-0123',
                    time: '10m ago',
                    duration: '2m 14s',
                    status: 'missed',
                  },
                  {
                    from: '(212) 555-0988',
                    time: '1h ago',
                    duration: '5m 32s',
                    status: 'completed',
                  },
                  {
                    from: '(310) 555-4422',
                    time: '3h ago',
                    duration: '1m 05s',
                    status: 'completed',
                  },
                ].map((call) => (
                  <div
                    key={`${call.from}-${call.time}`}
                    className="flex justify-between items-center text-sm border-b border-slate-50 last:border-0 pb-2 last:pb-0"
                  >
                    <div>
                      <p className="font-medium text-slate-700">{call.from}</p>
                      <p className="text-xs text-slate-400">{call.time}</p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-xs capitalize ${call.status === 'missed' ? 'text-red-500' : 'text-emerald-500'}`}
                      >
                        {call.status}
                      </p>
                      <p className="text-xs text-slate-400">{call.duration}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="w-full mt-4 text-xs text-blue-900 font-medium hover:underline"
              >
                View Call Logs
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2.5 bg-blue-900 text-white rounded-lg font-medium hover:bg-blue-950 shadow-sm transition flex items-center gap-2 disabled:opacity-70"
        >
          {isSaving ? (
            <Loader className="animate-spin" size={18} />
          ) : (
            <Save size={18} />
          )}
          Save Configuration
        </button>
      </div>

      {/* Voice Setup Wizard */}
      {showWizard && user && (
        <VoiceSetupWizard
          user={user}
          onComplete={(config) => {
            setShowWizard(false);
            setCartesiaApiKey(config.cartesiaApiKey);
            setVoice(config.voiceId);
            setIntroMessage(config.introMessage);
            setDelegationLink(config.delegationLink || '');
            setEnabled(config.enabled);
            setActiveTab('config');

            if (onUpdate) {
              onUpdate({
                ...user,
                phoneConfig: {
                  enabled: config.enabled,
                  voiceId: config.voiceId,
                  introMessage: config.introMessage,
                  cartesiaApiKey: config.cartesiaApiKey,
                  delegationLink: config.delegationLink,
                  phoneNumber: config.phoneNumber,
                },
              });
            }
          }}
          onCancel={() => setShowWizard(false)}
        />
      )}
    </div>
  );
};
