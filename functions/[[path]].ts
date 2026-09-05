interface Env {
  BUILDMYBOT_PRIMARY_API_ORIGIN?: string;
  BUILDMYBOT_FALLBACK_API_ORIGIN?: string;
  /** Legacy setting: treated as fallback so an old Cloud Run value cannot override Railway primary. */
  BUILDMYBOT_API_ORIGIN?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

const DEFAULT_RAILWAY_ORIGIN =
  'https://buildmybot2-web-production.up.railway.app';
const DEFAULT_CLOUD_RUN_ORIGIN = 'https://buildmybot2-fq5disxp2a-uc.a.run.app';

function buildUpstreamRequest(request: Request, origin: string): Request {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(
    `${incomingUrl.pathname}${incomingUrl.search}`,
    origin,
  );
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', incomingUrl.host);
  headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }
  return new Request(upstreamUrl.toString(), init);
}

function withOriginHeader(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  headers.set('x-buildmybot-origin', origin);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Cloudflare remains the public edge. Railway is the primary origin for the
 * application and API; Cloud Run is a warm fallback for idempotent GET/HEAD
 * traffic only. Mutating requests are never automatically replayed against a
 * second backend because doing so could duplicate external or database writes.
 */
export async function onRequest(context: PagesContext): Promise<Response> {
  const primary =
    context.env.BUILDMYBOT_PRIMARY_API_ORIGIN || DEFAULT_RAILWAY_ORIGIN;
  const fallback =
    context.env.BUILDMYBOT_FALLBACK_API_ORIGIN ||
    context.env.BUILDMYBOT_API_ORIGIN ||
    DEFAULT_CLOUD_RUN_ORIGIN;
  const method = context.request.method.toUpperCase();
  const isWebSocket =
    context.request.headers.get('upgrade')?.toLowerCase() === 'websocket';
  const mayFallback = (method === 'GET' || method === 'HEAD') && !isWebSocket;

  try {
    const response = await fetch(
      buildUpstreamRequest(context.request, primary),
    );
    if (!mayFallback || response.status < 500) {
      return withOriginHeader(response, 'railway');
    }
  } catch (error) {
    if (!mayFallback) throw error;
  }

  const fallbackResponse = await fetch(
    buildUpstreamRequest(context.request, fallback),
  );
  return withOriginHeader(fallbackResponse, 'cloud-run-fallback');
}
