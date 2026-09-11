# Stripe Setup Guide for BuildMyBot

## Step 1: Create Stripe Account
1. Go to https://dashboard.stripe.com/register
2. Complete registration (use your business email)
3. Verify your email and complete account setup

## Step 2: Get API Keys
1. Navigate to **Developers** → **API keys** in Stripe Dashboard
2. Copy your **Secret key** (starts with `sk_live_` for production or `sk_test_` for testing)
3. Copy your **Publishable key** (starts with `pk_live_` or `pk_test_`)

⚠️ **IMPORTANT**: Use test keys (`sk_test_`, `pk_test_`) for development, live keys (`sk_live_`, `pk_live_`) for production

## Step 3: Create Products and Prices

### Create Products for Each Plan:

**1. STARTER Plan - $29/month**
1. Go to **Products** → **+ Add product**
2. Fill in:
   - Name: `BuildMyBot - Starter`
   - Description: `1 bot, 750 conversations/month, GPT-4o Mini`
   - Pricing: `Recurring`
   - Price: `$29.00 USD`
   - Billing period: `Monthly`
3. Click **Save product**
4. **Copy the Price ID** (starts with `price_`) → This is `STRIPE_PRICE_STARTER`

**2. PROFESSIONAL Plan - $99/month**
1. Products → **+ Add product**
2. Fill in:
   - Name: `BuildMyBot - Professional`
   - Description: `5 bots, 5,000 conversations/month, Advanced analytics`
   - Pricing: `Recurring`
   - Price: `$99.00 USD`
   - Billing period: `Monthly`
3. **Copy the Price ID** → This is `STRIPE_PRICE_PROFESSIONAL`

**3. EXECUTIVE Plan - $199/month**
1. Products → **+ Add product**
2. Fill in:
   - Name: `BuildMyBot - Executive`
   - Description: `10 bots, 15,000 conversations/month, Premium features`
   - Pricing: `Recurring`
   - Price: `$199.00 USD`
   - Billing period: `Monthly`
3. **Copy the Price ID** → This is `STRIPE_PRICE_EXECUTIVE`

**4. ENTERPRISE Plan - $499/month**
1. Products → **+ Add product**
2. Fill in:
   - Name: `BuildMyBot - Enterprise`
   - Description: `Unlimited bots, 50,000 conversations/month, White-labeling`
   - Pricing: `Recurring`
   - Price: `$499.00 USD`
   - Billing period: `Monthly`
3. **Copy the Price ID** → This is `STRIPE_PRICE_ENTERPRISE`

## Step 4: Set Up Webhook

1. Go to **Developers** → **Webhooks** → **+ Add endpoint**
2. Enter webhook URL:
   ```
   https://qjwwkcoredotrjtstigt.supabase.co/functions/v1/stripe-webhook
   ```
3. Select events to listen to:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
   - ✅ `invoice.payment_failed`
4. Click **Add endpoint**
5. **Copy the Signing secret** (starts with `whsec_`) → This is `STRIPE_WEBHOOK_SECRET`

## Step 5: Configure Supabase Edge Functions Environment Variables

1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/qjwwkcoredotrjtstigt/settings/functions
2. Add the following secrets:

```bash
# Stripe Keys
STRIPE_SECRET_KEY=sk_live_YOUR_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE

# Stripe Price IDs
STRIPE_PRICE_STARTER=price_YOUR_STARTER_PRICE_ID
STRIPE_PRICE_PROFESSIONAL=price_YOUR_PROFESSIONAL_PRICE_ID
STRIPE_PRICE_EXECUTIVE=price_YOUR_EXECUTIVE_PRICE_ID
STRIPE_PRICE_ENTERPRISE=price_YOUR_ENTERPRISE_PRICE_ID
```

### How to Add Secrets:
```bash
# Using CLI
npx supabase secrets set STRIPE_SECRET_KEY=sk_live_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
npx supabase secrets set STRIPE_PRICE_STARTER=price_...
npx supabase secrets set STRIPE_PRICE_PROFESSIONAL=price_...
npx supabase secrets set STRIPE_PRICE_EXECUTIVE=price_...
npx supabase secrets set STRIPE_PRICE_ENTERPRISE=price_...
```

Or via Dashboard:
1. Settings → Edge Functions → Secrets
2. Click **Add new secret**
3. Enter name and value for each secret

## Step 6: Test the Integration

### Test Mode (Recommended First):
1. Use test API keys (`sk_test_`, `pk_test_`)
2. Create test products with $0.50 prices
3. Use Stripe test card: `4242 4242 4242 4242` (any future expiry, any CVC)
4. Test the checkout flow in your app
5. Verify webhook events in Stripe Dashboard → Webhooks

### Go Live:
1. Replace test keys with live keys
2. Update products to real prices
3. Complete Stripe account activation (provide business details, bank account)
4. Enable payment methods (cards, Apple Pay, Google Pay)

## Step 7: Update Your .env.local for Development

```bash
NEXT_PUBLIC_SUPABASE_URL=https://qjwwkcoredotrjtstigt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY

# For testing locally (use test keys)
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## Verification Checklist

- [ ] Stripe account created and verified
- [ ] API keys copied (Secret + Publishable)
- [ ] All 4 products created (Starter, Professional, Executive, Enterprise)
- [ ] All 4 price IDs copied
- [ ] Webhook endpoint created
- [ ] Webhook secret copied
- [ ] All environment variables added to Supabase
- [ ] Tested checkout with test keys
- [ ] Verified webhook events received
- [ ] Switched to live keys (when ready for production)

## Troubleshooting

**Webhook not receiving events:**
- Check the endpoint URL matches exactly
- Verify STRIPE_WEBHOOK_SECRET is set correctly
- Check Supabase Edge Function logs for errors
- Test webhook delivery in Stripe Dashboard

**Checkout not working:**
- Verify all STRIPE_PRICE_* environment variables are set
- Check browser console for errors
- Verify Supabase auth is working
- Check Edge Function logs

**Payment succeeded but user not upgraded:**
- Check stripe-webhook Edge Function logs
- Verify webhook events include correct metadata (user_id, plan_id)
- Check database profiles table for stripe_customer_id and stripe_subscription_id

## Support Resources

- Stripe Dashboard: https://dashboard.stripe.com
- Stripe Docs: https://stripe.com/docs
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Test Cards: https://stripe.com/docs/testing#cards
