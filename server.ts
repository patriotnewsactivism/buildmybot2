import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';

import loginHandler from './api/auth/login.js';
import logoutHandler from './api/auth/logout.js';
import signupHandler from './api/auth/signup.js';
import userHandler from './api/auth/user.js';
import cronHandler from './api/cron/[job].js';
import gatewayHandler from './api/gateway.js';
import {
  corsMiddleware,
  embedFrameMiddleware,
  helmetOptions,
} from './api/lib/security.js';
import stripeWebhookHandler from './api/stripe-webhook.js';
import smsWebhookHandler from './api/sms/webhooks.js';
import liveTokenHandler from './api/voice/live-token.js';
import { handleTwilioMediaConnection } from './api/voice/twilio-live.js';

const app = express();
const server = createServer(app);
const twilioMediaWss = new WebSocketServer({ noServer: true });
const PORT = process.env.PORT || 8080;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Twilio's bidirectional Media Stream is a true WebSocket connection, not an
// HTTP route. Only the dedicated voice-media path is allowed to upgrade;
// everything else is rejected instead of accidentally exposing a generic WS
// endpoint on the public Cloud Run service.
server.on('upgrade', (request, socket, head) => {
  let pathname = '';
  try {
    const host = request.headers.host || 'localhost';
    pathname = new URL(request.url || '/', `http://${host}`).pathname;
  } catch {
    socket.destroy();
    return;
  }

  if (pathname !== '/api/voice/twilio-media') {
    socket.destroy();
    return;
  }

  twilioMediaWss.handleUpgrade(request, socket, head, (webSocket) => {
    handleTwilioMediaConnection(webSocket, request);
  });
});

// ── Security middleware — MUST run before every API route ───────────
// Previously the header middleware sat AFTER all /api routes, so no API
// response ever carried them. Helmet + strict CORS now run first.
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet(helmetOptions()));
app.use(embedFrameMiddleware);
app.use(corsMiddleware);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(self), camera=()',
  );
  next();
});

// Stripe webhook needs raw body for signature verification
// P0 FIX: this used to JSON.parse the raw buffer and REPLACE req.body with
// the parsed object before calling the handler. The handler then tried to
// re-read the (already consumed) stream, got zero bytes, and every Stripe
// signature check failed on Cloud Run -- i.e. no subscription, plan or
// credit event was ever applied in production. The exact bytes Stripe signed
// are now preserved on req.rawBody (and left on req.body as a Buffer), which
// is what api/stripe-webhook.ts verifies against.
app.post(
  '/api/stripe-webhook',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    (req as any).rawBody = raw;
    await stripeWebhookHandler(req as any, res as any);
  },
);

app.post('/api/sms/webhooks', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  await smsWebhookHandler(req as any, res as any);
});

// Body parsing for all other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Lightweight production health/provenance endpoint used by deploy verification.
// Railway injects RAILWAY_GIT_COMMIT_SHA for GitHub-backed deployments; Cloud
// Run receives BUILD_SHA from its deployment workflow.
const healthPayload = () => ({
  status: 'ok',
  service: 'buildmybot2',
  timestamp: new Date().toISOString(),
  build: {
    sha:
      process.env.BUILD_SHA ||
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.K_REVISION ||
      'unknown',
    deployedAt: process.env.BUILD_TIME || null,
  },
});
app.get('/health', (_req, res) => res.status(200).json(healthPayload()));
// /api/health must report the same provenance — deploy verification and
// external monitors both check the public /api path.
app.get('/api/health', (_req, res) => res.status(200).json(healthPayload()));

// Auth routes — file-system routing equivalents from Vercel
app.all('/api/auth/login', async (req, res) => {
  await loginHandler(req as any, res as any);
});
app.all('/api/auth/signup', async (req, res) => {
  await signupHandler(req as any, res as any);
});
app.all('/api/auth/logout', async (req, res) => {
  await logoutHandler(req as any, res as any);
});
app.all('/api/auth/user', async (req, res) => {
  await userHandler(req as any, res as any);
});

// Cron routes — Vercel dynamic route [job] -> Express :job param.
// req.query must be shadowed with defineProperty because Express 5 exposes it
// as a getter-only property on the request prototype.
app.all('/api/cron/:job', async (req, res) => {
  Object.defineProperty(req, 'query', {
    value: { ...req.query, job: req.params.job },
    writable: true,
    configurable: true,
    enumerable: true,
  });
  await cronHandler(req as any, res as any);
});

// Gemini Live ephemeral tokens are minted server-side so the permanent API
// key never enters the browser bundle.
app.all('/api/voice/live-token', async (req, res) => {
  await liveTokenHandler(req as any, res as any);
});

// A normal HTTP request to the Media Stream endpoint is not useful. Returning
// 426 makes misconfiguration obvious while the WebSocket upgrade path above
// handles actual Twilio streams.
app.all('/api/voice/twilio-media', (_req, res) => {
  res.status(426).json({ error: 'WebSocket upgrade required' });
});

// Gateway handles everything else under /api/*.
// Express 5 uses named wildcards; the braced form also matches /api itself.
app.all('/api/{*path}', async (req, res) => {
  await gatewayHandler(req as any, res as any);
});

// Static asset caching for the embeddable widget (headers themselves are
// set by the security middleware above).
app.use((req, res, next) => {
  if (req.path === '/embed.js')
    res.setHeader('Cache-Control', 'public, max-age=3600');
  next();
});

// Static frontend (built by Vite)
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback — Express 5 named wildcard form also matches the root path.
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`BuildMyBot server running on port ${PORT}`);
});
