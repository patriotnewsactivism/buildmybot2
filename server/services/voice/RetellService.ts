/**
 * RetellService — Integrates Retell AI for voice agent calls.
 *
 * Retell handles the full voice pipeline (STT + LLM + TTS) via its own
 * WebSocket, so we don't need separate OpenAI Realtime or Cartesia connections.
 *
 * Flow for inbound Twilio calls:
 *   1. Twilio webhook fires → we register the call with Retell
 *   2. Retell returns a `call_id` (the call is now "registered")
 *   3. We return TwiML that connects Twilio's media stream to Retell's WebSocket
 *   4. Retell orchestrates the entire conversation
 *   5. We receive post-call webhooks with transcript, analysis, etc.
 */

import axios from 'axios';
import { env } from '../../env';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RetellRegisterCallResponse {
  call_id: string;
  web_call_link?: string;
  access_token?: string;
  agent_id: string;
  call_status: string;
  call_type: string;
}

export interface RetellRegisterCallParams {
  agent_id: string;
  audio_websocket_protocol: 'twilio';
  audio_encoding: 's16le' | 'mulaw';
  sample_rate: number;
  from_number?: string;
  to_number?: string;
  metadata?: Record<string, string>;
  retell_llm_dynamic_variables?: Record<string, string>;
}

export interface RetellCreateWebCallParams {
  agent_id: string;
  metadata?: Record<string, string>;
  retell_llm_dynamic_variables?: Record<string, string>;
}

export interface RetellCreateWebCallResponse {
  call_id: string;
  web_call_link: string;
  access_token: string;
  agent_id: string;
  call_status: string;
  call_type: string;
}

export interface RetellAgent {
  agent_id: string;
  agent_name: string;
  voice_id: string;
  language: string;
  response_engine: {
    type: string;
    llm_id?: string;
    conversation_flow_id?: string;
  };
}

export interface RetellCallDetail {
  call_id: string;
  call_status: string;
  call_type: string;
  agent_id: string;
  from_number?: string;
  to_number?: string;
  direction?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  transcript?: string;
  transcript_object?: Array<{
    role: 'agent' | 'user';
    content: string;
    words: Array<{ word: string; start: number; end: number }>;
  }>;
  call_analysis?: {
    call_summary?: string;
    user_sentiment?: string;
    call_successful?: boolean;
    custom_analysis_data?: Record<string, any>;
  };
  recording_url?: string;
}

// ── Retell Voice IDs ───────────────────────────────────────────────────────────

export const RETELL_VOICES: Record<string, string> = {
  // Retell built-in voices
  'retell-marissa': 'retell-Marissa',
  'retell-cimo': 'retell-Cimo',
  // ElevenLabs voices available through Retell
  '11labs-adrian': '11labs-Adrian',
  '11labs-jessica': '11labs-Jessica',
  '11labs-josh': '11labs-Josh',
  '11labs-rachel': '11labs-Rachel',
  '11labs-emily': '11labs-Emily',
  '11labs-charlie': '11labs-Charlie',
  '11labs-aria': '11labs-Aria',
};

// ── Service ────────────────────────────────────────────────────────────────────

const RETELL_API_URL = 'https://api.retellai.com';

class RetellService {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = env.RETELL_API_KEY;
    if (!this.apiKey) {
      console.warn(
        'RETELL_API_KEY not configured — Retell voice agent will be unavailable',
      );
    }
  }

  private ensureApiKey(): string {
    if (!this.apiKey) {
      throw new Error('RETELL_API_KEY is required for Retell voice agent');
    }
    return this.apiKey;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.ensureApiKey()}`,
      'Content-Type': 'application/json',
    };
  }

  // ── Call Registration (for Twilio inbound) ─────────────────────────────────

  /**
   * Register an inbound Twilio call with Retell.
   * Retell returns a call_id; then we connect Twilio's media stream
   * to `wss://api.retellai.com/audio-websocket/{call_id}`.
   */
  async registerCall(
    params: RetellRegisterCallParams,
  ): Promise<RetellRegisterCallResponse> {
    try {
      const response = await axios.post<RetellRegisterCallResponse>(
        `${RETELL_API_URL}/v2/create-phone-call`,
        {
          ...params,
          // For Twilio integration we use register-call endpoint
        },
        { headers: this.headers },
      );
      return response.data;
    } catch (error: any) {
      console.error(
        'Retell registerCall error:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to register call with Retell: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Register a Twilio media-stream call with Retell via the register-call
   * endpoint.  This is the correct path for connecting an already-active
   * Twilio call to Retell's audio WebSocket.
   */
  async registerTwilioCall(
    agentId: string,
    fromNumber?: string,
    toNumber?: string,
    metadata?: Record<string, string>,
    dynamicVariables?: Record<string, string>,
  ): Promise<{ call_id: string; websocket_url: string }> {
    try {
      const body: any = {
        agent_id: agentId,
        audio_websocket_protocol: 'twilio',
        audio_encoding: 'mulaw',
        sample_rate: 8000,
      };
      if (fromNumber) body.from_number = fromNumber;
      if (toNumber) body.to_number = toNumber;
      if (metadata) body.metadata = metadata;
      if (dynamicVariables)
        body.retell_llm_dynamic_variables = dynamicVariables;

      const response = await axios.post(
        `${RETELL_API_URL}/v2/register-call`,
        body,
        { headers: this.headers },
      );

      const data = response.data;
      return {
        call_id: data.call_id,
        websocket_url: `wss://api.retellai.com/audio-websocket/${data.call_id}`,
      };
    } catch (error: any) {
      console.error(
        'Retell registerTwilioCall error:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to register Twilio call with Retell: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  // ── Web Calls (browser-based voice) ────────────────────────────────────────

  /**
   * Create a web call — returns an access_token the frontend uses
   * with the Retell Web SDK to start a voice session in the browser.
   */
  async createWebCall(
    params: RetellCreateWebCallParams,
  ): Promise<RetellCreateWebCallResponse> {
    try {
      const response = await axios.post<RetellCreateWebCallResponse>(
        `${RETELL_API_URL}/v2/create-web-call`,
        params,
        { headers: this.headers },
      );
      return response.data;
    } catch (error: any) {
      console.error(
        'Retell createWebCall error:',
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to create Retell web call: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  // ── Agent Management ───────────────────────────────────────────────────────

  async listAgents(): Promise<RetellAgent[]> {
    const response = await axios.get<RetellAgent[]>(
      `${RETELL_API_URL}/list-agents`,
      { headers: this.headers },
    );
    return response.data;
  }

  async getAgent(agentId: string): Promise<RetellAgent> {
    const response = await axios.get<RetellAgent>(
      `${RETELL_API_URL}/get-agent/${agentId}`,
      { headers: this.headers },
    );
    return response.data;
  }

  async createAgent(params: {
    agent_name: string;
    voice_id: string;
    language?: string;
    response_engine: {
      type: string;
      llm_id?: string;
    };
    begin_message?: string;
    general_prompt?: string;
    enable_backchannel?: boolean;
  }): Promise<RetellAgent> {
    const response = await axios.post<RetellAgent>(
      `${RETELL_API_URL}/create-agent`,
      params,
      { headers: this.headers },
    );
    return response.data;
  }

  async updateAgent(
    agentId: string,
    params: Partial<{
      agent_name: string;
      voice_id: string;
      language: string;
      begin_message: string;
      general_prompt: string;
    }>,
  ): Promise<RetellAgent> {
    const response = await axios.patch<RetellAgent>(
      `${RETELL_API_URL}/update-agent/${agentId}`,
      params,
      { headers: this.headers },
    );
    return response.data;
  }

  // ── Call Details / Post-call ────────────────────────────────────────────────

  async getCall(callId: string): Promise<RetellCallDetail> {
    const response = await axios.get<RetellCallDetail>(
      `${RETELL_API_URL}/v2/get-call/${callId}`,
      { headers: this.headers },
    );
    return response.data;
  }

  async listCalls(
    params?: {
      limit?: number;
      sort_order?: 'ascending' | 'descending';
      filter_criteria?: any;
    },
  ): Promise<RetellCallDetail[]> {
    const response = await axios.post<RetellCallDetail[]>(
      `${RETELL_API_URL}/v2/list-calls`,
      params || {},
      { headers: this.headers },
    );
    return response.data;
  }

  // ── Phone Number Management ────────────────────────────────────────────────

  async listPhoneNumbers() {
    const response = await axios.get(
      `${RETELL_API_URL}/list-phone-numbers`,
      { headers: this.headers },
    );
    return response.data;
  }

  /**
   * Purchase a phone number through Retell (if using Retell's telephony).
   * When using Twilio, you provision via Twilio and register the call with Retell.
   */
  async importPhoneNumber(phoneNumber: string, terminationUri?: string) {
    const body: any = { phone_number: phoneNumber };
    if (terminationUri) body.termination_uri = terminationUri;
    const response = await axios.post(
      `${RETELL_API_URL}/create-phone-number`,
      body,
      { headers: this.headers },
    );
    return response.data;
  }

  // ── Webhook Signature Verification ─────────────────────────────────────────

  /**
   * Verify that a webhook request is authentically from Retell.
   * Uses HMAC-SHA256 with the webhook secret.
   */
  verifyWebhookSignature(
    body: string,
    signature: string,
    secret?: string,
  ): boolean {
    const crypto = require('node:crypto');
    const webhookSecret = secret || env.RETELL_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('RETELL_WEBHOOK_SECRET not set — skipping signature check');
      return true; // Fail-open if no secret configured
    }
    const hmac = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');
    return hmac === signature;
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  getAvailableVoices() {
    return RETELL_VOICES;
  }

  /**
   * Estimate cost per minute using Retell's pricing.
   * ~$0.07-0.15/min depending on LLM + voice config.
   */
  estimateCostPerMinute(
    config: { llm: 'gpt-4o' | 'gpt-4o-mini'; voice: 'retell' | '11labs' } = {
      llm: 'gpt-4o-mini',
      voice: 'retell',
    },
  ): number {
    // Retell base: ~$0.07/min (retell voice + gpt-4o-mini)
    // 11labs voice: ~$0.05/min extra
    // gpt-4o: ~$0.03/min extra
    let cost = 0.07;
    if (config.voice === '11labs') cost += 0.05;
    if (config.llm === 'gpt-4o') cost += 0.03;
    return cost;
  }
}

export const retellService = new RetellService();
