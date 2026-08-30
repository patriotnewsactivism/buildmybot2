interface Env {
  BUILDMYBOT_API_ORIGIN?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

const DEFAULT_API_ORIGIN = 'https://buildmybot2-fq5disxp2a-uc.a.run.app';

/**
 * Keep buildmybot.app same-origin for browser clients while the API runs on
 * Google Cloud Run. Cloudflare Pages Functions invokes this handler for every
 * /api/* path and streams the request/response without exposing backend
 * credentials to the browser.
 *
 * Set BUILDMYBOT_API_ORIGIN in Cloudflare Pages if the Cloud Run service URL
 * changes. The production Cloud Run URL is used as a safe default.
 */
export async function onRequest(context: PagesContext): Promise<Response> {
  const incomingUrl = new URL(context.request.url);
  const configuredOrigin = context.env.BUILDMYBOT_API_ORIGIN || DEFAULT_API_ORIGIN;
  const origin = new URL(configuredOrigin);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, origin);

  const headers = new Headers(context.request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', incomingUrl.host);
  headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));

  const init: RequestInit = {
    method: context.request.method,
    headers,
    redirect: 'manual',
  };

  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    init.body = context.request.body;
  }

  const upstreamResponse = await fetch(new Request(upstreamUrl.toString(), init));

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: upstreamResponse.headers,
  });
}
