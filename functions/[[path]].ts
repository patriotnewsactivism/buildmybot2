interface Env {
  BUILDMYBOT_API_ORIGIN?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

const DEFAULT_CLOUD_RUN_ORIGIN = 'https://buildmybot2-fq5disxp2a-uc.a.run.app';

/**
 * Keep the public BuildMyBot domain on Cloudflare's edge while making Cloud
 * Run the origin for every route, including the standalone voice-agent page.
 */
export async function onRequest(context: PagesContext): Promise<Response> {
  const incomingUrl = new URL(context.request.url);
  const cloudRunOrigin = new URL(
    context.env.BUILDMYBOT_API_ORIGIN || DEFAULT_CLOUD_RUN_ORIGIN,
  );
  const upstreamUrl = new URL(
    `${incomingUrl.pathname}${incomingUrl.search}`,
    cloudRunOrigin,
  );

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

  const upstreamResponse = await fetch(
    new Request(upstreamUrl.toString(), init),
  );
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set('x-buildmybot-origin', 'cloud-run');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
