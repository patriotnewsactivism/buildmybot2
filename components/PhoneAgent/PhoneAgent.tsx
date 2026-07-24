import {
  Database,
  Loader,
  Mic,
  Phone,
  Save,
  Settings,
  Sparkles,
  Voicemail,
  Volume2,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';
import type { User } from '../../types';
import { KnowledgeBaseManager } from '../BotBuilder/KnowledgeBaseManager';
import { VoiceCallSimulator } from './VoiceCallSimulator';
import { VoiceSetupWizard } from './VoiceSetupWizard';
import {
  DEFAULT_VOICE_ID,
  VOICE_OPTIONS,
  fetchVoicePreview,
} from './voiceOptions';

interface PhoneAgentProps {
  user?: User;
  onUpdate?: (user: User) => void;
}

interface CallLogRow {
  id: string;
  caller_number?: string;
  called_number?: string;
  status?: string;
  duration?: number;
  started_at?: string;
}

export const PhoneAgent: React.FC<PhoneAgentProps> = ({ user, onUpdate }) => {
  const [showWizard, setShowWizard] = useState(false);
  const [enabled, setEnabled] = useState(user?.phoneConfig?.enabled || false);
  const [voice, setVoice] = useState(
    user?.phoneConfig?.voiceId || DEFAULT_VOICE_ID,
  );
  const [introMessage, setIntroMessage] = useState(
    user?.phoneConfig?.introMessage ||
      'Hi! Thanks for calling. This is your AI assistant. How can I help you today?',
  );
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState<string | null>(null);
  const [voiceBotId, setVoiceBotId] = useState<string | null>(null);
  const [recentCalls, setRecentCalls] = useState<CallLogRow[]>([]);

  useEffect(() => {
    if (user?.phoneConfig) {
      setEnabled(user.phoneConfig.enabled);
      if (user.phoneConfig.voiceId) setVoice(user.phoneConfig.voiceId);
      if (user.phoneConfig.introMessage)
        setIntroMessage(user.phoneConfig.introMessage);
    }
  }, [user?.phoneConfig]);

  // Get (or lazily create) the answering bot so knowledge/PDFs can be
  // uploaded here even before a phone number is purchased.
  useEffect(() => {
    let cancelled = false;
    fetch(buildApiUrl('/phone/voice-bot'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.botId) setVoiceBotId(data.botId);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchCalls = () => {
      fetch(buildApiUrl('/phone/calls'), { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (!cancelled && Array.isArray(data)) setRecentCalls(data);
        })
        .catch(() => {});
    };
    fetchCalls();
    const interval = setInterval(fetchCalls, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const playVoicePreview = async (voiceId: string) => {
    setIsPlayingPreview(voiceId);
    try {
      const audio = await fetchVoicePreview(voiceId);
      audio.addEventListener('ended', () => setIsPlayingPreview(null), {
        once: true,
      });
      await audio.play();
    } catch (err) {
      console.error(err);
      alert('Voice preview is temporarily unavailable. Please try again.');
      setIsPlayingPreview(null);
    }
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      if (onUpdate && user) {
        onUpdate({
          ...user,
          phoneConfig: {
            ...user.phoneConfig,
            enabled,
            voiceId: voice,
            introMessage,
          },
        });
      }
      setIsSaving(false);
    }, 800);
  };

  return (
    <div className="max-w-5xl mx-auto animate-fade-in space-y-6 p-4 md:p-6">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">AI Voice Agent</h2>
          <p className="text-slate-500">
            Deploy an AI receptionist with an ultra-realistic voice.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center gap-2 shadow-sm"
          >
            <Sparkles size={16} />
            Quick Setup Wizard
          </button>
          <span
            className={`text-sm font-medium ${enabled ? 'text-emerald-600' : 'text-slate-500'}`}
          >
            {enabled ? 'Agent Active' : 'Agent Disabled'}
          </span>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
            aria-label="Toggle voice agent"
          >
            <div
              className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${enabled ? 'left-7' : 'left-1'}`}
            />
          </button>
        </div>
      </div>

      {/* Platform-powered banner — no customer API key required */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <div className="p-2 bg-white text-blue-600 rounded-lg shadow-sm">
          <Sparkles size={18} />
        </div>
        <div>
          <p className="font-semibold text-slate-800 text-sm">
            Powered by the platform voice engine
          </p>
          <p className="text-sm text-slate-600 mt-0.5">
            Realistic Grok voices are built in — no third-party API key to set
            up. Pick a voice, write your greeting, and test it live below.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main config */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-blue-50 text-blue-900 rounded-lg">
                <Settings size={18} />
              </div>
              <h3 className="font-bold text-slate-800">Greeting Message</h3>
            </div>
            <label
              htmlFor="voice-intro-message"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              What your AI will say when answering
            </label>
            <textarea
              id="voice-intro-message"
              value={introMessage}
              onChange={(e) => setIntroMessage(e.target.value)}
              className="w-full rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-24 p-3 text-sm"
              placeholder="Hi! Thanks for calling. How can I help you today?"
            />
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-blue-50 text-blue-900 rounded-lg">
                <Mic size={18} />
              </div>
              <h3 className="font-bold text-slate-800">Select Voice</h3>
              <span className="text-xs text-slate-500 ml-auto">
                Powered by Grok
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {VOICE_OPTIONS.map((v) => (
                <div
                  key={v.id}
                  className={`p-3 rounded-lg border transition ${
                    voice === v.id
                      ? 'border-blue-900 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-blue-300'
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
                      <p className="text-xs text-slate-500">{v.description}</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {v.bestFor}
                      </p>
                    </button>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-blue-900 p-1"
                      onClick={() => playVoicePreview(v.id)}
                      disabled={isPlayingPreview === v.id}
                      aria-label={`Preview ${v.name}`}
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

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-blue-50 text-blue-900 rounded-lg">
                <Database size={18} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">
                  Business Info &amp; Knowledge Base
                </h3>
                <p className="text-xs text-slate-500">
                  Upload PDFs or paste a website URL — your AI will use this to
                  answer caller questions accurately.
                </p>
              </div>
            </div>
            {voiceBotId ? (
              <KnowledgeBaseManager
                botId={voiceBotId}
                documents={[]}
                onDocumentsChange={() => {}}
              />
            ) : (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                <Loader size={16} className="animate-spin" />
                Setting up your knowledge base...
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg text-center">
            <h3 className="font-bold text-lg mb-4">Live Call Simulation</h3>
            <button
              type="button"
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2"
              onClick={() => setIsSimulatorOpen(true)}
              aria-label="Start call simulation"
            >
              <Phone size={20} />
              Test Your Voice Agent
            </button>
            <p className="text-xs text-slate-400 mt-4">
              Click to start a live test call with your configured voice and
              greeting.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Voicemail size={18} className="text-blue-900" /> Recent Calls
            </h3>
            {recentCalls.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">
                No calls yet. Once your number is live, calls will show up here.
              </p>
            ) : (
              <div className="space-y-3">
                {recentCalls.map((call) => {
                  const missed = ['no-answer', 'busy', 'failed'].includes(
                    call.status || '',
                  );
                  const minutes = Math.floor((call.duration || 0) / 60);
                  const seconds = (call.duration || 0) % 60;
                  return (
                    <div
                      key={call.id}
                      className="flex justify-between items-center text-sm border-b border-slate-50 last:border-0 pb-2 last:pb-0"
                    >
                      <div>
                        <p className="font-medium text-slate-700">
                          {call.caller_number || 'Unknown'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {call.started_at
                            ? new Date(call.started_at).toLocaleString()
                            : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-xs capitalize ${missed ? 'text-red-500' : 'text-emerald-500'}`}
                        >
                          {call.status || 'unknown'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {minutes}m {seconds.toString().padStart(2, '0')}s
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

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

      {isSimulatorOpen && (
        <VoiceCallSimulator
          isOpen={isSimulatorOpen}
          onClose={() => setIsSimulatorOpen(false)}
          introMessage={introMessage}
          voiceId={voice}
        />
      )}

      {showWizard && user && (
        <VoiceSetupWizard
          user={user}
          onComplete={(config) => {
            setShowWizard(false);
            setVoice(config.voiceId);
            setIntroMessage(config.introMessage);
            setEnabled(config.enabled);
            if (onUpdate) {
              onUpdate({
                ...user,
                phoneConfig: {
                  ...user.phoneConfig,
                  enabled: config.enabled,
                  voiceId: config.voiceId,
                  introMessage: config.introMessage,
                  phoneNumber: config.phoneNumber,
                  twilioSid: config.twilioSid,
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
