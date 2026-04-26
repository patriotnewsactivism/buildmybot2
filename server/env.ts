import fs from 'node:fs';
import path from 'node:path';

// Helper to manually load env vars since dotenv package might be unstable in this environment
function loadEnv(filePath: string, override = true) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split(/\r?\n/).forEach((line) => {
      // Remove comments and whitespace
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) return;

      const match = trimmedLine.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove surrounding quotes
        value = value.replace(/^(['"])(.*)\1$/, '$2');

        if (override || !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

// Load .env and .env.local once for server-side code.
loadEnv(path.resolve(process.cwd(), '.env'));
loadEnv(path.resolve(process.cwd(), '.env.local'), true);

if (process.env.DATABASE_URL) {
  const url = process.env.DATABASE_URL;
  console.log(`Loaded DATABASE_URL: ${url.substring(0, 20)}...`);
} else {
  console.log('DATABASE_URL NOT FOUND in env');
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: process.env.PORT,
  API_PORT: process.env.API_PORT,
  APP_BASE_URL: process.env.APP_BASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  VITE_API_URL: process.env.VITE_API_URL,
  VITE_OPENAI_API_KEY: process.env.VITE_OPENAI_API_KEY,
  VITE_CARTESIA_API_KEY: process.env.VITE_CARTESIA_API_KEY,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
  VITE_SENTRY_DSN: process.env.VITE_SENTRY_DSN,
  VITE_SENTRY_ORG: process.env.VITE_SENTRY_ORG,
  VITE_SENTRY_PROJECT: process.env.VITE_SENTRY_PROJECT,
  VITE_SENTRY_AUTH_TOKEN: process.env.VITE_SENTRY_AUTH_TOKEN,
  VITE_ENVIRONMENT: process.env.VITE_ENVIRONMENT,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT,
  VITE_POSTHOG_API_KEY: process.env.VITE_POSTHOG_API_KEY,
  VITE_POSTHOG_HOST: process.env.VITE_POSTHOG_HOST,
  NEXT_PUBLIC_POSTHOG_API_KEY: process.env.NEXT_PUBLIC_POSTHOG_API_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  VITE_STRIPE_PUBLISHABLE_KEY: process.env.VITE_STRIPE_PUBLISHABLE_KEY,
  SESSION_SECRET: process.env.SESSION_SECRET,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
  STRIPE_WHITELABEL_PRICE_ID: process.env.STRIPE_WHITELABEL_PRICE_ID,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  AI_INTEGRATIONS_OPENAI_API_KEY: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  AI_INTEGRATIONS_OPENAI_BASE_URL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  CARTESIA_API_KEY: process.env.CARTESIA_API_KEY,
  VAPI_API_KEY: process.env.VAPI_API_KEY,
  VAPI_DEFAULT_VOICE_ID: process.env.VAPI_DEFAULT_VOICE_ID,
  VAPI_WEBHOOK_SECRET: process.env.VAPI_WEBHOOK_SECRET,
  RETELL_API_KEY: process.env.RETELL_API_KEY,
  RETELL_DEFAULT_VOICE_ID: process.env.RETELL_DEFAULT_VOICE_ID,
  RETELL_WEBHOOK_SECRET: process.env.RETELL_WEBHOOK_SECRET,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
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
  RESELLER_EMAIL: process.env.RESELLER_EMAIL,
  RESELLER_PLAN: process.env.RESELLER_PLAN,
  CLIENT_EMAIL: process.env.CLIENT_EMAIL,
  CLIENT_PLAN: process.env.CLIENT_PLAN,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
  LAUNCH_GATE_ENABLED: process.env.LAUNCH_GATE_ENABLED,
  KNOWLEDGE_REPAIR_INTERVAL_MS: process.env.KNOWLEDGE_REPAIR_INTERVAL_MS,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
};
