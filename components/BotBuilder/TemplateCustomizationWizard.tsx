import React, { useState } from 'react';
import type { BotTemplate } from '../../shared/schema';
import { Button } from '../UI/Button'; // Assuming a Button component exists
import { Input } from '../UI/Input'; // Assuming an Input component exists
import { Textarea } from '../UI/Textarea'; // Assuming a Textarea component exists
import { Select } from '../UI/Select'; // Assuming a Select component exists

interface TemplateCustomizationWizardProps {
  template: BotTemplate;
  onClose: () => void;
  onDeploy: (customizedBot: any) => void; // TODO: Define a more specific type for customizedBot
}

interface CustomBotSettings {
  name: string;
  description: string;
  industry: string;
  systemPrompt: string;
  knowledgeBaseJson: string; // Will be parsed to JSON
  leadCaptureConfig: string; // Will be parsed to JSON
  voiceSettings: string; // Will be parsed to JSON
  themeColor: string;
  model: string;
  temperature: number;
}

const Step1ChooseTemplate: React.FC<{ template: BotTemplate; onNext: () => void }>
 = ({ template, onNext }) => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-slate-800">Step 1: Review Template</h2>
    <div className="p-6 bg-white rounded-lg border border-slate-200 shadow-sm">
      <h3 className="text-xl font-semibold text-slate-900 mb-2">{template.name}</h3>
      <p className="text-slate-600 mb-4">{template.description}</p>
      <div className="grid grid-cols-2 gap-4 text-sm text-slate-700">
        <div>
          <p className="font-medium">Industry:</p>
          <p>{template.industry}</p>
        </div>
        <div>
          <p className="font-medium">Category:</p>
          <p>{template.category}</p>
        </div>
        <div>
          <p className="font-medium">Rating:</p>
          <p>{template.rating ? `${template.rating.toFixed(1)} stars` : 'N/A'}</p>
        </div>
        <div>
          <p className="font-medium">Installs:</p>
          <p>{template.installCount || 0}</p>
        </div>
      </div>
    </div>
    <div className="flex justify-end">
      <Button onClick={onNext}>Next: Customize Branding</Button>
    </div>
  </div>
);

const Step2CustomizeBranding: React.FC<{ settings: CustomBotSettings; onUpdate: (updates: Partial<CustomBotSettings>) => void; onBack: () => void; onNext: () => void }>
 = ({ settings, onUpdate, onBack, onNext }) => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-slate-800">Step 2: Customize Your Bot</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label htmlFor="botName" className="block text-sm font-medium text-slate-700 mb-1">
          Bot Name
        </label>
        <Input
          id="botName"
          type="text"
          value={settings.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="e.g., My Customer Support Bot"
        />
      </div>
      <div>
        <label htmlFor="industry" className="block text-sm font-medium text-slate-700 mb-1">
          Industry
        </label>
        <Input
          id="industry"
          type="text"
          value={settings.industry}
          onChange={(e) => onUpdate({ industry: e.target.value })}
          placeholder="e.g., E-commerce"
        />
      </div>
      <div className="md:col-span-2">
        <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
          Bot Description
        </label>
        <Textarea
          id="description"
          value={settings.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="A brief description of your bot's purpose."
          rows={3}
        />
      </div>
      <div>
        <label htmlFor="themeColor" className="block text-sm font-medium text-slate-700 mb-1">
          Theme Color
        </label>
        <Input
          id="themeColor"
          type="color"
          value={settings.themeColor}
          onChange={(e) => onUpdate({ themeColor: e.target.value })}
          className="h-10 w-full p-1 rounded-md border border-slate-300"
        />
      </div>
      <div>
        <label htmlFor="model" className="block text-sm font-medium text-slate-700 mb-1">
          AI Model
        </label>
        <Select
          id="model"
          value={settings.model}
          onChange={(e) => onUpdate({ model: e.target.value })}
        >
          <option value="gpt-4o-mini">GPT-4o Mini</option>
          <option value="gpt-4o">GPT-4o</option>
          <option value="claude-3-opus">Claude 3 Opus</option>
          <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
        </Select>
      </div>
      <div>
        <label htmlFor="temperature" className="block text-sm font-medium text-slate-700 mb-1">
          Temperature (Creativity)
        </label>
        <Input
          id="temperature"
          type="range"
          min="0" max="1" step="0.1"
          value={settings.temperature}
          onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
          className="w-full"
        />
        <span className="text-xs text-slate-500">{settings.temperature.toFixed(1)}</span>
      </div>
    </div>
    <div className="flex justify-between">
      <Button variant="secondary" onClick={onBack}>Back</Button>
      <Button onClick={onNext}>Next: Advanced Settings</Button>
    </div>
  </div>
);

const Step3Deploy: React.FC<{ settings: CustomBotSettings; onUpdate: (updates: Partial<CustomBotSettings>) => void; onBack: () => void; onDeploy: () => void }>
 = ({ settings, onUpdate, onBack, onDeploy }) => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-slate-800">Step 3: Advanced Settings & Deploy</h2>
    <div className="space-y-4">
      <div>
        <label htmlFor="systemPrompt" className="block text-sm font-medium text-slate-700 mb-1">
          System Prompt
        </label>
        <Textarea
          id="systemPrompt"
          value={settings.systemPrompt}
          onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
          placeholder="Define your bot's personality and instructions."
          rows={6}
        />
      </div>
      <div>
        <label htmlFor="knowledgeBaseJson" className="block text-sm font-medium text-slate-700 mb-1">
          Knowledge Base (JSON)
        </label>
        <Textarea
          id="knowledgeBaseJson"
          value={settings.knowledgeBaseJson}
          onChange={(e) => onUpdate({ knowledgeBaseJson: e.target.value })}
          placeholder="Enter JSON for knowledge base configuration."
          rows={6}
          className="font-mono text-xs"
        />
        <p className="text-xs text-slate-500 mt-1">Ensure this is valid JSON.</p>
      </div>
      <div>
        <label htmlFor="leadCaptureConfig" className="block text-sm font-medium text-slate-700 mb-1">
          Lead Capture Configuration (JSON)
        </label>
        <Textarea
          id="leadCaptureConfig"
          value={settings.leadCaptureConfig}
          onChange={(e) => onUpdate({ leadCaptureConfig: e.target.value })}
          placeholder="Enter JSON for lead capture settings."
          rows={4}
          className="font-mono text-xs"
        />
        <p className="text-xs text-slate-500 mt-1">Ensure this is valid JSON.</p>
      </div>
      <div>
        <label htmlFor="voiceSettings" className="block text-sm font-medium text-slate-700 mb-1">
          Voice Settings (JSON)
        </label>
        <Textarea
          id="voiceSettings"
          value={settings.voiceSettings}
          onChange={(e) => onUpdate({ voiceSettings: e.target.value })}
          placeholder="Enter JSON for voice agent settings."
          rows={4}
          className="font-mono text-xs"
        />
        <p className="text-xs text-slate-500 mt-1">Ensure this is valid JSON.</p>
      </div>
    </div>
    <div className="flex justify-between">
      <Button variant="secondary" onClick={onBack}>Back</Button>
      <Button onClick={onDeploy}>Deploy Bot</Button>
    </div>
  </div>
);

export const TemplateCustomizationWizard: React.FC<TemplateCustomizationWizardProps> = ({
  template,
  onClose,
  onDeploy,
}) => {
  const [step, setStep] = useState(1);
  const [customSettings, setCustomSettings] = useState<CustomBotSettings>({
    name: `${template.name} (Customized)`,
    description: template.description || '',
    industry: template.industry || '',
    systemPrompt: template.systemPrompt || '',
    knowledgeBaseJson: JSON.stringify(template.knowledgeBaseJson || {}, null, 2),
    leadCaptureConfig: JSON.stringify(template.leadCaptureConfig || {}, null, 2),
    voiceSettings: JSON.stringify(template.voiceSettings || {}, null, 2),
    themeColor: '#1e3a8a', // Default theme color
    model: 'gpt-4o-mini', // Default model
    temperature: 0.7, // Default temperature
  });

  const updateSettings = (updates: Partial<CustomBotSettings>) => {
    setCustomSettings((prev) => ({ ...prev, ...updates }));
  };

  const handleDeploy = () => {
    try {
      const parsedSettings = {
        ...customSettings,
        knowledgeBaseJson: JSON.parse(customSettings.knowledgeBaseJson),
        leadCaptureConfig: JSON.parse(customSettings.leadCaptureConfig),
        voiceSettings: JSON.parse(customSettings.voiceSettings),
      };
      onDeploy(parsedSettings);
    } catch (e) {
      console.error('Failed to parse JSON settings:', e);
      alert('Please ensure all JSON fields are valid.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="relative w-full max-w-3xl bg-slate-50 rounded-lg shadow-xl p-8 overflow-y-auto max-h-[90vh]">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
          aria-label="Close wizard"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Bot Customization Wizard</h1>
          <p className="text-slate-600">Follow these steps to tailor your bot template.</p>
        </div>

        {/* Progress Indicator */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex-1 text-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-1 ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}
            >
              1
            </div>
            <span className="text-sm text-slate-700">Choose Template</span>
          </div>
          <div className="flex-1 border-t-2 border-slate-200 mx-2" />
          <div className="flex-1 text-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-1 ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}
            >
              2
            </div>
            <span className="text-sm text-slate-700">Customize Branding</span>
          </div>
          <div className="flex-1 border-t-2 border-slate-200 mx-2" />
          <div className="flex-1 text-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-1 ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}
            >
              3
            </div>
            <span className="text-sm text-slate-700">Deploy</span>
          </div>
        </div>

        {step === 1 && (
          <Step1ChooseTemplate
            template={template}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <Step2CustomizeBranding
            settings={customSettings}
            onUpdate={updateSettings}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3Deploy
            settings={customSettings}
            onUpdate={updateSettings}
            onBack={() => setStep(2)}
            onDeploy={handleDeploy}
          />
        )}
      </div>
    </div>
  );
};
