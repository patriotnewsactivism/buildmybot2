/**
 * API Configuration
 * 
 * In production (Vercel), uses relative /api/ paths which are proxied to Railway
 * via vercel.json rewrites. This avoids CORS issues from cross-origin requests.
 * 
 * In development, VITE_API_URL can point to the local backend (e.g., http://localhost:3001)
 */
const isDev = import.meta.env.DEV;
const rawApiBase = isDev
  ? (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '')
  : '';

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
