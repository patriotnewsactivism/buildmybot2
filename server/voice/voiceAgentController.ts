import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { VoiceAgentManager } from './voiceAgentManager';
import {
  CallSession,
  TranscriptEntry,
  VoiceAgentConfig,
  WebhookResult,
} from './types';

type ProviderName = 'vapi' | 'retell' | 'custom';

export class VoiceAgentController {
  private sessions = new Map<string, CallSession>();
  private openai: OpenAI;

  constructor(
    private readonly manager: VoiceAgentManager,
    openaiClient?: OpenAI,
  ) {
    this.openai = openaiClient || new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  /**
   * Called by the telephony webhook once a call is connected.
   */
  async handleIncomingCall(
    provider: ProviderName,
    callSid: string,
    callerNumber: string,
    config: VoiceAgentConfig,
    metadata: Record<string, any> = {},
  ) {
    const sessionId = randomUUID();
    const session: CallSession = {
      id: sessionId,
      callSid,
      botId: config.botId,
      agentConfig: config,
      callerNumber,
      direction: 'inbound',
      transcript: [],
      leadScore: 0,
      status: 'active',
      startedAt: new Date(),
      metadata,
    };
    this.sessions.set(sessionId, session);

    const systemPrompt = this.buildSystemPrompt(config);
    const greeting = await this.generateResponse(
      session,
      systemPrompt,
      `A customer is calling ${config.businessName}. Greet them warmly.`,
    );

    return { greeting, sessionId };
  }

  /**
   * Called for each utterance from the caller. Returns the next AI response and any actions.
   */
  async processUtterance(
    sessionId: string,
    userSpeech: string,
  ): Promise<{ response: string; leadScore: number; action: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    session.transcript.push({
      role: 'user',
      content: userSpeech,
      timestamp: new Date(),
    });

    const intent = await this.detectIntent(userSpeech);

    if (intent.action === 'book_appointment') {
      await this.handleAppointmentBooking(session, intent);
      return {
        response: 'I can help book that. What date and time works best?',
        leadScore: session.leadScore,
        action: 'book_appointment',
      };
    }

    if (intent.action === 'transfer_to_human') {
      await this.handleWarmTransfer(session);
      return {
        response: 'Let me connect you to a teammate now.',
        leadScore: session.leadScore,
        action: 'transfer',
      };
    }

    if (intent.action === 'emergency') {
      await this.handleUrgentEscalation(session);
      return {
        response: 'I am escalating this immediately.',
        leadScore: session.leadScore,
        action: 'escalate',
      };
    }

    const response = await this.generateResponse(
      session,
      this.buildSystemPrompt(session.agentConfig),
      userSpeech,
    );

    session.leadScore = await this.scoreLead(session);
    session.transcript.push({
      role: 'assistant',
      content: response,
      timestamp: new Date(),
    });

    return { response, leadScore: session.leadScore, action: 'continue' };
  }

  async endCall(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'completed';
    session.endedAt = new Date();
    session.duration =
      (session.endedAt.getTime() - session.startedAt.getTime()) / 1000;

    // Placeholder: persist to CRM / database hooks here.

    this.sessions.delete(sessionId);
  }

  async handleProviderWebhook(
    provider: ProviderName,
    payload: any,
  ): Promise<WebhookResult> {
    return this.manager.handleWebhook(provider, payload);
  }

  private buildSystemPrompt(config: VoiceAgentConfig): string {
    return `You are a professional, warm, and helpful AI receptionist for ${config.businessName}.

${config.systemPrompt}

KNOWLEDGE BASE CONTEXT:
${config.knowledgeBaseChunks.join('\n\n')}

RULES:
- Keep responses concise (1-3 sentences) and conversational.
- If you don't know something, say "Let me connect you with someone who can help".
- Confirm key details back to the caller.
- For appointments, collect: name, phone, preferred date/time, and reason.
- For urgent matters, offer to transfer immediately.`;
  }

  private async detectIntent(speech: string) {
    const result = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Classify the caller intent. Return JSON: { "action": "continue"|"book_appointment"|"transfer_to_human"|"emergency", "confidence": 0-1 }',
        },
        { role: 'user', content: speech },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 50,
    });
    return JSON.parse(result.choices[0].message.content || '{}');
  }

  private async generateResponse(
    session: CallSession,
    systemPrompt: string,
    userSpeech: string,
  ): Promise<string> {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...session.transcript.map((t) => ({
          role: t.role,
          content: t.content,
        })),
        { role: 'user', content: userSpeech },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    return completion.choices[0].message.content || '';
  }

  private async scoreLead(session: CallSession): Promise<number> {
    if (!session.transcript.length) return 0;
    const summaryPrompt = `Rate this caller's lead quality from 0 to 100 based on intent, budget signals, and urgency. Return just a number.\n\nTranscript:\n${session.transcript
      .map((t) => `${t.role}: ${t.content}`)
      .join('\n')}`;

    const res = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: summaryPrompt }],
      max_tokens: 5,
      temperature: 0,
    });

    const score = parseInt(res.choices[0].message.content || '0', 10);
    return Number.isNaN(score) ? 0 : Math.max(0, Math.min(100, score));
  }

  // Placeholder action handlers. Implementation will depend on downstream integrations.
  private async handleAppointmentBooking(
    _session: CallSession,
    _intent: any,
  ): Promise<void> {
    return;
  }

  private async handleWarmTransfer(_session: CallSession): Promise<void> {
    return;
  }

  private async handleUrgentEscalation(_session: CallSession): Promise<void> {
    return;
  }
}
