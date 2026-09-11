import type { ApiRequest, ApiResponse } from './lib/http-types.js';

const DEFAULT_AGENT_ID = '6a515f4e071e32fc10378575';
const BASE44_AGENT_API = 'https://app.base44.com/api/agents';
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_TIMEOUT_MS = 50_000;
const POLL_INTERVAL_MS = 1_000;

class HttpError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

interface Base44Message {
  id?: string;
  role?: string;
  content?: string;
}

interface Base44Conversation {
  id?: string;
  conversation_id?: string;
  messages?: Base44Message[];
}

function base44Key(): string {
  return (process.env.BASE44_SUPERAGENT_API_KEY || '').trim();
}

function agentId(): string {
  return (process.env.BASE44_SUPERAGENT_ID || DEFAULT_AGENT_ID).trim();
}

function timeoutMs(requested?: unknown): number {
  const envDefault = Number(
    process.env.BASE44_SUPERAGENT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS,
  );
  const candidate = Number.isFinite(Number(requested))
    ? Number(requested)
    : envDefault;
  return Math.min(
    MAX_TIMEOUT_MS,
    Math.max(1_000, Math.floor(candidate || DEFAULT_TIMEOUT_MS)),
  );
}

function supabaseConfig(): { url: string; anonKey: string } {
  return {
    url: (
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      ''
    ).replace(/\/$/, ''),
    anonKey:
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      '',
  };
}

function allowedEmails(): Set<string> {
  return new Set(
    (process.env.BASE44_ALLOWED_EMAILS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function requireAllowedUser(req: ApiRequest): Promise<{ email: string }> {
  const auth = (req.headers.authorization as string) || '';
  const token = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : '';

  if (!token) {
    throw new HttpError('Authentication required', 401);
  }

  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) {
    throw new HttpError(
      'Supabase auth verification is not configured on the server',
      503,
    );
  }

  const allowlist = allowedEmails();
  if (allowlist.size === 0) {
    throw new HttpError(
      'BASE44_ALLOWED_EMAILS is not configured; Base44 access is fail-closed',
      503,
    );
  }

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new HttpError('Invalid or expired session', 401);
  }

  const user = (await response.json()) as { email?: string };
  const email = String(user.email || '')
    .trim()
    .toLowerCase();

  if (!email || !allowlist.has(email)) {
    throw new HttpError(
      'This account is not authorized to use the internal Base44 Superagent',
      403,
    );
  }

  return { email };
}

async function base44Fetch<T = unknown>(
  path: string,
  init?: RequestInit,
  signal?: AbortSignal,
): Promise<T> {
  const key = base44Key();
  if (!key) {
    throw new HttpError('BASE44_SUPERAGENT_API_KEY is not configured', 503);
  }

  const response = await fetch(
    `${BASE44_AGENT_API}/${encodeURIComponent(agentId())}${path}`,
    {
      ...(init || {}),
      signal,
      headers: {
        'Content-Type': 'application/json',
        api_key: key,
        ...(init?.headers || {}),
      },
    },
  );

  const text = await response.text();
  if (!response.ok) {
    const status = response.status >= 500 ? 502 : response.status;
    throw new HttpError(
      `Base44 Superagent API ${response.status}: ${text.slice(0, 500)}`,
      status,
    );
  }

  return (text ? JSON.parse(text) : {}) as T;
}

function conversationIdFrom(value: Base44Conversation | null): string | null {
  return (value && (value.id || value.conversation_id)) || null;
}

function assistantMessages(
  conversation: Base44Conversation | null,
): Base44Message[] {
  return Array.isArray(conversation?.messages)
    ? conversation.messages.filter(
        (message) =>
          message &&
          message.role === 'assistant' &&
          typeof message.content === 'string',
      )
    : [];
}

function newestNewAssistant(
  conversation: Base44Conversation | null,
  priorIds: Set<string>,
  priorCount: number,
): Base44Message | null {
  const assistants = assistantMessages(conversation);
  for (let index = assistants.length - 1; index >= 0; index -= 1) {
    const message = assistants[index];
    const id = message.id;
    if (id && !priorIds.has(id)) return message;
  }
  return assistants.length > priorCount
    ? assistants[assistants.length - 1]
    : null;
}

async function getConversation(
  conversationId: string,
  signal: AbortSignal,
): Promise<Base44Conversation> {
  return base44Fetch<Base44Conversation>(
    `/conversations/${encodeURIComponent(conversationId)}`,
    { method: 'GET' },
    signal,
  );
}

async function createConversation(signal: AbortSignal): Promise<string> {
  const conversation = await base44Fetch<Base44Conversation>(
    '/conversations',
    { method: 'POST', body: '{}' },
    signal,
  );
  const id = conversationIdFrom(conversation);
  if (!id) throw new HttpError('Base44 did not return a conversation id', 502);
  return id;
}

interface CallSuperagentParams {
  task: string;
  conversationId?: string;
  fileUrls?: string[];
  requestedTimeout?: unknown;
}

async function callSuperagent({
  task,
  conversationId,
  fileUrls,
  requestedTimeout,
}: CallSuperagentParams): Promise<{
  conversationId: string;
  messageId: string | null;
  content: string;
}> {
  const controller = new AbortController();
  const waitMs = timeoutMs(requestedTimeout);
  const timer = setTimeout(() => controller.abort(), waitMs);

  try {
    let id = String(conversationId || '').trim();
    let before: Base44Conversation = { messages: [] };
    if (id) before = await getConversation(id, controller.signal);
    else id = await createConversation(controller.signal);

    const priorAssistants = assistantMessages(before);
    const priorIds = new Set(
      priorAssistants.map((message) => message.id || '').filter(Boolean),
    );

    await base44Fetch(
      `/conversations/${encodeURIComponent(id)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          role: 'user',
          content: task,
          file_urls: Array.isArray(fileUrls) ? fileUrls : [],
        }),
      },
      controller.signal,
    );

    while (!controller.signal.aborted) {
      const conversation = await getConversation(id, controller.signal);
      const reply = newestNewAssistant(
        conversation,
        priorIds,
        priorAssistants.length,
      );
      if (reply?.content) {
        return {
          conversationId: id,
          messageId: reply.id || null,
          content: reply.content,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new HttpError(
      `Base44 Superagent did not complete within ${waitMs}ms`,
      504,
    );
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      throw new HttpError(
        `Base44 Superagent request timed out after ${waitMs}ms`,
        504,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(
  req: ApiRequest,
  res: ApiResponse,
): Promise<ApiResponse | undefined> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireAllowedUser(req);

    const body =
      req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : {};
    const task = typeof body.task === 'string' ? body.task.trim() : '';
    if (!task) return res.status(400).json({ error: 'task is required' });
    if (task.length > 100_000)
      return res.status(400).json({ error: 'task is too large' });

    const fileUrls = Array.isArray(body.fileUrls)
      ? body.fileUrls
          .filter((value): value is string => typeof value === 'string')
          .slice(0, 10)
      : [];

    const result = await callSuperagent({
      task,
      conversationId:
        typeof body.conversationId === 'string'
          ? body.conversationId
          : undefined,
      fileUrls,
      requestedTimeout: body.timeoutMs,
    });
    return res.status(200).json(result);
  } catch (error: unknown) {
    const status = error instanceof HttpError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : String(error);
    return res.status(status).json({ error: message });
  }
}
