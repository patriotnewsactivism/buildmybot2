import { Router, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { getUncachableStripeClient } from '../stripeClient';
import logger from '../utils/logger';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: ServiceStatus;
    stripe: ServiceStatus;
    openai: ServiceStatus;
    cartesia: ServiceStatus;
  };
}

interface ServiceStatus {
  status: 'up' | 'down' | 'unknown';
  latency?: number;
  error?: string;
}

async function checkDatabase(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return {
      status: 'up',
      latency: Date.now() - start,
    };
  } catch (error: any) {
    return {
      status: 'down',
      error: error.message || 'Database connection failed',
    };
  }
}

async function checkStripe(): Promise<ServiceStatus> {
  if (!process.env.STRIPE_SECRET_KEY && !process.env.REPLIT_CONNECTORS_HOSTNAME) {
    return {
      status: 'unknown',
      error: 'Stripe not configured',
    };
  }
  const start = Date.now();
  try {
    const stripe = await getUncachableStripeClient();
    await stripe.balance.retrieve();
    return {
      status: 'up',
      latency: Date.now() - start,
    };
  } catch (error: any) {
    return {
      status: 'down',
      error: 'Stripe connection failed',
    };
  }
}

async function checkOpenAI(): Promise<ServiceStatus> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      status: 'unknown',
      error: 'OpenAI API key not configured',
    };
  }
  return {
    status: 'up',
  };
}

async function checkCartesia(): Promise<ServiceStatus> {
  const apiKey = process.env.CARTESIA_API_KEY || process.env.VITE_CARTESIA_API_KEY;
  if (!apiKey) {
    return {
      status: 'unknown',
      error: 'Cartesia API key not configured',
    };
  }
  return {
    status: 'up',
  };
}

router.get('/', async (req: Request, res: Response) => {
  const startTime = process.hrtime();

  const [database, stripe, openai, cartesia] = await Promise.all([
    checkDatabase(),
    checkStripe(),
    checkOpenAI(),
    checkCartesia(),
  ]);

  const allUp =
    database.status === 'up' &&
    stripe.status !== 'down' &&
    openai.status !== 'down' &&
    cartesia.status !== 'down';
  const anyDown = database.status === 'down';

  const health: HealthStatus = {
    status: anyDown ? 'unhealthy' : allUp ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database,
      stripe,
      openai,
      cartesia,
    },
  };

  if (health.status !== 'healthy') {
    logger.warn('System health check degraded or unhealthy', { health });
  }

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});

router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

router.get('/ready', async (req: Request, res: Response) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'not ready', timestamp: new Date().toISOString() });
  }
});

export default router;
