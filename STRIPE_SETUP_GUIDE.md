# Stripe Setup Guide for BuildMyBot

## Step 1: Create Stripe Account
1. Go to https://dashboard.stripe.com/register
2. Complete registration (use your business email)
3. Verify your email and complete account setup

## Step 2: Get API Keys
1. Navigate to **Developers** → **API keys** in Stripe Dashboard
2. Copy your **Secret key** (starts with `sk_live_` for production or `sk_test_` for testing)
3. Copy your **Publishable key** (starts with `pk_live_` or `pk_test_`)

**IMPORTANT**: Use test keys (`sk_test_`, `pk_test_`) for development, live keys (`sk_live_`, `pk_live_`) for production

## Step 3: Create Products and Prices

### Create Products for Each Plan:

**1. STARTER Plan - $29/month**
1. Go to **Products** → **+ Add product**
2. Fill in:
   - Name: `BuildMyBot - Starter`
   - Description: `1 bot, 750 conversations/month, GPT-5o Mini`
   - Pricing: `Recurring`
   - Price: `$29.00 USD`
   - Billing period: `Monthly`
3. Click **Save product**
4. **Copy the Price ID** (starts with `price_`)

**2. PROFESSIONAL Plan - $99/month**
1. Products → **+ Add product**
2. Fill in:
   - Name: `BuildMyBot - Professional`
   - Description: `5 bots, 5,000 conversations/month, Advanced analytics`
   - Pricing: `Recurring`
   - Price: `$99.00 USD`
   - Billing period: `Monthly`
3. **Copy the Price ID**

**3. EXECUTIVE Plan - $199/month**
1. Products → **+ Add product**
2. Fill in:
   - Name: `BuildMyBot - Executive`
   - Description: `10 bots, 15,000 conversations/month, Premium features`
   - Pricing: `Recurring`
   - Price: `$199.00 USD`
   - Billing period: `Monthly`
3. **Copy the Price ID**

**4. ENTERPRISE Plan - $499/month**
1. Products → **+ Add product**
2. Fill in:
   - Name: `BuildMyBot - Enterprise`
   - Description: `Unlimited bots, 50,000 conversations/month, White-labeling`
   - Pricing: `Recurring`
   - Price: `$499.00 USD`
   - Billing period: `Monthly`
3. **Copy the Price ID**


**5. WHITELABEL Partner Fee - $499 every 30 days**
1. Products -> **+ Add product**
2. Fill in:
   - Name: `BuildMyBot - Whitelabel Partner Fee`
   - Description: `Whitelabel partner fee for guaranteed 50% revenue split`
   - Pricing: `Recurring`
   - Price: `$499.00 USD`
   - Billing period: `Every 30 days`
3. **Copy the Price ID**
## Step 4: Configure Environment Variables

Add the following to your environment:

```bash
STRIPE_SECRET_KEY=sk_live_YOUR_SECRET_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_PUBLISHABLE_KEY_HERE
STRIPE_PRICE_STARTER=price_YOUR_STARTER_PRICE_ID
STRIPE_PRICE_PROFESSIONAL=price_YOUR_PROFESSIONAL_PRICE_ID
STRIPE_PRICE_EXECUTIVE=price_YOUR_EXECUTIVE_PRICE_ID
STRIPE_PRICE_ENTERPRISE=price_YOUR_ENTERPRISE_PRICE_ID
STRIPE_WHITELABEL_PRICE_ID=price_YOUR_WHITELABEL_PRICE_ID
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
```

## Step 5: Test the Integration

### Test Mode (Recommended First):
1. Use test API keys (`sk_test_`, `pk_test_`)
2. Create test products with $0.50 prices
3. Use Stripe test card: `4242 4242 4242 4242` (any future expiry, any CVC)
4. Test the checkout flow in your app

### Go Live:
1. Replace test keys with live keys
2. Update products to real prices
3. Complete Stripe account activation (provide business details, bank account)
4. Enable payment methods (cards, Apple Pay, Google Pay)

## Verification Checklist

- [ ] Stripe account created and verified
- [ ] API keys copied (Secret + Publishable)
- [ ] All 4 products created (Starter, Professional, Executive, Enterprise)
- [ ] All 4 price IDs copied
- [ ] All environment variables configured
- [ ] Tested checkout with test keys
- [ ] Switched to live keys (when ready for production)

## Troubleshooting

**Checkout not working:**
- Verify all STRIPE_PRICE_* environment variables are set
- Check browser console for errors
- Verify API keys are correct

**Payment succeeded but user not upgraded:**
- Check server logs for webhook processing
- Verify subscription metadata includes user_id and plan_id

## Support Resources

- Stripe Dashboard: https://dashboard.stripe.com
- Stripe Docs: https://stripe.com/docs
- Test Cards: https://stripe.com/docs/testing#cards
