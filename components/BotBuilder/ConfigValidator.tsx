import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, Lightbulb, XCircle, Wrench } from 'lucide-react';
import { BotConfig } from '../../shared/schema-agentic-os'; // Assuming a shared schema for bot config

interface ValidationResult {
  isValid: boolean;
  message: string;
  suggestion?: string;
  fixAction?: () => void;
  severity: 'info' | 'warning' | 'error';
  field: string;
}

interface ConfigValidatorProps {
  botConfig: Partial<BotConfig>;
  onValidationChange?: (isValid: boolean, errors: ValidationResult[]) => void;
  onFixAttempt?: (field: string, suggestion: string) => void;
}

const ConfigValidator: React.FC<ConfigValidatorProps> = ({
  botConfig,
  onValidationChange,
  onFixAttempt,
}) => {
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);

  const validateConfig = useCallback(() => {
    const results: ValidationResult[] = [];

    // 1. System Prompt Validation
    const systemPrompt = botConfig.systemPrompt || '';
    if (systemPrompt.length < 50) {
      results.push({
        isValid: false,
        message: 'System prompt is too short. A detailed prompt improves bot performance.',
        suggestion: 'Expand the system prompt to at least 50 characters, clearly defining the bot\'s role, goals, and interaction style.',
        severity: 'warning',
        field: 'systemPrompt',
      });
    } else if (systemPrompt.length > 2000) {
      results.push({
        isValid: false,
        message: 'System prompt is too long. Consider refining for conciseness.',
        suggestion: 'Condense the system prompt to under 2000 characters, focusing on essential instructions.',
        severity: 'warning',
        field: 'systemPrompt',
      });
    } else {
      results.push({
        isValid: true,
        message: 'System prompt looks good.',
        severity: 'info',
        field: 'systemPrompt',
      });
    }

    // 2. Knowledge Base Validation
    const knowledgeSources = botConfig.knowledgeBaseConfig?.sources || [];
    if (knowledgeSources.length === 0) {
      results.push({
        isValid: false,
        message: 'No knowledge sources configured. Bot may lack specific domain information.',
        suggestion: 'Add at least one knowledge source (PDF, URL, or text) to train your bot.',
        severity: 'warning',
        field: 'knowledgeBaseConfig.sources',
      });
    } else {
      const invalidSources = knowledgeSources.filter(source => !source.url && !source.content && !source.fileId);
      if (invalidSources.length > 0) {
        results.push({
          isValid: false,
          message: `Some knowledge sources are incomplete. ${invalidSources.length} sources are missing content or URL.`, 
          suggestion: 'Ensure all knowledge sources have either a URL, file, or direct content.',
          severity: 'error',
          field: 'knowledgeBaseConfig.sources',
        });
      } else {
        results.push({
          isValid: true,
          message: 'Knowledge base sources are configured.',
          severity: 'info',
          field: 'knowledgeBaseConfig.sources',
        });
      }
    }

    // 3. Voice Configuration Validation (if voice is enabled)
    if (botConfig.voiceEnabled) {
      const voiceConfig = botConfig.voiceConfig;
      if (!voiceConfig) {
        results.push({
          isValid: false,
          message: 'Voice is enabled but voice configuration is missing.',
          suggestion: 'Configure voice settings like voice ID and provider.',
          severity: 'error',
          field: 'voiceConfig',
        });
      } else {
        if (!voiceConfig.voiceId || voiceConfig.voiceId.trim() === '') {
          results.push({
            isValid: false,
            message: 'Voice ID is missing. A unique voice ID is required for human-like voice.',
            suggestion: 'Select a voice ID from the available options or provide a custom one.',
            severity: 'error',
            field: 'voiceConfig.voiceId',
          });
        }
        if (!voiceConfig.provider || voiceConfig.provider.trim() === '') {
          results.push({
            isValid: false,
            message: 'Voice provider is not selected.',
            suggestion: 'Choose a voice provider (e.g., Cartesia) for voice synthesis.',
            severity: 'error',
            field: 'voiceConfig.provider',
          });
        }
        if (voiceConfig.voiceId && voiceConfig.provider) {
          results.push({
            isValid: true,
            message: 'Voice configuration looks good.',
            severity: 'info',
            field: 'voiceConfig',
          });
        }
      }
    } else {
      results.push({
        isValid: true,
        message: 'Voice is disabled, no voice configuration needed.',
        severity: 'info',
        field: 'voiceConfig',
      });
    }

    // 4. API Key Format Validation (example for a hypothetical API key field)
    // Assuming botConfig.integrations?.openaiApiKey exists
    const openaiApiKey = botConfig.integrations?.openaiApiKey || '';
    if (openaiApiKey && !openaiApiKey.startsWith('sk-')) {
      results.push({
        isValid: false,
        message: 'OpenAI API Key format is incorrect. It should start with \'sk-\'.',
        suggestion: 'Please provide a valid OpenAI API key.',
        severity: 'warning',
        field: 'integrations.openaiApiKey',
      });
    } else if (openaiApiKey) {
      results.push({
        isValid: true,
        message: 'OpenAI API Key format is valid.',
        severity: 'info',
        field: 'integrations.openaiApiKey',
      });
    }

    setValidationResults(results);
    const overallValid = results.every(r => r.isValid || r.severity === 'info');
    onValidationChange?.(overallValid, results);
  }, [botConfig, onValidationChange]);

  useEffect(() => {
    validateConfig();
  }, [validateConfig]);

  const getIcon = (severity: ValidationResult['severity']) => {
    switch (severity) {
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'info':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <Lightbulb className="h-4 w-4 text-gray-500" />;
    }
  };

  const getBorderColor = (severity: ValidationResult['severity']) => {
    switch (severity) {
      case 'error':
        return 'border-red-400 bg-red-50';
      case 'warning':
        return 'border-yellow-400 bg-yellow-50';
      case 'info':
        return 'border-green-400 bg-green-50';
      default:
        return 'border-gray-300 bg-gray-50';
    }
  };

  const filteredResults = validationResults.filter(r => !r.isValid || r.suggestion);

  if (filteredResults.length === 0) {
    return (
      <div className="p-4 border border-green-400 bg-green-50 rounded-lg flex items-center space-x-2 text-sm text-green-800">
        <CheckCircle className="h-5 w-5" />
        <span>All configurations look good!</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filteredResults.map((result, index) => (
        <div
          key={index}
          className={`p-3 border rounded-lg flex items-start space-x-3 text-sm ${getBorderColor(result.severity)}`}
        >
          <div className="pt-1 flex-shrink-0">{getIcon(result.severity)}</div>
          <div className="flex-grow">
            <p className={`font-medium ${result.severity === 'error' ? 'text-red-800' : result.severity === 'warning' ? 'text-yellow-800' : 'text-gray-800'}`}>
              {result.message}
            </p>
            {result.suggestion && (
              <p className="mt-1 text-gray-700">
                <span className="font-semibold">Suggestion:</span> {result.suggestion}
              </p>
            )}
            {result.fixAction && (
              <button
                onClick={() => {
                  result.fixAction?.();
                  onFixAttempt?.(result.field, result.suggestion || '');
                }}
                className="mt-2 px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-xs font-medium min-h-[36px]"
              >
                <Wrench className="inline-block h-3 w-3 mr-1" /> Quick Fix
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ConfigValidator;
