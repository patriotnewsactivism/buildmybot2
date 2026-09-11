import { buildApiUrl } from './apiConfig';

export interface Base44SuperagentResult {
  conversationId: string;
  messageId: string | null;
  content: string;
}

export interface Base44SuperagentOptions {
  conversationId?: string;
  fileUrls?: string[];
  timeoutMs?: number;
  accessToken?: string;
}

/**
 * Calls BuildMyBot's authenticated server-side Base44 proxy. The Base44 API
 * credential never reaches the browser; this client sends the current
 * authenticated session/token so the server can enforce BASE44_ALLOWED_EMAILS.
 */
export async function callBase44Superagent(
  task: string,
  options: Base44SuperagentOptions = {},
): Promise<Base44SuperagentResult> {
  const prompt = task.trim();
  if (!prompt) throw new Error('Base44 Superagent task must not be empty');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const response = await fetch(buildApiUrl('/base44-agent'), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({
      task: prompt,
      conversationId: options.conversationId,
      fileUrls: options.fileUrls ?? [],
      timeoutMs: options.timeoutMs,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as
    | Base44SuperagentResult
    | { error?: string };
  if (!response.ok) {
    throw new Error(
      'error' in payload && payload.error
        ? payload.error
        : `Base44 Superagent request failed (${response.status})`,
    );
  }

  return payload as Base44SuperagentResult;
}
