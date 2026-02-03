import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle,
  Globe,
  MessageSquare,
  Save,
  Settings,
  Upload,
  User,
} from 'lucide-react';
import React, { useState } from 'react';

// --- Types ---
interface BotFormData {
  id?: string;
  name: string;
  description: string;
  role: string;
  welcomeMessage: string;
  systemPrompt: string;
  tone: 'professional' | 'friendly' | 'witty' | 'authoritative';
  model: 'gpt-4o-mini' | 'gpt-4o' | 'gpt-4' | 'gpt-3.5-turbo';
  temperature: number;
  knowledgeSources: {
    type: 'url' | 'file';
    value: string;
    status: 'pending' | 'ready';
  }[];
  isPublic: boolean;
}

const INITIAL_DATA: BotFormData = {
  name: '',
  description: '',
  role: 'Assistant',
  welcomeMessage: 'Hello! How can I help you today?',
  systemPrompt: 'You are a helpful AI assistant.',
  tone: 'professional',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  knowledgeSources: [],
  isPublic: false,
};

// --- Props Interface (Required for the Build) ---
interface SimplifiedBotWizardProps {
  onComplete: (bot: any) => void;
  onCancel: () => void;
}

// --- Component ---
export default function SimplifiedBotWizard({
  onComplete,
  onCancel,
}: SimplifiedBotWizardProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<BotFormData>(INITIAL_DATA);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>(
    'idle',
  );

  const updateField = (field: keyof BotFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      // Construct the full payload
      const payload = {
        ...formData,
        configuration: {
          model: formData.model,
          temperature: formData.temperature,
          tone: formData.tone,
        },
        // Ensure knowledge sources are formatted for the backend
        knowledgeBase: formData.knowledgeSources.map((k) => ({
          source: k.value,
          type: k.type,
        })),
      };

      // Note: We call onComplete to let the parent handle the actual saving/state update
      // If you still want the fetch here, keep it, but ensure onComplete fires.

      // Simulating a save delay if not using real fetch immediately
      await new Promise((resolve) => setTimeout(resolve, 800));

      // If you want to use the API fetch:
      /*
        const response = await fetch('/api/bots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to save');
        const savedBot = await response.json();
        */

      setSaveStatus('success');

      // Pass the data back to the parent
      setTimeout(() => {
        onComplete(payload);
      }, 1000);
    } catch (error) {
      console.error('Save error:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const steps = [
    { number: 1, title: 'Identity', icon: User },
    { number: 2, title: 'Personality', icon: Settings },
    { number: 3, title: 'Knowledge', icon: BookOpen },
    { number: 4, title: 'Review', icon: CheckCircle },
  ];

  return (
    <div className="flex h-screen bg-gray-50 text-slate-800 font-sans overflow-hidden">
      {/* LEFT PANEL - WIZARD */}
      <div className="w-full lg:w-1/2 flex flex-col h-full border-r border-gray-200 bg-white shadow-xl z-10">
        {/* Header */}
        <div className="p-8 border-b border-gray-100 relative">
          {/* Back/Cancel Button */}
          <button
            onClick={onCancel}
            className="absolute top-4 left-4 text-gray-400 hover:text-gray-600"
          >
            <ArrowLeft size={20} />
          </button>

          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mt-4">
            BuildMyBot Studio
          </h1>
          <div className="flex items-center mt-6 space-x-4">
            {steps.map((s) => (
              <div
                key={s.number}
                className={`flex items-center space-x-2 ${step === s.number ? 'opacity-100' : 'opacity-50'}`}
              >
                <div
                  className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                  ${step >= s.number ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}
                  transition-all duration-300
                `}
                >
                  {step > s.number ? <CheckCircle size={16} /> : s.number}
                </div>
                <span
                  className={`text-sm font-medium hidden sm:block ${step === s.number ? 'text-blue-600' : 'text-gray-500'}`}
                >
                  {s.title}
                </span>
                {s.number !== 4 && (
                  <div className="w-8 h-px bg-gray-200 ml-2 hidden sm:block" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Bot Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                      placeholder="e.g. Legal Eagle AI"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Role / Title
                    </label>
                    <input
                      type="text"
                      value={formData.role}
                      onChange={(e) => updateField('role', e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                      placeholder="e.g. Constitutional Law Expert"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        updateField('description', e.target.value)
                      }
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none h-24 resize-none"
                      placeholder="A short description of what this bot does..."
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      System Prompt (The Brain)
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      These are the core instructions your bot will never
                      forget.
                    </p>
                    <textarea
                      value={formData.systemPrompt}
                      onChange={(e) =>
                        updateField('systemPrompt', e.target.value)
                      }
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none h-48 font-mono text-sm"
                      placeholder="You are an expert in..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Tone
                      </label>
                      <select
                        value={formData.tone}
                        onChange={(e) => updateField('tone', e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-200 outline-none"
                      >
                        <option value="professional">Professional</option>
                        <option value="friendly">Friendly</option>
                        <option value="witty">Witty</option>
                        <option value="authoritative">Authoritative</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Model
                      </label>
                      <select
                        value={formData.model}
                        onChange={(e) => updateField('model', e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-200 outline-none"
                      >
                        <option value="gpt-4o-mini">
                          GPT-4o Mini (Recommended)
                        </option>
                        <option value="gpt-4o">GPT-4o (Most Capable)</option>
                        <option value="gpt-4">GPT-4 (Classic)</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 (Fastest)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-4">
                    <h3 className="text-blue-800 font-medium flex items-center gap-2">
                      <BookOpen size={18} />
                      Knowledge Base
                    </h3>
                    <p className="text-sm text-blue-600 mt-1">
                      Upload documents or add website links. The bot will use
                      this data to answer questions.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group">
                      <Upload
                        className="text-gray-400 group-hover:text-blue-500 mb-2"
                        size={32}
                      />
                      <span className="font-medium text-gray-600 group-hover:text-blue-600">
                        Upload PDF/Doc
                      </span>
                    </button>
                    <button className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group">
                      <Globe
                        className="text-gray-400 group-hover:text-blue-500 mb-2"
                        size={32}
                      />
                      <span className="font-medium text-gray-600 group-hover:text-blue-600">
                        Add Website URL
                      </span>
                    </button>
                  </div>

                  {/* Placeholder for list of added files */}
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                      Active Sources
                    </p>
                    <div className="mt-2 p-3 bg-white border rounded-lg text-sm text-gray-500 text-center italic">
                      No sources added yet.
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-6">
                  <div className="bg-green-50 p-6 rounded-xl border border-green-100 text-center">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-green-900">
                      Ready to Deploy
                    </h2>
                    <p className="text-green-700 mt-2">
                      Review your settings on the right. If everything looks
                      good, click Create Bot below.
                    </p>
                  </div>

                  <div className="bg-white border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-500">Name</span>
                      <span className="font-medium">
                        {formData.name || 'Untitled'}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-500">Model</span>
                      <span className="font-medium uppercase">
                        {formData.model}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-gray-500">Visibility</span>
                      <span className="font-medium">
                        {formData.isPublic ? 'Public' : 'Private'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="p-8 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <button
            onClick={() =>
              step === 1 ? onCancel() : setStep((s) => Math.max(1, s - 1))
            }
            className="px-6 py-2.5 rounded-lg font-medium text-gray-600 hover:bg-gray-200 transition-colors"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep((s) => Math.min(4, s + 1))}
              className="px-6 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-all flex items-center space-x-2"
            >
              <span>Next Step</span>
              <ArrowRight size={18} />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`px-8 py-3 rounded-lg font-bold text-white shadow-lg transform transition-all flex items-center space-x-2
                ${saveStatus === 'success' ? 'bg-green-600 scale-105' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-200 hover:-translate-y-1'}
                ${isSaving ? 'opacity-75 cursor-wait' : ''}
              `}
            >
              {isSaving ? (
                <>
                  <span>Saving...</span>
                </>
              ) : saveStatus === 'success' ? (
                <>
                  <span>Saved!</span>
                  <CheckCircle size={20} />
                </>
              ) : (
                <>
                  <span>Create Bot</span>
                  <Save size={20} />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* RIGHT PANEL - PREVIEW */}
      <div className="hidden lg:flex w-1/2 bg-slate-100 items-center justify-center p-12">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-8 border-slate-900 h-[800px] flex flex-col relative">
          {/* Phone Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-slate-900 rounded-b-2xl z-20" />

          {/* Chat Header */}
          <div className="bg-white border-b p-4 pt-12 flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
              {formData.name ? formData.name.charAt(0) : 'B'}
            </div>
            <div>
              <h3 className="font-bold text-slate-800 leading-tight">
                {formData.name || 'New Bot'}
              </h3>
              <p className="text-xs text-green-500 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Online
              </p>
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 bg-gray-50 p-4 space-y-4 overflow-y-auto">
            <div className="flex justify-start">
              <div className="bg-white border border-gray-100 p-3 rounded-2xl rounded-tl-none shadow-sm max-w-[80%] text-sm text-gray-600">
                {formData.welcomeMessage}
              </div>
            </div>
            {/* Fake user message for preview */}
            <div className="flex justify-end">
              <div className="bg-blue-600 text-white p-3 rounded-2xl rounded-tr-none shadow-sm max-w-[80%] text-sm">
                Tell me about your services.
              </div>
            </div>
            {/* Fake response based on role */}
            <div className="flex justify-start">
              <div className="bg-white border border-gray-100 p-3 rounded-2xl rounded-tl-none shadow-sm max-w-[80%] text-sm text-gray-600">
                {formData.role
                  ? `As a ${formData.role}, I can assist you with...`
                  : 'I can help you with that...'}
              </div>
            </div>
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t">
            <div className="flex items-center bg-gray-100 rounded-full px-4 py-2">
              <input
                disabled
                className="bg-transparent flex-1 outline-none text-sm"
                placeholder="Type a message..."
              />
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white ml-2">
                <ArrowRight size={16} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
