import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { BotConfig, botConfigSchema } from '../../shared/schema-agentic-os';
import { Input } from '../UI/Input';
import { Textarea } from '../UI/Textarea';
import { Button } from '../UI/Button';
import { Checkbox } from '../UI/Checkbox';
import { Label } from '../UI/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../UI/Select';
import { toast } from 'sonner';
import { Loader2, Save, PlusCircle, Trash2, Settings, MessageSquare, BookOpen, Volume2, Zap, LayoutDashboard } from 'lucide-react';
import { KnowledgeBaseManager } from './KnowledgeBaseManager';
import { VoiceAgentConfigComponent as VoiceAgentConfig } from './VoiceAgentConfig';
import { ToolBuilder } from './ToolBuilder';
import { BotService } from '../../server/services/BotService'; // Assuming this path for client-side interaction
import ConfigValidator from './ConfigValidator'; // Import the new validator component

// Mock API calls for demonstration. Replace with actual API integration.
const mockFetchBotConfig = async (id: string): Promise<BotConfig | null> => {
  console.log(`Fetching bot config for ID: ${id}`);
  return new Promise((resolve) => {
    setTimeout(() => {
      if (id === '123') {
        resolve({
          id: '123',
          name: 'Customer Support Bot',
          description: 'Handles common customer inquiries and routes complex issues.',
          systemPrompt: 'You are a helpful customer support assistant. Your goal is to provide accurate information and assist users efficiently. Be polite and concise. If you cannot answer, escalate to a human.',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 500,
          voiceEnabled: true,
          voiceConfig: {
            voiceId: 'cartesia-female-1',
            provider: 'Cartesia',
            speed: 1.0,
            pitch: 0,
          },
          knowledgeBaseConfig: {
            sources: [
              { type: 'URL', url: 'https://buildmybot.ai/faq', content: '', fileId: '' },
              { type: 'TEXT', content: 'Our business hours are M-F, 9 AM - 5 PM EST.', url: '', fileId: '' },
            ],
            chunkSize: 1000,
            overlap: 200,
          },
          integrations: {
            crm: { enabled: true, type: 'HubSpot', config: { apiKey: 'mock-hubspot-key' } },
            openaiApiKey: 'sk-mock-openai-key-1234567890',
          },
          tools: [
            { name: 'create_ticket', description: 'Creates a support ticket in the CRM.', schema: '{}' },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
          organizationId: 'org1',
          userId: 'user1',
        });
      } else {
        resolve(null);
      }
    }, 1000);
  });
};

const mockSaveBotConfig = async (config: BotConfig): Promise<BotConfig> => {
  console.log('Saving bot config:', config);
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ ...config, updatedAt: new Date() });
    }, 1000);
  });
};

type Tab = 'general' | 'knowledge' | 'voice' | 'tools' | 'integrations' | 'deployment';

const BotBuilder: React.FC = () => {
  const { botId } = useParams<{ botId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<any[]>([]); // State to hold validation errors from ConfigValidator
  const [isConfigValid, setIsConfigValid] = useState(true); // State for overall config validity

  const { control, handleSubmit, reset, watch, setValue, formState: { errors, isDirty } } = useForm<BotConfig>({
    resolver: zodResolver(botConfigSchema),
    defaultValues: {
      name: '',
      description: '',
      systemPrompt: '',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 500,
      voiceEnabled: false,
      voiceConfig: {
        voiceId: '',
        provider: '',
        speed: 1.0,
        pitch: 0,
      },
      knowledgeBaseConfig: {
        sources: [],
        chunkSize: 1000,
        overlap: 200,
      },
      integrations: {},
      tools: [],
    },
  });

  const watchedBotConfig = watch(); // Watch all form values for real-time validation

  useEffect(() => {
    if (botId) {
      setIsLoading(true);
      mockFetchBotConfig(botId)
        .then((config) => {
          if (config) {
            reset(config);
          } else {
            toast.error('Bot not found.');
          }
        })
        .catch((err) => {
          toast.error('Failed to load bot configuration.');
          console.error(err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [botId, reset]);

  const onSubmit = async (data: BotConfig) => {
    setIsSaving(true);
    try {
      const savedConfig = await mockSaveBotConfig(data);
      reset(savedConfig); // Reset form with saved data to clear isDirty
      toast.success('Bot configuration saved successfully!');
    } catch (error) {
      toast.error('Failed to save bot configuration.');
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleValidationChange = useCallback((isValid: boolean, errors: any[]) => {
    setIsConfigValid(isValid);
    setValidationErrors(errors);
  }, []);

  const handleFixAttempt = useCallback((field: string, suggestion: string) => {
    // Implement quick-fix logic here
    // This is a simplified example. Real implementation would involve more complex state updates.
    toast.info(`Attempting to fix '${field}': ${suggestion}`);
    if (field === 'systemPrompt') {
      if (watchedBotConfig.systemPrompt && watchedBotConfig.systemPrompt.length < 50) {
        setValue('systemPrompt', watchedBotConfig.systemPrompt + ' This is an expanded prompt to meet the minimum length requirement.', { shouldDirty: true });
      }
    } else if (field === 'knowledgeBaseConfig.sources') {
      // Example: Add a placeholder source if none exist
      if (!watchedBotConfig.knowledgeBaseConfig?.sources || watchedBotConfig.knowledgeBaseConfig.sources.length === 0) {
        setValue('knowledgeBaseConfig.sources', [{ type: 'TEXT', content: 'Default knowledge for common queries.', url: '', fileId: '' }], { shouldDirty: true });
      }
    } else if (field === 'voiceConfig.voiceId') {
      if (watchedBotConfig.voiceEnabled && (!watchedBotConfig.voiceConfig?.voiceId || watchedBotConfig.voiceConfig.voiceId.trim() === '')) {
        setValue('voiceConfig.voiceId', 'default-voice-id', { shouldDirty: true });
      }
    } else if (field === 'voiceConfig.provider') {
      if (watchedBotConfig.voiceEnabled && (!watchedBotConfig.voiceConfig?.provider || watchedBotConfig.voiceConfig.provider.trim() === '')) {
        setValue('voiceConfig.provider', 'Cartesia', { shouldDirty: true });
      }
    }
    // After attempting a fix, re-validate
    // The `watchedBotConfig` update will trigger `validateConfig` in `ConfigValidator` via `useEffect`
  }, [watchedBotConfig, setValue]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Bot Name</Label>
              <Controller
                name="name"
                control={control}
                render={({ field }) => <Input id="name" {...field} placeholder="e.g., Customer Support Agent" />}
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Controller
                name="description"
                control={control}
                render={({ field }) => <Textarea id="description" {...field} placeholder="A brief description of what this bot does." rows={3} />}
              />
              {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description.message}</p>}
            </div>
            <div>
              <Label htmlFor="systemPrompt">System Prompt</Label>
              <Controller
                name="systemPrompt"
                control={control}
                render={({ field }) => <Textarea id="systemPrompt" {...field} placeholder="Define the bot's persona, goals, and interaction style." rows={6} />}
              />
              {errors.systemPrompt && <p className="text-red-500 text-sm mt-1">{errors.systemPrompt.message}</p>}
            </div>
            <div>
              <Label htmlFor="model">AI Model</Label>
              <Controller
                name="model"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select an AI Model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.model && <p className="text-red-500 text-sm mt-1">{errors.model.message}</p>}
            </div>
            <div>
              <Label htmlFor="temperature">Temperature (Creativity)</Label>
              <Controller
                name="temperature"
                control={control}
                render={({ field }) => (
                  <Input
                    id="temperature"
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                  />
                )}
              />
              {errors.temperature && <p className="text-red-500 text-sm mt-1">{errors.temperature.message}</p>}
            </div>
            <div>
              <Label htmlFor="maxTokens">Max Tokens</Label>
              <Controller
                name="maxTokens"
                control={control}
                render={({ field }) => (
                  <Input
                    id="maxTokens"
                    type="number"
                    step="1"
                    min="100"
                    max="4000"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                )}
              />
              {errors.maxTokens && <p className="text-red-500 text-sm mt-1">{errors.maxTokens.message}</p>}
            </div>
          </div>
        );
      case 'knowledge':
        return (
          <KnowledgeBaseManager
            knowledgeBaseConfig={watchedBotConfig.knowledgeBaseConfig}
            onConfigChange={(newConfig) => setValue('knowledgeBaseConfig', newConfig, { shouldDirty: true })}
          />
        );
      case 'voice':
        return (
          <VoiceAgentConfig
            voiceEnabled={watchedBotConfig.voiceEnabled}
            voiceConfig={watchedBotConfig.voiceConfig}
            onVoiceEnabledChange={(enabled) => setValue('voiceEnabled', enabled, { shouldDirty: true })}
            onVoiceConfigChange={(newConfig) => setValue('voiceConfig', newConfig, { shouldDirty: true })}
          />
        );
      case 'tools':
        return (
          <ToolBuilder
            tools={watchedBotConfig.tools}
            onToolsChange={(newTools) => setValue('tools', newTools, { shouldDirty: true })}
          />
        );
      case 'integrations':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Integrations</h3>
            <p className="text-sm text-gray-600">Connect your bot to external services like CRM, analytics, and more.</p>
            {/* Example: OpenAI API Key for advanced features */}
            <div>
              <Label htmlFor="openaiApiKey">OpenAI API Key</Label>
              <Controller
                name="integrations.openaiApiKey"
                control={control}
                render={({ field }) => (
                  <Input
                    id="openaiApiKey"
                    type="password"
                    {...field}
                    placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                )}
              />
              {errors.integrations?.openaiApiKey && <p className="text-red-500 text-sm mt-1">{errors.integrations.openaiApiKey.message}</p>}
            </div>
            {/* Add more integration fields as needed */}
          </div>
        );
      case 'deployment':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Deployment Status & Validation</h3>
            <p className="text-sm text-gray-600">Review your bot's readiness for deployment.</p>
            <ConfigValidator
              botConfig={watchedBotConfig}
              onValidationChange={handleValidationChange}
              onFixAttempt={handleFixAttempt}
            />
            {!isConfigValid && validationErrors.length > 0 && (
              <div className="p-4 border border-red-400 bg-red-50 rounded-lg text-sm text-red-800">
                <p className="font-semibold mb-2">Deployment Blocked:</p>
                <ul className="list-disc list-inside space-y-1">
                  {validationErrors.filter(e => e.severity === 'error').map((error, index) => (
                    <li key={index}>{error.message}</li>
                  ))}
                </ul>
                {validationErrors.filter(e => e.severity === 'warning').length > 0 && (
                  <p className="mt-2">Please address the warnings to ensure optimal performance.</p>
                )}
              </div>
            )}
            <Button
              type="button"
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              disabled={!isConfigValid || isSaving}
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Deploy Bot
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-lg text-gray-600">Loading bot configuration...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 bg-white shadow-lg rounded-lg max-w-4xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Bot Builder: {botId ? 'Edit Bot' : 'New Bot'}</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex border-b border-gray-200 mb-6">
          <TabButton icon={<MessageSquare className="h-4 w-4" />} label="General" active={activeTab === 'general'} onClick={() => setActiveTab('general')} />
          <TabButton icon={<BookOpen className="h-4 w-4" />} label="Knowledge Base" active={activeTab === 'knowledge'} onClick={() => setActiveTab('knowledge')} />
          <TabButton icon={<Volume2 className="h-4 w-4" />} label="Voice Agent" active={activeTab === 'voice'} onClick={() => setActiveTab('voice')} />
          <TabButton icon={<Wrench className="h-4 w-4" />} label="Tools" active={activeTab === 'tools'} onClick={() => setActiveTab('tools')} />
          <TabButton icon={<Zap className="h-4 w-4" />} label="Integrations" active={activeTab === 'integrations'} onClick={() => setActiveTab('integrations')} />
          <TabButton icon={<LayoutDashboard className="h-4 w-4" />} label="Deployment" active={activeTab === 'deployment'} onClick={() => setActiveTab('deployment')} />
        </div>

        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
          {renderTabContent()}
        </div>

        <div className="flex justify-end space-x-3">
          {isDirty && <p className="text-sm text-gray-600 self-center">Unsaved changes</p>}
          <Button type="button" variant="outline" onClick={() => reset()} disabled={!isDirty || isSaving} className="min-h-[44px]">
            Discard
          </Button>
          <Button type="submit" disabled={isSaving} className="min-h-[44px]">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Configuration
          </Button>
        </div>
      </form>
    </div>
  );
};

interface TabButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ icon, label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 ${active
      ? 'border-blue-600 text-blue-600'
      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
    } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 min-h-[44px]`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

export default BotBuilder;
