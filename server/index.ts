import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';
import { initSentry } from './utils/sentry';

// Initialize Sentry before any other imports
initSentry();

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import { and, desc, eq, isNull } from 'drizzle-orm';
import express from 'express';
import session from 'express-session';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketServer } from 'ws';
import { PLANS, RESELLER_TIERS, WHITELABEL_FEE } from '../constants';
import {
  auditLogs,
  botDocuments,
  botTemplates,
  bots,
  conversations,
  knowledgeSources,
  leads,
  users,
} from '../shared/schema';
import { db, pool } from './db';
import {
  apiLimiter,
  applyImpersonation,
  authenticate,
  authorize,
  isLaunchGateActive,
  loadOrganizationContext,
  metricsMiddleware,
  requestLogger,
  requireLaunchGateOpen,
  securityHeaders,
  subdomainResolution,
  tenantIsolation,
} from './middleware';
import {
  adminRouter,
  agencyRouter,
  analyticsRouter,
  auditRouter,
  authRouter,
  channelsRouter,
  chatRouter,
  clientsRouter,
  healthRouter,
  impersonationRouter,
  integrationsRouter,
  knowledgeRouter,
  landingPagesRouter,
  leadsRouter,
  notificationsRouter,
  organizationsRouter,
  partnersRouter,
  phoneRouter,
  revenueRouter,
  searchRouter,
  teamRouter,
  templatesRouter,
  toolsRouter,
  twilioWebhooksRouter,
  voiceAgentsRouter,
  voiceRouter,
  webhooksRouter,
} from './routes';
import { KnowledgeRepairService } from './services/KnowledgeRepairService';
import { nurtureService } from './services/NurtureService';
import { voiceAgentService } from './services/VoiceAgentService';
import { WebScraperService } from './services/WebScraperService';
import { getStripePublishableKey } from './stripeClient';
import { stripeService } from './stripeService';
import { WebhookHandlers } from './webhookHandlers';

const isVercel = Boolean(process.env.VERCEL);
const uploadsDir = isVercel
  ? path.join('/tmp', 'uploads')
  : path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Use memory storage — disk storage is ephemeral on Railway/Vercel and loses files on restart
const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ];
  const allowedExtensions = ['.pdf', '.docx', '.txt'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, DOCX, and TXT files are allowed'));
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy to properly handle X-Forwarded-For header for rate limiting
app.set('trust proxy', 1);

const isProduction = env.NODE_ENV === 'production';
const defaultPort = isProduction ? '5000' : env.API_PORT || '3001';
const PORT = Number.parseInt(env.PORT || defaultPort, 10);

function getBaseUrl() {
  const appBaseUrl = env.APP_BASE_URL?.trim();
  if (appBaseUrl) {
    return appBaseUrl.replace(/\/+$/, '');
  }

  return null;
}

// Stripe is configured via environment variables
// Webhook endpoint is available at /api/stripe/webhook

// CORS configuration - restrict origins in production
const getAllowedOrigins = (): (string | RegExp)[] => {
  const origins: (string | RegExp)[] = [];

  // Add APP_BASE_URL if configured
  if (env.APP_BASE_URL) {
    origins.push(env.APP_BASE_URL.replace(/\/+$/, ''));
  }

  // Add additional allowed origins from environment
  if (env.CORS_ORIGINS) {
    origins.push(
      ...env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    );
  }

  // In development, allow common local origins
  if (!isProduction) {
    origins.push(/^http:\/\/localhost:\d+$/);
    origins.push(/^http:\/\/127\.0\.0\.1:\d+$/);
  }

  // Fallback: if no origins configured, allow same-origin only
  if (origins.length === 0) {
    origins.push(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/);
  }

  return origins;
};

app.use(
  cors({
    origin: (requestOrigin, callback) => {
      const allowedOrigins = getAllowedOrigins();

      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!requestOrigin) {
        return callback(null, true);
      }

      // Check if origin matches any allowed pattern
      const isAllowed = allowedOrigins.some((allowed) => {
        if (typeof allowed === 'string') {
          return allowed === requestOrigin;
        }
        return allowed.test(requestOrigin);
      });

      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked origin: ${requestOrigin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Organization-Id',
      'x-user-id',
      'x-impersonation-token',
    ],
  }),
);

// Enable gzip/brotli compression for responses
app.use(
  compression({
    level: 6, // Balanced compression level
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
      // Don't compress if client doesn't accept it
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
  }),
);

// Configure session store with PostgreSQL
const PgSession = connectPgSimple(session);
// Validate session secret in production
const sessionSecret = env.SESSION_SECRET;
if (isProduction && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error(
    'SESSION_SECRET must be at least 32 characters in production',
  );
}

app.use(
  session({
    store: new PgSession({
      pool: pool as any,
      tableName: 'sessions',
      createTableIfMissing: true,
    }),
    secret: sessionSecret || 'buildmybot-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: isProduction ? 'none' : 'lax',
    },
  }),
);

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        return res.status(500).json({ error: 'Webhook processing error' });
      }
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  },
);

// Limit JSON body size to prevent abuse
app.use(express.json({ limit: '10mb' }));
// Handle url encoded for Twilio
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Phase 8: Structured Request Logging
app.use(requestLogger);

// Subdomain Resolution (Phase 10)
app.use(subdomainResolution());

// Metrics collection
app.use(metricsMiddleware);

// Phase 1: Apply security headers
app.use(securityHeaders);

// Phase 1: Apply rate limiting to API routes
app.use('/api', apiLimiter);

// Cache control helper middleware
const cacheControl = (maxAge: number, isPublic = true) => {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    res.set(
      'Cache-Control',
      `${isPublic ? 'public' : 'private'}, max-age=${maxAge}`,
    );
    next();
  };
};

// ETag support for efficient caching
app.set('etag', 'strong');

// ========================================
// LAUNCH GATE STATUS
// ========================================
app.get('/api/launch-gate/status', (_req, res) => {
  res.json({
    gateActive: isLaunchGateActive(),
    message: isLaunchGateActive()
      ? 'Platform is in pre-launch mode. Purchases are disabled.'
      : 'Platform is live. Purchases are enabled.',
  });
});

app.get('/api/stripe/publishable-key', async (req, res) => {
  try {
    const key = await getStripePublishableKey();
    res.json({ publishableKey: key });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get publishable key' });
  }
});

// Cache Stripe products for 5 minutes (300 seconds) - rarely changes
app.get('/api/stripe/products', cacheControl(300), async (req, res) => {
  try {
    const products = await stripeService.listProductsWithPrices();
    const productsMap = new Map();
    for (const row of products as any[]) {
      if (!productsMap.has(row.product_id)) {
        productsMap.set(row.product_id, {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          metadata: row.product_metadata,
          prices: [],
        });
      }
      if (row.price_id) {
        productsMap.get(row.product_id).prices.push({
          id: row.price_id,
          unit_amount: row.unit_amount,
          currency: row.currency,
          recurring: row.recurring,
        });
      }
    }
    res.json({ data: Array.from(productsMap.values()) });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/api/stripe/sync-plans', async (req, res) => {
  try {
    const results = await stripeService.syncPlansToStripe(PLANS);
    res.json({ success: true, synced: results });
  } catch (error) {
    console.error('Error syncing plans to Stripe:', error);
    res.status(500).json({ error: 'Failed to sync plans to Stripe' });
  }
});

app.post('/api/stripe/checkout', requireLaunchGateOpen, async (req, res) => {
  try {
    const { userId, priceId } = req.body;
    if (!userId || !priceId) {
      return res.status(400).json({ error: 'Missing userId or priceId' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeService.createCustomer(
        user.email,
        user.id,
        user.name,
      );
      await stripeService.updateUserStripeInfo(user.id, {
        stripeCustomerId: customer.id,
      });
      customerId = customer.id;
    }

    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      return res
        .status(500)
        .json({ error: 'APP_BASE_URL must be set for Stripe redirects' });
    }
    const session = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      `${baseUrl}/billing?success=true`,
      `${baseUrl}/billing?canceled=true`,
    );

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

app.post('/api/stripe/whitelabel/checkout', requireLaunchGateOpen, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const priceId = env.STRIPE_WHITELABEL_PRICE_ID;
    if (!priceId) {
      return res
        .status(500)
        .json({ error: 'STRIPE_WHITELABEL_PRICE_ID must be set' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeService.createCustomer(
        user.email,
        user.id,
        user.name,
      );
      await stripeService.updateUserStripeInfo(user.id, {
        stripeCustomerId: customer.id,
      });
      customerId = customer.id;
    }

    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      return res
        .status(500)
        .json({ error: 'APP_BASE_URL must be set for Stripe redirects' });
    }

    const session = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      `${baseUrl}/?whitelabel=success`,
      `${baseUrl}/?whitelabel=canceled`,
      {
        metadata: {
          purpose: 'whitelabel_fee',
          userId,
        },
        subscriptionMetadata: {
          purpose: 'whitelabel_fee',
          userId,
        },
      },
    );

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating whitelabel checkout session:', error);
    res
      .status(500)
      .json({ error: 'Failed to create whitelabel checkout session' });
  }
});

app.post('/api/stripe/portal', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user?.stripeCustomerId) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      return res
        .status(500)
        .json({ error: 'APP_BASE_URL must be set for Stripe redirects' });
    }
    const session = await stripeService.createCustomerPortalSession(
      user.stripeCustomerId,
      `${baseUrl}/billing`,
    );

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

const apiAuthStack = [
  authenticate,
  applyImpersonation,
  loadOrganizationContext,
  tenantIsolation(),
];

const isAdminUser = (user?: { role?: string } | null) => {
  return (
    user?.role === 'ADMIN' ||
    user?.role === 'Admin' ||
    user?.role === 'MasterAdmin'
  );
};

const canAccessBot = (
  bot: typeof bots.$inferSelect,
  user?: { id?: string; organizationId?: string; role?: string } | null,
  organizationId?: string,
) => {
  if (isAdminUser(user)) return true;
  if (!user?.id) return false;
  if (bot.userId && bot.userId === user.id) return true;
  if (organizationId && bot.organizationId === organizationId) return true;
  return false;
};

const extractKnowledgeUrls = (knowledgeBase: unknown): string[] => {
  if (!Array.isArray(knowledgeBase)) return [];
  return knowledgeBase.filter(
    (item) => typeof item === 'string' && item.startsWith('http'),
  );
};

type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update'>;

const createKnowledgeSourcesForUrls = async (
  tx: DbExecutor,
  botId: string,
  organizationId: string | null | undefined,
  urls: string[],
) => {
  if (urls.length === 0) return [];

  const existing = await tx
    .select({ sourceUrl: knowledgeSources.sourceUrl })
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.botId, botId),
        eq(knowledgeSources.sourceType, 'url'),
      ),
    );

  const existingSet = new Set(
    existing.map((row) => row.sourceUrl).filter(Boolean),
  );
  const created: Array<{ sourceId: string; url: string }> = [];

  for (const url of urls) {
    if (existingSet.has(url)) continue;
    try {
      const parsed = new URL(url);
      const sourceId = uuidv4();
      await tx.insert(knowledgeSources).values({
        id: sourceId,
        botId,
        organizationId,
        sourceType: 'url',
        sourceName: parsed.hostname,
        sourceUrl: url,
        status: 'processing',
        pagesCrawled: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      created.push({ sourceId, url });
    } catch (error) {
      console.warn('Invalid knowledge URL, skipping:', url);
    }
  }

  return created;
};

app.get('/api/bots', ...apiAuthStack, async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const organizationId =
      (req as any).organization?.id || (req.query.organizationId as string);

    const conditions = [];

    if (userId) {
      conditions.push(eq(bots.userId, userId));
    }
    if (organizationId) {
      conditions.push(eq(bots.organizationId, organizationId));
    }

    let allBots;
    if (conditions.length > 0) {
      allBots = await db
        .select()
        .from(bots)
        .where(and(isNull(bots.deletedAt), ...conditions));
    } else {
      // Fallback: If no filters, return empty array for safety instead of all bots
      // or check if user is admin
      const user = (req as any).user;
      if (isAdminUser(user)) {
        allBots = await db.select().from(bots).where(isNull(bots.deletedAt));
      } else {
        // If regular user/no context, only show their own bots if user exists
        if (user?.id) {
          allBots = await db
            .select()
            .from(bots)
            .where(and(eq(bots.userId, user.id), isNull(bots.deletedAt)));
        } else {
          allBots = [];
        }
      }
    }
    res.json(allBots);
  } catch (error) {
    console.error('Error fetching bots:', error);
    res.status(500).json({ error: 'Failed to fetch bots' });
  }
});

app.get('/api/bots/:id', ...apiAuthStack, async (req, res) => {
  try {
    const [bot] = await db
      .select()
      .from(bots)
      .where(and(eq(bots.id, req.params.id), isNull(bots.deletedAt)));
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    const user = (req as any).user;
    const organizationId = (req as any).organization?.id;
    if (!canAccessBot(bot, user, organizationId)) {
      return res.status(403).json({ error: 'Not authorized to view this bot' });
    }
    res.json(bot);
  } catch (error) {
    console.error('Error fetching bot:', error);
    res.status(500).json({ error: 'Failed to fetch bot' });
  }
});

app.get('/api/public/bots/:id', async (req, res) => {
  try {
    const [bot] = await db
      .select()
      .from(bots)
      .where(and(eq(bots.id, req.params.id), isNull(bots.deletedAt)));
    if (!bot || !bot.isPublic || !bot.active) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    res.json({
      id: bot.id,
      name: bot.name,
      type: bot.type,
      systemPrompt: bot.systemPrompt,
      model: bot.model,
      temperature: bot.temperature,
      knowledgeBase: bot.knowledgeBase,
      active: bot.active,
      themeColor: bot.themeColor,
      websiteUrl: bot.websiteUrl,
      maxMessages: bot.maxMessages,
      randomizeIdentity: bot.randomizeIdentity,
      avatar: bot.avatar,
      responseDelay: bot.responseDelay,
      embedType: bot.embedType,
      leadCapture: bot.leadCapture,
      isPublic: bot.isPublic,
    });
  } catch (error) {
    console.error('Error fetching public bot:', error);
    res.status(500).json({ error: 'Failed to fetch bot' });
  }
});

app.post('/api/bots', ...apiAuthStack, async (req, res) => {
  const requestId = uuidv4().slice(0, 8);
  const user = (req as any).user;

  try {
    console.log(
      `[${requestId}] Creating bot for user:`,
      user?.id,
      'Org:',
      user?.organizationId,
    );

    const botId = uuidv4();
    const targetUserId = user?.id || req.body.userId;
    const targetOrgId = user?.organizationId || req.body.organizationId;

    // Authorization checks
    if (
      user?.id &&
      req.body.userId &&
      req.body.userId !== user.id &&
      !isAdminUser(user)
    ) {
      console.warn(
        `[${requestId}] Authorization failed: user ${user.id} tried to create bot for ${req.body.userId}`,
      );
      return res
        .status(403)
        .json({ error: 'Not authorized to create bot for another user' });
    }

    if (!targetUserId) {
      console.error(`[${requestId}] Validation failed: missing user ID`);
      return res.status(400).json({ error: 'User ID is required' });
    }

    let knowledgeBase = Array.isArray(req.body.knowledgeBase)
      ? req.body.knowledgeBase
      : [];

    // Only include valid bot fields to prevent column mismatch errors
    const botData = {
      id: botId,
      name: req.body.name || 'New Bot',
      type: req.body.type,
      systemPrompt: req.body.systemPrompt || '',
      model: req.body.model || 'gpt-5o-mini',
      temperature: req.body.temperature ?? 0.7,
      knowledgeBase,
      active: req.body.active ?? true,
      conversationsCount: 0,
      themeColor: req.body.themeColor || '#3B82F6',
      websiteUrl: req.body.websiteUrl,
      maxMessages: req.body.maxMessages ?? 1000,
      randomizeIdentity: req.body.randomizeIdentity ?? false,
      avatar: req.body.avatar,
      responseDelay: req.body.responseDelay ?? 500,
      embedType: req.body.embedType || 'hover',
      leadCapture: req.body.leadCapture || {
        enabled: false,
        promptAfter: 3,
        emailRequired: true,
        nameRequired: false,
        phoneRequired: false,
      },
      userId: targetUserId,
      organizationId: targetOrgId,
      isPublic: req.body.isPublic ?? true,
      analytics: req.body.analytics || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Explicitly handle knowledge base and configuration if coming from template
    if (req.body.templateId) {
      console.log(`[${requestId}] Loading template:`, req.body.templateId);
      const [template] = await db
        .select()
        .from(botTemplates)
        .where(eq(botTemplates.id, req.body.templateId));
      if (template) {
        botData.systemPrompt = template.systemPrompt || botData.systemPrompt;
        const templateConfig = template.configuration;
        if (templateConfig) {
          if (Array.isArray(templateConfig)) {
            botData.knowledgeBase = [
              ...(botData.knowledgeBase || []),
              ...templateConfig,
            ];
          } else if (typeof templateConfig === 'string') {
            botData.knowledgeBase = [
              ...(botData.knowledgeBase || []),
              templateConfig,
            ];
          }
        }
      } else {
        console.warn(`[${requestId}] Template not found:`, req.body.templateId);
      }
    }

    knowledgeBase = Array.isArray(botData.knowledgeBase)
      ? botData.knowledgeBase
      : [];

    // Execute transactional write with audit log inside transaction
    console.log(`[${requestId}] Starting transaction...`);
    const { newBot, createdSources } = await db.transaction(async (tx) => {
      // Insert bot
      const botResult = await tx.insert(bots).values(botData).returning();

      // CRITICAL: Validate bot was created
      if (!botResult || botResult.length === 0) {
        throw new Error(
          'Bot insert failed - no rows returned. This may indicate RLS policy rejection or constraint violation.',
        );
      }

      const createdBot = botResult[0];
      console.log(`[${requestId}] Bot created:`, createdBot.id);

      // Create knowledge sources for URLs
      const urls = extractKnowledgeUrls(knowledgeBase);
      console.log(`[${requestId}] Extracted ${urls.length} knowledge URLs`);

      const sources = await createKnowledgeSourcesForUrls(
        tx,
        createdBot.id,
        createdBot.organizationId,
        urls,
      );
      console.log(`[${requestId}] Created ${sources.length} knowledge sources`);

      // MOVED: Audit log inside transaction for atomicity
      await tx.insert(auditLogs).values({
        id: uuidv4(),
        userId: user?.id,
        organizationId: user?.organizationId,
        action: 'create_bot',
        resourceType: 'bot',
        resourceId: createdBot.id,
        newValues: createdBot,
        ipAddress: (req as any).ip,
        userAgent: req.get('user-agent'),
        createdAt: new Date(),
      });

      return { newBot: createdBot, createdSources: sources };
    });

    console.log(`[${requestId}] Transaction committed successfully`);

    // Spawn web crawler asynchronously (fire-and-forget)
    if (createdSources.length > 0) {
      console.log(
        `[${requestId}] Spawning ${createdSources.length} web crawlers...`,
      );
      for (const source of createdSources) {
        WebScraperService.crawlWebsite(
          source.url,
          20,
          source.sourceId,
          newBot.id,
          newBot.organizationId,
        ).catch((err) =>
          console.error(
            `[${requestId}] Failed to scrape ${source.url} for bot ${newBot.id}:`,
            err.message || err,
          ),
        );
      }
    }

    console.log(`[${requestId}] Bot creation successful`);
    res.json(newBot);
  } catch (error: any) {
    console.error(`[${requestId}] Bot creation failed:`, {
      error: error.message,
      stack: error.stack,
      userId: user?.id,
      organizationId: user?.organizationId,
    });

    // Return detailed error to frontend
    const errorMessage = error.message || 'Unknown error';
    const isValidationError =
      errorMessage.includes('RLS') ||
      errorMessage.includes('constraint') ||
      errorMessage.includes('no rows returned');

    res.status(isValidationError ? 403 : 500).json({
      error: 'Failed to create bot',
      details: errorMessage,
      requestId,
    });
  }
});

app.put('/api/bots/:id', ...apiAuthStack, async (req, res) => {
  const requestId = uuidv4().slice(0, 8);
  const user = (req as any).user;
  const organizationId = (req as any).organization?.id;

  try {
    console.log(
      `[${requestId}] Updating bot:`,
      req.params.id,
      'user:',
      user?.id,
    );

    // Fetch existing bot and validate access
    const [existingBot] = await db
      .select()
      .from(bots)
      .where(and(eq(bots.id, req.params.id), isNull(bots.deletedAt)));

    if (!existingBot) {
      console.warn(`[${requestId}] Bot not found:`, req.params.id);
      return res.status(404).json({ error: 'Bot not found' });
    }

    if (!canAccessBot(existingBot, user, organizationId)) {
      console.warn(
        `[${requestId}] Access denied: user ${user?.id} cannot access bot ${req.params.id}`,
      );
      return res
        .status(403)
        .json({ error: 'Not authorized to update this bot' });
    }

    // Only include valid bot fields to prevent column mismatch errors
    const updateData: Record<string, any> = { updatedAt: new Date() };

    const validFields = [
      'name',
      'type',
      'systemPrompt',
      'model',
      'temperature',
      'knowledgeBase',
      'active',
      'themeColor',
      'websiteUrl',
      'maxMessages',
      'randomizeIdentity',
      'avatar',
      'responseDelay',
      'embedType',
      'leadCapture',
      'isPublic',
      'analytics',
    ];

    for (const field of validFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    // Validate knowledgeBase type
    if (
      updateData.knowledgeBase !== undefined &&
      !Array.isArray(updateData.knowledgeBase)
    ) {
      console.error(
        `[${requestId}] Validation failed: knowledgeBase must be array, got`,
        typeof updateData.knowledgeBase,
      );
      return res.status(400).json({ error: 'knowledgeBase must be an array' });
    }

    console.log(`[${requestId}] Starting transaction...`);
    const { updatedBot, createdSources } = await db.transaction(async (tx) => {
      // Update bot
      const botResult = await tx
        .update(bots)
        .set(updateData)
        .where(eq(bots.id, req.params.id))
        .returning();

      // CRITICAL: Validate update succeeded
      if (!botResult || botResult.length === 0) {
        throw new Error(
          'Bot update failed - no rows returned. Bot may have been deleted or RLS policy rejected the update.',
        );
      }

      const bot = botResult[0];
      console.log(`[${requestId}] Bot updated:`, bot.id);

      // Create knowledge sources for any new URLs
      let sources: Array<{ sourceId: string; url: string }> = [];
      if (Array.isArray(updateData.knowledgeBase)) {
        const urls = extractKnowledgeUrls(updateData.knowledgeBase);
        console.log(`[${requestId}] Extracted ${urls.length} knowledge URLs`);

        // TODO: Add deduplication - check for existing sources before creating new ones
        sources = await createKnowledgeSourcesForUrls(
          tx,
          bot.id,
          bot.organizationId,
          urls,
        );
        console.log(
          `[${requestId}] Created ${sources.length} new knowledge sources`,
        );
      }

      // MOVED: Audit log inside transaction
      await tx.insert(auditLogs).values({
        id: uuidv4(),
        userId: user?.id,
        organizationId: user?.organizationId,
        action: 'update_bot',
        resourceType: 'bot',
        resourceId: bot.id,
        oldValues: existingBot,
        newValues: bot,
        ipAddress: (req as any).ip,
        userAgent: req.get('user-agent'),
        createdAt: new Date(),
      });

      return { updatedBot: bot, createdSources: sources };
    });

    console.log(`[${requestId}] Transaction committed successfully`);

    // Spawn web crawler for new URLs (fire-and-forget)
    if (createdSources.length > 0) {
      console.log(
        `[${requestId}] Spawning ${createdSources.length} web crawlers...`,
      );
      for (const source of createdSources) {
        WebScraperService.crawlWebsite(
          source.url,
          20,
          source.sourceId,
          updatedBot.id,
          updatedBot.organizationId,
        ).catch((err) =>
          console.error(
            `[${requestId}] Failed to scrape ${source.url} for bot ${updatedBot.id}:`,
            err.message || err,
          ),
        );
      }
    }

    console.log(`[${requestId}] Bot update successful`);
    res.json(updatedBot);
  } catch (error: any) {
    console.error(`[${requestId}] Bot update failed:`, {
      error: error.message,
      stack: error.stack,
      botId: req.params.id,
      userId: user?.id,
      organizationId: organizationId,
    });

    // Return detailed error to frontend
    const errorMessage = error.message || 'Unknown error';
    const isValidationError =
      errorMessage.includes('RLS') ||
      errorMessage.includes('constraint') ||
      errorMessage.includes('no rows returned');

    res.status(isValidationError ? 403 : 500).json({
      error: 'Failed to update bot',
      details: errorMessage,
      requestId,
    });
  }
});

app.get('/api/leads', ...apiAuthStack, async (req, res) => {
  try {
    const userId = req.query.userId as string;
    let allLeads;
    if (userId) {
      allLeads = await db
        .select()
        .from(leads)
        .where(eq(leads.userId, userId))
        .orderBy(desc(leads.createdAt));
    } else {
      allLeads = await db.select().from(leads).orderBy(desc(leads.createdAt));
    }
    res.json(allLeads);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

app.post('/api/leads', ...apiAuthStack, async (req, res) => {
  try {
    const leadData = {
      ...req.body,
      id: req.body.id || uuidv4(),
      createdAt: new Date(),
    };
    const [newLead] = await db.insert(leads).values(leadData).returning();
    res.json(newLead);
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

app.get('/api/users', ...apiAuthStack, async (req, res) => {
  try {
    const allUsers = await db.select().from(users);
    res.json(allUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/users/:id', ...apiAuthStack, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.params.id));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.post('/api/users', ...apiAuthStack, async (req, res) => {
  try {
    const userData = {
      ...req.body,
      id: req.body.id || uuidv4(),
      createdAt: new Date(),
    };
    const [newUser] = await db.insert(users).values(userData).returning();
    res.json(newUser);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', ...apiAuthStack, async (req, res) => {
  try {
    const [updatedUser] = await db
      .update(users)
      .set(req.body)
      .where(eq(users.id, req.params.id))
      .returning();
    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.get('/api/users/referrals/:code', ...apiAuthStack, async (req, res) => {
  try {
    const referrals = await db
      .select()
      .from(users)
      .where(eq(users.referredBy, req.params.code));
    res.json(referrals);
  } catch (error) {
    console.error('Error fetching referrals:', error);
    res.status(500).json({ error: 'Failed to fetch referrals' });
  }
});

app.get('/api/resellers/:code/summary', ...apiAuthStack, async (req, res) => {
  try {
    const [reseller] = await db
      .select()
      .from(users)
      .where(eq(users.resellerCode, req.params.code));

    if (!reseller) {
      return res.status(404).json({ error: 'Reseller not found' });
    }

    const referrals = await db
      .select()
      .from(users)
      .where(eq(users.referredBy, req.params.code));

    const clientCount = referrals.length;

    const currentTier =
      RESELLER_TIERS.find(
        (tier) => clientCount >= tier.min && clientCount <= tier.max,
      ) || RESELLER_TIERS[0];

    const whitelabelEnabled = Boolean(reseller.whitelabelEnabled);
    const partnerAccessStart = reseller.whitelabelEnabledAt
      ? new Date(reseller.whitelabelEnabledAt)
      : null;
    const partnerAccessAppliesToAll =
      currentTier.commission >= WHITELABEL_FEE.commission ||
      (whitelabelEnabled && !partnerAccessStart);

    let legacyRevenue = 0;
    let partnerAccessRevenue = 0;
    let partnerAccessEligibleClients = 0;
    let partnerAccessLegacyClients = 0;

    for (const client of referrals) {
      const plan = PLANS[client.plan as keyof typeof PLANS];
      const price = plan?.price || 0;
      const createdAt = client.createdAt ? new Date(client.createdAt) : null;
      const eligibleForPartnerRate =
        partnerAccessAppliesToAll ||
        (whitelabelEnabled &&
          partnerAccessStart &&
          createdAt &&
          createdAt.getTime() >= partnerAccessStart.getTime());

      if (eligibleForPartnerRate) {
        partnerAccessRevenue += price;
        partnerAccessEligibleClients += 1;
      } else {
        legacyRevenue += price;
        partnerAccessLegacyClients += 1;
      }
    }

    const totalRevenue = legacyRevenue + partnerAccessRevenue;
    const grossCommission =
      legacyRevenue * currentTier.commission +
      partnerAccessRevenue * WHITELABEL_FEE.commission;
    const commissionRate =
      totalRevenue > 0
        ? grossCommission / totalRevenue
        : whitelabelEnabled || partnerAccessAppliesToAll
          ? WHITELABEL_FEE.commission
          : currentTier.commission;

    const paidThrough = reseller.whitelabelPaidThrough
      ? new Date(reseller.whitelabelPaidThrough)
      : null;
    const whitelabelFeeDue =
      whitelabelEnabled && (!paidThrough || paidThrough.getTime() < Date.now());
    const whitelabelFeeAmount = whitelabelFeeDue ? WHITELABEL_FEE.price : 0;
    const pendingPayout = Math.max(grossCommission - whitelabelFeeAmount, 0);

    res.json({
      users: referrals,
      stats: {
        totalClients: clientCount,
        totalRevenue,
        commissionRate,
        grossCommission,
        pendingPayout,
        whitelabelFeeDue,
        whitelabelFeeAmount,
        whitelabelPaidThrough: paidThrough ? paidThrough.toISOString() : null,
        partnerAccessActive: whitelabelEnabled,
        partnerAccessAppliesToAll,
        partnerAccessStart: partnerAccessStart
          ? partnerAccessStart.toISOString()
          : null,
        partnerAccessEligibleClients,
        partnerAccessLegacyClients,
      },
    });
  } catch (error) {
    console.error('Error fetching reseller summary:', error);
    res.status(500).json({ error: 'Failed to fetch reseller summary' });
  }
});

app.get('/api/users/:id/credits', ...apiAuthStack, async (req, res) => {
  try {
    const credits = await stripeService.getUserCredits(req.params.id);
    res.json(credits);
  } catch (error) {
    console.error('Error fetching user credits:', error);
    res.status(500).json({ error: 'Failed to fetch user credits' });
  }
});

app.post('/api/referral/credit', ...apiAuthStack, async (req, res) => {
  try {
    const { referredUserId, plan } = req.body;
    if (!referredUserId || !plan) {
      return res
        .status(400)
        .json({ error: 'referredUserId and plan are required' });
    }
    const result = await stripeService.creditReferrer(referredUserId, plan);
    res.json(result);
  } catch (error) {
    console.error('Error crediting referrer:', error);
    res.status(500).json({ error: 'Failed to credit referrer' });
  }
});

app.post('/api/users/:id/apply-credits', ...apiAuthStack, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    const result = await stripeService.applyCreditsToSubscription(
      req.params.id,
      amount,
    );
    res.json(result);
  } catch (error) {
    console.error('Error applying credits:', error);
    res.status(500).json({ error: 'Failed to apply credits' });
  }
});

app.get('/api/conversations', ...apiAuthStack, async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const botId = req.query.botId as string;
    const organizationId =
      (req as any).organization?.id || (req.query.organizationId as string);

    const conditions = [];

    if (userId) {
      conditions.push(eq(conversations.userId, userId));
    }
    if (botId) {
      conditions.push(eq(conversations.botId, botId));
    }
    if (organizationId) {
      conditions.push(eq(conversations.organizationId, organizationId));
    }

    let allConversations;
    if (conditions.length > 0) {
      allConversations = await db
        .select()
        .from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.timestamp));
    } else {
      // If no filters, return empty or limit to user's org context
      const user = (req as any).user;
      if (
        user?.role === 'ADMIN' ||
        user?.role === 'Admin' ||
        user?.role === 'MasterAdmin'
      ) {
        allConversations = await db
          .select()
          .from(conversations)
          .orderBy(desc(conversations.timestamp));
      } else {
        // Default to user's context if available, otherwise empty
        // Note: Conversations might not always have userId if anonymous, so we rely on organizationId usually.
        // But if we are here, organizationId was undefined.
        allConversations = [];
      }
    }
    res.json(allConversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.get('/api/conversations/:id', ...apiAuthStack, async (req, res) => {
  try {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, req.params.id));
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conversation);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

app.post('/api/conversations', ...apiAuthStack, async (req, res) => {
  try {
    const conversationData = {
      ...req.body,
      id: req.body.id || uuidv4(),
      timestamp: new Date(),
    };
    const [newConversation] = await db
      .insert(conversations)
      .values(conversationData)
      .returning();
    res.json(newConversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

app.put('/api/conversations/:id', ...apiAuthStack, async (req, res) => {
  try {
    const [updatedConversation] = await db
      .update(conversations)
      .set(req.body)
      .where(eq(conversations.id, req.params.id))
      .returning();
    res.json(updatedConversation);
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

app.post(
  '/api/bots/:botId/documents',
  ...apiAuthStack,
  upload.single('file'),
  async (req, res) => {
    try {
      const userId = (req.query.userId as string) || req.body.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { botId } = req.params;

      // Verify bot exists and belongs to user
      const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
      if (!bot) {
        return res.status(404).json({ error: 'Bot not found' });
      }
      if (bot.userId && bot.userId !== userId) {
        return res
          .status(403)
          .json({ error: 'Not authorized to upload documents to this bot' });
      }

      const ext = path
        .extname(req.file.originalname)
        .toLowerCase()
        .replace('.', '');

      const documentData = {
        id: uuidv4(),
        botId,
        fileName: req.file.originalname,
        fileType: ext,
        fileSize: req.file.size,
        content: null,
        createdAt: new Date(),
      };

      const [newDocument] = await db
        .insert(botDocuments)
        .values(documentData)
        .returning();
      res.json(newDocument);
    } catch (error) {
      console.error('Error uploading document:', error);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  },
);

app.get('/api/bots/:botId/documents', ...apiAuthStack, async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { botId } = req.params;

    // Verify bot exists and belongs to user
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    if (bot.userId && bot.userId !== userId) {
      return res
        .status(403)
        .json({ error: 'Not authorized to view documents for this bot' });
    }

    const documents = await db
      .select()
      .from(botDocuments)
      .where(eq(botDocuments.botId, botId))
      .orderBy(desc(botDocuments.createdAt));
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

app.delete('/api/documents/:docId', ...apiAuthStack, async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { docId } = req.params;

    // Get document and verify ownership
    const [document] = await db
      .select()
      .from(botDocuments)
      .where(eq(botDocuments.id, docId));
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Verify bot ownership
    if (document.botId) {
      const [bot] = await db
        .select()
        .from(bots)
        .where(eq(bots.id, document.botId));
      if (bot?.userId && bot.userId !== userId) {
        return res
          .status(403)
          .json({ error: 'Not authorized to delete this document' });
      }
    }

    const [deletedDocument] = await db
      .delete(botDocuments)
      .where(eq(botDocuments.id, docId))
      .returning();
    res.json({ success: true, deleted: deletedDocument });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ========================================
// HEALTH CHECK ROUTES (no auth required)
// ========================================
app.use('/api/health', healthRouter);

// ========================================
// AUTHENTICATION ROUTES (no auth required)
// ========================================
app.use('/api/auth', authRouter);

// Legacy routes for backwards compatibility
app.get('/api/login', (req, res) => res.redirect('/?auth=login'));
app.get('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

// ========================================
// PHASE 1: MULTI-TENANT ARCHITECTURE ROUTES
// ========================================

// Organization management
app.use('/api/organizations', organizationsRouter);

// Audit logging
app.use('/api/audit', auditRouter);

// Analytics and insights
app.use('/api/analytics', analyticsRouter);

// Admin dashboard APIs
app.use(
  '/api/admin',
  authenticate,
  applyImpersonation,
  authorize(['ADMIN', 'Admin', 'MasterAdmin']),
  adminRouter,
);

// Partner dashboard APIs
app.use(
  '/api/partners',
  authenticate,
  authorize(['RESELLER', 'Admin', 'ADMIN', 'MasterAdmin']),
  partnersRouter,
);

// Agency billing APIs (for billing arbitrage features)
app.use(
  '/api/agency',
  authenticate,
  loadOrganizationContext,
  tenantIsolation,
  agencyRouter,
);

// Client dashboard APIs (supports impersonation)
app.use(
  '/api/clients',
  authenticate,
  applyImpersonation,
  loadOrganizationContext,
  tenantIsolation,
  clientsRouter,
);

// Impersonation sessions
app.use('/api/impersonation', authenticate, impersonationRouter);

// Bot template marketplace - GET is public, POST/install requires auth
app.get('/api/templates', async (req, res, next) => {
  // Import and call the templates router directly for GET
  const { db } = await import('./db');
  const { botTemplates } = await import('../shared/schema');
  const { and, eq, desc, sql } = await import('drizzle-orm');

  try {
    const { category, industry, search, featured } = req.query;
    const conditions: any[] = [];

    if (category) {
      conditions.push(eq(botTemplates.category, category as string));
    }
    if (industry) {
      conditions.push(eq(botTemplates.industry, industry as string));
    }
    if (search) {
      const term = `%${search}%`;
      conditions.push(
        sql`${botTemplates.name} ILIKE ${term} OR ${botTemplates.description} ILIKE ${term}`,
      );
    }
    if (featured) {
      conditions.push(eq(botTemplates.isPublic, true));
    }

    let baseQuery = db.select().from(botTemplates);
    if (conditions.length) {
      baseQuery = baseQuery.where(and(...conditions)) as typeof baseQuery;
    }

    const templates = featured
      ? await baseQuery.orderBy(desc(botTemplates.rating))
      : await baseQuery;
    res.json(templates);
  } catch (error) {
    console.error('Template list error:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});
app.use(
  '/api/templates',
  authenticate,
  applyImpersonation,
  loadOrganizationContext,
  tenantIsolation,
  templatesRouter,
);

// Multi-channel deployment
app.use('/api/channels', channelsRouter);

// Phone number management (Twilio)
app.use('/api/phone', phoneRouter);

// Twilio Webhooks (legacy WebSocket-based flow)
app.use('/api/webhooks', twilioWebhooksRouter);

// Voice Agent Core API — Twilio webhook + management (auth per-route inside)
app.use('/api/voice', voiceRouter);

// Voice Agent Providers API (webhooks are public, management requires auth)
app.use('/api/voice-providers', (req, res, next) => {
  // Skip auth for provider webhook routes (VAPI/Retell call these externally)
  if (req.path.startsWith('/webhooks/')) {
    return next();
  }
  authenticate(req, res, next);
}, voiceAgentsRouter);

// Webhook management
app.use('/api/webhooks', webhooksRouter);

// Unified Search
app.use('/api/search', searchRouter);

// Team management
app.use('/api/teams', teamRouter);

// Knowledge base management
app.use('/api/knowledge', knowledgeRouter);

// Tool execution and action management
app.use(
  '/api/tools',
  authenticate,
  loadOrganizationContext,
  tenantIsolation,
  toolsRouter,
);

// Revenue and billing features
app.use('/api/revenue', revenueRouter);

// Chat API (proxies OpenAI requests)
app.use('/api/chat', chatRouter);

// Leads CRM API (includes public capture endpoint)
app.use('/api/leads', leadsRouter);

// Integrations API (HubSpot, etc.)
app.use('/api/integrations', integrationsRouter);

// Landing pages builder API
app.use('/api/landing-pages', landingPagesRouter);

// Notifications API (admin broadcast and user notifications)
app.use('/api', notificationsRouter);

// Serve voice audio files (generated by Cartesia TTS)
app.use('/voice/audio', express.static(path.join(__dirname, '..', 'public', 'voice', 'audio')));

// Serve static files in production
if (isProduction) {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));

  // Handle client-side routing - serve index.html for all non-API routes
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      next();
    }
  });
}

// Create HTTP server
const server = createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ server, path: '/api/ws/voice' });

wss.on('connection', (ws) => {
  voiceAgentService.handleConnection(ws);
});

if (!isVercel) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Server running on port ${PORT} (${isProduction ? 'production' : 'development'})`,
    );
  });
}

const repairIntervalMs = Number.parseInt(
  env.KNOWLEDGE_REPAIR_INTERVAL_MS || '300000',
  10,
);

if (!isVercel && repairIntervalMs > 0) {
  setInterval(() => {
    KnowledgeRepairService.reconcile().catch((error) => {
      console.error('Knowledge repair job failed:', error);
    });
  }, repairIntervalMs);
}

// Nurture sequence scheduler - process due enrollments every 15 minutes
const nurtureIntervalMs = 15 * 60 * 1000; // 15 minutes

if (!isVercel) {
  setInterval(() => {
    nurtureService.processEnrollments().catch((error) => {
      console.error('Nurture sequence processing failed:', error);
    });
  }, nurtureIntervalMs);

  // Also run once on startup
  setTimeout(() => {
    nurtureService.processEnrollments().catch((error) => {
      console.error('Initial nurture processing failed:', error);
    });
  }, 10000); // Wait 10 seconds after startup
}

export { app, server };

