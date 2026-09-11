import WebSocket, { type RawData } from 'ws';
import type { VoiceDepartment } from '../../shared/voice-team.js';

export type OpenAIRealtimeTool = {
  type: 'function';
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
};

export type OpenAIRealtimeToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type OpenAIRealtimeCallbacks = {
  onReady(): void;
  onAudio(payload: string): void;
  onCallerTranscript(text: string): void;
  onAgentTranscript(text: string): void;
  onSpeechStarted(): void;
  onSpeechStopped(): void;
  onToolCall(call: OpenAIRealtimeToolCall): void;
  onError(reason: string): void;
  onClose(): void;
};

export type OpenAIRealtimeConnection = {
  socket: WebSocket;
  model: string;
  appendAudio(payload: string): void;
  cancelResponse(): void;
  requestResponse(instructions?: string): void;
  sendToolResult(callId: string, result: unknown): void;
  close(): void;
};

type JsonObject = Record<string, unknown>;

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
export const DEFAULT_OPENAI_REALTIME_MODEL = 'gpt-realtime-2.1';

const VOICES: Record<VoiceDepartment, string> = {
  receptionist: 'marin',
  sales: 'cedar',
  support: 'coral',
  manager: 'sage',
};

function parseSocketMessage(data: RawData): JsonObject | null {
  try {
    if (typeof data === 'string') return JSON.parse(data) as JsonObject;
    if (Buffer.isBuffer(data)) return JSON.parse(data.toString('utf8')) as JsonObject;
    if (Array.isArray(data))
      return JSON.parse(Buffer.concat(data).toString('utf8')) as JsonObject;
    return JSON.parse(Buffer.from(data).toString('utf8')) as JsonObject;
  } catch {
    return null;
  }
}

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function normalizeSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSchema);
  if (!value || typeof value !== 'object') return value;
  const input = value as JsonObject;
  const output: JsonObject = {};
  for (const [key, child] of Object.entries(input)) {
    if (key === 'type' && typeof child === 'string') {
      output[key] = child.toLowerCase();
      continue;
    }
    output[key] = normalizeSchema(child);
  }
  return output;
}

export function openAIToolsFromGeminiTools(geminiTools: unknown): OpenAIRealtimeTool[] {
  if (!Array.isArray(geminiTools)) return [];
  const declarations: JsonObject[] = [];
  for (const bundle of geminiTools) {
    if (!bundle || typeof bundle !== 'object') continue;
    const functions = (bundle as JsonObject).functionDeclarations;
    if (!Array.isArray(functions)) continue;
    for (const declaration of functions) {
      if (declaration && typeof declaration === 'object') declarations.push(declaration as JsonObject);
    }
  }
  return declarations
    .filter((declaration) => typeof declaration.name === 'string')
    .map((declaration) => ({
      type: 'function' as const,
      name: String(declaration.name),
      ...(typeof declaration.description === 'string'
        ? { description: declaration.description }
        : {}),
      parameters:
        declaration.parameters && typeof declaration.parameters === 'object'
          ? (normalizeSchema(declaration.parameters) as Record<string, unknown>)
          : { type: 'object', properties: {} },
    }));
}

function reasoningEffort(department: VoiceDepartment): 'minimal' | 'low' | 'medium' {
  if (department === 'manager') return 'medium';
  if (department === 'sales' || department === 'support') return 'low';
  return 'minimal';
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function createOpenAIRealtimeConnection(options: {
  apiKey: string;
  model?: string;
  department: VoiceDepartment;
  instructions: string;
  tools: OpenAIRealtimeTool[];
  callbacks: OpenAIRealtimeCallbacks;
}): OpenAIRealtimeConnection {
  const model = options.model?.trim() || DEFAULT_OPENAI_REALTIME_MODEL;
  const socket = new WebSocket(`${OPENAI_REALTIME_URL}?model=${encodeURIComponent(model)}`, {
    headers: { Authorization: `Bearer ${options.apiKey}` },
  });
  let ready = false;
  let closing = false;
  const handledFunctionCalls = new Set<string>();

  socket.on('open', () => {
    sendJson(socket, {
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: options.instructions,
        output_modalities: ['audio'],
        reasoning: { effort: reasoningEffort(options.department) },
        audio: {
          input: {
            format: { type: 'audio/pcmu' },
            transcription: { model: 'gpt-4o-mini-transcribe' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 120,
              silence_duration_ms: 500,
              create_response: true,
              interrupt_response: true,
            },
          },
          output: {
            format: { type: 'audio/pcmu' },
            voice: VOICES[options.department],
          },
        },
        tools: options.tools,
        tool_choice: 'auto',
      },
    });
  });

  socket.on('message', (raw) => {
    const event = parseSocketMessage(raw);
    if (!event) return;
    const type = typeof event.type === 'string' ? event.type : '';

    if (type === 'session.updated' && !ready) {
      ready = true;
      options.callbacks.onReady();
      return;
    }
    if (type === 'response.output_audio.delta' && typeof event.delta === 'string') {
      options.callbacks.onAudio(event.delta);
      return;
    }
    if (
      type === 'conversation.item.input_audio_transcription.completed' &&
      typeof event.transcript === 'string' &&
      event.transcript.trim()
    ) {
      options.callbacks.onCallerTranscript(event.transcript.trim());
      return;
    }
    if (
      type === 'response.output_audio_transcript.done' &&
      typeof event.transcript === 'string' &&
      event.transcript.trim()
    ) {
      options.callbacks.onAgentTranscript(event.transcript.trim());
      return;
    }
    if (type === 'input_audio_buffer.speech_started') {
      options.callbacks.onSpeechStarted();
      return;
    }
    if (type === 'input_audio_buffer.speech_stopped') {
      options.callbacks.onSpeechStopped();
      return;
    }
    if (type === 'response.function_call_arguments.done') {
      const id = String(event.call_id || event.item_id || '');
      const name = String(event.name || '');
      if (!id || !name || handledFunctionCalls.has(id)) return;
      handledFunctionCalls.add(id);
      options.callbacks.onToolCall({
        id,
        name,
        args: parseToolArguments(event.arguments),
      });
      return;
    }
    if (type === 'response.output_item.done') {
      const item = event.item && typeof event.item === 'object' ? (event.item as JsonObject) : null;
      if (!item || item.type !== 'function_call') return;
      const id = String(item.call_id || item.id || '');
      const name = String(item.name || '');
      if (!id || !name || handledFunctionCalls.has(id)) return;
      handledFunctionCalls.add(id);
      options.callbacks.onToolCall({
        id,
        name,
        args: parseToolArguments(item.arguments),
      });
      return;
    }
    if (type === 'error') {
      const error = event.error && typeof event.error === 'object' ? (event.error as JsonObject) : {};
      options.callbacks.onError(
        typeof error.message === 'string' ? error.message : 'OpenAI Realtime returned an error',
      );
      return;
    }
    if (type === 'response.done') {
      const response = event.response && typeof event.response === 'object' ? (event.response as JsonObject) : {};
      if (response.status && response.status !== 'completed' && response.status !== 'cancelled') {
        options.callbacks.onError(`OpenAI Realtime response ended with status ${String(response.status)}`);
      }
    }
  });

  socket.on('error', (error) => {
    if (!closing) options.callbacks.onError(error.message || 'OpenAI Realtime connection failed');
  });
  socket.on('close', () => {
    if (!closing) options.callbacks.onClose();
  });

  return {
    socket,
    model,
    appendAudio(payload: string) {
      sendJson(socket, { type: 'input_audio_buffer.append', audio: payload });
    },
    cancelResponse() {
      sendJson(socket, { type: 'response.cancel' });
    },
    requestResponse(instructions?: string) {
      sendJson(socket, {
        type: 'response.create',
        ...(instructions ? { response: { instructions } } : {}),
      });
    },
    sendToolResult(callId: string, result: unknown) {
      sendJson(socket, {
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: JSON.stringify(result),
        },
      });
      sendJson(socket, { type: 'response.create' });
    },
    close() {
      closing = true;
      if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
      else if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'Fallback session finished');
    },
  };
}
