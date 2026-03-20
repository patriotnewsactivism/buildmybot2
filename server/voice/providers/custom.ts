import {
  CallSession,
  DateRange,
  Pagination,
  PhoneNumber,
  TranscriptEntry,
  UsageReport,
  VoiceAgentConfig,
  VoiceProvider,
  VoiceProviderConfig,
  WebhookResult,
} from '../types';

/**
 * Placeholder for a future in-house Twilio + Deepgram + Cartesia stack.
 * The shape matches the shared VoiceProvider interface so swapping providers
 * later will not touch business logic.
 */
export class CustomVoiceProvider implements VoiceProvider {
  public readonly name = 'custom';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly cfg: VoiceProviderConfig) {}

  async createAgent(_config: VoiceAgentConfig): Promise<string> {
    throw new Error('Custom voice provider is not implemented yet.');
  }

  async updateAgent(
    _agentId: string,
    _config: Partial<VoiceAgentConfig>,
  ): Promise<void> {
    throw new Error('Custom voice provider is not implemented yet.');
  }

  async deleteAgent(_agentId: string): Promise<void> {
    throw new Error('Custom voice provider is not implemented yet.');
  }

  async assignPhoneNumber(
    _agentId: string,
    _phoneNumber: string,
  ): Promise<void> {
    throw new Error('Custom voice provider is not implemented yet.');
  }

  async getAvailablePhoneNumbers(
    _areaCode?: string,
  ): Promise<PhoneNumber[]> {
    return [];
  }

  async provisionPhoneNumber(_areaCode: string): Promise<PhoneNumber> {
    throw new Error('Custom voice provider is not implemented yet.');
  }

  async getCallHistory(
    _agentId: string,
    _pagination: Pagination,
  ): Promise<CallSession[]> {
    return [];
  }

  async getCallRecording(_callId: string): Promise<string> {
    return '';
  }

  async getCallTranscript(_callId: string): Promise<TranscriptEntry[]> {
    return [];
  }

  async handleWebhook(_payload: any): Promise<WebhookResult> {
    return { status: 'ignored', message: 'Custom provider not implemented' };
  }

  async getUsage(
    _agentId: string,
    dateRange: DateRange,
  ): Promise<UsageReport> {
    return {
      minutesUsed: 0,
      calls: 0,
      cost: 0,
      periodStart: dateRange.start,
      periodEnd: dateRange.end,
    };
  }
}
