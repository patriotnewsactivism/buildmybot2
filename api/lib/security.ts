// =====================================================================
// P1: Central security headers + CORS policy.
//
// Applied in server.ts BEFORE any API route so no handler can respond
// without the hardened headers, and so a rejected cross-origin request
// never reaches business logic.
// =====================================================================

const DEFAULT_ORIGINS = [
  'https://buildmybot.app',
  'https://www.buildmybot.app',
];

/** Origins allowed to send credentialed (cookie) requests. */
export function allowedOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const dev =
    process.env.NODE_ENV !== 'production'
      ? ['http://localhost:5173', 'http://localhost:8080']
      : [];
  return [...new Set([...DEFAULT_ORIGINS, ...fromEnv, ...dev])];
}

/**
 * Routes that are intentionally public/anonymous and embedded on third
 * party websites. They get wildcard CORS but NEVER
 * Access-Control-Allow-Credentials, so no session cookie can ride along.
 */
export function isPublicEmbedPath(pathname: string): boolean {
  return (
    pathname === '/embed.js' ||
    pathname.startsWith('/chat/') ||
    pathname.startsWith('/api/chat') ||
    pathname.startsWith('/api/public/') ||
    pathname === '/api/leads/capture' ||
    pathname === '/api/health'
  );
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return allowedOrigins().includes(origin);
}

/** Express middleware: strict CORS with an allowlist. */
export function corsMiddleware(req: any, res: any, next: () => void) {
  const origin = req.headers.origin as string | undefined;
  const pathname = (req.path || req.url || '').split('?')[0];

  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin as string);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  } else if (isPublicEmbedPath(pathname)) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin) {
    // Unknown origin on a private route: no CORS headers at all, and
    // preflight is refused outright.
    if (req.method === 'OPTIONS') {
      res.status(403).end();
      return;
    }
  }

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With',
  );
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

/** Helmet configuration tuned for the SPA + embeddable widget. */
export function helmetOptions() {
  return {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        // The Vite bundle and Tailwind runtime need inline styles; scripts
        // are bundled but Stripe/analytics are loaded from their CDNs.
        'script-src': [
          "'self'",
          "'unsafe-inline'",
          'https://js.stripe.com',
          'https://cdn.jsdelivr.net',
        ],
        'style-src': [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
        ],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'connect-src': ["'self'", 'https:', 'wss:'],
        'frame-src': ["'self'", 'https://js.stripe.com'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        // frame-ancestors is relaxed per-route for the embeddable widget.
        'frame-ancestors': ["'self'"],
        'upgrade-insecure-requests': [],
      },
    },
    crossOriginEmbedderPolicy: false,
    // The widget and shared chat pages are meant to be embedded.
    crossOriginResourcePolicy: { policy: 'cross-origin' as const },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' as const },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  };
}

/**
 * Widget routes must stay embeddable, so the strict frame-ancestors /
 * X-Frame-Options that helmet sets are relaxed for exactly those paths.
 */
export function embedFrameMiddleware(req: any, res: any, next: () => void) {
  const pathname = (req.path || req.url || '').split('?')[0];
  if (pathname.startsWith('/chat/') || pathname === '/embed.js') {
    res.removeHeader?.('X-Frame-Options');
    res.setHeader(
      'Content-Security-Policy',
      "frame-ancestors *; default-src 'self' https: 'unsafe-inline' data: blob:",
    );
  }
  next();
}
