import {
  ArrowLeft,
  ArrowRight,
  Check,
  MessageSquare,
  Palette,
  Play,
  Save,
  Sparkles,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import type { BotTemplate } from '../../shared/schema';
import type { Bot as BotType } from '../../types';
import { TemplateGallery } from './TemplateGallery';

interface SimplifiedBotWizardProps {
  onComplete: (bot: BotType) => void;
  onCancel: () => void;
}

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  systemPrompt: string;
  suggestedColor: string;
}

const QUICK_TEMPLATES: TemplateOption[] = [
  {
    id: 'support',
    name: 'Customer Support',
    description: 'Help customers resolve issues and answer questions',
    icon: '💬',
    category: 'Support',
    systemPrompt:
      'You are a helpful customer support agent. Be polite, patient, and concise. Your goal is to resolve issues quickly. If you do not know the answer, ask for their contact info.',
    suggestedColor: '#1e3a8a',
  },
  {
    id: 'sales',
    name: 'Sales Assistant',
    description: 'Qualify leads and schedule meetings',
    icon: '💼',
    category: 'Sales',
    systemPrompt:
      'You are a top-performing sales representative. Your goal is to qualify leads and close deals. Be persuasive but not pushy. Focus on value and benefits. Always try to get a meeting booked.',
    suggestedColor: '#047857',
  },
  {
    id: 'receptionist',
    name: 'AI Receptionist',
    description: 'Greet visitors and schedule appointments',
    icon: '📞',
    category: 'Reception',
    systemPrompt:
      'You are the front desk receptionist. Be warm and welcoming. Help schedule appointments and route calls. Keep responses short and professional.',
    suggestedColor: '#d97706',
  },
  {
    id: 'scheduler',
    name: 'Appointment Scheduler',
    description: 'Book and manage appointments efficiently',
    icon: '📅',
    category: 'Scheduling',
    systemPrompt:
      'You are a dedicated scheduling assistant. Your primary goal is to book appointments. Be efficient and accommodating. Always offer specific time slots and confirm details.',
    suggestedColor: '#7c3aed',
  },
  {
    id: 'product',
    name: 'Product Specialist',
    description: 'Help customers find the right products',
    icon: '🛍️',
    category: 'E-commerce',
    systemPrompt:
      'You are an expert product specialist. Assist customers in finding the perfect product. Ask about their needs, compare options, and explain benefits clearly.',
    suggestedColor: '#be123c',
  },
  {
    id: 'custom',
    name: 'Custom Bot',
    description: 'Start from scratch with your own settings',
    icon: '⚙️',
    category: 'Custom',
    systemPrompt: 'You are a helpful assistant.',
    suggestedColor: '#64748b',
  },
];

const THEME_COLORS = [
  { name: 'Blue', value: '#1e3a8a' },
  { name: 'Green', value: '#047857' },
  { name: 'Orange', value: '#d97706' },
  { name: 'Purple', value: '#7c3aed' },
  { name: 'Red', value: '#be123c' },
  { name: 'Slate', value: '#64748b' },
];

export const SimplifiedBotWizard: React.FC<SimplifiedBotWizardProps> = ({
  onComplete,
  onCancel,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<
    TemplateOption | BotTemplate | null
  >(null);
  const [useMarketplace, setUseMarketplace] = useState(false);
  const [botConfig, setBotConfig] = useState({
    name: '',
    themeColor: '#1e3a8a',
    systemPrompt: '',
    model: 'gpt-5o-mini' as const,
    temperature: 0.7,
    responseDelay: 2000,
    randomizeIdentity: true,
  });
  const [testMessage, setTestMessage] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  const handleTemplateSelect = (template: TemplateOption | BotTemplate) => {
    setSelectedTemplate(template);
    if ('systemPrompt' in template && 'id' in template) {
      // BotTemplate from marketplace
      const botTemplate = template as BotTemplate;
      const templateConfig =
        botTemplate.configuration &&
        typeof botTemplate.configuration === 'object' &&
        !Array.isArray(botTemplate.configuration)
          ? (botTemplate.configuration as Record<string, unknown>)
          : null;
      const themeColor =
        templateConfig && typeof templateConfig.themeColor === 'string'
          ? templateConfig.themeColor
          : '#1e3a8a';
      setBotConfig({
        ...botConfig,
        name: botTemplate.name || '',
        systemPrompt: botTemplate.systemPrompt || '',
        themeColor: themeColor,
      });
    } else {
      // Quick template
      const quickTemplate = template as TemplateOption;
      setBotConfig({
        ...botConfig,
        name: quickTemplate.name,
        themeColor: quickTemplate.suggestedColor,
        systemPrompt: quickTemplate.systemPrompt,
      });
    }
  };

  const handleNext = () => {
    if (step === 1 && selectedTemplate) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const handleTestBot = () => {
    setIsTesting(true);
    // Simulate bot response
    setTimeout(() => {
      setTestResponse(
        `Great question! As a ${selectedTemplate?.name}, I'm here to help you with that. How can I assist you further?`,
      );
      setIsTesting(false);
    }, 1500);
  };

  const handleDeploy = () => {
    const newBot: BotType = {
      id: 'new',
      name: botConfig.name,
      type: selectedTemplate?.category || 'Custom',
      systemPrompt: botConfig.systemPrompt,
      model: botConfig.model,
      temperature: botConfig.temperature,
      knowledgeBase: [],
      active: true,
      conversationsCount: 0,
      themeColor: botConfig.themeColor,
      maxMessages: 20,
      randomizeIdentity: botConfig.randomizeIdentity,
      responseDelay: botConfig.responseDelay,
      embedType: 'hover',
    };
    onComplete(newBot);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="text-blue-600" size={24} />
              Create Your Bot
            </h2>
            <p className="text-sm text-slate-500 mt-1">Step {step} of 3</p>
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
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`flex-1 h-2 rounded-full transition-all ${
                  s <= step ? 'bg-blue-600' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>Choose Template</span>
            <span>Configure</span>
            <span>Test & Deploy</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Template Selection */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Choose a Template
                </h3>
                <p className="text-sm text-slate-600">
                  Select a pre-configured bot template to get started quickly,
                  or build your own from scratch.
                </p>
              </div>

              {/* Template Source Toggle */}
              <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setUseMarketplace(false)}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    !useMarketplace
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Quick Templates
                </button>
                <button
                  type="button"
                  onClick={() => setUseMarketplace(true)}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    useMarketplace
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Marketplace
                </button>
              </div>

              {useMarketplace ? (
                <TemplateGallery
                  onSelect={(template) => {
                    handleTemplateSelect(template);
                    setStep(2);
                  }}
                  selectedTemplateId={
                    selectedTemplate && 'id' in selectedTemplate
                      ? selectedTemplate.id
                      : undefined
                  }
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {QUICK_TEMPLATES.map((template) => (
                    <button
                      type="button"
                      key={template.id}
                      onClick={() => handleTemplateSelect(template)}
                      className={`text-left p-4 rounded-xl border-2 transition-all ${
                        selectedTemplate &&
                        'id' in selectedTemplate &&
                        selectedTemplate.id === template.id
                          ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-slate-200 hover:border-blue-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-3xl">{template.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 flex items-center gap-2">
                            {template.name}
                            {selectedTemplate &&
                              'id' in selectedTemplate &&
                              selectedTemplate.id === template.id && (
                                <Check className="text-blue-600" size={16} />
                              )}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {template.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Quick Configuration */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Configure Your Bot
                </h3>
                <p className="text-sm text-slate-600">
                  Customize the basic settings for your bot.
                </p>
              </div>

              <div className="space-y-4">
                {/* Bot Name */}
                <div>
                  <label
                    htmlFor="bot-wizard-name"
                    className="block text-sm font-medium text-slate-700 mb-2"
                  >
                    Bot Name
                  </label>
                  <input
                    id="bot-wizard-name"
                    type="text"
                    value={botConfig.name}
                    onChange={(e) =>
                      setBotConfig({ ...botConfig, name: e.target.value })
                    }
                    placeholder="e.g., Customer Support Bot"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  />
                </div>

                {/* Theme Color */}
                <fieldset>
                  <legend className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                    <Palette size={16} />
                    Theme Color
                  </legend>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    {THEME_COLORS.map((color) => (
                      <button
                        type="button"
                        key={color.value}
                        onClick={() =>
                          setBotConfig({
                            ...botConfig,
                            themeColor: color.value,
                          })
                        }
                        className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                          botConfig.themeColor === color.value
                            ? 'border-slate-900 ring-2 ring-slate-300'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div
                          className="w-6 h-6 rounded-full"
                          style={{ backgroundColor: color.value }}
                        />
                        <span className="text-xs font-medium text-slate-700">
                          {color.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                {/* System Prompt (Optional) */}
                <div>
                  <label
                    htmlFor="bot-wizard-prompt"
                    className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2"
                  >
                    <MessageSquare size={16} />
                    Instructions (Optional)
                  </label>
                  <textarea
                    id="bot-wizard-prompt"
                    value={botConfig.systemPrompt}
                    onChange={(e) =>
                      setBotConfig({
                        ...botConfig,
                        systemPrompt: e.target.value,
                      })
                    }
                    rows={4}
                    placeholder="Customize how your bot should behave..."
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Advanced: Modify the bot's behavior and personality
                  </p>
                </div>

                {/* Human-Like Behavior */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <label
                        htmlFor="bot-wizard-randomize"
                        className="text-sm font-medium text-slate-700 flex items-center gap-2"
                      >
                        <Sparkles size={16} />
                        Human-Like Identity
                      </label>
                      <p className="text-xs text-slate-500 mt-1">
                        Bot uses random names/avatars to feel more natural
                      </p>
                    </div>
                    <input
                      id="bot-wizard-randomize"
                      type="checkbox"
                      checked={botConfig.randomizeIdentity}
                      onChange={(e) =>
                        setBotConfig({
                          ...botConfig,
                          randomizeIdentity: e.target.checked,
                        })
                      }
                      className="w-5 h-5 rounded text-blue-600 focus:ring-blue-600"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Test & Deploy */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Test & Deploy
                </h3>
                <p className="text-sm text-slate-600">
                  Try out your bot before deploying it to your website.
                </p>
              </div>

              {/* Bot Preview */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold"
                    style={{ backgroundColor: botConfig.themeColor }}
                  >
                    {botConfig.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">
                      {botConfig.name}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Online
                    </div>
                  </div>
                </div>

                {/* Test Chat Interface */}
                <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3 min-h-[200px]">
                  {!testResponse && !isTesting && (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      <Play className="mx-auto mb-2 opacity-50" size={24} />
                      Send a test message to see how your bot responds
                    </div>
                  )}

                  {testMessage && (
                    <div className="flex justify-end">
                      <div className="bg-blue-600 text-white px-4 py-2 rounded-2xl rounded-br-sm max-w-[80%]">
                        {testMessage}
                      </div>
                    </div>
                  )}

                  {isTesting && (
                    <div className="flex justify-start">
                      <div className="bg-slate-100 px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1">
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                        <div
                          className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                          style={{ animationDelay: '0.1s' }}
                        />
                        <div
                          className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                          style={{ animationDelay: '0.2s' }}
                        />
                      </div>
                    </div>
                  )}

                  {testResponse && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-200 px-4 py-2 rounded-2xl rounded-bl-sm max-w-[80%]">
                        {testResponse}
                      </div>
                    </div>
                  )}
                </div>

                {/* Test Input */}
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleTestBot()}
                    placeholder="Type a test message..."
                    className="flex-1 px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={handleTestBot}
                    disabled={!testMessage.trim() || isTesting}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
                  >
                    <Play size={16} />
                    Test
                  </button>
                </div>
              </div>

              {/* Deploy Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Zap className="text-blue-600 shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      Ready to deploy!
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      Your bot will be saved and ready to embed on your website
                      or share via link.
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
            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={step === 1 && !selectedTemplate}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2 transition"
              >
                Next
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDeploy}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2 transition"
              >
                <Save size={16} />
                Deploy Bot
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
