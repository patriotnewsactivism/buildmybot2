# Production Environment Variables Setup

## Overview
This guide covers all environment variables needed for BuildMyBot production deployment.

## 1. Supabase Edge Functions Secrets

These are server-side secrets that should NEVER be exposed to the client.

### Required Secrets:

```bash
# OpenAI API Key (for AI completions and embeddings)
OPENAI_API_KEY=sk-proj-YOUR_OPENAI_KEY_HERE

# Stripe Keys (for payment processing)
STRIPE_SECRET_KEY=sk_live_YOUR_STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SIGNING_SECRET

# Stripe Price IDs (one for each plan)
STRIPE_PRICE_STARTER=price_YOUR_STARTER_PRICE_ID
STRIPE_PRICE_PROFESSIONAL=price_YOUR_PROFESSIONAL_PRICE_ID
STRIPE_PRICE_EXECUTIVE=price_YOUR_EXECUTIVE_PRICE_ID
STRIPE_PRICE_ENTERPRISE=price_YOUR_ENTERPRISE_PRICE_ID
```

### How to Set Supabase Secrets:

**Option 1: Using Supabase CLI (Recommended)**
```bash
npx supabase secrets set OPENAI_API_KEY="sk-proj-..."
npx supabase secrets set STRIPE_SECRET_KEY="sk_live_..."
npx supabase secrets set STRIPE_WEBHOOK_SECRET="whsec_..."
npx supabase secrets set STRIPE_PRICE_STARTER="price_..."
npx supabase secrets set STRIPE_PRICE_PROFESSIONAL="price_..."
npx supabase secrets set STRIPE_PRICE_EXECUTIVE="price_..."
npx supabase secrets set STRIPE_PRICE_ENTERPRISE="price_..."
```

**Option 2: Using Supabase Dashboard**
1. Go to https://supabase.com/dashboard/project/qjwwkcoredotrjtstigt/settings/functions
2. Navigate to **Edge Functions** → **Secrets**
3. Click **Add new secret**
4. Enter name and value for each variable above

### Verify Secrets are Set:
```bash
npx supabase secrets list
```

## 2. Frontend Environment Variables (.env.production)

These are public variables that will be embedded in your Next.js build.

Create `.env.production` in your project root:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://qjwwkcoredotrjtstigt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqd3drY29yZWRvdHJqdHN0aWd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNjE0MTMsImV4cCI6MjA4MDgzNzQxM30.mD81m4nFEmko_ElwHCfCmYzAaVLXn-GIC5rLFp2ZIOs

# App Configuration
NEXT_PUBLIC_APP_URL=https://app.buildmybot.com

# Optional: Analytics/Monitoring (add when ready)
# NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
# NEXT_PUBLIC_GA_MEASUREMENT_ID=G-...
```

## 3. Vercel Environment Variables (if using Vercel)

Go to your Vercel project settings → Environment Variables:

### Production Environment:
- `NEXT_PUBLIC_SUPABASE_URL` → `https://qjwwkcoredotrjtstigt.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → (your anon key)
- `NEXT_PUBLIC_APP_URL` → `https://app.buildmybot.com`

### Preview Environment (optional):
- Same as production but can point to a staging Supabase project

### Development Environment:
- Point to local Supabase instance (http://127.0.0.1:55321)

## 4. Database Environment (already configured)

Your Supabase project automatically has these:
- `SUPABASE_URL` - Used internally by Edge Functions
- `SUPABASE_SERVICE_ROLE_KEY` - Used by Edge Functions for admin access
- `SUPABASE_ANON_KEY` - Public key for client access

## 5. Required API Keys & Credentials

### OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Create new secret key
3. Copy and add to Supabase secrets
4. **Add billing method** to OpenAI account
5. **Set spending limits** to prevent unexpected charges

### Stripe Keys
Follow `STRIPE_SETUP_GUIDE.md` to:
1. Get Secret Key and Publishable Key
2. Create products and get Price IDs
3. Set up webhook and get Webhook Secret

## 6. Security Checklist

Before going to production, verify:

- [ ] All API keys are in Supabase secrets (NOT in code)
- [ ] `.env` file is in `.gitignore`
- [ ] No hardcoded credentials in code
- [ ] OpenAI API key is NEW (old one was exposed in git)
- [ ] Supabase anon key is regenerated (old one was exposed)
- [ ] Stripe is in live mode (not test mode)
- [ ] CORS whitelist only includes production domain
- [ ] Rate limiting is enabled on all Edge Functions
- [ ] Input validation is active on all endpoints

## 7. Deployment Checklist

### Before First Production Deploy:
```bash
# 1. Set all Supabase secrets
npx supabase secrets set OPENAI_API_KEY="..."
npx supabase secrets set STRIPE_SECRET_KEY="..."
# ... (all other secrets)

# 2. Verify secrets
npx supabase secrets list

# 3. Deploy Edge Functions (already done)
npx supabase functions deploy

# 4. Build frontend with production env
npm run build

# 5. Deploy to Vercel/hosting
vercel --prod
```

## 8. Environment Variables Reference

| Variable | Location | Purpose | Example |
|----------|----------|---------|---------|
| `OPENAI_API_KEY` | Supabase Secrets | AI completions | `sk-proj-...` |
| `STRIPE_SECRET_KEY` | Supabase Secrets | Process payments | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Supabase Secrets | Verify webhooks | `whsec_...` |
| `STRIPE_PRICE_*` | Supabase Secrets | Plan pricing | `price_...` |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend .env | Connect to DB | `https://...` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend .env | Auth client | `eyJ...` |
| `NEXT_PUBLIC_APP_URL` | Frontend .env | App base URL | `https://app...` |

## 9. Local Development Environment

For local development, use `.env.local`:

```bash
# Local Supabase (from npx supabase start)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Test mode Stripe keys
STRIPE_PUBLISHABLE_KEY=pk_test_...

# OpenAI (can use same key as production if testing)
OPENAI_API_KEY=sk-proj-...
```

## 10. Troubleshooting

**Edge Functions can't access secrets:**
- Run `npx supabase secrets list` to verify they're set
- Restart Edge Functions after setting secrets
- Check function logs for "not configured" errors

**Frontend can't connect to Supabase:**
- Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
- Check `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set
- Ensure variables start with `NEXT_PUBLIC_` prefix

**CORS errors in production:**
- Add your production domain to `_shared/cors.ts`
- Redeploy Edge Functions
- Clear browser cache

**Rate limiting too strict:**
- Adjust limits in `_shared/rateLimit.ts`
- Redeploy affected Edge Functions

## Quick Setup Script

```bash
#!/bin/bash
# save as setup-production-env.sh

echo "Setting up Supabase Edge Function secrets..."

# Prompt for each secret
read -p "Enter OPENAI_API_KEY: " OPENAI_KEY
read -p "Enter STRIPE_SECRET_KEY: " STRIPE_KEY
read -p "Enter STRIPE_WEBHOOK_SECRET: " WEBHOOK_SECRET
read -p "Enter STRIPE_PRICE_STARTER: " PRICE_STARTER
read -p "Enter STRIPE_PRICE_PROFESSIONAL: " PRICE_PROFESSIONAL
read -p "Enter STRIPE_PRICE_EXECUTIVE: " PRICE_EXECUTIVE
read -p "Enter STRIPE_PRICE_ENTERPRISE: " PRICE_ENTERPRISE

# Set all secrets
npx supabase secrets set OPENAI_API_KEY="$OPENAI_KEY"
npx supabase secrets set STRIPE_SECRET_KEY="$STRIPE_KEY"
npx supabase secrets set STRIPE_WEBHOOK_SECRET="$WEBHOOK_SECRET"
npx supabase secrets set STRIPE_PRICE_STARTER="$PRICE_STARTER"
npx supabase secrets set STRIPE_PRICE_PROFESSIONAL="$PRICE_PROFESSIONAL"
npx supabase secrets set STRIPE_PRICE_EXECUTIVE="$PRICE_EXECUTIVE"
npx supabase secrets set STRIPE_PRICE_ENTERPRISE="$PRICE_ENTERPRISE"

echo "✅ All secrets configured!"
npx supabase secrets list
```

Make executable: `chmod +x setup-production-env.sh`
Run: `./setup-production-env.sh`
