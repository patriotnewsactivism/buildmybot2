import { PlanType } from './types';

export const PLANS = {
  [PlanType.FREE]: {
    price: 0,
    bots: 1,
    conversations: 60,
    name: 'Free Tier',
    features: [
      'Drag-and-drop website widget',
      '1 bot with branded colors',
      '60 conversations/month',
      '50MB knowledge base storage',
      'Basic FAQs & lead capture',
      'Email transcript export',
      'Community support',
    ],
  },
  [PlanType.STARTER]: {
    price: 29,
    bots: 1,
    conversations: 750,
    name: 'Starter',
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
  [PlanType.PROFESSIONAL]: {
    price: 99,
    bots: 5,
    conversations: 5000,
    name: 'Professional',
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
  [PlanType.EXECUTIVE]: {
    price: 199,
    bots: 10,
    conversations: 30000,
    name: 'Executive',
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
  [PlanType.ENTERPRISE]: {
    price: 499,
    bots: 9999, // Unlimited
    conversations: 50000,
    name: 'Ultimate Power', // Updated from Enterprise
    overage: 0.01,
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
      'All Executive features',
    ],
  },
};

export const RESELLER_TIERS = [
  { min: 0, max: 49, commission: 0.2, label: 'Bronze' },
  { min: 50, max: 149, commission: 0.3, label: 'Silver' },
  { min: 150, max: 249, commission: 0.4, label: 'Gold' },
  { min: 250, max: 999999, commission: 0.5, label: 'Platinum' },
];

export const WHITELABEL_FEE = {
  price: 499,
  intervalDays: 30,
  netTermsDays: 30,
  commission: 0.5,
  label: 'Whitelabel',
  features: [
    'Guaranteed 50% revenue split while fee is current',
    'Billed every 30 days (net 30)',
    'If unpaid, $499 is deducted from partner payouts',
    'Skip the tiered structure entirely',
    'Custom domain & branding',
    'White-label dashboard',
    'Priority support',
    'No client minimums required',
  ],
};

export const REFERRAL_REWARDS = {
  type: 'credit',
  description: 'Earn credits for each referral that subscribes',
  rewardPercentage: 1.0,
  maxCreditsPerReferral: 499,
  creditsExpiryMonths: 12,
  howItWorks: [
    'Share your unique referral link with other businesses',
    'When they subscribe to any paid plan, you earn credits',
    "Credits equal one month of the referral's plan price",
    'Use credits toward your own subscription',
    'Credits are valid for 12 months',
  ],
};

export const AVAILABLE_MODELS = [
  {
    id: 'gpt-5o-mini',
    name: 'GPT-5o Mini',
    description:
      'Fast, cost-effective. Best for real-time chat. 33% lower cost than GPT-4o Mini.',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description:
      'Legacy model. Consider upgrading to GPT-5o Mini for cost savings.',
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'High reasoning. Best for complex tasks and coding.',
  },
];

export const VOICE_AGENT_PRICING = [
  {
    id: 'voice_starter',
    name: 'Voice Starter',
    price: 49,
    minutesIncluded: 100,
    overagePerMinute: 0.12,
    features: [
      '100 minutes/month',
      'Cartesia ultra-realistic voice',
      'Basic call routing',
      'Call transcripts',
    ],
  },
  {
    id: 'voice_professional',
    name: 'Voice Professional',
    price: 149,
    minutesIncluded: 500,
    overagePerMinute: 0.08,
    features: [
      '500 minutes/month',
      'All Cartesia voices',
      'Call transfers & scheduling',
      'CRM integration',
      'Analytics dashboard',
    ],
  },
  {
    id: 'voice_enterprise',
    name: 'Voice Enterprise',
    price: 399,
    minutesIncluded: 2000,
    overagePerMinute: 0.05,
    features: [
      '2000 minutes/month',
      'Custom voice cloning',
      'Multi-language support',
      'Priority support',
      'White-label ready',
      'API access',
    ],
  },
];

export const MOCK_ANALYTICS_DATA = [
  { date: 'Mon', conversations: 45, leads: 2 },
  { date: 'Tue', conversations: 52, leads: 5 },
  { date: 'Wed', conversations: 38, leads: 1 },
  { date: 'Thu', conversations: 65, leads: 8 },
  { date: 'Fri', conversations: 89, leads: 12 },
  { date: 'Sat', conversations: 120, leads: 15 },
  { date: 'Sun', conversations: 95, leads: 9 },
];
