import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { users } from '../shared/schema';
import { db } from './db';
import { getStripeSecretKey, getStripeSync } from './stripeClient';

export class WebhookHandlers {
  static async processWebhook(
    payload: Buffer,
    signature: string,
  ): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        `STRIPE WEBHOOK ERROR: Payload must be a Buffer. Received type: ${typeof payload}. This usually means express.json() parsed the body before reaching this handler. FIX: Ensure webhook route is registered BEFORE app.use(express.json()).`,
      );
    }

    try {
      const sync = await getStripeSync();
      await sync.processWebhook(payload, signature);
    } catch (error) {
      console.error('Stripe webhook processing error:', error);
    }

    // Also process custom business logic
    await WebhookHandlers.processBusinessLogic(payload, signature);
  }

  private static async processBusinessLogic(
    payload: Buffer,
    signature: string,
  ): Promise<void> {
    try {
      const secretKey = await getStripeSecretKey();
      const stripe = new Stripe(secretKey, {
        apiVersion: '2025-08-27.basil' as any,
      });

      // Get webhook secret from the managed webhook or fallback
      const sync = await getStripeSync();
      let webhookSecret: string | undefined;

      try {
        const webhookInfo = await sync.getManagedWebhook();
        webhookSecret = webhookInfo?.webhook?.secret;
      } catch {
        // Webhook not yet configured
      }

      if (!webhookSecret) {
        return;
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          payload,
          signature,
          webhookSecret,
        );
      } catch (error) {
        console.error('Stripe webhook signature verification failed:', error);
        return;
      }

      await WebhookHandlers.processStripeEvent(event);
    } catch (error) {
      console.error('Business logic webhook error:', error);
    }
  }

  private static async processStripeEvent(event: Stripe.Event): Promise<void> {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.purpose !== 'whitelabel_fee') {
        return;
      }
      const userId = session.metadata?.userId;
      if (!userId) {
        return;
      }

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
      return;
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId =
        'subscription' in invoice && invoice.subscription
          ? invoice.subscription.toString()
          : undefined;
      const periodEnd = invoice.lines?.data?.[0]?.period?.end;
      if (!subscriptionId || !periodEnd) {
        return;
      }

      const paidThrough = new Date(periodEnd * 1000);
      await db
        .update(users)
        .set({ whitelabelPaidThrough: paidThrough })
        .where(eq(users.whitelabelSubscriptionId, subscriptionId));
    }
  }
}
