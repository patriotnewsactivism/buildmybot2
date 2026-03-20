import { randomUUID } from 'node:crypto';
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

const VAPI_BASE_URL = 'https://api.vapi.ai';

type VapiAssistantResponse = {
  id?: string;
  assistantId?: string;
  assistant?: { id: string };
};

export class VapiProvider implements VoiceProvider {
  public readonly name = 'vapi';

  constructor(private readonly cfg: VoiceProviderConfig) {}

  async createAgent(config: VoiceAgentConfig): Promise<string> {
    this.ensureApiKey();

    const payload = this.buildAssistantPayload(config);
    const data = (await this.request('/assistant', {
      method: 'POST',
      body: JSON.stringify(payload),
    })) as VapiAssistantResponse;

    const id =
      data.id || data.assistantId || data.assistant?.id || randomUUID();
    return id;
  }

  async updateAgent(
    agentId: string,
    config: Partial<VoiceAgentConfig>,
  ): Promise<void> {
    this.ensureApiKey();
    const payload = this.buildAssistantPayload({
      ...(config as VoiceAgentConfig),
      botId: config.botId || 'unknown',
      businessName: config.businessName || 'Unknown Business',
      systemPrompt: config.systemPrompt || '',
      voiceId: config.voiceId || this.cfg.defaultVoiceId,
      greeting: config.greeting || '',
      language: config.language || 'en',
      businessHours:
        config.businessHours ||
        ({
          timezone: 'UTC',
          schedule: {},
        } as VoiceAgentConfig['businessHours']),
      afterHoursMessage: config.afterHoursMessage || '',
      maxCallDuration: config.maxCallDuration || 600,
      recordCalls: config.recordCalls ?? true,
      knowledgeBaseChunks: config.knowledgeBaseChunks || [],
      endCallPhrases: config.endCallPhrases || [],
      escalationRules: config.escalationRules || [],
    });

    await this.request(`/assistant/${agentId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteAgent(agentId: string): Promise<void> {
    this.ensureApiKey();
    await this.request(`/assistant/${agentId}`, { method: 'DELETE' });
  }

  async assignPhoneNumber(agentId: string, phoneNumber: string): Promise<void> {
    // Vapi lets you attach numbers via their dashboard; expose as best-effort API call.
    this.ensureApiKey();
    await this.request(`/assistant/${agentId}/phone-number`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    });
  }

  async getAvailablePhoneNumbers(areaCode?: string): Promise<PhoneNumber[]> {
    this.ensureApiKey();
    const query = areaCode ? `?areaCode=${areaCode}` : '';
    const data = (await this.request(
      `/phone-numbers${query}`,
      { method: 'GET' },
    )) as { numbers?: any[] };

    return (
      data.numbers?.map((n) => ({
        id: n.id ?? n.sid,
        providerNumberId: n.id ?? n.sid,
        number: n.phoneNumber ?? n.number,
        friendlyName: n.friendlyName,
        country: n.countryCode,
        capabilities: n.capabilities,
        monthlyCost: n.price,
        metadata: n,
      })) || []
    );
  }

  async provisionPhoneNumber(areaCode: string): Promise<PhoneNumber> {
    this.ensureApiKey();
    const data = (await this.request('/phone-numbers', {
      method: 'POST',
      body: JSON.stringify({ areaCode }),
    })) as any;

    return {
      id: data.id ?? data.sid ?? randomUUID(),
      providerNumberId: data.id ?? data.sid,
      number: data.phoneNumber ?? data.number,
      friendlyName: data.friendlyName,
      country: data.countryCode,
      capabilities: data.capabilities,
      monthlyCost: data.price,
      metadata: data,
    };
  }

  async getCallHistory(
    agentId: string,
    pagination: Pagination,
  ): Promise<CallSession[]> {
    this.ensureApiKey();
    const { page, pageSize } = pagination;
    const data = (await this.request(
      `/assistant/${agentId}/calls?page=${page}&pageSize=${pageSize}`,
      { method: 'GET' },
    )) as { calls?: any[] };

    return (
      data.calls?.map(
        (call) =>
          ({
            id: call.id ?? call.callId,
            callSid: call.callSid ?? call.sid,
            botId: call.botId ?? '',
            agentConfig: call.agentConfig ?? ({} as VoiceAgentConfig),
            callerNumber: call.from ?? call.callerNumber,
            direction: call.direction ?? 'inbound',
            transcript:
              call.transcript?.map((t: any) => ({
                role: t.role ?? 'user',
                content: t.content ?? '',
                timestamp: new Date(t.timestamp ?? Date.now()),
                confidence: t.confidence,
              })) || [],
            leadScore: call.leadScore ?? 0,
            status: call.status ?? 'completed',
            startedAt: call.startedAt
              ? new Date(call.startedAt)
              : new Date(),
            endedAt: call.endedAt ? new Date(call.endedAt) : undefined,
            duration: call.duration,
            recordingUrl: call.recordingUrl,
            summary: call.summary,
            metadata: call.metadata ?? {},
          }) as CallSession,
      ) || []
    );
  }

  async getCallRecording(callId: string): Promise<string> {
    this.ensureApiKey();
    const data = (await this.request(`/calls/${callId}/recording`, {
      method: 'GET',
    })) as { url?: string };
    return data.url ?? '';
  }

  async getCallTranscript(callId: string): Promise<TranscriptEntry[]> {
    this.ensureApiKey();
    const data = (await this.request(`/calls/${callId}/transcript`, {
      method: 'GET',
    })) as { transcript?: any[] };

    return (
      data.transcript?.map((t) => ({
        role: t.role ?? 'user',
        content: t.content ?? '',
        timestamp: new Date(t.timestamp ?? Date.now()),
        confidence: t.confidence,
      })) || []
    );
  }

  async handleWebhook(payload: any): Promise<WebhookResult> {
    const eventType = payload?.type || payload?.event;

    if (!eventType) {
      return { status: 'ignored', message: 'Unknown payload shape' };
    }

    switch (eventType) {
      case 'call.started':
        return {
          status: 'ok',
          callSessionId: payload?.call?.id,
          data: payload,
        };
      case 'call.ended':
        return {
          status: 'ok',
          callSessionId: payload?.call?.id,
          data: payload,
        };
      case 'transcript.update':
        return {
          status: 'ok',
          callSessionId: payload?.call?.id,
          actions: [{ type: 'transcript', value: payload?.transcript }],
        };
      case 'function.call':
        return {
          status: 'ok',
          callSessionId: payload?.call?.id,
          actions: [{ type: 'function_call', value: payload?.functionCall }],
        };
      default:
        return { status: 'ignored', message: `Unhandled event ${eventType}` };
    }
  }

  async getUsage(agentId: string, dateRange: DateRange): Promise<UsageReport> {
    this.ensureApiKey();
    const params = new URLSearchParams({
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    });
    const data = (await this.request(
      `/assistant/${agentId}/usage?${params.toString()}`,
      { method: 'GET' },
    )) as any;

    return {
      minutesUsed: data.minutesUsed ?? 0,
      calls: data.calls ?? 0,
      cost: data.cost ?? 0,
      periodStart: dateRange.start,
      periodEnd: dateRange.end,
      breakdown: data.breakdown,
    };
  }

  // Helpers
  private ensureApiKey() {
    if (!this.cfg.apiKey) {
      throw new Error(
        'Vapi provider requires an API key. Set VAPI_API_KEY in the environment.',
      );
    }
  }

  private buildAssistantPayload(config: VoiceAgentConfig) {
    return {
      name: `${config.businessName} Assistant`,
      systemPrompt: config.systemPrompt,
      voice: config.voiceId || this.cfg.defaultVoiceId,
      greeting: config.greeting,
      language: config.language,
      businessHours: config.businessHours,
      afterHoursMessage: config.afterHoursMessage,
      endCallPhrases: config.endCallPhrases,
      interruptionSensitivity: config.interruptionSensitivity || 'medium',
      fillers: config.fillers || ['One moment...', 'Let me check on that.'],
      tools: this.buildTools(),
      serverUrl: this.cfg.webhookUrl,
      knowledgeBase: config.knowledgeBaseChunks,
      metadata: {
        botId: config.botId,
        businessName: config.businessName,
        transferNumber: config.transferNumber,
        calendarBookingUrl: config.calendarBookingUrl,
        maxCallDuration: config.maxCallDuration,
        recordCalls: config.recordCalls,
      },
    };
  }

  private buildTools() {
    // Function definitions Vapi expects for server-url tool calling
    return [
      {
        name: 'book_appointment',
        description: 'Book an appointment for the caller',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            phone: { type: 'string' },
            date: { type: 'string' },
            time: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['name', 'phone', 'date', 'time'],
        },
      },
      {
        name: 'transfer_call',
        description: 'Transfer the call to a department or person',
        parameters: {
          type: 'object',
          properties: {
            department_or_person: { type: 'string' },
          },
          required: ['department_or_person'],
        },
      },
      {
        name: 'send_sms',
        description: 'Send an SMS to the caller',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            message: { type: 'string' },
          },
          required: ['to', 'message'],
        },
      },
      {
        name: 'lookup_customer',
        description: 'Lookup customer details',
        parameters: {
          type: 'object',
          properties: {
            phone_or_email: { type: 'string' },
          },
          required: ['phone_or_email'],
        },
      },
      {
        name: 'check_availability',
        description: 'Check booking availability',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string' },
          },
          required: ['date'],
        },
      },
      {
        name: 'escalate_to_human',
        description: 'Escalate call to a human',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
          },
          required: ['reason'],
        },
      },
    ];
  }

  private async request(path: string, init: RequestInit) {
    const res = await fetch(`${VAPI_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.apiKey}`,
        ...(init.headers || {}),
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Vapi request failed (${res.status} ${res.statusText}): ${text}`,
      );
    }

    if (res.status === 204) return null;
    const contentType = res.headers.get('content-type') || '';
    return contentType.includes('application/json') ? res.json() : res.text();
  }
}
