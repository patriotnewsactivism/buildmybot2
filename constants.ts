import { PlanType } from './types';

export const PLANS = {
  [PlanType.FREE]: {
    price: 0,
    bots: 1,
    conversations: 60,
    name: 'Free',
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
      'GPT-4o Mini model',
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
    name: 'Enterprise', // Updated from Ultimate Power
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
  { min: 150, max: 250, commission: 0.4, label: 'Gold' },
  { min: 251, max: 999999, commission: 0.5, label: 'Platinum' },
];

export const WHITELABEL_FEE = {
  price: 499,
  intervalDays: 30,
  netTermsDays: 30,
  commission: 0.5,
  label: 'Partner Access',
  features: [
    'Immediate partner access at $499/mo',
    '50% split on new accounts created after enrollment',
    'Existing accounts keep their current commission rate',
    'Billed every 30 days (net 30)',
    'Skip the tiered sales agent structure',
    'Optional white-label branding and custom domain',
    'White-label dashboard',
    'Priority support',
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
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast, cost-effective. Recommended for most chatbots.',
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'High reasoning. Best for complex tasks and coding.',
  },
];

export const VOICE_AGENT_PRICING = [
  {
    id: 'voice_basic',
    name: 'Voice Basic',
    price: 79,
    minutesIncluded: 150,
    overagePerMinute: 0.5,
    features: [
      '150 minutes/month',
      'Cartesia ultra-realistic voice',
      'Basic call routing',
      'Call transcripts',
      'Email support',
      '$0.50/min overage',
    ],
  },
  {
    id: 'voice_standard',
    name: 'Voice Standard',
    price: 174,
    minutesIncluded: 450,
    overagePerMinute: 0.5,
    features: [
      '450 minutes/month',
      'All Cartesia voices',
      'Advanced call routing',
      'Call transfers',
      'Scheduling workflows',
      'Analytics dashboard',
      '$0.50/min overage',
    ],
  },
  {
    id: 'voice_professional',
    name: 'Voice Professional',
    price: 279,
    minutesIncluded: 1000,
    overagePerMinute: 0.5,
    features: [
      '1,000 minutes/month',
      'CRM integration',
      'Call transfers & scheduling',
      'Advanced analytics',
      'Priority routing rules',
      'API webhooks',
      '$0.50/min overage',
    ],
  },
  {
    id: 'voice_enterprise',
    name: 'Voice Enterprise',
    price: 549,
    minutesIncluded: 2500,
    overagePerMinute: 0.5,
    features: [
      '2,500 minutes/month',
      'Multi-language support',
      'Dedicated priority support',
      'White-label ready',
      'Full API access',
      'Custom integrations',
      '$0.50/min overage',
    ],
  },
];

export const EXPERT_SETUP_SERVICES = [
  {
    id: 'basic_setup',
    name: 'Basic Setup',
    price: 299,
    deliveryDays: 3,
    highlights: ['1 bot', '10 pages knowledge base'],
  },
  {
    id: 'standard_setup',
    name: 'Standard Setup',
    price: 799,
    deliveryDays: 5,
    highlights: ['3 bots', 'CRM integration'],
  },
  {
    id: 'premium_setup',
    name: 'Premium Setup',
    price: 1599,
    deliveryDays: 10,
    highlights: ['10 bots', 'voice agent + API integrations'],
  },
  {
    id: 'enterprise_launch',
    name: 'Enterprise Launch',
    price: 2499,
    deliveryDays: 14,
    highlights: ['Unlimited bots', 'dedicated success manager'],
  },
];

export const TEMPLATE_MARKETPLACE_PRICING = [
  { id: 'starter_templates', name: 'Starter Templates', price: 0 },
  { id: 'industry_packs', name: 'Industry Packs', price: 49 },
  { id: 'advanced_workflows', name: 'Advanced Workflows', price: 99 },
  { id: 'voice_agent_templates', name: 'Voice Agent Templates', price: 149 },
  { id: 'enterprise_suite', name: 'Enterprise Suite', price: 299 },
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
