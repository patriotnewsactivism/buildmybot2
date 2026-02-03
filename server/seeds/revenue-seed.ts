import { fileURLToPath } from 'node:url';
import { v4 as uuid } from 'uuid';
import {
  billingPlans,
  creditPackages,
  planFeatures,
  serviceOfferings,
  voiceMinutesPackages,
} from '../../shared/billing-schema';
import { db } from '../db';

export async function seedRevenueTables() {
  console.log('Seeding revenue tables...');

  const starterPlanId = uuid();
  const proPlanId = uuid();
  const enterprisePlanId = uuid();

  await db
    .insert(billingPlans)
    .values([
      {
        id: uuid(),
        name: 'Free',
        description: 'Get started with basic features',
        planType: 'free',
        priceCentsMonthly: 0,
        priceCentsYearly: 0,
        features: [
          '1 Bot',
          '100 conversations/mo',
          'Community support',
          'Basic analytics',
        ],
        isActive: true,
        sortOrder: 0,
      },
      {
        id: starterPlanId,
        name: 'Starter',
        description: 'Perfect for small businesses',
        planType: 'starter',
        priceCentsMonthly: 4900,
        priceCentsYearly: 47000,
        features: [
          '3 Bots',
          '1,000 conversations/mo',
          'Email support',
          'Standard analytics',
          'Lead capture',
        ],
        isActive: true,
        sortOrder: 1,
      },
      {
        id: proPlanId,
        name: 'Professional',
        description: 'Advanced features for growing teams',
        planType: 'professional',
        priceCentsMonthly: 9900,
        priceCentsYearly: 95000,
        features: [
          '10 Bots',
          '10,000 conversations/mo',
          'Priority support',
          'Advanced analytics',
          'White-label branding',
          'API access',
          'Voice agent',
        ],
        isActive: true,
        isPopular: true,
        sortOrder: 2,
      },
      {
        id: enterprisePlanId,
        name: 'Enterprise',
        description: 'Custom solutions for large organizations',
        planType: 'enterprise',
        priceCentsMonthly: 29900,
        priceCentsYearly: 287000,
        features: [
          'Unlimited Bots',
          'Unlimited conversations',
          'Dedicated support',
          'Custom analytics',
          'White-label branding',
          'Full API access',
          'Voice agent',
          'Custom integrations',
          'SLA guarantee',
        ],
        isActive: true,
        sortOrder: 3,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(planFeatures)
    .values([
      {
        id: uuid(),
        planId: starterPlanId,
        featureCode: 'max_bots',
        featureName: 'Maximum Bots',
        limitValue: 3,
        isEnabled: true,
      },
      {
        id: uuid(),
        planId: starterPlanId,
        featureCode: 'max_conversations',
        featureName: 'Max Conversations/Month',
        limitValue: 1000,
        isEnabled: true,
      },
      {
        id: uuid(),
        planId: proPlanId,
        featureCode: 'max_bots',
        featureName: 'Maximum Bots',
        limitValue: 10,
        isEnabled: true,
      },
      {
        id: uuid(),
        planId: proPlanId,
        featureCode: 'max_conversations',
        featureName: 'Max Conversations/Month',
        limitValue: 10000,
        isEnabled: true,
      },
      {
        id: uuid(),
        planId: proPlanId,
        featureCode: 'white_label',
        featureName: 'White-Label Branding',
        isEnabled: true,
      },
      {
        id: uuid(),
        planId: proPlanId,
        featureCode: 'api_access',
        featureName: 'API Access',
        isEnabled: true,
      },
      {
        id: uuid(),
        planId: proPlanId,
        featureCode: 'voice_agent',
        featureName: 'Voice Agent',
        isEnabled: true,
      },
      {
        id: uuid(),
        planId: proPlanId,
        featureCode: 'advanced_analytics',
        featureName: 'Advanced Analytics',
        isEnabled: true,
      },
      {
        id: uuid(),
        planId: enterprisePlanId,
        featureCode: 'max_bots',
        featureName: 'Maximum Bots',
        limitValue: 999,
        isEnabled: true,
      },
      {
        id: uuid(),
        planId: enterprisePlanId,
        featureCode: 'max_conversations',
        featureName: 'Max Conversations/Month',
        limitValue: 999999,
        isEnabled: true,
      },
      {
        id: uuid(),
        planId: enterprisePlanId,
        featureCode: 'white_label',
        featureName: 'White-Label Branding',
        isEnabled: true,
      },
      {
        id: uuid(),
        planId: enterprisePlanId,
        featureCode: 'api_access',
        featureName: 'API Access',
        isEnabled: true,
      },
      {
        id: uuid(),
        planId: enterprisePlanId,
        featureCode: 'voice_agent',
        featureName: 'Voice Agent',
        isEnabled: true,
      },
      {
        id: uuid(),
        planId: enterprisePlanId,
        featureCode: 'advanced_analytics',
        featureName: 'Advanced Analytics',
        isEnabled: true,
      },
      {
        id: uuid(),
        planId: enterprisePlanId,
        featureCode: 'priority_support',
        featureName: 'Priority Support SLA',
        isEnabled: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(voiceMinutesPackages)
    .values([
      {
        id: uuid(),
        name: 'Voice Basic',
        description: '150 minutes per month',
        minutes: 150,
        priceCents: 4900,
        isActive: true,
        sortOrder: 0,
      },
      {
        id: uuid(),
        name: 'Voice Standard',
        description: '450 minutes per month',
        minutes: 450,
        priceCents: 9900,
        isActive: true,
        isPopular: true,
        sortOrder: 1,
      },
      {
        id: uuid(),
        name: 'Voice Professional',
        description: '1,000 minutes per month',
        minutes: 1000,
        priceCents: 19900,
        isActive: true,
        sortOrder: 2,
      },
      {
        id: uuid(),
        name: 'Voice Enterprise',
        description: '2,500 minutes per month',
        minutes: 2500,
        priceCents: 39900,
        isActive: true,
        sortOrder: 3,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(creditPackages)
    .values([
      {
        id: uuid(),
        name: 'SMS Starter',
        description: '500 SMS credits',
        resourceType: 'sms_credits',
        credits: 500,
        priceCents: 2500,
        isActive: true,
        sortOrder: 0,
      },
      {
        id: uuid(),
        name: 'SMS Growth',
        description: '2,000 SMS credits',
        resourceType: 'sms_credits',
        credits: 2000,
        priceCents: 8000,
        isActive: true,
        isPopular: true,
        sortOrder: 1,
      },
      {
        id: uuid(),
        name: 'SMS Business',
        description: '5,000 SMS credits',
        resourceType: 'sms_credits',
        credits: 5000,
        priceCents: 15000,
        isActive: true,
        sortOrder: 2,
      },
      {
        id: uuid(),
        name: 'Email Starter',
        description: '1,000 email credits',
        resourceType: 'email_credits',
        credits: 1000,
        priceCents: 1500,
        isActive: true,
        sortOrder: 0,
      },
      {
        id: uuid(),
        name: 'Email Growth',
        description: '5,000 email credits',
        resourceType: 'email_credits',
        credits: 5000,
        priceCents: 5000,
        isActive: true,
        isPopular: true,
        sortOrder: 1,
      },
      {
        id: uuid(),
        name: 'Email Business',
        description: '25,000 email credits',
        resourceType: 'email_credits',
        credits: 25000,
        priceCents: 15000,
        isActive: true,
        sortOrder: 2,
      },
      {
        id: uuid(),
        name: 'Storage 1GB',
        description: '1GB additional storage',
        resourceType: 'storage_mb',
        credits: 1024,
        priceCents: 500,
        isActive: true,
        sortOrder: 0,
      },
      {
        id: uuid(),
        name: 'Storage 5GB',
        description: '5GB additional storage',
        resourceType: 'storage_mb',
        credits: 5120,
        priceCents: 2000,
        isActive: true,
        isPopular: true,
        sortOrder: 1,
      },
      {
        id: uuid(),
        name: 'Storage 20GB',
        description: '20GB additional storage',
        resourceType: 'storage_mb',
        credits: 20480,
        priceCents: 5000,
        isActive: true,
        sortOrder: 2,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(serviceOfferings)
    .values([
      {
        id: uuid(),
        name: 'Basic Setup',
        description: 'Single bot setup with a 10-page knowledge base',
        serviceType: 'onboarding',
        priceCents: 29900,
        deliveryDays: 3,
        features: [
          '1 bot configuration',
          'Up to 10 knowledge base pages',
          'Widget installation guide',
          'Launch checklist review',
        ],
        isActive: true,
        sortOrder: 0,
      },
      {
        id: uuid(),
        name: 'Standard Setup',
        description: 'Multi-bot setup with CRM integration',
        serviceType: 'onboarding',
        priceCents: 79900,
        deliveryDays: 5,
        features: [
          'Up to 3 bot configurations',
          'CRM integration setup',
          'Knowledge base buildout',
          'Website widget integration',
          'Team training session',
        ],
        isActive: true,
        sortOrder: 1,
      },
      {
        id: uuid(),
        name: 'Premium Setup',
        description: 'Advanced setup with voice agent and integrations',
        serviceType: 'onboarding',
        priceCents: 159900,
        deliveryDays: 10,
        features: [
          'Up to 10 bot configurations',
          'Voice agent setup',
          'API integrations',
          'Advanced routing & workflows',
          'Team training session',
        ],
        isActive: true,
        sortOrder: 2,
      },
      {
        id: uuid(),
        name: 'Enterprise Launch',
        description: 'White-glove launch with dedicated success manager',
        serviceType: 'onboarding',
        priceCents: 249900,
        deliveryDays: 14,
        features: [
          'Unlimited bot configurations',
          'Dedicated success manager',
          'Custom integrations',
          'White-label branding setup',
          'Launch plan & training',
        ],
        isActive: true,
        sortOrder: 3,
      },
      {
        id: uuid(),
        name: 'Industry Training',
        description: 'Train your bot on industry-specific knowledge',
        serviceType: 'training',
        priceCents: 49900,
        deliveryDays: 5,
        features: [
          'Industry research',
          'FAQ compilation',
          'Response optimization',
          'Sentiment tuning',
          'Quality assurance testing',
        ],
        isActive: true,
        sortOrder: 0,
      },
      {
        id: uuid(),
        name: 'Advanced Custom Training',
        description: 'Deep customization for complex use cases',
        serviceType: 'training',
        priceCents: 99900,
        deliveryDays: 10,
        features: [
          'Custom conversation flows',
          'Multi-language support',
          'Brand voice alignment',
          'A/B testing setup',
          'Performance optimization',
        ],
        isActive: true,
        sortOrder: 1,
      },
      {
        id: uuid(),
        name: 'Website Import',
        description: 'Import content from your existing website',
        serviceType: 'kb_import',
        priceCents: 19900,
        deliveryDays: 2,
        features: [
          'Up to 100 pages crawled',
          'Content extraction',
          'Chunk optimization',
          'Quality review',
        ],
        isActive: true,
        sortOrder: 0,
      },
      {
        id: uuid(),
        name: 'Document Migration',
        description: 'Bulk import of your documents',
        serviceType: 'kb_import',
        priceCents: 29900,
        deliveryDays: 3,
        features: [
          'Up to 50 documents',
          'PDF/DOCX processing',
          'OCR for scanned docs',
          'Content structuring',
        ],
        isActive: true,
        sortOrder: 1,
      },
      {
        id: uuid(),
        name: 'Custom Integration',
        description: 'Build custom integrations for your workflow',
        serviceType: 'custom',
        priceCents: 199900,
        deliveryDays: 14,
        features: [
          'Requirements analysis',
          'Custom API integration',
          'Testing & QA',
          'Documentation',
          'Ongoing support',
        ],
        isActive: true,
        sortOrder: 0,
      },
    ])
    .onConflictDoNothing();

  console.log('Revenue tables seeded successfully!');
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  seedRevenueTables()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
