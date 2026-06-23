import React, { useState } from 'react';
import type { BotTemplate } from '../../shared/schema';

// Simple UI components to replace missing imports
const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }> = ({
  children,
  className = '',
  variant = 'primary',
  ...props
}) => {
  const variantClasses = variant === 'secondary' ? 'bg-gray-100 hover:bg-gray-200 text-gray-800' : 'bg-blue-600 hover:bg-blue-700 text-white';
  return (
    <button
      className={`inline-flex items-center justify-center font-medium rounded-md px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...props }) => (
  <input
    className={`flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
    {...props}
  />
);

const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className = '', ...props }) => (
  <textarea
    className={`flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
    {...props}
  />
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ children, className = '', ...props }) => (
  <select
    className={`flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
    {...props}
  >
    {children}
  </select>
);

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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ name: e.target.value })}
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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ industry: e.target.value })}
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
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdate({ description: e.target.value })}
          placeholder="A brief description of your bot's purpose."
          rows={3}
        />
      </div>
      <div>
        <label htmlFor="themeColor" className="block text-sm font-medium text-slate-700 mb-1">
          Theme Color
        </label>
        <div className="flex items-center space-x-3">
          <Input
            id="themeColor"
            type="color"
            value={settings.themeColor}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ themeColor: e.target.value })}
            className="w-12 h-10 p-0 border-none cursor-pointer"
          />
          <span className="text-sm font-mono">{settings.themeColor}</span>
        </div>
      </div>
      <div>
        <label htmlFor="model" className="block text-sm font-medium text-slate-700 mb-1">
          AI Model
        </label>
        <Select
          id="model"
          value={settings.model}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onUpdate({ model: e.target.value })}
        >
          <option value="gpt-4o-mini">gpt-4o-mini (Fast & Cost-Effective)</option>
          <option value="gpt-4o">gpt-4o (Smart & Accurate)</option>
          <option value="grok-4-1-fast-reasoning">grok-4-1-fast-reasoning</option>
        </Select>
      </div>
    </div>
    <div className="flex justify-between">
      <Button variant="secondary" onClick={onBack}>Back</Button>
      <Button onClick={onNext}>Next: Advanced Prompting</Button>
    </div>
  </div>
);

const Step3AdvancedPrompting: React.FC<{ settings: CustomBotSettings; onUpdate: (updates: Partial<CustomBotSettings>) => void; onBack: () => void; onNext: () => void }>
 = ({ settings, onUpdate, onBack, onNext }) => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-slate-800">Step 3: Refine System Instructions</h2>
    <div className="space-y-4">
      <div>
        <label htmlFor="systemPrompt" className="block text-sm font-medium text-slate-700 mb-1">
          System Instructions
        </label>
        <Textarea
          id="systemPrompt"
          value={settings.systemPrompt}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdate({ systemPrompt: e.target.value })}
          placeholder="Give your bot its personality and rules. (e.g., 'You are a helpful and polite receptionist. Do not answer questions outside of...')"
          rows={10}
        />
        <p className="text-xs text-slate-500 mt-1">These instructions define your bot's behavior and guardrails.</p>
      </div>
      <div>
        <label htmlFor="temperature" className="block text-sm font-medium text-slate-700 mb-1">
          Creativity Level (Temperature)
        </label>
        <div className="flex items-center space-x-4">
          <Input
            id="temperature"
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.temperature}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ temperature: parseFloat(e.target.value) })}
            className="flex-1"
          />
          <span className="text-sm font-mono w-8 text-right">{settings.temperature}</span>
        </div>
        <p className="text-xs text-slate-500">Lower values make the bot more factual and deterministic. Higher values make it more creative.</p>
      </div>
    </div>
    <div className="flex justify-between">
      <Button variant="secondary" onClick={onBack}>Back</Button>
      <Button onClick={onNext}>Next: Knowledge & Integrations</Button>
    </div>
  </div>
);

const Step4KnowledgeIntegrations: React.FC<{ settings: CustomBotSettings; onUpdate: (updates: Partial<CustomBotSettings>) => void; onBack: () => void; onDeploy: () => void }>
 = ({ settings, onUpdate, onBack, onDeploy }) => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-slate-800">Step 4: Knowledge Base & Configuration</h2>
    <div className="space-y-4">
      <div>
        <label htmlFor="kbJson" className="block text-sm font-medium text-slate-700 mb-1">
          Custom Knowledge Base (JSON format)
        </label>
        <Textarea
          id="kbJson"
          value={settings.knowledgeBaseJson}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdate({ knowledgeBaseJson: e.target.value })}
          placeholder="Enter JSON for custom knowledge base settings."
          rows={4}
          className="font-mono text-xs"
        />
        <p className="text-xs text-slate-500 mt-1">Ensure this is valid JSON.</p>
      </div>
      <div>
        <label htmlFor="leadCapture" className="block text-sm font-medium text-slate-700 mb-1">
          Lead Capture Form Config (JSON format)
        </label>
        <Textarea
          id="leadCapture"
          value={settings.leadCaptureConfig}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdate({ leadCaptureConfig: e.target.value })}
          placeholder="Enter JSON for lead capture settings."
          rows={4}
          className="font-mono text-xs"
        />
        <p className="text-xs text-slate-500 mt-1">Ensure this is valid JSON.</p>
      </div>
      <div>
        <label htmlFor="voiceSettings" className="block text-sm font-medium text-slate-700 mb-1">
          Voice Agent Configuration (JSON format)
        </label>
        <Textarea
          id="voiceSettings"
          value={settings.voiceSettings}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdate({ voiceSettings: e.target.value })}
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
    knowledgeBaseJson: JSON.stringify((template as any).knowledgeBaseJson || {}, null, 2),
    leadCaptureConfig: JSON.stringify((template as any).leadCaptureConfig || {}, null, 2),
    voiceSettings: JSON.stringify((template as any).voiceSettings || {}, null, 2),
    themeColor: '#1e3a8a', // Default theme color
    model: 'gpt-4o-mini', // Default model
    temperature: 0.7, // Default temperature
  });

  const updateSettings = (updates: Partial<CustomBotSettings>) => {
    setCustomSettings((prev) => ({ ...prev, ...updates }));
  };

  const handleDeploy = () => {
    try {
      const parsedKB = JSON.parse(customSettings.knowledgeBaseJson);
      const parsedLead = JSON.parse(customSettings.leadCaptureConfig);
      const parsedVoice = JSON.parse(customSettings.voiceSettings);

      const customizedBot = {
        name: customSettings.name,
        description: customSettings.description,
        industry: customSettings.industry,
        systemPrompt: customSettings.systemPrompt,
        knowledgeBase: parsedKB,
        leadCaptureConfig: parsedLead,
        voiceSettings: parsedVoice,
        themeColor: customSettings.themeColor,
        model: customSettings.model,
        temperature: customSettings.temperature,
        templateId: template.id,
      };

      onDeploy(customizedBot);
    } catch (e: any) {
      alert(`Invalid JSON format in custom configuration: ${e.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
      <div className="bg-slate-50 w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Progress Bar */}
        <div className="w-full bg-slate-200 h-1.5 flex">
          <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${(step / 4) * 100}%` }} />
        </div>

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
          <div>
            <span className="text-xs font-semibold text-blue-600 tracking-wider uppercase">Bot Wizard</span>
            <h1 className="text-xl font-bold text-slate-800">Customize: {template.name}</h1>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6">
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
            <Step3AdvancedPrompting
              settings={customSettings}
              onUpdate={updateSettings}
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
            />
          )}

          {step === 4 && (
            <Step4KnowledgeIntegrations
              settings={customSettings}
              onUpdate={updateSettings}
              onBack={() => setStep(3)}
              onDeploy={handleDeploy}
            />
          )}
        </div>
      </div>
    </div>
  );
};