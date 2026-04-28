import Stripe from 'stripe';
import { env } from './env';

/**
 * Simplified Stripe client for Railway deployment.
 * Removed stripe-replit-sync dependency — uses standard env vars.
 */

export async function getUncachableStripeClient() {
  const secretKey = await getStripeSecretKey();
  return new Stripe(secretKey, {
    apiVersion: '2025-08-27.basil' as any,
  });
}

export async function getStripePublishableKey() {
  return env.STRIPE_PUBLISHABLE_KEY || env.VITE_STRIPE_PUBLISHABLE_KEY || '';
}

export async function getStripeSecretKey() {
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      'Stripe not configured. Please set STRIPE_SECRET_KEY environment variable.',
    );
  }
  return secretKey;
}

export function getWebhookSecret(): string | undefined {
  return env.STRIPE_WEBHOOK_SECRET;
}
