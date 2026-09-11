/**
 * Telnyx bidirectional media ↔ Deepgram Voice Agent bridge.
 *
 * Audio path is raw PCMU/8 kHz both ways (no Gemini-style resample). Outbound
 * audio is paced at 160 bytes / 20 ms to avoid Telnyx RTP static and jitter.
 * Control frames are gated on WebSocket isBinary — never Buffer.isBuffer alone.
 */

import type { IncomingMessage } from 'node:http';
import WebSocket from 'ws';
import { validTelnyxClientState } from '../phone/tenant-telnyx-token.js';
import {
  type DeepgramToolContext,
  executeServerTool,
  getToolDeclarationsForDeepgram,
} from './deepgram-tools.js';
import { MediaDiagnostics } from './media-diagnostics.js';
import { MAX_OUTBOUND_PENDING_BYTES } from './ringback-tone.js';

export const DEEPGRAM_AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse';

const MAX_PENDING_INBOUND_BYTES = 64_000;
const PCMU_FRAME_BYTES = 160;
const PCMU_FRAME_MS = 20;
const DIAGNOSTICS_LOG_MS = 10_000;

const DEFERRED_TOOL_NAMES = new Set([
  'send_checkout_link',
  'transfer_to_owner',
]);

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
  media: {
    track?: string;
    payload?: string;
  };
}

interface TelnyxStartMessage {
  event: 'start';
  start?: {
    call_control_id?: string;
    client_state?: string;
    media_format?: {
      encoding?: string;
      sample_rate?: number;
      channels?: number;
    };
  };
}

export function isDeepgramVoiceEnabled(): boolean {
  const engine = (process.env.VOICE_ENGINE || '').trim().toLowerCase();
  return engine === 'deepgram' && Boolean(process.env.DEEPGRAM_API_KEY);
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
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
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
    this.toolContext = {
      callControlId,
      ...toolContext,
    };
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
      if (this.cleaningUp || this.telnyxWs.readyState !== WebSocket.OPEN) {
        return;
      }
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
      // Only trust isBinary. Node ws can deliver text frames as Buffer.
      if (isBinary) {
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
        this.sendDeepgramSettings();
        break;
      case 'SettingsApplied':
        this.deepgramReady = true;
        this.diagnostics.markSettingsApplied();
        this.flushPendingInbound();
        console.info(
          `[Deepgram Agent] Settings applied for ${this.callControlId}`,
        );
        break;
      case 'UserStartedSpeaking':
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
        console.info('[Deepgram Agent] Conversation:', event);
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

  private sendDeepgramSettings(): void {
    if (this.settingsSent || this.dgWs?.readyState !== WebSocket.OPEN) {
      return;
    }
    this.settingsSent = true;

    const functions = getToolDeclarationsForDeepgram().map((tool) => {
      if (!DEFERRED_TOOL_NAMES.has(tool.name)) return tool;
      return { ...tool, defer_until_eot: true };
    });

    const botName = this.toolContext.botName || 'BuildMyBot';
    this.dgWs.send(
      JSON.stringify({
        type: 'Settings',
        audio: {
          input: { encoding: 'mulaw', sample_rate: 8000 },
          output: {
            encoding: 'mulaw',
            sample_rate: 8000,
            container: 'none',
          },
        },
        agent: {
          listen: {
            provider: {
              type: 'deepgram',
              version: 'v2',
              model: 'flux-general-en',
            },
          },
          think: {
            provider: {
              type: 'open_ai',
              model: 'gpt-4o-mini',
            },
            prompt: [
              `You are the receptionist for ${botName}.`,
              'Answer questions concisely, professionally, and warmly in a conversational phone tone.',
              'Keep responses short, usually one or two sentences.',
              'If the caller asks for promotional discounts, use the quote_discounted_plan function.',
              'If the caller is ready to subscribe, use the send_checkout_link function to text them the link.',
              'If the caller asks to speak to the owner or needs urgent escalation, use the transfer_to_owner function.',
            ].join(' '),
            functions,
          },
          speak: {
            provider: {
              type: 'deepgram',
              version: 'v1',
              model: 'aura-2-asteria-en',
            },
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
      if (message.event === 'error') {
        console.error('[Telnyx Media] Stream error:', message);
      }
    });

    this.telnyxWs.on('error', (error) => {
      console.error('[Telnyx Media] WebSocket error:', error);
      this.cleanup();
    });

    this.telnyxWs.on('close', () => {
      this.cleanup();
    });
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

    this.validateTelnyxFormat(message);
  }

  private validateTelnyxFormat(message: TelnyxStartMessage): void {
    const format = message.start?.media_format;
    if (!format) {
      // Some Telnyx builds omit media_format; continue but warn.
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

    // Accept inbound / inbound_track; drop echo of our own outbound.
    if (track && track !== 'inbound' && track !== 'inbound_track') {
      return;
    }

    if (!this.formatValidated && this.callControlId) {
      // Wait for start validation when possible; still accept early media
      // into the pending buffer so Deepgram does not miss the opener.
    }

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

  private flushPendingInbound(): void {
    while (this.pendingInbound.length > 0) {
      const audio = this.pendingInbound.shift();
      if (!audio) continue;
      this.pendingInboundBytes -= audio.length;
      this.sendAudioToDeepgram(audio);
    }
    this.pendingInboundBytes = 0;
    this.diagnostics.pendingInboundBytes = 0;
  }

  private sendAudioToDeepgram(audio: Buffer): void {
    if (!this.deepgramReady || this.dgWs?.readyState !== WebSocket.OPEN) {
      return;
    }
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
      // Deepgram marks server-executed tools with client_side !== false in
      // current Agent API; skip explicitly client-only stubs.
      if (functionCall.client_side === false) continue;

      this.diagnostics.functionCalls += 1;

      try {
        const args = parseJsonArguments(functionCall.arguments);
        const result = await executeServerTool(
          functionCall.name,
          args,
          this.toolContext,
        );

        if (this.cancelledFunctionCalls.has(functionCall.id)) {
          console.info(
            `[Deepgram Agent] Function ${functionCall.id} was cancelled; response suppressed.`,
          );
          continue;
        }
        if (this.dgWs?.readyState !== WebSocket.OPEN) continue;

        const response: Record<string, unknown> = {
          type: 'FunctionCallResponse',
          id: functionCall.id,
          name: functionCall.name,
          content: JSON.stringify(result),
        };
        if (functionCall.thought_signature) {
          response.thought_signature = functionCall.thought_signature;
        }
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

  private handleFunctionCallCancelled(
    event: DeepgramFunctionCallCancelled,
  ): void {
    for (const functionCall of event.functions ?? []) {
      this.cancelledFunctionCalls.add(functionCall.id);
      this.diagnostics.functionCancels += 1;
      console.info(
        `[Deepgram Agent] Function cancelled: ${functionCall.name} (${functionCall.id})`,
      );
    }
  }

  private closeTelnyx(code: number, reason: string): void {
    if (this.telnyxWs.readyState === WebSocket.OPEN) {
      this.telnyxWs.close(code, reason);
    }
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
    this.pacingTimer = null;
    this.keepaliveTimer = null;
    this.diagnosticsTimer = null;

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
  const session = new DeepgramVoiceSession(telnyxSocket);
  void session.start();
}
