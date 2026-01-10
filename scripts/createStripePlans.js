/**
 * Script to seed Stripe Plans for BuildMyBot
 *
 * Usage:
 * 1. Ensure you have the stripe package installed: npm install stripe
 * 2. Set your STRIPE_SECRET_KEY environment variable.
 * 3. Run: node scripts/createStripePlans.js
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    amount: 2900, // in cents ($29.00)
    description:
      'Website embeds, 750 conversations, 500MB storage, GPT-5o Mini, Lead capture alerts, Basic analytics.',
    features: [
      'Website + landing page embeds',
      'Multi-page training (URLs, PDFs)',
      '750 conversations/month',
      '500MB knowledge base storage',
      'GPT-5o Mini model',
      'Lead capture via email & SMS alerts',
      'Office-hours & scheduling rules',
      'Basic analytics dashboard',
      'Email support',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    amount: 9900, // $99.00
    description:
      '5 bots, 5000 conversations, 2GB storage, Multi-language, CRM integrations, Lead scoring, API access.',
    features: [
      '5 bots for multiple brands',
      '5,000 conversations/month',
      '2GB knowledge base storage',
      'Multi-language support',
      'CRM & calendar integrations',
      'Proactive lead scoring & alerts',
      'Knowledge base + custom training',
      'Advanced analytics & conversion tracking',
      'API access & webhooks',
      'Priority chat & email support',
    ],
  },
  {
    id: 'executive',
    name: 'Executive',
    amount: 19900, // $199.00
    description:
      '10 bots, 30k conversations, 10GB storage, Voice agent, Workflow automation, Premium analytics, AB testing.',
    features: [
      '10 bots with shared knowledge bases',
      '30,000 conversations/month',
      '10GB knowledge base storage',
      'Voice & phone agent included',
      'Workflow automation & triggers',
      'Premium analytics with attribution',
      'AB testing & copy experiments',
      'Team seats & roles',
      'Priority onboarding concierge',
    ],
  },
  {
    id: 'enterprise',
    name: 'Ultimate Power',
    amount: 49900, // $499.00
    description:
      'Unlimited bots, 50k convos, 100GB storage, White-label, SSO, Dedicated SLA support, Custom data residency.',
    features: [
      'Unlimited bots & workspaces',
      '50,000 convos included',
      '100GB knowledge base storage',
      '$0.01 per overage conversation',
      'Full white-label (domains, emails, branding)',
      'SAML/SSO + SCIM provisioning',
      'Dedicated Slack/phone support with SLA',
      'Security reviews, DPA & audit logs',
      'Custom data residency & backups',
      'Dedicated success manager',
    ],
  },
  {
    id: 'whitelabel_fee',
    name: 'Whitelabel Partner Fee',
    amount: 49900, // $499.00
    description: 'Whitelabel partner fee for guaranteed 50% revenue split.',
    features: [
      'Guaranteed 50% revenue split while fee is current',
      'Billed every 30 days (net 30)',
      'If unpaid, $499 is deducted from partner payouts',
      'Custom domain & branding',
      'White-label dashboard',
      'Priority support',
      'No client minimums required',
    ],
    recurring: { interval: 'day', interval_count: 30 },
    metadata: { product_type: 'whitelabel_fee', billing_terms: 'net_30' },
  },
];

async function createPlans() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Error: STRIPE_SECRET_KEY environment variable is missing.');
    process.exit(1);
  }

  console.log('Starting Stripe Plan Creation...');

  for (const plan of PLANS) {
    try {
      console.log(`Creating Product: ${plan.name}...`);

      // Create Product with features in metadata for future syncing
      const product = await stripe.products.create({
        name: `BuildMyBot - ${plan.name}`,
        description: plan.description,
        metadata: {
          app_plan_id: plan.id,
          features_list: JSON.stringify(plan.features),
          ...(plan.metadata || {}),
        },
      });

      console.log(`Creating Price for ${plan.name}...`);

      const price = await stripe.prices.create({
        unit_amount: plan.amount,
        currency: 'usd',
        recurring: plan.recurring || { interval: 'month' },
        product: product.id,
        metadata: {
          app_plan_id: plan.id,
        },
      });

      console.log(
        `✅ Created ${plan.name}: \n   Product ID: ${product.id} \n   Price ID: ${price.id}`,
      );

      // Feature list logging for verification
      console.log('   Features included:');
      plan.features.forEach((f) => console.log(`   - ${f}`));
      console.log('---');
    } catch (error) {
      console.error(`❌ Failed to create ${plan.name}:`, error.message);
    }
  }

  console.log('\n--- Plan Creation Complete ---');
  console.log('Copy the Price IDs above into your environment configuration.');
}

createPlans();
