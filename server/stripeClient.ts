import Stripe from 'stripe';
import { env } from './env';

function getStripeSecretKeyInternal() {
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }
  return secretKey;
}

export async function getUncachableStripeClient() {
  const secretKey = getStripeSecretKeyInternal();
  return new Stripe(secretKey, {
    apiVersion: '2024-12-18.acacia' as any,
  });
}

export async function getStripePublishableKey() {
  const publishableKey = env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error('Missing STRIPE_PUBLISHABLE_KEY');
  }
  return publishableKey;
}

export async function getStripeSecretKey() {
  return getStripeSecretKeyInternal();
}
