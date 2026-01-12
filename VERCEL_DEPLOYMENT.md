# Vercel Deployment Guide

This project is deployed to Vercel using the **buildmybot20** project.

## Current Production Setup

- **Project**: buildmybot20
- **Domain**: https://www.buildmybot.app
- **Backend**: https://buildmybot2-production.up.railway.app
- **Database**: Supabase (PostgreSQL pooler)

## What Was Changed

✅ Removed `stripe-replit-sync` dependency from package.json
✅ Deleted `server/replit_integrations` folder
✅ Cleaned up .env file (removed Replit webhook URLs)
✅ Deleted Replit-specific documentation
✅ Created `vercel.json` configuration
✅ Created `.vercelignore` file
✅ Updated CLAUDE.md with deployment instructions

## Deployment Architecture

This is a full-stack application with:
- **Frontend**: React + Vite (deploy to Vercel)
- **Backend**: Express.js API server (deploy separately)
- **Database**: PostgreSQL on Supabase

## Step 1: Deploy Frontend to Vercel (buildmybot20)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Link to buildmybot20 project**:
   ```bash
   rm -rf .vercel
   vercel link --project buildmybot20 --yes
   ```

4. **Deploy**:
   ```bash
   vercel --prod
   ```

5. **Environment Variables** (already configured in buildmybot20):
   - `VITE_API_URL` = `https://buildmybot2-production.up.railway.app`
   - `VITE_STRIPE_PUBLISHABLE_KEY` = Your Stripe publishable key
   - `VITE_SUPABASE_URL` = Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = Your Supabase anon key
   - `DATABASE_URL` = Supabase pooler connection string
   - `TWILIO_*` = Twilio credentials (for phone agent)
   - `CARTESIA_API_KEY` = Cartesia voice API key

## Step 2: Deploy Backend

Choose one of these platforms for your Express backend:

### Option A: Railway (Recommended)

1. Create account at https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Set start command: `npm run start`
5. Add environment variables (see below)

### Option B: Render

1. Create account at https://render.com
2. Click "New +" → "Web Service"
3. Connect your repository
4. Set build command: `npm install`
5. Set start command: `npm run start`
6. Add environment variables (see below)

### Option C: Fly.io

1. Install Fly CLI: `brew install flyctl` (Mac) or `powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"` (Windows)
2. Login: `fly auth login`
3. Launch: `fly launch`
4. Deploy: `fly deploy`

### Backend Environment Variables

Set these in your backend deployment platform:

```bash
DATABASE_URL=postgresql://postgres.qjwwkcoredotrjtstigt:BuildMyBot123!@aws-0-us-west-2.pooler.supabase.com:5432/postgres
SESSION_SECRET=your-random-secret-here
OPENAI_API_KEY=your-openai-api-key
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
APP_BASE_URL=https://your-frontend-url.vercel.app
CARTESIA_API_KEY=your-cartesia-api-key (optional)
NODE_ENV=production
```

## Step 3: Database Setup

Your database is already configured on Supabase. No changes needed!

Current connection: `postgresql://postgres.qjwwkcoredotrjtstigt:BuildMyBot123!@aws-0-us-west-2.pooler.supabase.com:5432/postgres`

## Step 4: Configure Stripe Webhooks

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-backend-url.com/api/stripe/webhook`
3. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the webhook signing secret
5. Set it as `STRIPE_WEBHOOK_SECRET` in backend environment

## Step 5: Update Master Admin Emails

Before deploying, update the master admin emails in `App.tsx`:

```typescript
const MASTER_ADMINS = ['your-admin-email@example.com'];
```

## Step 6: Test Deployment

1. Visit your Vercel URL
2. Test login with seeded users:
   - `mreardon@wtpnews.org` / `password` (MasterAdmin)
3. Verify API connectivity
4. Test bot creation and chat
5. Test Stripe integration (if configured)

## Production Checklist

- [ ] Frontend deployed to Vercel
- [ ] Backend deployed to Railway/Render/Fly
- [ ] All environment variables set
- [ ] Database migrations run
- [ ] Bot templates seeded
- [ ] User roles seeded
- [ ] Stripe webhooks configured
- [ ] Master admin emails updated
- [ ] DNS configured (if using custom domain)
- [ ] SSL certificates active
- [ ] Test all major features

## Troubleshooting

### Frontend can't connect to backend
- Check `VITE_API_URL` is set correctly in Vercel
- Check backend is running and accessible
- Verify CORS is configured in backend

### Database connection errors
- Use Supabase pooler URL (not direct connection)
- Verify `DATABASE_URL` is set correctly
- Check Supabase project is not paused

### Stripe webhooks not working
- Verify webhook URL is correct
- Check `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
- Test webhook with Stripe CLI: `stripe trigger payment_intent.succeeded`

## Support

For deployment issues, check:
- Vercel build logs
- Backend server logs
- Supabase database logs
- Browser console errors

## Next Steps

After deployment:
1. Set up monitoring (Sentry, LogRocket, etc.)
2. Configure custom domain
3. Enable caching and CDN
4. Set up CI/CD pipeline
5. Configure backup strategy for database
