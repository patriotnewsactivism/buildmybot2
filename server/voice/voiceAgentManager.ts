import {
  CallSession,
  DateRange,
  Pagination,
  TranscriptEntry,
  UsageReport,
  VoiceAgentConfig,
  VoiceProvider,
  VoiceProviderConfig,
  WebhookResult,
} from './types';
import { CustomVoiceProvider } from './providers/custom';
import { RetellProvider } from './providers/retell';
import { VapiProvider } from './providers/vapi';

type ProviderName = VoiceProviderConfig['provider'];

export class VoiceAgentManager {
  private providers = new Map<ProviderName, VoiceProvider>();

  constructor(configs: VoiceProviderConfig[]) {
    configs.forEach((cfg) => this.registerProvider(cfg));
  }

  registerProvider(cfg: VoiceProviderConfig) {
    let provider: VoiceProvider;
    switch (cfg.provider) {
      case 'vapi':
        provider = new VapiProvider(cfg);
        break;
      case 'retell':
        provider = new RetellProvider(cfg);
        break;
      case 'custom':
        provider = new CustomVoiceProvider(cfg);
        break;
      default:
        throw new Error(`Unsupported voice provider: ${cfg.provider}`);
    }

    this.providers.set(cfg.provider, provider);
  }

  getProvider(name: ProviderName): VoiceProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Voice provider ${name} is not configured`);
    }
    return provider;
  }

  async createAgent(
    providerName: ProviderName,
    config: VoiceAgentConfig,
  ): Promise<string> {
    return this.getProvider(providerName).createAgent(config);
  }

  async updateAgent(
    providerName: ProviderName,
    agentId: string,
    config: Partial<VoiceAgentConfig>,
  ): Promise<void> {
    return this.getProvider(providerName).updateAgent(agentId, config);
  }

  async deleteAgent(providerName: ProviderName, agentId: string): Promise<void> {
    return this.getProvider(providerName).deleteAgent(agentId);
  }

  async assignPhoneNumber(
    providerName: ProviderName,
    agentId: string,
    phoneNumber: string,
  ): Promise<void> {
    return this.getProvider(providerName).assignPhoneNumber(agentId, phoneNumber);
  }

  async getAvailablePhoneNumbers(
    providerName: ProviderName,
    areaCode?: string,
  ) {
    return this.getProvider(providerName).getAvailablePhoneNumbers(areaCode);
  }

  async provisionPhoneNumber(providerName: ProviderName, areaCode: string) {
    return this.getProvider(providerName).provisionPhoneNumber(areaCode);
  }

  async getCallHistory(
    providerName: ProviderName,
    agentId: string,
    pagination: Pagination,
  ): Promise<CallSession[]> {
    return this.getProvider(providerName).getCallHistory(agentId, pagination);
  }

  async getCallRecording(
    providerName: ProviderName,
    callId: string,
  ): Promise<string> {
    return this.getProvider(providerName).getCallRecording(callId);
  }

  async getCallTranscript(
    providerName: ProviderName,
    callId: string,
  ): Promise<TranscriptEntry[]> {
    return this.getProvider(providerName).getCallTranscript(callId);
  }

  async handleWebhook(
    providerName: ProviderName,
    payload: any,
  ): Promise<WebhookResult> {
    return this.getProvider(providerName).handleWebhook(payload);
  }

  async getUsage(
    providerName: ProviderName,
    agentId: string,
    dateRange: DateRange,
  ): Promise<UsageReport> {
    return this.getProvider(providerName).getUsage(agentId, dateRange);
  }
}
