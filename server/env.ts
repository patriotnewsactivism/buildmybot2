import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';

// Load .env and .env.local once for server-side code.
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  config({ path: envPath });
}

const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  config({ path: envLocalPath, override: true });
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  API_PORT: process.env.API_PORT,
  APP_BASE_URL: process.env.APP_BASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
  STRIPE_WHITELABEL_PRICE_ID: process.env.STRIPE_WHITELABEL_PRICE_ID,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  AI_INTEGRATIONS_OPENAI_API_KEY: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  AI_INTEGRATIONS_OPENAI_BASE_URL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  CARTESIA_API_KEY: process.env.CARTESIA_API_KEY,
  FEATURE_MULTI_TENANT: process.env.FEATURE_MULTI_TENANT,
  FEATURE_PARTNER_IMPERSONATION: process.env.FEATURE_PARTNER_IMPERSONATION,
  FEATURE_VOICE_AGENT: process.env.FEATURE_VOICE_AGENT,
  FEATURE_MULTI_CHANNEL: process.env.FEATURE_MULTI_CHANNEL,
  FEATURE_ADVANCED_ANALYTICS: process.env.FEATURE_ADVANCED_ANALYTICS,
  FEATURE_REAL_TIME_METRICS: process.env.FEATURE_REAL_TIME_METRICS,
  FEATURE_BOT_TEMPLATES: process.env.FEATURE_BOT_TEMPLATES,
  FEATURE_SIMPLIFIED_WIZARD: process.env.FEATURE_SIMPLIFIED_WIZARD,
  FEATURE_AB_TESTING: process.env.FEATURE_AB_TESTING,
  FEATURE_CLIENT_DASHBOARD: process.env.FEATURE_CLIENT_DASHBOARD,
  FEATURE_REDIS_CACHE: process.env.FEATURE_REDIS_CACHE,
  FEATURE_GPT5O_MINI: process.env.FEATURE_GPT5O_MINI,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PLAN: process.env.ADMIN_PLAN,
  MASTER_ADMIN_EMAIL: process.env.MASTER_ADMIN_EMAIL,
  MASTER_ADMIN_PLAN: process.env.MASTER_ADMIN_PLAN,
};
