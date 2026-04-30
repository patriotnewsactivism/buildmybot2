/**
 * API Configuration
 * 
 * In production (Vercel), uses relative /api/ paths which are proxied to Railway
 * via vercel.json rewrites. This avoids CORS issues from cross-origin requests.
 * 
 * In development, VITE_API_URL can point to the local backend (e.g., http://localhost:3001)
 * 
 * IMPORTANT: Never use a full URL in production — it causes CORS blocks.
 * The Vercel rewrite handles proxying /api/* to Railway.
 */

function getApiBase(): string {
  // In browser context, check if we are on localhost (dev) or production
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isLocalDev = hostname === "localhost" || hostname === "127.0.0.1";
    if (!isLocalDev) {
      // Production: always use relative path to go through Vercel rewrites
      return "/api";
    }
  }

  // Development: allow VITE_API_URL override
  try {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl && typeof envUrl === "string") {
      const trimmed = envUrl.trim().replace(/\/+$/, "");
      return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
    }
  } catch {
    // import.meta.env may not be available in all contexts
  }

  return "/api";
}

export const API_BASE = getApiBase();

export const buildApiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
};

export async function safeParseJson<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
