# Stripe Webhook Configuration for Production

## Webhook URL

**Production Webhook Endpoint**:
```
https://buildmybot2-production.up.railway.app/api/stripe/webhook
```

## Setup Instructions

### 1. Access Stripe Dashboard

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Make sure you're in **Live mode** (toggle in top right)
3. Navigate to **Developers** → **Webhooks**

### 2. Add Endpoint

Click **"Add endpoint"** and configure:

**Endpoint URL**:
```
https://buildmybot2-production.up.railway.app/api/stripe/webhook
```

**Description**: `BuildMyBot Production Webhook`

### 3. Select Events to Listen To

The application currently handles these events:

#### Required Events:
- ✅ `checkout.session.completed` - When a checkout session is completed
- ✅ `invoice.paid` - When a subscription invoice is paid

#### Recommended Events (for future features):
- `customer.subscription.created` - New subscription created
- `customer.subscription.updated` - Subscription modified
- `customer.subscription.deleted` - Subscription cancelled
- `invoice.payment_failed` - Payment failed
- `payment_intent.succeeded` - One-time payment succeeded
- `payment_intent.payment_failed` - One-time payment failed

### 4. Get Webhook Signing Secret

After creating the endpoint:

1. Click on your newly created webhook endpoint
2. Click **"Reveal"** next to "Signing secret"
3. Copy the webhook signing secret (starts with `whsec_`)

### 5. Update Environment Variables

#### On Railway (Backend):

1. Go to [Railway Dashboard](https://railway.app)
2. Select your project: `buildmybot2`
3. Go to **Variables** tab
4. Update or add:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
   ```
5. Redeploy if needed

#### In Local .env:

Update your `.env` file:
```bash
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 6. Test the Webhook

#### Option A: Use Stripe CLI (Recommended)

1. Install Stripe CLI:
   ```bash
   npm install -g stripe
   ```

2. Login to Stripe:
   ```bash
   stripe login
   ```

3. Test webhook:
   ```bash
   stripe trigger checkout.session.completed
   ```

4. Forward to local for testing:
   ```bash
   stripe listen --forward-to https://buildmybot2-production.up.railway.app/api/stripe/webhook
   ```

#### Option B: Use Stripe Dashboard

1. Go to **Developers** → **Webhooks**
2. Click on your webhook endpoint
3. Click **"Send test webhook"**
4. Select `checkout.session.completed` event
5. Click **"Send test webhook"**

You should see a `200 OK` response if configured correctly.

### 7. Monitor Webhooks

In Stripe Dashboard:

1. Go to **Developers** → **Webhooks**
2. Click on your webhook endpoint
3. View **"Attempts"** tab to see:
   - Successful deliveries (200 status)
   - Failed deliveries (with error details)
   - Retry attempts

## Current Webhook Logic

### `checkout.session.completed`

Handles white-label subscription purchases:

```typescript
// Updates user record with:
- whitelabelEnabled: true
- whitelabelEnabledAt: timestamp
- whitelabelSubscriptionId: subscription ID
- stripeCustomerId: customer ID
```

### `invoice.paid`

Updates subscription expiration:

```typescript
// Updates user record with:
- whitelabelPaidThrough: period end date
```

## Security Features

✅ **Signature Verification**: All webhooks are verified using Stripe's signature
✅ **Raw Body Parsing**: Webhook endpoint uses raw body (not JSON parsed)
✅ **Error Handling**: Graceful error handling with logging
✅ **Idempotency**: Safe to retry webhook events

## Troubleshooting

### Webhook Returns 400

**Issue**: Missing `stripe-signature` header

**Fix**: Ensure you're sending from Stripe (not curl/postman)

### Webhook Returns 500

**Issue**: Body parsing error

**Fix**: Webhook route is registered BEFORE `express.json()` middleware (✅ already correct)

### Event Not Processing

**Issue**: Event type not handled

**Fix**: Check `webhookHandlers.ts` for supported event types

### Signature Verification Failed

**Issue**: Wrong webhook secret

**Fix**: Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard

## Webhook Event Flow

```
Stripe Event Occurs
    ↓
Stripe sends POST to webhook URL
    ↓
Signature verification
    ↓
Parse event data
    ↓
Route to event handler
    ↓
Update database
    ↓
Return 200 OK to Stripe
```

## Testing Checklist

- [ ] Webhook URL is correct
- [ ] Webhook secret is configured in Railway
- [ ] Events are selected in Stripe dashboard
- [ ] Test webhook sent successfully
- [ ] Check Railway logs for webhook processing
- [ ] Verify database updates after webhook

## Monitoring

### Check Railway Logs

```bash
# View recent logs
railway logs --service buildmybot2
```

Look for:
- ✅ "Stripe webhook processing..." (success)
- ❌ "Stripe webhook processing error:" (failure)

### Check Supabase Database

Query to verify webhook updates:

```sql
SELECT
  email,
  whitelabel_enabled,
  whitelabel_enabled_at,
  whitelabel_subscription_id,
  stripe_customer_id
FROM users
WHERE whitelabel_enabled = true;
```

## Production URLs Summary

| Component | URL |
|-----------|-----|
| **Frontend** | https://www.buildmybot.app |
| **Backend** | https://buildmybot2-production.up.railway.app |
| **Webhook** | https://buildmybot2-production.up.railway.app/api/stripe/webhook |
| **Stripe Dashboard** | https://dashboard.stripe.com |

## Support

If webhooks are not working:

1. Check Railway logs for errors
2. Verify webhook secret matches Stripe
3. Test with Stripe CLI first
4. Check Stripe dashboard "Attempts" for delivery status
5. Ensure Railway service is running

---

**Last Updated**: $(date)
**Status**: ✅ Endpoint configured and accessible
**Test Result**: Returns 400 for unsigned requests (expected behavior)
