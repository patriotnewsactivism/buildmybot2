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

const RETELL_BASE_URL = 'https://api.retellai.com';

export class RetellProvider implements VoiceProvider {
  public readonly name = 'retell';

  constructor(private readonly cfg: VoiceProviderConfig) {}

  async createAgent(config: VoiceAgentConfig): Promise<string> {
    this.ensureApiKey();

    const payload = {
      name: `${config.businessName} Agent`,
      systemPrompt: config.systemPrompt,
      voiceId: config.voiceId || this.cfg.defaultVoiceId,
      language: config.language,
      greeting: config.greeting,
      serverUrl: this.cfg.webhookUrl,
      metadata: {
        botId: config.botId,
        businessName: config.businessName,
        transferNumber: config.transferNumber,
        calendarBookingUrl: config.calendarBookingUrl,
      },
    };

    const data = (await this.request('/agents', {
      method: 'POST',
      body: JSON.stringify(payload),
    })) as { id?: string };

    return data.id ?? randomUUID();
  }

  async updateAgent(
    agentId: string,
    config: Partial<VoiceAgentConfig>,
  ): Promise<void> {
    this.ensureApiKey();
    await this.request(`/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify(config),
    });
  }

  async deleteAgent(agentId: string): Promise<void> {
    this.ensureApiKey();
    await this.request(`/agents/${agentId}`, { method: 'DELETE' });
  }

  async assignPhoneNumber(agentId: string, phoneNumber: string): Promise<void> {
    // Retell typically manages numbers internally; expose best-effort mapping.
    this.ensureApiKey();
    await this.request(`/agents/${agentId}/phone-number`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    });
  }

  async getAvailablePhoneNumbers(areaCode?: string): Promise<PhoneNumber[]> {
    this.ensureApiKey();
    const params = areaCode ? `?areaCode=${areaCode}` : '';
    const data = (await this.request(`/phone-numbers${params}`, {
      method: 'GET',
    })) as { numbers?: any[] };

    return (
      data.numbers?.map((n) => ({
        id: n.id ?? n.sid,
        providerNumberId: n.id ?? n.sid,
        number: n.phoneNumber ?? n.number,
        friendlyName: n.friendlyName,
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
      id: data.id ?? randomUUID(),
      providerNumberId: data.id,
      number: data.phoneNumber ?? data.number,
      friendlyName: data.friendlyName,
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
      `/agents/${agentId}/calls?page=${page}&pageSize=${pageSize}`,
      { method: 'GET' },
    )) as { calls?: any[] };

    return (
      data.calls?.map(
        (call) =>
          ({
            id: call.id ?? call.callId,
            callSid: call.sid ?? call.callSid,
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
    const event = payload?.event || payload?.type;
    if (!event) return { status: 'ignored', message: 'Unknown payload' };

    switch (event) {
      case 'call.started':
      case 'call.ended':
      case 'transcript.updated':
      case 'function.call':
        return {
          status: 'ok',
          callSessionId: payload?.call?.id ?? payload?.callId,
          data: payload,
        };
      default:
        return { status: 'ignored', message: `Unhandled event ${event}` };
    }
  }

  async getUsage(agentId: string, dateRange: DateRange): Promise<UsageReport> {
    this.ensureApiKey();
    const params = new URLSearchParams({
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    });
    const data = (await this.request(
      `/agents/${agentId}/usage?${params.toString()}`,
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

  private ensureApiKey() {
    if (!this.cfg.apiKey) {
      throw new Error(
        'Retell provider requires an API key. Set RETELL_API_KEY in the environment.',
      );
    }
  }

  private async request(path: string, init: RequestInit) {
    const res = await fetch(`${RETELL_BASE_URL}${path}`, {
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
        `Retell request failed (${res.status} ${res.statusText}): ${text}`,
      );
    }

    if (res.status === 204) return null;
    const contentType = res.headers.get('content-type') || '';
    return contentType.includes('application/json') ? res.json() : res.text();
  }
}
