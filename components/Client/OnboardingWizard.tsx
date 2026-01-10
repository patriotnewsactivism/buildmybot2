/**
 * Onboarding Wizard Component
 * 3-step guided bot creation flow for new clients
 */

import { ArrowLeft, ArrowRight, CheckCircle, Sparkles } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import type { BotTemplate } from '../../shared/schema';

interface OnboardingWizardProps {
  onComplete: (data: OnboardingData) => Promise<void>;
  onSkip?: () => void;
}

interface OnboardingData {
  industry?: string;
  goal?: string;
  template?: BotTemplate;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  onComplete,
  onSkip,
}) => {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>({});

  const industries = [
    'Real Estate',
    'Dental',
    'HVAC',
    'Legal',
    'Healthcare',
    'E-commerce',
    'SaaS',
    'Other',
  ];

  const goals = [
    'Capture leads',
    'Answer FAQs',
    'Schedule appointments',
    'Provide customer support',
    'Generate sales',
  ];

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      onComplete(data);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const progress = (step / 3) * 100;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Progress Bar */}
        <div className="h-2 bg-slate-200">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-8">
          {/* Step 1: Choose Industry */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="text-blue-600" size={24} />
                <h2 className="text-3xl font-bold text-slate-900">
                  Choose Your Industry
                </h2>
              </div>
              <p className="text-slate-600 mb-8">
                We'll customize templates and guidance for your industry.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {industries.map((industry) => (
                  <button
                    type="button"
                    key={industry}
                    onClick={() => setData({ ...data, industry })}
                    className={`
                      p-4 rounded-lg border-2 transition-all
                      ${
                        data.industry === industry
                          ? 'border-blue-600 bg-blue-50 text-blue-900'
                          : 'border-slate-200 hover:border-slate-300'
                      }
                    `}
                  >
                    {industry}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Set Goal */}
          {step === 2 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="text-blue-600" size={24} />
                <h2 className="text-3xl font-bold text-slate-900">
                  What's Your Primary Goal?
                </h2>
              </div>
              <p className="text-slate-600 mb-8">
                Tell us what you want your bot to accomplish.
              </p>

              <div className="space-y-3">
                {goals.map((goal) => (
                  <button
                    type="button"
                    key={goal}
                    onClick={() => setData({ ...data, goal })}
                    className={`
                      w-full p-4 rounded-lg border-2 text-left transition-all
                      ${
                        data.goal === goal
                          ? 'border-blue-600 bg-blue-50 text-blue-900'
                          : 'border-slate-200 hover:border-slate-300'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{goal}</span>
                      {data.goal === goal && (
                        <CheckCircle className="text-blue-600" size={20} />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Review & Deploy */}
          {step === 3 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="text-blue-600" size={24} />
                <h2 className="text-3xl font-bold text-slate-900">
                  Ready to Deploy!
                </h2>
              </div>
              <p className="text-slate-600 mb-8">
                Review your selections and we'll create your first bot.
              </p>

              <div className="bg-slate-50 rounded-lg p-6 space-y-4">
                <div>
                  <span className="text-sm text-slate-600">Industry:</span>
                  <p className="font-semibold text-slate-900">
                    {data.industry || 'Not selected'}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-slate-600">Primary Goal:</span>
                  <p className="font-semibold text-slate-900">
                    {data.goal || 'Not selected'}
                  </p>
                </div>
              </div>

              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  We'll create a bot optimized for {data.industry} businesses
                  focused on {data.goal?.toLowerCase()}. You can customize
                  everything after creation!
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between items-center mt-8 pt-6 border-t border-slate-200">
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
                  onClick={handleBack}
                  className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-2"
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                disabled={
                  (step === 1 && !data.industry) || (step === 2 && !data.goal)
                }
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {step < 3 ? (
                  <>
                    Next
                    <ArrowRight size={16} />
                  </>
                ) : (
                  <>
                    Create Bot
                    <CheckCircle size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
