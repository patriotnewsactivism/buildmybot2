import { eq, sql } from 'drizzle-orm';
import { users } from '../shared/schema';
import { db } from './db';
import { getUncachableStripeClient } from './stripeClient';

const PLAN_PRICES: Record<string, number> = {
  FREE: 0,
  STARTER: 29,
  PROFESSIONAL: 99,
  EXECUTIVE: 199,
  ENTERPRISE: 499,
};

export class StripeService {
  async createCustomer(email: string, userId: string, name?: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      email,
      name,
      metadata: { userId },
    });
  }

  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    options?: {
      metadata?: Record<string, string>;
      subscriptionMetadata?: Record<string, string>;
    },
  ) {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: options?.metadata,
      subscription_data: options?.subscriptionMetadata
        ? { metadata: options.subscriptionMetadata }
        : undefined,
    });
  }

  async createCustomerPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async createPaymentIntent(
    customerId: string,
    amountCents: number,
    metadata?: Record<string, string>,
  ) {
    const stripe = await getUncachableStripeClient();
    return await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: customerId,
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });
  }

  async getProduct(productId: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.products.retrieve(productId);
  }

  async listProducts(active = true) {
    const stripe = await getUncachableStripeClient();
    const products = await stripe.products.list({ active, limit: 100 });
    return products.data;
  }

  async listProductsWithPrices(active = true) {
    const stripe = await getUncachableStripeClient();
    const products = await stripe.products.list({ active, limit: 100 });
    const prices = await stripe.prices.list({ active: true, limit: 100 });

    const result: any[] = [];
    for (const product of products.data) {
      const productPrices = prices.data.filter((p) => p.product === product.id);
      if (productPrices.length === 0) {
        result.push({
          product_id: product.id,
          product_name: product.name,
          product_description: product.description,
          product_active: product.active,
          product_metadata: product.metadata,
          price_id: null,
          unit_amount: null,
          currency: null,
          recurring: null,
          price_active: null,
        });
      } else {
        for (const price of productPrices) {
          result.push({
            product_id: product.id,
            product_name: product.name,
            product_description: product.description,
            product_active: product.active,
            product_metadata: product.metadata,
            price_id: price.id,
            unit_amount: price.unit_amount,
            currency: price.currency,
            recurring: price.recurring,
            price_active: price.active,
          });
        }
      }
    }
    return result.sort((a, b) => (a.unit_amount || 0) - (b.unit_amount || 0));
  }

  async getSubscription(subscriptionId: string) {
    const stripe = await getUncachableStripeClient();
    try {
      return await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      return null;
    }
  }

  async syncPlansToStripe(
    plans: Record<string, { price: number; name: string; features: string[] }>,
  ) {
    const stripe = await getUncachableStripeClient();
    const results: { plan: string; productId: string; priceId: string }[] = [];

    for (const [planKey, planData] of Object.entries(plans)) {
      if (planData.price === 0) continue;

      const existingProducts = await stripe.products.list({ limit: 100 });
      let product = existingProducts.data.find(
        (p) => p.metadata?.planKey === planKey,
      );

      if (!product) {
        product = await stripe.products.create({
          name: planData.name,
          description: planData.features.slice(0, 3).join(', '),
          metadata: { planKey },
        });
      }

      const existingPrices = await stripe.prices.list({
        product: product.id,
        active: true,
      });
      let price = existingPrices.data.find(
        (p) =>
          p.unit_amount === planData.price * 100 &&
          p.recurring?.interval === 'month',
      );

      if (!price) {
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: planData.price * 100,
          currency: 'usd',
          recurring: { interval: 'month' },
          metadata: { planKey },
        });
      }

      results.push({ plan: planKey, productId: product.id, priceId: price.id });
    }

    return results;
  }

  async updateUserStripeInfo(
    userId: string,
    stripeInfo: {
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
    },
  ) {
    const [user] = await db
      .update(users)
      .set(stripeInfo)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async creditReferrer(
    referredUserId: string,
    plan: string,
  ): Promise<{ success: boolean; credited: number; referrerId?: string }> {
    const [referredUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, referredUserId));

    if (!referredUser || !referredUser.referredBy) {
      return { success: false, credited: 0 };
    }

    const [referrer] = await db
      .select()
      .from(users)
      .where(eq(users.resellerCode, referredUser.referredBy));

    if (!referrer) {
      return { success: false, credited: 0 };
    }

    const planPrice = PLAN_PRICES[plan.toUpperCase()] || 0;
    if (planPrice === 0) {
      return { success: false, credited: 0 };
    }

    const creditAmount = planPrice;
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 12);

    const currentCredits = referrer.referralCredits || 0;
    const newCredits = currentCredits + creditAmount;

    await db
      .update(users)
      .set({
        referralCredits: newCredits,
        referralCreditsExpiry: expiryDate,
      })
      .where(eq(users.id, referrer.id));

    return {
      success: true,
      credited: creditAmount,
      referrerId: referrer.id,
    };
  }

  async getUserCredits(
    userId: string,
  ): Promise<{ credits: number; expiry: Date | null }> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return {
      credits: user?.referralCredits || 0,
      expiry: user?.referralCreditsExpiry || null,
    };
  }

  async applyCreditsToSubscription(
    userId: string,
    amount: number,
  ): Promise<{ success: boolean; remainingCredits: number }> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user || (user.referralCredits || 0) < amount) {
      return { success: false, remainingCredits: user?.referralCredits || 0 };
    }

    const newCredits = (user.referralCredits || 0) - amount;
    await db
      .update(users)
      .set({ referralCredits: newCredits })
      .where(eq(users.id, userId));

    return { success: true, remainingCredits: newCredits };
  }
}

export const stripeService = new StripeService();
