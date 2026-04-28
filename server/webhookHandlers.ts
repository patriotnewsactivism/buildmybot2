import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { users } from '../shared/schema';
import { db } from './db';
import { getStripeSecretKey, getWebhookSecret } from './stripeClient';

/**
 * Stripe Webhook Handlers
 * Standard webhook verification using STRIPE_WEBHOOK_SECRET.
 * Replaces stripe-replit-sync approach.
 */
export class WebhookHandlers {
  static async processWebhook(
    payload: Buffer,
    signature: string,
  ): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        `STRIPE WEBHOOK ERROR: Payload must be a Buffer. Received type: ${typeof payload}.`,
      );
    }

    const secretKey = await getStripeSecretKey();
    const stripe = new Stripe(secretKey, {
      apiVersion: '2025-08-27.basil' as any,
    });

    const webhookSecret = getWebhookSecret();
    if (!webhookSecret) {
      console.error('[Stripe] STRIPE_WEBHOOK_SECRET not set — cannot verify webhooks');
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      console.error('[Stripe] Webhook signature verification failed:', error);
      throw error;
    }

    console.log(`[Stripe Webhook] Processing event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await WebhookHandlers.handleCheckoutCompleted(stripe, event);
        break;
      case 'customer.subscription.updated':
        await WebhookHandlers.handleSubscriptionUpdated(event);
        break;
      case 'customer.subscription.deleted':
        await WebhookHandlers.handleSubscriptionDeleted(event);
        break;
      case 'invoice.paid':
        await WebhookHandlers.handleInvoicePaid(event);
        break;
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }
  }

  /**
   * Customer completed checkout — upgrade their plan
   */
  private static async handleCheckoutCompleted(
    stripe: Stripe,
    event: Stripe.Event,
  ): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;

    // Handle whitelabel purchase separately
    if (session.metadata?.purpose === 'whitelabel_fee') {
      await WebhookHandlers.handleWhitelabelCheckout(session);
      return;
    }

    // Handle regular subscription checkout
    const customerId = session.customer?.toString();
    const subscriptionId = session.subscription?.toString();
    if (!customerId || !subscriptionId) {
      console.warn('[Stripe] checkout.session.completed missing customer or subscription');
      return;
    }

    // Find user by Stripe customer ID
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.stripeCustomerId, customerId));

    if (!user) {
      console.error(`[Stripe] No user found for customer ${customerId}`);
      return;
    }

    // Get subscription to determine which plan they bought
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = subscription.items.data[0]?.price?.id;
    const plan = WebhookHandlers.planFromPriceId(priceId);

    await db
      .update(users)
      .set({
        plan,
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: 'active',
      })
      .where(eq(users.id, user.id));

    console.log(`[Stripe] User ${user.id} (${user.email}) upgraded to ${plan}`);
  }

  /**
   * Whitelabel fee checkout completed
   */
  private static async handleWhitelabelCheckout(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const userId = session.metadata?.userId;
    if (!userId) return;

    const updates: Record<string, unknown> = {
      whitelabelEnabled: true,
    };

    const [existingUser] = await db
      .select({ whitelabelEnabledAt: users.whitelabelEnabledAt })
      .from(users)
      .where(eq(users.id, userId));

    if (!existingUser?.whitelabelEnabledAt) {
      updates.whitelabelEnabledAt = session.created
        ? new Date(session.created * 1000)
        : new Date();
    }

    if (session.subscription) {
      updates.whitelabelSubscriptionId = session.subscription.toString();
    }
    if (session.customer) {
      updates.stripeCustomerId = session.customer.toString();
    }

    await db.update(users).set(updates).where(eq(users.id, userId));
    console.log(`[Stripe] Whitelabel enabled for user ${userId}`);
  }

  /**
   * Subscription changed (upgrade/downgrade/payment issue)
   */
  private static async handleSubscriptionUpdated(
    event: Stripe.Event,
  ): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const subscriptionId = subscription.id;
    const status = subscription.status;
    const priceId = subscription.items.data[0]?.price?.id;
    const plan = WebhookHandlers.planFromPriceId(priceId);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.stripeSubscriptionId, subscriptionId));

    if (!user) {
      console.warn(`[Stripe] subscription.updated — no user for sub ${subscriptionId}`);
      return;
    }

    await db
      .update(users)
      .set({
        plan: status === 'active' ? plan : user.plan, // only change plan if active
        subscriptionStatus: status,
      })
      .where(eq(users.id, user.id));

    console.log(`[Stripe] Subscription updated: user ${user.id} → ${plan} (${status})`);
  }

  /**
   * Subscription canceled — downgrade to FREE
   */
  private static async handleSubscriptionDeleted(
    event: Stripe.Event,
  ): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const subscriptionId = subscription.id;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.stripeSubscriptionId, subscriptionId));

    if (!user) {
      console.warn(`[Stripe] subscription.deleted — no user for sub ${subscriptionId}`);
      return;
    }

    await db
      .update(users)
      .set({
        plan: 'FREE',
        subscriptionStatus: 'canceled',
      })
      .where(eq(users.id, user.id));

    console.log(`[Stripe] Subscription canceled: user ${user.id} downgraded to FREE`);
  }

  /**
   * Invoice paid — update whitelabel expiry
   */
  private static async handleInvoicePaid(
    event: Stripe.Event,
  ): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId =
      'subscription' in invoice && invoice.subscription
        ? invoice.subscription.toString()
        : undefined;
    const periodEnd = invoice.lines?.data?.[0]?.period?.end;
    if (!subscriptionId || !periodEnd) return;

    const paidThrough = new Date(periodEnd * 1000);
    await db
      .update(users)
      .set({ whitelabelPaidThrough: paidThrough })
      .where(eq(users.whitelabelSubscriptionId, subscriptionId));
  }

  /**
   * Map Stripe price IDs to BuildMyBot plan names
   */
  private static planFromPriceId(priceId: string | undefined): string {
    const priceMap: Record<string, string> = {
      'price_1TRAyTDmDTj65rCT4VtrFNbk': 'STARTER',      // $29/mo
      'price_1TRAyUDmDTj65rCTJuC5e6qy': 'PROFESSIONAL',  // $99/mo
      'price_1TRAyUDmDTj65rCT4My4pTlG': 'EXECUTIVE',     // $199/mo
      'price_1TRAyVDmDTj65rCTjLyjctAV': 'ENTERPRISE',    // $499/mo
    };
    return priceMap[priceId || ''] || 'FREE';
  }
}
