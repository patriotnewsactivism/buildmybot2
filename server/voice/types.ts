import { z } from 'zod';

// Core configuration for selecting a voice provider
export interface VoiceProviderConfig {
  provider: 'vapi' | 'retell' | 'custom';
  apiKey: string;
  defaultVoiceId: string;
  webhookUrl: string;
}

// Business-specific voice agent configuration
export interface VoiceAgentConfig {
  botId: string;
  businessName: string;
  systemPrompt: string;
  voiceId: string;
  greeting: string;
  language: string;
  businessHours: {
    timezone: string;
    schedule: Record<string, { open: string; close: string } | null>;
  };
  afterHoursMessage: string;
  transferNumber?: string;
  calendarBookingUrl?: string;
  maxCallDuration: number; // seconds
  recordCalls: boolean;
  knowledgeBaseChunks: string[];
  endCallPhrases: string[];
  escalationRules: EscalationRule[];
  interruptionSensitivity?: 'low' | 'medium' | 'high';
  fillers?: string[];
}

export interface EscalationRule {
  trigger: 'keyword' | 'sentiment' | 'intent' | 'timeout';
  condition: string;
  action: 'transfer' | 'sms_alert' | 'email_alert' | 'end_call';
  destination?: string;
}

export interface CallSession {
  id: string;
  callSid: string;
  botId: string;
  agentConfig: VoiceAgentConfig;
  callerNumber: string;
  direction: 'inbound' | 'outbound';
  transcript: TranscriptEntry[];
  leadScore: number;
  status:
    | 'ringing'
    | 'active'
    | 'on_hold'
    | 'transferring'
    | 'completed'
    | 'failed';
  startedAt: Date;
  endedAt?: Date;
  duration?: number;
  recordingUrl?: string;
  summary?: string;
  metadata: Record<string, any>;
}

export interface TranscriptEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  confidence?: number;
}

export interface PhoneNumber {
  id?: string;
  providerNumberId?: string;
  number: string;
  friendlyName?: string;
  country?: string;
  capabilities?: {
    voice?: boolean;
    sms?: boolean;
  };
  monthlyCost?: number;
  metadata?: Record<string, any>;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface UsageReport {
  minutesUsed: number;
  calls: number;
  cost: number;
  periodStart: Date;
  periodEnd: Date;
  breakdown?: Record<string, number>;
}

export interface WebhookResult {
  status: 'ok' | 'ignored' | 'error';
  message?: string;
  callSessionId?: string;
  actions?: any[];
  data?: Record<string, any>;
}

export interface VoiceProvider {
  name: string;
  createAgent(config: VoiceAgentConfig): Promise<string>; // returns agentId
  updateAgent(agentId: string, config: Partial<VoiceAgentConfig>): Promise<void>;
  deleteAgent(agentId: string): Promise<void>;
  assignPhoneNumber(agentId: string, phoneNumber: string): Promise<void>;
  getAvailablePhoneNumbers(areaCode?: string): Promise<PhoneNumber[]>;
  provisionPhoneNumber(areaCode: string): Promise<PhoneNumber>;
  getCallHistory(agentId: string, pagination: Pagination): Promise<CallSession[]>;
  getCallRecording(callId: string): Promise<string>; // returns URL
  getCallTranscript(callId: string): Promise<TranscriptEntry[]>;
  handleWebhook(payload: any): Promise<WebhookResult>;
  getUsage(agentId: string, dateRange: DateRange): Promise<UsageReport>;
}

// Zod schemas to validate incoming configs before hitting providers.
export const voiceProviderConfigSchema = z.object({
  provider: z.enum(['vapi', 'retell', 'custom']),
  apiKey: z.string().min(1, 'Provider API key is required'),
  defaultVoiceId: z.string().min(1),
  webhookUrl: z.string().url(),
});

export const voiceAgentConfigSchema = z.object({
  botId: z.string(),
  businessName: z.string(),
  systemPrompt: z.string(),
  voiceId: z.string(),
  greeting: z.string(),
  language: z.string().default('en'),
  businessHours: z.object({
    timezone: z.string(),
    schedule: z.record(
      z.object({
        open: z.string(),
        close: z.string(),
      }).nullable(),
    ),
  }),
  afterHoursMessage: z.string(),
  transferNumber: z.string().optional(),
  calendarBookingUrl: z.string().url().optional(),
  maxCallDuration: z.number().int().positive(),
  recordCalls: z.boolean(),
  knowledgeBaseChunks: z.array(z.string()),
  endCallPhrases: z.array(z.string()),
  escalationRules: z.array(
    z.object({
      trigger: z.enum(['keyword', 'sentiment', 'intent', 'timeout']),
      condition: z.string(),
      action: z.enum(['transfer', 'sms_alert', 'email_alert', 'end_call']),
      destination: z.string().optional(),
    }),
  ),
  interruptionSensitivity: z.enum(['low', 'medium', 'high']).optional(),
  fillers: z.array(z.string()).optional(),
});
