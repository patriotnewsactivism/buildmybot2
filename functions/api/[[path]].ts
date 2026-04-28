// Cloudflare Pages Function to proxy /api/* requests to Railway backend
const RAILWAY_BACKEND = "https://buildmybot2-production-0aff.up.railway.app";

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const targetUrl = RAILWAY_BACKEND + url.pathname + url.search;

  // Clone the request with the new URL
  const headers = new Headers(context.request.headers);
  headers.delete("host");
  
  const init: RequestInit = {
    method: context.request.method,
    headers,
  };

  // Forward body for non-GET/HEAD requests
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    init.body = context.request.body;
    // @ts-ignore - duplex is needed for streaming body
    init.duplex = "half";
  }

  try {
    const response = await fetch(targetUrl, init);
    
    // Clone response with CORS headers
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    
    // Handle OPTIONS preflight
    if (context.request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: responseHeaders });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Backend unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};
