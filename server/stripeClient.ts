import Stripe from 'stripe';

function getStripeSecretKeyInternal() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
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
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error('Missing STRIPE_PUBLISHABLE_KEY');
  }
  return publishableKey;
}

export async function getStripeSecretKey() {
  return getStripeSecretKeyInternal();
}
