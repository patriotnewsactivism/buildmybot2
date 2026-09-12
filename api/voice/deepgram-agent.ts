/**
 * Telnyx bidirectional media ↔ Deepgram Voice Agent bridge.
 * Half-duplex inbound: mute as soon as SettingsApplied (greeting starts),
 * stay muted through TTS + a short hangover so line echo of our own voice
 * never reaches Flux STT. Ignore UserStartedSpeaking during that window so
 * a self-echo cannot barge-in and overlap a second reply.
 */

import type { IncomingMessage } from 'node:http';
import WebSocket from 'ws';
import {
  type SharedCallContext,
  type VoiceDepartment,
  destinationDepartment,
} from '../../shared/voice-team.js';
import { validTelnyxClientState } from '../phone/tenant-telnyx-token.js';
import {
  type SalesSeat,
  buildAgentPrompt,
  deepgramSpeakProvider,
  defaultSharedContext,
  openingGreeting,
  pickSalesSeat,
} from './deepgram-team.js';
import {
  type DeepgramToolContext,
  executeServerTool,
  getToolDeclarationsForDeepgram,
} from './deepgram-tools.js';
import { MediaDiagnostics } from './media-diagnostics.js';
import {
  MAX_OUTBOUND_PENDING_BYTES,
  TRANSFER_MIN_HOLD_MS,
  generateHoldMusicMuLaw,
  generateRingbackMuLaw,
} from './ringback-tone.js';

export { hasLiveVoiceEngine, isDeepgramVoiceEnabled } from './engine.js';

export const DEEPGRAM_AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse';

const MAX_PENDING_INBOUND_BYTES = 64_000;
const PCMU_FRAME_BYTES = 160;
const PCMU_FRAME_MS = 20;
const DIAGNOSTICS_LOG_MS = 10_000;
/** Drop inbound after TTS so the acoustic echo tail is not transcribed. */
export const SPEAKING_HANGOVER_MS = 500;
/** Flux: higher confidence before declaring the caller finished. Default 0.7. */
export const FLUX_EOT_THRESHOLD = 0.8;
/**
 * Flux: hard silence cap before forcing EndOfTurn. 1800ms was cutting PSTN
 * pauses and starting a second reply while TTS was still on the wire.
 * Deepgram default is 5000ms.
 */
export const FLUX_EOT_TIMEOUT_MS = 5000;
/** Ringback until Deepgram greeting audio; keep under the 3s outbound cap. */
const DEEPGRAM_CONNECT_COMFORT_MS = 2000;

const DEFERRED_TOOL_NAMES = new Set([
  'send_checkout_link',
  'transfer_to_owner',
]);
const HOLD_CHUNK_MS = 2000;
const HOLD_PENDING_WATERMARK = 8000;

interface DeepgramFunctionCall {
  id: string;
  name: string;
  arguments?: string;
  client_side?: boolean;
  thought_signature?: string;
}

interface DeepgramFunctionCallRequest {
  type: 'FunctionCallRequest';
  functions?: DeepgramFunctionCall[];
}

interface DeepgramFunctionCallCancelled {
  type: 'FunctionCallCancelled';
  functions?: Array<{ id: string; name: string }>;
}

interface TelnyxMediaMessage {
  event: 'media';
  media: { track?: string; payload?: string };
}

interface TelnyxStartMessage {
  event: 'start';
  start?: {
    call_control_id?: string;
    client_state?: string;
    from?: string;
    to?: string;
    media_format?: {
      encoding?: string;
      sample_rate?: number;
      channels?: number;
    };
  };
}

export function rawDataToBuffer(data: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

export function parseJsonArguments(value?: string): Record<string, unknown> {
  if (!value) return {};
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Function arguments must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify(payload));
}

export class DeepgramVoiceSession {
  private readonly telnyxWs: WebSocket;
  private callControlId: string;
  private toolContext: DeepgramToolContext;
  private dgWs: WebSocket | null = null;
  private deepgramReady = false;
  private settingsSent = false;
  private cleaningUp = false;
  private formatValidated = false;
  private agentSpeaking = false;
  private speakHangoverUntil = 0;
  private holdInProgress = false;
  private comfortPlaying = false;
  private welcomeReceived = false;
  private telnyxStarted = false;
  private awaitingDestinationAudio = false;
  private holdTimer: ReturnType<typeof setInterval> | null = null;
  private holdOffsetMs = 0;
  private salesSeat: SalesSeat | undefined;
  private department: VoiceDepartment = 'receptionist';
  private callContext: SharedCallContext;
  private readonly pendingInbound: Buffer[] = [];
  private pendingInboundBytes = 0;
  private pendingOutbound = Buffer.alloc(0);
  private readonly cancelledFunctionCalls = new Set<string>();
  private readonly diagnostics = new MediaDiagnostics();
  private pacingTimer: ReturnType<typeof setInterval> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private diagnosticsTimer: ReturnType<typeof setInterval> | null = null;

  public constructor(
    telnyxWs: WebSocket,
    callControlId = '',
    toolContext: Partial<DeepgramToolContext> = {},
  ) {
    this.telnyxWs = telnyxWs;
    this.callControlId = callControlId;
    this.toolContext = { callControlId, ...toolContext };
    this.callContext = defaultSharedContext(toolContext.callerNumber || '');
  }

  public async start(): Promise<void> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      console.error('[Deepgram Agent] DEEPGRAM_API_KEY is missing.');
      this.closeTelnyx(1011, 'Voice service unavailable');
      return;
    }
    this.setupTelnyx();
    this.startPacing();
    this.startKeepalive();
    this.startDiagnosticsLogging();
    this.dgWs = new WebSocket(DEEPGRAM_AGENT_URL, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    this.setupDeepgram();
  }

  private startPacing(): void {
    this.pacingTimer = setInterval(() => {
      if (
        this.cleaningUp ||
        this.telnyxWs.readyState !== WebSocket.OPEN ||
        this.pendingOutbound.length < PCMU_FRAME_BYTES
      ) {
        return;
      }
      const frame = this.pendingOutbound.subarray(0, PCMU_FRAME_BYTES);
      this.pendingOutbound = this.pendingOutbound.subarray(PCMU_FRAME_BYTES);
      this.diagnostics.pendingOutboundBytes = this.pendingOutbound.length;
      this.diagnostics.recordOutbound(frame.length);
      sendJson(this.telnyxWs, {
        event: 'media',
        media: { payload: frame.toString('base64') },
      });
    }, PCMU_FRAME_MS);
  }

  private startKeepalive(): void {
    this.keepaliveTimer = setInterval(() => {
      if (this.cleaningUp || this.telnyxWs.readyState !== WebSocket.OPEN)
        return;
      try {
        this.telnyxWs.ping();
      } catch {
        /* ignore */
      }
    }, 15_000);
  }

  private startDiagnosticsLogging(): void {
    this.diagnosticsTimer = setInterval(() => {
      if (this.cleaningUp) return;
      this.diagnostics.log('[Deepgram Agent]', this.callControlId || 'pending');
    }, DIAGNOSTICS_LOG_MS);
  }

  private setupDeepgram(): void {
    const socket = this.dgWs;
    if (!socket) return;
    socket.on('open', () => {
      console.info(
        `[Deepgram Agent] Connected for ${this.callControlId || 'pending'}`,
      );
    });
    socket.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) {
        if (this.holdInProgress && !this.awaitingDestinationAudio) return;
        if (this.holdInProgress && this.awaitingDestinationAudio) {
          this.endHold();
        }
        this.stopConnectComfort();
        this.markAgentSpeaking();
        this.enqueueOutboundAudio(rawDataToBuffer(data));
        return;
      }
      this.handleDeepgramControlMessage(rawDataToBuffer(data).toString('utf8'));
    });
    socket.on('error', (error) => {
      console.error('[Deepgram Agent] WebSocket error:', error);
      this.cleanup();
    });
    socket.on('close', (code, reason) => {
      console.info(`[Deepgram Agent] Closed: ${code} ${reason.toString()}`);
      this.cleanup();
    });
  }

  private handleDeepgramControlMessage(raw: string): void {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      console.error('[Deepgram Agent] Invalid control message:', error);
      return;
    }
    switch (event.type) {
      case 'Welcome':
        this.welcomeReceived = true;
        this.maybeSendDeepgramSettings();
        break;
      case 'SettingsApplied':
        this.deepgramReady = true;
        this.diagnostics.markSettingsApplied();
        // Greeting audio starts immediately; mute before AgentStartedSpeaking.
        this.markAgentSpeaking();
        this.dropPendingInbound();
        console.info(
          `[Deepgram Agent] Settings applied for ${this.callControlId}`,
        );
        break;
      case 'AgentStartedSpeaking':
        this.markAgentSpeaking();
        break;
      case 'AgentAudioDone':
      case 'AgentStartedListening':
        this.beginSpeakHangover();
        break;
      case 'UserStartedSpeaking':
        if (this.shouldIgnoreBargeIn()) return;
        this.agentSpeaking = false;
        this.speakHangoverUntil = 0;
        this.clearTelnyxPlayback();
        break;
      case 'FunctionCallRequest':
        void this.handleFunctionCalls(
          event as unknown as DeepgramFunctionCallRequest,
        );
        break;
      case 'FunctionCallCancelled':
        this.handleFunctionCallCancelled(
          event as unknown as DeepgramFunctionCallCancelled,
        );
        break;
      case 'ConversationText':
        this.recordConversation(event);
        break;
      case 'Warning':
        console.warn('[Deepgram Agent] Warning:', event);
        break;
      case 'Error':
        console.error('[Deepgram Agent] Fatal error:', event);
        this.cleanup();
        break;
      default:
        break;
    }
  }

  private recordConversation(event: Record<string, unknown>): void {
    const role = event.role === 'user' ? 'caller' : 'agent';
    const content =
      typeof event.content === 'string'
        ? event.content
        : typeof event.text === 'string'
          ? event.text
          : '';
    if (!content) return;
    this.callContext.transcript.push({
      role,
      text: content,
      at: new Date().toISOString(),
      department: this.department,
    });
    if (role === 'caller' && !this.callContext.reason) {
      this.callContext.reason = content.slice(0, 400);
    }
    this.callContext.summary = this.callContext.transcript
      .slice(-8)
      .map((turn) => `${turn.role}: ${turn.text}`)
      .join(' | ')
      .slice(0, 2000);
  }

  private maybeSendDeepgramSettings(): void {
    if (this.settingsSent || this.dgWs?.readyState !== WebSocket.OPEN) return;
    if (!this.welcomeReceived) return;
    // Tests construct a session with a known callControlId; production waits for Telnyx start.
    if (!this.telnyxStarted && !this.callControlId) return;
    this.sendDeepgramSettings();
  }

  private sendDeepgramSettings(): void {
    if (this.settingsSent || this.dgWs?.readyState !== WebSocket.OPEN) return;
    this.settingsSent = true;
    const functions = getToolDeclarationsForDeepgram().map((tool) => {
      if (!DEFERRED_TOOL_NAMES.has(tool.name)) return tool;
      return { ...tool, defer_until_eot: true };
    });
    const botName = this.toolContext.botName || 'BuildMyBot';
    this.dgWs.send(
      JSON.stringify({
        type: 'Settings',
        flags: { history: true },
        audio: {
          input: { encoding: 'mulaw', sample_rate: 8000 },
          output: { encoding: 'mulaw', sample_rate: 8000, container: 'none' },
        },
        agent: {
          greeting: openingGreeting(this.department, this.salesSeat),
          listen: {
            provider: {
              type: 'deepgram',
              version: 'v2',
              model: 'flux-general-en',
              eot_threshold: FLUX_EOT_THRESHOLD,
              eot_timeout_ms: FLUX_EOT_TIMEOUT_MS,
            },
          },
          think: {
            provider: { type: 'open_ai', model: 'gpt-4o-mini' },
            prompt: buildAgentPrompt(
              this.department,
              botName,
              this.callContext,
              this.salesSeat,
            ),
            functions,
          },
          speak: {
            provider: deepgramSpeakProvider(this.department, this.salesSeat),
          },
        },
      }),
    );
  }

  private setupTelnyx(): void {
    this.telnyxWs.on('message', (raw: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) {
        console.warn('[Telnyx Media] Unexpected binary WebSocket frame.');
        return;
      }
      let message:
        | TelnyxMediaMessage
        | TelnyxStartMessage
        | Record<string, unknown>;
      try {
        message = JSON.parse(rawDataToBuffer(raw).toString('utf8')) as
          | TelnyxMediaMessage
          | TelnyxStartMessage
          | Record<string, unknown>;
      } catch (error) {
        console.error('[Telnyx Media] Invalid JSON frame:', error);
        return;
      }
      if (message.event === 'start') {
        this.handleTelnyxStart(message as TelnyxStartMessage);
        return;
      }
      if (message.event === 'media') {
        this.handleTelnyxMedia(message as TelnyxMediaMessage);
        return;
      }
      if (message.event === 'stop') {
        this.cleanup();
        return;
      }
      if (message.event === 'error')
        console.error('[Telnyx Media] Stream error:', message);
    });
    this.telnyxWs.on('error', (error) => {
      console.error('[Telnyx Media] WebSocket error:', error);
      this.cleanup();
    });
    this.telnyxWs.on('close', () => this.cleanup());
  }

  private handleTelnyxStart(message: TelnyxStartMessage): void {
    const start = message.start;
    const callControlId = start?.call_control_id || this.callControlId;
    const clientState = start?.client_state || '';
    if (callControlId) {
      this.callControlId = callControlId;
      this.toolContext.callControlId = callControlId;
    }
    if (callControlId && clientState) {
      const state = validTelnyxClientState(clientState, callControlId);
      if (!state) {
        console.error(
          '[Deepgram Agent] Invalid Telnyx client_state; closing media.',
        );
        this.cleanup();
        return;
      }
    } else if (!callControlId) {
      console.error(
        '[Deepgram Agent] Missing call_control_id on start; closing media.',
      );
      this.cleanup();
      return;
    }
    if (start?.from) {
      this.toolContext.callerNumber = start.from;
      this.callContext.callerNumber = start.from;
    }
    if (start?.to) this.toolContext.calledNumber = start.to;
    this.validateTelnyxFormat(message);
    if (this.cleaningUp) return;
    this.telnyxStarted = true;
    this.startConnectComfort();
    this.maybeSendDeepgramSettings();
  }

  private validateTelnyxFormat(message: TelnyxStartMessage): void {
    const format = message.start?.media_format;
    if (!format) {
      console.warn(
        `[Telnyx Media] No media_format on start for ${this.callControlId}`,
      );
      this.formatValidated = true;
      return;
    }
    const encoding = format.encoding?.toUpperCase();
    const sampleRate = format.sample_rate;
    if (encoding !== 'PCMU' || sampleRate !== 8000) {
      console.error('[Telnyx Media] Unexpected audio format:', format);
      this.cleanup();
      return;
    }
    this.formatValidated = true;
    console.info(
      `[Telnyx Media] PCMU/8000 confirmed for ${this.callControlId}`,
    );
  }

  private handleTelnyxMedia(message: TelnyxMediaMessage): void {
    const { track, payload } = message.media;
    if (!payload) return;
    if (track && track !== 'inbound' && track !== 'inbound_track') return;
    let audio: Buffer;
    try {
      audio = Buffer.from(payload, 'base64');
    } catch (error) {
      console.error('[Telnyx Media] Invalid base64 payload:', error);
      return;
    }
    this.diagnostics.recordInbound(audio.length);
    if (!this.deepgramReady) {
      this.queuePendingInbound(audio);
      return;
    }
    if (this.isInboundMuted()) return;
    this.sendAudioToDeepgram(audio);
  }

  private queuePendingInbound(audio: Buffer): void {
    this.pendingInbound.push(audio);
    this.pendingInboundBytes += audio.length;
    this.diagnostics.pendingInboundBytes = this.pendingInboundBytes;
    while (
      this.pendingInboundBytes > MAX_PENDING_INBOUND_BYTES &&
      this.pendingInbound.length > 1
    ) {
      const removed = this.pendingInbound.shift();
      if (removed) {
        this.pendingInboundBytes -= removed.length;
        this.diagnostics.droppedInboundChunks += 1;
      }
    }
    this.diagnostics.pendingInboundBytes = this.pendingInboundBytes;
  }

  private dropPendingInbound(): void {
    if (this.pendingInbound.length) {
      this.diagnostics.droppedInboundChunks += this.pendingInbound.length;
    }
    this.pendingInbound.length = 0;
    this.pendingInboundBytes = 0;
    this.diagnostics.pendingInboundBytes = 0;
  }

  private sendAudioToDeepgram(audio: Buffer): void {
    if (!this.deepgramReady || this.dgWs?.readyState !== WebSocket.OPEN) return;
    this.dgWs.send(audio);
  }

  private enqueueOutboundAudio(audio: Buffer): void {
    this.pendingOutbound = Buffer.concat([this.pendingOutbound, audio]);
    if (this.pendingOutbound.length > MAX_OUTBOUND_PENDING_BYTES) {
      const overflow = this.pendingOutbound.length - MAX_OUTBOUND_PENDING_BYTES;
      this.pendingOutbound = this.pendingOutbound.subarray(overflow);
      this.diagnostics.droppedOutboundBytes += overflow;
    }
    this.diagnostics.pendingOutboundBytes = this.pendingOutbound.length;
  }

  private clearTelnyxPlayback(): void {
    this.diagnostics.bargeIns += 1;
    this.pendingOutbound = Buffer.alloc(0);
    this.diagnostics.pendingOutboundBytes = 0;
    sendJson(this.telnyxWs, { event: 'clear' });
  }

  private async handleFunctionCalls(
    event: DeepgramFunctionCallRequest,
  ): Promise<void> {
    const functions = event.functions ?? [];
    for (const functionCall of functions) {
      if (functionCall.client_side === false) continue;
      this.diagnostics.functionCalls += 1;
      try {
        const args = parseJsonArguments(functionCall.arguments);
        const result =
          functionCall.name === 'route_department'
            ? await this.transferDepartment(args)
            : await executeServerTool(
                functionCall.name,
                args,
                this.toolContext,
              );
        if (this.cancelledFunctionCalls.has(functionCall.id)) continue;
        if (this.dgWs?.readyState !== WebSocket.OPEN) continue;
        const response: Record<string, unknown> = {
          type: 'FunctionCallResponse',
          id: functionCall.id,
          name: functionCall.name,
          content: JSON.stringify(result),
        };
        if (functionCall.thought_signature)
          response.thought_signature = functionCall.thought_signature;
        this.dgWs.send(JSON.stringify(response));
      } catch (error) {
        console.error(
          `[Deepgram Agent] Function ${functionCall.name} failed:`,
          error,
        );
        if (
          this.cancelledFunctionCalls.has(functionCall.id) ||
          this.dgWs?.readyState !== WebSocket.OPEN
        ) {
          continue;
        }
        this.dgWs.send(
          JSON.stringify({
            type: 'FunctionCallResponse',
            id: functionCall.id,
            name: functionCall.name,
            content: JSON.stringify({
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Tool execution failed.',
            }),
          }),
        );
      }
    }
  }

  private async transferDepartment(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const destination = destinationDepartment(args.department);
    if (!destination) return { ok: false, error: 'Unknown department.' };
    if (destination === this.department) {
      return { ok: false, error: 'Already speaking with that department.' };
    }
    const callerName =
      typeof args.callerName === 'string' ? args.callerName.trim() : '';
    const reason =
      typeof args.reason === 'string'
        ? args.reason.trim()
        : typeof args.interest === 'string'
          ? args.interest.trim()
          : '';
    const company = typeof args.company === 'string' ? args.company.trim() : '';
    const summary =
      typeof args.summary === 'string' ? args.summary.trim() : reason;
    const objection =
      typeof args.objection === 'string' ? args.objection.trim() : '';
    if (callerName) this.callContext.callerName = callerName;
    if (reason) this.callContext.reason = reason;
    if (company) this.callContext.company = company;
    if (summary) this.callContext.summary = summary.slice(0, 2000);
    if (objection) this.callContext.objection = objection;
    this.beginHold();
    this.department = destination;
    this.salesSeat =
      destination === 'sales'
        ? pickSalesSeat(this.callControlId || callerName || 'sales')
        : undefined;
    const botName = this.toolContext.botName || 'BuildMyBot';
    if (this.dgWs?.readyState === WebSocket.OPEN) {
      sendJson(this.dgWs, {
        type: 'UpdateSpeak',
        speak: { provider: deepgramSpeakProvider(destination, this.salesSeat) },
      });
      sendJson(this.dgWs, {
        type: 'UpdatePrompt',
        prompt: buildAgentPrompt(
          destination,
          botName,
          this.callContext,
          this.salesSeat,
        ),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, TRANSFER_MIN_HOLD_MS));
    if (this.cleaningUp || this.dgWs?.readyState !== WebSocket.OPEN) {
      this.endHold();
      return { ok: false, error: 'Call ended during transfer.' };
    }
    sendJson(this.dgWs, {
      type: 'InjectAgentMessage',
      message: openingGreeting(destination, this.salesSeat),
    });
    this.awaitingDestinationAudio = true;
    this.markAgentSpeaking();
    return {
      ok: true,
      department: destination,
      agent: this.salesSeat?.name || destination,
      hold_ms: TRANSFER_MIN_HOLD_MS,
    };
  }

  private handleFunctionCallCancelled(
    event: DeepgramFunctionCallCancelled,
  ): void {
    for (const functionCall of event.functions ?? []) {
      this.cancelledFunctionCalls.add(functionCall.id);
      this.diagnostics.functionCancels += 1;
    }
  }

  private enqueueHoldChunk(): void {
    this.enqueueOutboundAudio(
      generateHoldMusicMuLaw(HOLD_CHUNK_MS, this.holdOffsetMs),
    );
    this.holdOffsetMs += HOLD_CHUNK_MS;
  }

  private beginHold(): void {
    this.holdInProgress = true;
    this.awaitingDestinationAudio = false;
    this.agentSpeaking = true;
    this.holdOffsetMs = 0;
    this.clearTelnyxPlayback();
    this.enqueueHoldChunk();
    if (!this.holdTimer) {
      this.holdTimer = setInterval(() => {
        if (!this.holdInProgress || this.cleaningUp) return;
        if (this.pendingOutbound.length < HOLD_PENDING_WATERMARK) {
          this.enqueueHoldChunk();
        }
      }, 400);
    }
  }

  private endHold(): void {
    this.holdInProgress = false;
    this.awaitingDestinationAudio = false;
    if (this.holdTimer) {
      clearInterval(this.holdTimer);
      this.holdTimer = null;
    }
    this.pendingOutbound = Buffer.alloc(0);
    this.diagnostics.pendingOutboundBytes = 0;
    sendJson(this.telnyxWs, { event: 'clear' });
  }

  private startConnectComfort(): void {
    if (this.comfortPlaying || this.cleaningUp) return;
    this.comfortPlaying = true;
    this.enqueueOutboundAudio(
      generateRingbackMuLaw(DEEPGRAM_CONNECT_COMFORT_MS),
    );
  }

  private stopConnectComfort(): void {
    if (!this.comfortPlaying) return;
    this.comfortPlaying = false;
    this.pendingOutbound = Buffer.alloc(0);
    this.diagnostics.pendingOutboundBytes = 0;
    sendJson(this.telnyxWs, { event: 'clear' });
  }

  private markAgentSpeaking(): void {
    this.agentSpeaking = true;
    this.speakHangoverUntil = 0;
  }

  private beginSpeakHangover(): void {
    this.agentSpeaking = false;
    this.speakHangoverUntil = Date.now() + SPEAKING_HANGOVER_MS;
  }

  private isInboundMuted(): boolean {
    return (
      this.agentSpeaking ||
      this.holdInProgress ||
      Date.now() < this.speakHangoverUntil
    );
  }

  private shouldIgnoreBargeIn(): boolean {
    return this.isInboundMuted() || this.pendingOutbound.length > 0;
  }

  private closeTelnyx(code: number, reason: string): void {
    if (this.telnyxWs.readyState === WebSocket.OPEN)
      this.telnyxWs.close(code, reason);
  }

  public getDiagnosticsSnapshot() {
    return this.diagnostics.snapshot();
  }

  private cleanup(): void {
    if (this.cleaningUp) return;
    this.cleaningUp = true;
    this.deepgramReady = false;
    this.diagnostics.log('[Deepgram Agent]', this.callControlId || 'pending');
    if (this.pacingTimer) clearInterval(this.pacingTimer);
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    if (this.diagnosticsTimer) clearInterval(this.diagnosticsTimer);
    if (this.holdTimer) clearInterval(this.holdTimer);
    this.pacingTimer = null;
    this.keepaliveTimer = null;
    this.diagnosticsTimer = null;
    this.holdTimer = null;
    this.holdInProgress = false;
    this.holdOffsetMs = 0;
    this.awaitingDestinationAudio = false;
    this.pendingInbound.length = 0;
    this.pendingInboundBytes = 0;
    this.pendingOutbound = Buffer.alloc(0);
    const deepgramSocket = this.dgWs;
    this.dgWs = null;
    if (
      deepgramSocket &&
      (deepgramSocket.readyState === WebSocket.OPEN ||
        deepgramSocket.readyState === WebSocket.CONNECTING)
    ) {
      try {
        deepgramSocket.close();
      } catch {
        /* ignore */
      }
    }
    if (
      this.telnyxWs.readyState === WebSocket.OPEN ||
      this.telnyxWs.readyState === WebSocket.CONNECTING
    ) {
      try {
        this.telnyxWs.close();
      } catch {
        /* ignore */
      }
    }
  }
}

export function handleDeepgramTelnyxMediaConnection(
  telnyxSocket: WebSocket,
  _request: IncomingMessage,
): void {
  console.info('[Deepgram Agent] Telnyx media WebSocket accepted');
  const session = new DeepgramVoiceSession(telnyxSocket);
  void session.start();
}
