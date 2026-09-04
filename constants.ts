// NOTE: explicit .js extension is REQUIRED — api/gateway.ts imports this file,
// and Vercel's serverless ESM runtime does real Node module resolution (no
// bundler). An extensionless './types' crashes every /api/* route at cold
// start (ERR_MODULE_NOT_FOUND). Vite resolves .js → .ts fine for the frontend.
import { PlanType } from './types.js';

/**
 * Canonical plan definitions — the single source of truth for BOTH the
 * marketing surface (pricing page, dashboard display) and backend enforcement.
 *
 * `conversations` is the number shown to customers ("included"). Enforcement
 * limits are derived by `PLAN_LIMITS` below; a plan may set `conversationsLimit`
 * when the enforced cap differs from the advertised "included" number (e.g.
 * Enterprise bills overage rather than hard-blocking). `knowledgeSources`,
 * `leads`, and `trialDays` are enforcement-only fields consumed by the gateway.
 *
 * ⚠️ Keep advertised === enforced. api/gateway.ts imports PLAN_LIMITS from here
 * so the two can't drift. Do not reintroduce a second limits table.
 */
export const PLANS = {
  [PlanType.FREE]: {
    price: 0,
    bots: 1,
    conversations: 250,
    knowledgeSources: 3,
    leads: 50,
    phoneMinutes: 0,
    trialDays: 0,
    name: 'Free',
    features: [
      'Drag-and-drop website widget',
      '1 bot with branded colors',
      '250 conversations/month',
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
    knowledgeSources: 10,
    leads: 500,
    phoneMinutes: 0,
    trialDays: 0,
    name: 'Starter',
    features: [
      'Website + landing page embeds',
      'Multi-page training (URLs, PDFs)',
      '750 conversations/month',
      '500MB knowledge base storage',
      'MiniMax M3 reasoning model',
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
    knowledgeSources: 50,
    leads: 5000,
    phoneMinutes: 0,
    trialDays: 0,
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
    knowledgeSources: 200,
    leads: 50000,
    // No phone-minutes figure was ever published anywhere (marketing copy
    // just says "Voice & phone agent included" with no number) — this is a
    // placeholder pending a real decision, not a previously-advertised value.
    phoneMinutes: 500,
    trialDays: 0,
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
    conversations: 50000, // included; billed overage beyond this
    conversationsLimit: 999999, // enforcement cap (overage billed, not blocked)
    knowledgeSources: 999,
    leads: 999999,
    // Same caveat as Executive — placeholder pending a real published figure.
    phoneMinutes: 2000,
    phoneMinutesOverage: 0.1, // $ per overage minute, billed not blocked
    trialDays: 0,
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

/**
 * Standalone voice/phone-agent plans — purchasable on their own regardless
 * of chatbot plan tier (Free through Professional don't include phone
 * minutes at all), and also bundled for free into Executive/Enterprise
 * (see PLANS[EXECUTIVE/ENTERPRISE].phoneMinutes above). A user's effective
 * phone-minutes limit is whichever is higher: their standalone voice plan
 * (if any) or their chatbot plan's bundled amount — see
 * getPhoneMinutesLimit() in api/gateway.ts.
 *
 * ⚠️ Same caveat as the bundled figures above: these numbers are not
 * previously-published prices, they're a starting point pending a real
 * pricing decision.
 */
/**
 * ⚠️ SINGLE SOURCE OF TRUTH for standalone voice/receptionist pricing.
 *
 * Before P1 there were three disagreeing tables: VOICE_PLANS ($49/$129/$199),
 * VOICE_AGENT_PRICING ($79/$174/$279/$549) and hard-coded tiers on the landing
 * page ($79/$174/$279). The published prices (VOICE_AGENT_PRICING, which the
 * live pricing page renders) are now authoritative; every other table and the
 * marketing pages derive from this object.
 *
 * `stripePriceEnv` names the env var holding the Stripe Price ID for that tier,
 * so checkout can never be handed a client-supplied price. Stripe products must
 * also carry metadata.planKey matching these keys (api/stripe-webhook.ts
 * resolves entitlements from product metadata).
 */
export const VOICE_PLANS = {
  VOICE_BASIC: {
    price: 79,
    minutes: 150,
    overagePerMinute: 0.5,
    name: 'Voice Basic',
    stripePriceEnv: 'STRIPE_PRICE_VOICE_BASIC',
  },
  VOICE_STANDARD: {
    price: 174,
    minutes: 450,
    overagePerMinute: 0.5,
    name: 'Voice Standard',
    stripePriceEnv: 'STRIPE_PRICE_VOICE_STANDARD',
  },
  VOICE_PROFESSIONAL: {
    price: 279,
    minutes: 1000,
    overagePerMinute: 0.5,
    name: 'Voice Professional',
    stripePriceEnv: 'STRIPE_PRICE_VOICE_PROFESSIONAL',
  },
  VOICE_ENTERPRISE: {
    price: 549,
    minutes: 2500,
    overagePerMinute: 0.5,
    name: 'Voice Enterprise',
    stripePriceEnv: 'STRIPE_PRICE_VOICE_ENTERPRISE',
  },
};

/**
 * Backend enforcement limits, derived from PLANS so advertised === enforced.
 * Shape matches what api/gateway.ts getPlanLimits() / checkQuota() expect.
 * Keyed by upper-case plan key (PlanType values are already upper-case).
 */
export const PLAN_LIMITS: Record<
  string,
  {
    bots: number;
    conversations_per_month: number;
    knowledge_sources: number;
    leads: number;
    phone_minutes: number;
    trial_days: number;
  }
> = Object.fromEntries(
  Object.entries(PLANS).map(([key, plan]) => [
    key.toUpperCase(),
    {
      bots: plan.bots,
      conversations_per_month:
        'conversationsLimit' in plan
          ? (plan as { conversationsLimit: number }).conversationsLimit
          : plan.conversations,
      knowledge_sources: plan.knowledgeSources,
      leads: plan.leads,
      phone_minutes: 'phoneMinutes' in plan ? plan.phoneMinutes : 0,
      trial_days: plan.trialDays,
    },
  ]),
);

/**
 * Human-readable pricing line for LLM prompts (AI voice/chat agents), generated
 * from PLANS so the AI never quotes stale prices. Free is labelled $0.
 */
export function formatPricingForPrompt(): string {
  return Object.values(PLANS)
    .map((p) => `${p.name} $${p.price}/mo`)
    .join(', ');
}

export const RESELLER_TIERS = [
  { min: 0, max: 49, commission: 0.2, label: 'Bronze' },
  { min: 50, max: 149, commission: 0.3, label: 'Silver' },
  { min: 150, max: 250, commission: 0.4, label: 'Gold' },
  { min: 251, max: 999999, commission: 0.5, label: 'Platinum' },
];

/** Affiliate program: 20% lifetime commission on referred accounts */
export const AFFILIATE_COMMISSION = {
  rate: 0.2,
  label: '20% Lifetime',
  description: 'Earn 20% of every referred account subscription — for life.',
  minPayoutCents: 2500, // $25 minimum payout
  payoutFrequency: 'monthly',
};

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

/**
 * Commission sustainability safeguard.
 *
 * Added 2026-07-07: the commission calculation in server/routes/partners.ts
 * previously paid RESELLER_TIERS / WHITELABEL_FEE / AFFILIATE_COMMISSION
 * rates against raw gross plan price, with zero awareness of the variable
 * AI cost (OpenAI + Cartesia + Twilio) that plan actually carries. At full
 * conversation-quota utilization, that math goes net-negative on the
 * Executive tier and thin-to-negative on Enterprise -- see
 * PAYOUT_SUSTAINABILITY_AUDIT.md for the full derivation. This block adds
 * the cost model + a hard cap so no payout can be computed that exceeds a
 * safe share of estimated per-plan margin, without changing the advertised
 * commission tiers/rates themselves.
 *
 * COST_PER_CONVERSATION_ESTIMATE_USD is a blended estimate (chat completion
 * input+output tokens on gpt-4o-mini-class pricing + a trivial embedding
 * call for RAG retrieval), priced at real OpenAI list rates as of July 2026
 * ($0.40/1M input, $1.60/1M output, $0.02/1M embedding tokens), assuming
 * ~9,000 input + ~900 output tokens per conversation with a buffer. This is
 * an ESTIMATE, not a measurement -- there is no real conversation volume in
 * production yet to calibrate against (see audit doc). Revisit once real
 * usage data exists; a scheduled job re-deriving this from actual OpenAI
 * billing + conversation counts would replace the hardcoded estimate below.
 */
export const COST_PER_CONVERSATION_ESTIMATE_USD = 0.008;

/** Cap payouts at this share of estimated gross margin (price minus
 * estimated AI cost at full quota utilization), leaving the remainder for
 * hosting/support/overhead. Deliberately conservative -- worst-case quota
 * utilization is the stress test, not the expected case. */
export const MAX_COMMISSION_SHARE_OF_MARGIN = 0.7;

/** Estimate variable AI cost for a plan at full conversation-quota
 * utilization -- the worst case a payout safeguard needs to survive. */
export function estimatePlanVariableCostUsd(plan: keyof typeof PLANS): number {
  const conversations = PLANS[plan]?.conversations || 0;
  return conversations * COST_PER_CONVERSATION_ESTIMATE_USD;
}

/** Estimated gross margin for a plan at full quota utilization (can be
 * negative -- that's the point of surfacing it). */
export function estimatePlanMarginUsd(plan: keyof typeof PLANS): number {
  const price = PLANS[plan]?.price || 0;
  return price - estimatePlanVariableCostUsd(plan);
}

/** Cap a computed commission dollar amount so it can never exceed
 * MAX_COMMISSION_SHARE_OF_MARGIN of the plan's estimated margin. Returns
 * both the capped amount and whether capping actually happened, so callers
 * can log/flag it rather than silently changing numbers a rep might expect. */
export function applyCommissionSafeguard(
  plan: keyof typeof PLANS,
  computedCommissionUsd: number,
): {
  cappedCommissionUsd: number;
  wasCapped: boolean;
  estimatedMarginUsd: number;
} {
  const estimatedMarginUsd = estimatePlanMarginUsd(plan);
  const maxSafeCommissionUsd =
    Math.max(0, estimatedMarginUsd) * MAX_COMMISSION_SHARE_OF_MARGIN;
  const cappedCommissionUsd = Math.min(
    computedCommissionUsd,
    maxSafeCommissionUsd,
  );
  return {
    cappedCommissionUsd,
    wasCapped: cappedCommissionUsd < computedCommissionUsd,
    estimatedMarginUsd,
  };
}

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

/**
 * Models the backend can ACTUALLY route to. Production inference goes through
 * OpenRouter (api/ai-team/lib.ts PROVIDER_CONFIG); the previous
 * 'grok-4-1-fast-reasoning' / 'gpt-4o' entries were dead options — selecting
 * them silently fell back to the default provider.
 */
export const AVAILABLE_MODELS = [
  {
    id: 'openrouter-minimax-m3',
    name: 'MiniMax M3',
    description:
      'Fast, high-quality general reasoning. Recommended for most chatbots.',
  },
  {
    id: 'openrouter-nemotron-ultra',
    name: 'Nemotron Ultra',
    description: 'Larger model used as automatic fallback for complex answers.',
  },
];

export const DEFAULT_CHAT_MODEL = 'openrouter-minimax-m3';

// Display-layer view of VOICE_PLANS — feature copy only. Prices and minutes
// are derived so the pricing page can never drift from what is charged.
const VOICE_PLAN_FEATURES: Record<string, string[]> = {
  VOICE_BASIC: [
    'Cartesia ultra-realistic voice',
    'Basic call routing',
    'Call transcripts',
    'Email support',
  ],
  VOICE_STANDARD: [
    'All Cartesia voices',
    'Advanced call routing',
    'Call transfers',
    'Scheduling workflows',
    'Analytics dashboard',
  ],
  VOICE_PROFESSIONAL: [
    'CRM integration',
    'Call transfers & scheduling',
    'Advanced analytics',
    'Priority routing rules',
    'API webhooks',
  ],
  VOICE_ENTERPRISE: [
    'Multi-language support',
    'Dedicated priority support',
    'White-label ready',
    'Full API access',
    'Custom integrations',
  ],
};

export const VOICE_AGENT_PRICING = Object.entries(VOICE_PLANS).map(
  ([key, plan]) => ({
    id: key.toLowerCase(),
    planKey: key,
    name: plan.name,
    price: plan.price,
    minutesIncluded: plan.minutes,
    overagePerMinute: plan.overagePerMinute,
    features: [
      `${plan.minutes.toLocaleString()} minutes/month`,
      ...(VOICE_PLAN_FEATURES[key] || []),
      `$${plan.overagePerMinute.toFixed(2)}/min overage`,
    ],
  }),
);

/**
 * Standalone SMS marketing add-on -- flat monthly tiers, purchasable
 * regardless of chatbot/voice plan (mirrors the VOICE_PLANS pattern above).
 * Requires the tenant to complete 10DLC brand+campaign registration
 * (api/sms/register.ts) before sending is unlocked -- see SmsMarketing.tsx.
 *
 * NOT YET PUBLISHED anywhere -- no route links to the page that renders
 * this yet (Don's call, 2026-09-04: build it now, keep it unpublished until
 * a real Telnyx account + registration flow is verified end-to-end).
 *
 * `stripePriceEnv` follows the same convention as VOICE_PLANS -- checkout
 * resolves the real Stripe Price ID server-side, never trusts a
 * client-supplied price.
 */
export const SMS_MARKETING_PLANS = {
  SMS_STARTER: {
    price: 39,
    messagesIncluded: 1000,
    overagePerMessage: 0.02,
    name: 'SMS Marketing Starter',
    stripePriceEnv: 'STRIPE_PRICE_SMS_STARTER',
  },
  SMS_GROWTH: {
    price: 99,
    messagesIncluded: 5000,
    overagePerMessage: 0.018,
    name: 'SMS Marketing Growth',
    stripePriceEnv: 'STRIPE_PRICE_SMS_GROWTH',
  },
  SMS_SCALE: {
    price: 249,
    messagesIncluded: 20000,
    overagePerMessage: 0.015,
    name: 'SMS Marketing Scale',
    stripePriceEnv: 'STRIPE_PRICE_SMS_SCALE',
  },
};

export const SMS_MARKETING_PRICING = Object.entries(SMS_MARKETING_PLANS).map(
  ([key, plan]) => ({
    id: key.toLowerCase(),
    planKey: key,
    name: plan.name,
    price: plan.price,
    messagesIncluded: plan.messagesIncluded,
    overagePerMessage: plan.overagePerMessage,
    features: [
      `${plan.messagesIncluded.toLocaleString()} messages/month`,
      'Two-way SMS marketing campaigns',
      'Built-in opt-out (STOP/HELP) compliance',
      `$${plan.overagePerMessage.toFixed(3)}/msg overage`,
    ],
  }),
);

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

// ─── Annual Plan Pricing (2 months free = 17% discount) ─────────────
export const ANNUAL_PLAN_PRICING = {
  [PlanType.STARTER]: {
    monthly: 29,
    annual: 290, // $24.17/mo effective — save $58
    savingsPercent: 17,
  },
  [PlanType.PROFESSIONAL]: {
    monthly: 99,
    annual: 990, // $82.50/mo effective — save $198
    savingsPercent: 17,
  },
  [PlanType.EXECUTIVE]: {
    monthly: 199,
    annual: 1990, // $165.83/mo effective — save $398
    savingsPercent: 17,
  },
  [PlanType.ENTERPRISE]: {
    monthly: 499,
    annual: 4990, // $415.83/mo effective — save $998
    savingsPercent: 17,
  },
};

// ─── Premium Recurring Add-Ons (monthly recurring = recurring commissions) ──
export const PREMIUM_ADDONS = [
  {
    id: 'addon_advanced_analytics',
    name: 'Advanced Analytics Pro',
    price: 49,
    interval: 'month',
    category: 'analytics',
    description:
      'Deep conversion funnels, heatmaps, A/B testing dashboards, and ROI attribution across all bots.',
    features: [
      'Multi-touch attribution modeling',
      'Conversion funnel analysis',
      'Real-time visitor heatmaps',
      'A/B test management & reporting',
      'Custom report builder',
      'Scheduled email reports',
      'Google Analytics 4 integration',
    ],
    applicablePlans: ['STARTER', 'PROFESSIONAL', 'EXECUTIVE', 'ENTERPRISE'],
    popular: true,
  },
  {
    id: 'addon_multilanguage',
    name: 'Multi-Language Pack',
    price: 39,
    interval: 'month',
    category: 'international',
    description:
      'Auto-detect visitor language and respond in 40+ languages with native-quality translations.',
    features: [
      '40+ supported languages',
      'Auto-detect visitor language',
      'Translated knowledge base',
      'Localized lead capture forms',
      'RTL language support (Arabic, Hebrew)',
      'Language-specific analytics',
    ],
    applicablePlans: ['PROFESSIONAL', 'EXECUTIVE', 'ENTERPRISE'],
    popular: false,
  },
  {
    id: 'addon_ecommerce',
    name: 'E-Commerce Suite',
    price: 79,
    interval: 'month',
    category: 'integrations',
    description:
      'Connect Shopify, WooCommerce, or BigCommerce. Product recommendations, cart recovery, and order tracking inside the chat.',
    features: [
      'Shopify / WooCommerce / BigCommerce sync',
      'Product recommendation engine',
      'Abandoned cart recovery messages',
      'Order status lookup in chat',
      'Upsell & cross-sell automation',
      'Revenue attribution per bot',
      'Inventory-aware responses',
    ],
    applicablePlans: ['PROFESSIONAL', 'EXECUTIVE', 'ENTERPRISE'],
    popular: true,
  },
  {
    id: 'addon_appointment_pro',
    name: 'Appointment Scheduling Pro',
    price: 49,
    interval: 'month',
    category: 'scheduling',
    description:
      'Let visitors book appointments directly in chat. Syncs with Google Calendar, Outlook, and Calendly.',
    features: [
      'In-chat booking widget',
      'Google Calendar & Outlook sync',
      'Calendly / Cal.com integration',
      'Automated reminders (SMS + email)',
      'Buffer time & availability rules',
      'Round-robin team scheduling',
      'No-show follow-up automation',
    ],
    applicablePlans: ['STARTER', 'PROFESSIONAL', 'EXECUTIVE', 'ENTERPRISE'],
    popular: true,
  },
  {
    id: 'addon_social_responder',
    name: 'Social Media Auto-Responder',
    price: 59,
    interval: 'month',
    category: 'social',
    description:
      'Extend your AI bot to Facebook Messenger, Instagram DMs, WhatsApp Business, and Telegram.',
    features: [
      'Facebook Messenger integration',
      'Instagram DM auto-replies',
      'WhatsApp Business API',
      'Telegram bot connector',
      'Unified inbox for all channels',
      'Channel-specific response rules',
      'Cross-channel lead tracking',
    ],
    applicablePlans: ['PROFESSIONAL', 'EXECUTIVE', 'ENTERPRISE'],
    popular: true,
  },
  {
    id: 'addon_crm_pro',
    name: 'CRM Power Suite',
    price: 69,
    interval: 'month',
    category: 'integrations',
    description:
      'Deep 2-way sync with Salesforce, HubSpot, Pipedrive, and Zoho. Auto-create deals and contacts from chat leads.',
    features: [
      'Salesforce bi-directional sync',
      'HubSpot deals & contacts',
      'Pipedrive pipeline automation',
      'Zoho CRM integration',
      'Auto-create contacts from leads',
      'Deal stage automation',
      'Custom field mapping',
      'Activity timeline in CRM',
    ],
    applicablePlans: ['PROFESSIONAL', 'EXECUTIVE', 'ENTERPRISE'],
    popular: false,
  },
  {
    id: 'addon_compliance',
    name: 'HIPAA & Compliance Pack',
    price: 149,
    interval: 'month',
    category: 'security',
    description:
      'HIPAA-ready configuration, BAA agreement, SOC 2 audit logs, data encryption at rest, and custom data retention policies.',
    features: [
      'HIPAA-compliant data handling',
      'Business Associate Agreement (BAA)',
      'SOC 2 Type II audit trail',
      'End-to-end encryption at rest',
      'Custom data retention policies',
      'PII auto-redaction in logs',
      'Compliance dashboard & reports',
      'Dedicated compliance support',
    ],
    applicablePlans: ['EXECUTIVE', 'ENTERPRISE'],
    popular: false,
  },
  {
    id: 'addon_priority_support',
    name: 'Priority Support & SLA',
    price: 99,
    interval: 'month',
    category: 'support',
    description:
      '4-hour response SLA, dedicated Slack channel, monthly strategy calls, and priority bug fixes.',
    features: [
      '4-hour response time SLA',
      'Dedicated Slack support channel',
      'Monthly strategy calls',
      'Priority bug fixes & updates',
      'Direct engineer escalation',
      'Custom feature requests (prioritized)',
      'Quarterly business review',
    ],
    applicablePlans: ['STARTER', 'PROFESSIONAL', 'EXECUTIVE', 'ENTERPRISE'],
    popular: false,
  },
  {
    id: 'addon_white_label_lite',
    name: 'White-Label Lite',
    price: 99,
    interval: 'month',
    category: 'branding',
    description:
      'Remove BuildMyBot branding. Custom logo, colors, and email domain for the chat widget and lead notifications.',
    features: [
      'Remove "Powered by BuildMyBot"',
      'Custom widget logo & icon',
      'Custom color scheme',
      'Branded email notifications',
      'Custom email sender domain',
      'Branded PDF reports',
    ],
    applicablePlans: ['PROFESSIONAL', 'EXECUTIVE', 'ENTERPRISE'],
    popular: false,
  },
  {
    id: 'addon_lead_nurture',
    name: 'Lead Nurture Automation',
    price: 59,
    interval: 'month',
    category: 'automation',
    description:
      'Automated drip campaigns, follow-up sequences, and re-engagement flows triggered by chat interactions.',
    features: [
      'Multi-step drip campaigns',
      'Behavior-triggered sequences',
      'Email + SMS follow-up automation',
      'Re-engagement flows for cold leads',
      'Lead scoring adjustments per action',
      'Personalized message templates',
      'Campaign performance analytics',
    ],
    applicablePlans: ['PROFESSIONAL', 'EXECUTIVE', 'ENTERPRISE'],
    popular: true,
  },
  {
    id: 'addon_ai_training_pro',
    name: 'AI Training Studio',
    price: 39,
    interval: 'month',
    category: 'ai',
    description:
      'Fine-tune bot responses, review & correct conversation logs, and build custom training datasets from real interactions.',
    features: [
      'Conversation review & correction',
      'Custom training dataset builder',
      'Response quality scoring',
      'Tone & style fine-tuning',
      'Industry-specific vocabulary',
      'Continuous learning from feedback',
      'Training performance reports',
    ],
    applicablePlans: ['STARTER', 'PROFESSIONAL', 'EXECUTIVE', 'ENTERPRISE'],
    popular: false,
  },
  {
    id: 'addon_dedicated_manager',
    name: 'Dedicated Success Manager',
    price: 299,
    interval: 'month',
    category: 'support',
    description:
      'Personal account manager with weekly calls, custom bot optimization, and proactive growth strategy.',
    features: [
      'Named account manager',
      'Weekly strategy calls',
      'Custom bot optimization',
      'Proactive performance reviews',
      'Growth strategy planning',
      'Priority feature influence',
      'Quarterly ROI analysis',
      'Annual account health audit',
    ],
    applicablePlans: ['EXECUTIVE', 'ENTERPRISE'],
    popular: false,
  },
];

// ─── High-Ticket One-Time Services (big commission payouts) ─────────
export const PREMIUM_SERVICES = [
  {
    id: 'svc_custom_bot_dev',
    name: 'Custom Bot Development',
    priceTiers: [
      {
        id: 'custom_bot_standard',
        name: 'Standard Custom Bot',
        price: 2999,
        description:
          'Custom-built AI bot with specialized workflows and integrations',
        deliveryDays: 14,
        includes: [
          '1 custom AI bot',
          'Up to 5 custom workflows',
          '2 third-party integrations',
          'Custom training on your data',
          '30-day support & revisions',
        ],
      },
      {
        id: 'custom_bot_advanced',
        name: 'Advanced Custom Bot',
        price: 5999,
        description: 'Multi-bot system with complex logic, APIs, and custom UI',
        deliveryDays: 21,
        includes: [
          'Up to 3 interconnected bots',
          'Unlimited custom workflows',
          '5 third-party integrations',
          'Custom API development',
          'Branded chat UI design',
          '60-day support & revisions',
        ],
      },
      {
        id: 'custom_bot_enterprise',
        name: 'Enterprise Bot Suite',
        price: 14999,
        description: 'Full enterprise AI deployment with dedicated team',
        deliveryDays: 45,
        includes: [
          'Unlimited bots & workflows',
          'Custom AI model fine-tuning',
          'Full system integrations',
          'Custom dashboard development',
          'On-site or virtual training',
          'Dedicated project manager',
          '90-day support & revisions',
          'SLA-backed performance guarantees',
        ],
      },
    ],
  },
  {
    id: 'svc_integration_dev',
    name: 'Custom Integration Development',
    priceTiers: [
      {
        id: 'integration_single',
        name: 'Single Integration',
        price: 1499,
        description: 'Connect BuildMyBot to any third-party system',
        deliveryDays: 7,
        includes: [
          '1 custom API integration',
          'Bi-directional data sync',
          'Error handling & retry logic',
          'Documentation & testing',
          '14-day support',
        ],
      },
      {
        id: 'integration_multi',
        name: 'Integration Bundle (3-5)',
        price: 3999,
        description: 'Multiple integrations built as a unified system',
        deliveryDays: 14,
        includes: [
          '3-5 custom integrations',
          'Unified data pipeline',
          'Webhook orchestration',
          'Dashboard for monitoring',
          'Full documentation',
          '30-day support',
        ],
      },
    ],
  },
  {
    id: 'svc_migration',
    name: 'Bot Migration Service',
    priceTiers: [
      {
        id: 'migration_basic',
        name: 'Basic Migration',
        price: 999,
        description: 'Migrate from another chatbot platform to BuildMyBot',
        deliveryDays: 5,
        includes: [
          'Platform audit & assessment',
          'Data export & import',
          'Conversation history migration',
          'Knowledge base transfer',
          'Testing & validation',
        ],
      },
      {
        id: 'migration_full',
        name: 'Full Migration + Optimization',
        price: 2499,
        description: 'Complete migration with performance optimization',
        deliveryDays: 10,
        includes: [
          'Everything in Basic Migration',
          'Workflow optimization',
          'Response quality improvement',
          'Integration re-wiring',
          'Staff training session',
          'Performance benchmarking',
        ],
      },
    ],
  },
  {
    id: 'svc_strategy',
    name: 'AI Strategy Consulting',
    priceTiers: [
      {
        id: 'strategy_session',
        name: 'Strategy Session (2 hr)',
        price: 499,
        description:
          'Expert consultation on AI chatbot strategy for your business',
        deliveryDays: 3,
        includes: [
          '2-hour strategy session',
          'Competitive analysis',
          'Bot architecture recommendations',
          'ROI projection model',
          'Recording & action items',
        ],
      },
      {
        id: 'strategy_roadmap',
        name: 'Full AI Roadmap',
        price: 2999,
        description:
          'Complete AI automation strategy with implementation roadmap',
        deliveryDays: 14,
        includes: [
          'Business process audit',
          'AI opportunity analysis',
          'Detailed implementation roadmap',
          'Technology stack recommendations',
          'Budget & timeline planning',
          'Monthly advisory calls (3 months)',
        ],
      },
    ],
  },
  {
    id: 'svc_training',
    name: 'Staff Training Packages',
    priceTiers: [
      {
        id: 'training_team',
        name: 'Team Training',
        price: 999,
        description: 'Train your team to manage and optimize BuildMyBot',
        deliveryDays: 5,
        includes: [
          '4-hour live training session',
          'Recorded for future reference',
          'Custom training materials',
          'Bot management certification',
          'Q&A follow-up session',
        ],
      },
      {
        id: 'training_enterprise',
        name: 'Enterprise Training Program',
        price: 4999,
        description: 'Comprehensive training program for large teams',
        deliveryDays: 21,
        includes: [
          'Multi-day training program',
          'Role-based curriculum',
          'Hands-on workshops',
          'Admin & developer tracks',
          'Certification program',
          'Train-the-trainer module',
          'Ongoing learning resources',
        ],
      },
    ],
  },
  {
    id: 'svc_conversion_audit',
    name: 'Conversion Optimization Audit',
    priceTiers: [
      {
        id: 'audit_standard',
        name: 'Standard Audit',
        price: 1499,
        description:
          'Deep-dive audit of your bot performance and conversion rates',
        deliveryDays: 7,
        includes: [
          'Conversation flow analysis',
          'Drop-off point identification',
          'Response quality scoring',
          'Lead capture optimization',
          'Actionable recommendations report',
          'Implementation support call',
        ],
      },
      {
        id: 'audit_premium',
        name: 'Premium Audit + Implementation',
        price: 3999,
        description: 'Full audit plus we implement all recommendations',
        deliveryDays: 14,
        includes: [
          'Everything in Standard Audit',
          'Full implementation of changes',
          'A/B test setup',
          '30-day performance tracking',
          'Follow-up optimization round',
          'ROI impact report',
        ],
      },
    ],
  },
];

// ─── Commission Accelerators & Bonuses ──────────────────────────────
export const COMMISSION_ACCELERATORS = {
  // Base commission on add-ons (same as plan tier)
  addonCommissionMatch: true, // Add-ons pay the same commission % as the agent's current tier

  // Annual plan upsell bonus: extra 5% commission on annual deals
  annualUpsellBonus: 0.05,

  // One-time services commission rate (flat rate regardless of tier)
  servicesCommission: 0.25, // 25% on all one-time services

  // Voice plan commission rate (same as base tier)
  voiceCommissionMatch: true,

  // Revenue milestone bonuses (one-time bonus payouts)
  milestones: [
    {
      id: 'milestone_5k',
      label: 'Rising Star',
      revenueTarget: 5000,
      bonus: 500,
      badge: '⭐',
      description:
        'Earn $500 bonus when you generate $5K in monthly recurring revenue',
    },
    {
      id: 'milestone_10k',
      label: 'Sales Pro',
      revenueTarget: 10000,
      bonus: 1500,
      badge: '🌟',
      description: 'Earn $1,500 bonus when you hit $10K MRR',
    },
    {
      id: 'milestone_25k',
      label: 'Elite Closer',
      revenueTarget: 25000,
      bonus: 5000,
      badge: '💎',
      description: 'Earn $5,000 bonus when you hit $25K MRR',
    },
    {
      id: 'milestone_50k',
      label: 'Top Producer',
      revenueTarget: 50000,
      bonus: 15000,
      badge: '🏆',
      description: 'Earn $15,000 bonus when you hit $50K MRR',
    },
    {
      id: 'milestone_100k',
      label: 'Legend',
      revenueTarget: 100000,
      bonus: 40000,
      badge: '👑',
      description:
        "Earn $40,000 bonus when you hit $100K MRR. You're a legend.",
    },
  ],

  // Deal spiffs (limited-time bonuses)
  spiffs: [
    {
      id: 'spiff_enterprise_close',
      name: 'Enterprise Close Spiff',
      bonus: 1000,
      condition: 'Close any Enterprise plan ($499/mo)',
      recurring: false,
    },
    {
      id: 'spiff_voice_bundle',
      name: 'Voice Bundle Spiff',
      bonus: 250,
      condition: 'Sell any plan + Voice add-on in the same deal',
      recurring: false,
    },
    {
      id: 'spiff_annual_deal',
      name: 'Annual Lock-In Spiff',
      bonus: 500,
      condition: 'Close any annual Professional plan or higher',
      recurring: false,
    },
    {
      id: 'spiff_multi_addon',
      name: 'Stack Master Spiff',
      bonus: 200,
      condition: 'Client subscribes to 3+ add-ons simultaneously',
      recurring: false,
    },
    {
      id: 'spiff_custom_service',
      name: 'Big Ticket Spiff',
      bonus: 500,
      condition: 'Sell any custom service over $5,000',
      recurring: false,
    },
  ],

  // Earnings examples for sales page
  earningsExamples: [
    {
      scenario: 'Starter Agent',
      description: '10 Starter clients ($29/mo each)',
      monthlyRevenue: 290,
      commissionRate: 0.2,
      monthlyEarnings: 58,
      annualEarnings: 696,
    },
    {
      scenario: 'Growing Agent',
      description:
        '20 Professional clients ($99/mo) + 10 with add-ons ($49 avg)',
      monthlyRevenue: 2470,
      commissionRate: 0.2,
      monthlyEarnings: 494,
      annualEarnings: 5928,
    },
    {
      scenario: 'Silver Agent',
      description: '60 mixed clients + voice plans + add-ons',
      monthlyRevenue: 8900,
      commissionRate: 0.3,
      monthlyEarnings: 2670,
      annualEarnings: 32040,
    },
    {
      scenario: 'Gold Agent',
      description: '175 clients across all tiers + services',
      monthlyRevenue: 22000,
      commissionRate: 0.4,
      monthlyEarnings: 8800,
      annualEarnings: 105600,
    },
    {
      scenario: 'Platinum Partner',
      description:
        '300+ clients, enterprise deals, white-label, custom services',
      monthlyRevenue: 65000,
      commissionRate: 0.5,
      monthlyEarnings: 32500,
      annualEarnings: 390000,
    },
  ],
};

// ─── Sales Agent Incentive Tiers (enhanced) ─────────────────────────
export const SALES_AGENT_TIERS = [
  {
    tier: 'Bronze',
    clients: '0-49',
    baseCommission: '20%',
    addonCommission: '20%',
    servicesCommission: '25%',
    perks: [
      'Partner dashboard access',
      'Marketing materials library',
      'Referral link & tracking',
      'Email support',
    ],
  },
  {
    tier: 'Silver',
    clients: '50-149',
    baseCommission: '30%',
    addonCommission: '30%',
    servicesCommission: '25%',
    perks: [
      'Everything in Bronze',
      'Co-branded landing pages',
      'Priority lead routing',
      'Monthly strategy call',
      'Custom promo codes',
    ],
  },
  {
    tier: 'Gold',
    clients: '150-250',
    baseCommission: '40%',
    addonCommission: '40%',
    servicesCommission: '25%',
    perks: [
      'Everything in Silver',
      'Dedicated partner manager',
      'Early access to new features',
      'Custom pricing for clients',
      'Quarterly business review',
      'Conference sponsorship credits',
    ],
  },
  {
    tier: 'Platinum',
    clients: '251+',
    baseCommission: '50%',
    addonCommission: '50%',
    servicesCommission: '25%',
    perks: [
      'Everything in Gold',
      'White-label platform option',
      'Custom feature development',
      'Revenue share on client add-ons',
      'VIP support line',
      'Annual retreat invitation',
      'Advisory board membership',
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
