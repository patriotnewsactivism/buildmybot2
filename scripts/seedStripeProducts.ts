import type Stripe from 'stripe';
import { getUncachableStripeClient } from '../server/stripeClient';

type PlanDefinition = {
  name: string;
  description: string;
  price: number;
  metadata: Stripe.MetadataParam;
  recurring: Stripe.PriceCreateParams.Recurring;
};

const MONTHLY_RECURRING: Stripe.PriceCreateParams.Recurring = {
  interval: 'month',
  interval_count: 1,
};

const PLANS: PlanDefinition[] = [
  {
    name: 'Starter',
    description:
      'Perfect for small businesses getting started with AI chatbots',
    price: 2900,
    metadata: { planKey: 'STARTER', bots: '1', conversations: '750' },
    recurring: MONTHLY_RECURRING,
  },
  {
    name: 'Professional',
    description: 'For growing businesses with multiple brands',
    price: 9900,
    metadata: { planKey: 'PROFESSIONAL', bots: '5', conversations: '5000' },
    recurring: MONTHLY_RECURRING,
  },
  {
    name: 'Executive',
    description: 'Advanced features for serious businesses',
    price: 19900,
    metadata: { planKey: 'EXECUTIVE', bots: '10', conversations: '30000' },
    recurring: MONTHLY_RECURRING,
  },
  {
    name: 'Ultimate Power',
    description: 'Enterprise-grade white-label solution with unlimited bots',
    price: 49900,
    metadata: {
      planKey: 'ENTERPRISE',
      bots: 'unlimited',
      conversations: '50000',
    },
    recurring: MONTHLY_RECURRING,
  },
  {
    name: 'Whitelabel Partner Fee',
    description: 'Whitelabel partner fee for guaranteed 50% revenue split',
    price: 49900,
    metadata: {
      planKey: 'WHITELABEL_FEE',
      productType: 'WHITELABEL_FEE',
      billingTerms: 'net_30',
    },
    recurring: { interval: 'day', interval_count: 30 },
  },
];

async function seedProducts() {
  console.log('Seeding Stripe products...');
  const stripe = await getUncachableStripeClient();

  for (const plan of PLANS) {
    const existingProducts = await stripe.products.search({
      query: `name:'${plan.name}'`,
    });

    if (existingProducts.data.length > 0) {
      console.log(`${plan.name} already exists, skipping...`);
      continue;
    }

    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: plan.metadata,
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.price,
      currency: 'usd',
      recurring: plan.recurring,
    });

    console.log(
      `Created: ${plan.name} (${product.id}) - $${plan.price / 100}/mo (${price.id})`,
    );
  }

  console.log('Done seeding products!');
}

seedProducts().catch(console.error);
