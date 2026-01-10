const rawApiBase = (import.meta.env.VITE_API_URL || '')
  .trim()
  .replace(/\/+$/, '');

export const API_BASE = rawApiBase
  ? rawApiBase.endsWith('/api')
    ? rawApiBase
    : `${rawApiBase}/api`
  : '/api';

export const buildApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
};

export async function safeParseJson<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
