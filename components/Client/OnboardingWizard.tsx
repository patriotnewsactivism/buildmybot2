/**
 * Onboarding Wizard Component
 * 5-step guided setup flow aligned with Market Readiness roadmap
 */

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Copy,
  Phone,
  Sparkles,
} from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';

interface OnboardingWizardProps {
  onComplete: (data: OnboardingData) => Promise<void>;
  onSkip?: () => void;
  existingBotId?: string;
}

export interface OnboardingData {
  businessName?: string;
  websiteUrl?: string;
  industryTemplate?: string;
  botTone?: string;
  botPersona?: string;
  embedCode?: string;
  voiceEnabled?: boolean;
  businessHours?: string;
  transferNumber?: string;
}

const INDUSTRY_TEMPLATES = [
  'Real Estate Lead Assistant',
  'Dental Front Desk',
  'HVAC Dispatcher',
  'Legal Intake Coordinator',
  'Medical Reception Assistant',
  'E-commerce Sales Concierge',
  'SaaS Customer Success',
  'General Business Assistant',
];

const TONE_OPTIONS = ['Professional', 'Friendly', 'Consultative', 'Direct'];

const VOICE_HOURS = [
  '24/7',
  'Weekdays 8am-6pm',
  'Weekdays 9am-5pm',
  'Business hours + voicemail fallback',
];

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  onComplete,
  onSkip,
  existingBotId,
}) => {
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    botTone: 'Professional',
    voiceEnabled: false,
    businessHours: 'Weekdays 9am-5pm',
  });

  const progress = (step / 5) * 100;

  const embedCode = useMemo(() => {
    const safeBotId = existingBotId || 'YOUR_BOT_ID';
    return `<script src="${window.location.origin}/widget.js" data-bot-id="${safeBotId}"></script>`;
  }, [existingBotId]);

  const canGoNext = useMemo(() => {
    if (step === 1) {
      return Boolean(data.businessName?.trim() && data.websiteUrl?.trim());
    }
    if (step === 2) {
      return Boolean(data.industryTemplate);
    }
    if (step === 3) {
      return Boolean(data.botTone && data.botPersona?.trim());
    }
    if (step === 5 && data.voiceEnabled) {
      return Boolean(data.businessHours && data.transferNumber?.trim());
    }

    return true;
  }, [step, data]);

  const handleNext = async () => {
    if (step < 5) {
      setStep((prev) => prev + 1);
      return;
    }

    setIsSaving(true);
    try {
      await onComplete({
        ...data,
        embedCode,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 1500);
    } catch (error) {
      console.error('Failed to copy embed code:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="h-2 bg-slate-200">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-8">
          {step === 1 && (
            <div>
              <h2 className="mb-2 text-3xl font-bold text-slate-900">
                Business Profile
              </h2>
              <p className="mb-6 text-slate-600">
                Add your core business details so we can tailor your assistant.
              </p>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="business-name"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Business name
                  </label>
                  <input
                    id="business-name"
                    type="text"
                    value={data.businessName || ''}
                    onChange={(event) =>
                      setData({ ...data, businessName: event.target.value })
                    }
                    placeholder="Acme Dental"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="website-url"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Website URL
                  </label>
                  <input
                    id="website-url"
                    type="url"
                    value={data.websiteUrl || ''}
                    onChange={(event) =>
                      setData({ ...data, websiteUrl: event.target.value })
                    }
                    placeholder="https://example.com"
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="mb-2 text-3xl font-bold text-slate-900">
                Industry Template
              </h2>
              <p className="mb-6 text-slate-600">
                Pick a launch template and we will pre-configure your assistant.
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {INDUSTRY_TEMPLATES.map((template) => (
                  <button
                    type="button"
                    key={template}
                    onClick={() =>
                      setData({ ...data, industryTemplate: template })
                    }
                    className={`rounded-lg border-2 p-4 text-left transition-all ${
                      data.industryTemplate === template
                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-medium">{template}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="mb-2 text-3xl font-bold text-slate-900">
                Persona & Tone
              </h2>
              <p className="mb-6 text-slate-600">
                Define how your assistant sounds to customers.
              </p>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="bot-tone"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Tone
                  </label>
                  <select
                    id="bot-tone"
                    value={data.botTone || ''}
                    onChange={(event) =>
                      setData({ ...data, botTone: event.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  >
                    {TONE_OPTIONS.map((tone) => (
                      <option key={tone} value={tone}>
                        {tone}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="bot-persona"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Persona prompt
                  </label>
                  <textarea
                    id="bot-persona"
                    value={data.botPersona || ''}
                    onChange={(event) =>
                      setData({ ...data, botPersona: event.target.value })
                    }
                    rows={4}
                    placeholder="You are our friendly front-desk assistant. Keep replies short and helpful."
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  <div className="mb-1 font-semibold">Preview</div>
                  <p>
                    Hi! Thanks for contacting{' '}
                    {data.businessName || 'your business'}. I&apos;m your{' '}
                    {data.botTone?.toLowerCase() || 'professional'} assistant
                    and I can help with questions, appointments, and next steps.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="mb-2 text-3xl font-bold text-slate-900">
                Embed Your Widget
              </h2>
              <p className="mb-6 text-slate-600">
                Copy this one-line script and paste it before your closing
                <code className="mx-1 rounded bg-slate-100 px-1">
                  &lt;/body&gt;
                </code>
                tag.
              </p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <code className="block break-all text-sm text-slate-800">
                  {embedCode}
                </code>
              </div>
              <button
                type="button"
                onClick={handleCopyEmbed}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                <Copy size={16} />
                {copySuccess ? 'Copied!' : 'Copy embed code'}
              </button>
            </div>
          )}

          {step === 5 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Phone className="text-blue-600" size={24} />
                <h2 className="text-3xl font-bold text-slate-900">
                  Voice Add-on
                </h2>
              </div>
              <p className="mb-6 text-slate-600">
                Configure basic call coverage for after-hours and handoffs.
              </p>

              <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-4">
                <input
                  type="checkbox"
                  checked={Boolean(data.voiceEnabled)}
                  onChange={(event) =>
                    setData({ ...data, voiceEnabled: event.target.checked })
                  }
                  className="h-4 w-4"
                />
                <span className="font-medium text-slate-800">
                  Enable voice receptionist
                </span>
              </label>

              {data.voiceEnabled && (
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="voice-hours"
                      className="mb-1 block text-sm font-medium text-slate-700"
                    >
                      Business hours
                    </label>
                    <select
                      id="voice-hours"
                      value={data.businessHours || ''}
                      onChange={(event) =>
                        setData({ ...data, businessHours: event.target.value })
                      }
                      className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                    >
                      {VOICE_HOURS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="transfer-number"
                      className="mb-1 block text-sm font-medium text-slate-700"
                    >
                      Human transfer number
                    </label>
                    <input
                      id="transfer-number"
                      type="tel"
                      value={data.transferNumber || ''}
                      onChange={(event) =>
                        setData({ ...data, transferNumber: event.target.value })
                      }
                      placeholder="+1 555 123 4567"
                      className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6">
            <div>
              {onSkip && step === 1 && (
                <button
                  type="button"
                  onClick={onSkip}
                  className="text-slate-600 hover:text-slate-900"
                >
                  Skip for now
                </button>
              )}
            </div>

            <div className="flex gap-3">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((prev) => Math.max(1, prev - 1))}
                  className="flex items-center gap-2 rounded-lg border border-slate-300 px-6 py-2 hover:bg-slate-50"
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                disabled={!canGoNext || isSaving}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {step < 5 ? (
                  <>
                    Next
                    <ArrowRight size={16} />
                  </>
                ) : (
                  <>
                    {isSaving ? 'Saving...' : 'Finish Setup'}
                    <CheckCircle size={16} />
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Sparkles size={14} />
            Step {step} of 5
          </div>
        </div>
      </div>
    </div>
  );
};
