import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  json,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  botTemplates,
  bots,
  organizations,
  supportTickets,
  users,
} from './schema';

export const planTypeEnum = pgEnum('plan_type', [
  'free',
  'starter',
  'professional',
  'enterprise',
  'custom',
]);
export const billingIntervalEnum = pgEnum('billing_interval', [
  'monthly',
  'yearly',
  'one_time',
]);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'canceled',
  'trialing',
  'paused',
]);
export const usageResourceEnum = pgEnum('usage_resource', [
  'voice_minutes',
  'sms_credits',
  'email_credits',
  'storage_mb',
  'api_calls',
]);
export const serviceTypeEnum = pgEnum('service_type', [
  'onboarding',
  'training',
  'kb_import',
  'template',
  'landing_page',
  'custom',
]);
export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'paid',
  'processing',
  'completed',
  'refunded',
  'canceled',
]);

export const billingPlans = pgTable('billing_plans', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  planType: varchar('plan_type', { length: 50 }).notNull(),
  priceCentsMonthly: integer('price_cents_monthly').default(0),
  priceCentsYearly: integer('price_cents_yearly').default(0),
  stripePriceIdMonthly: text('stripe_price_id_monthly'),
  stripePriceIdYearly: text('stripe_price_id_yearly'),
  features: json('features').default([]),
  isActive: boolean('is_active').default(true),
  isPopular: boolean('is_popular').default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const planFeatures = pgTable('plan_features', {
  id: text('id').primaryKey(),
  planId: text('plan_id')
    .notNull()
    .references(() => billingPlans.id, { onDelete: 'cascade' }),
  featureCode: varchar('feature_code', { length: 100 }).notNull(),
  featureName: varchar('feature_name', { length: 255 }).notNull(),
  limitValue: integer('limit_value'),
  limitType: varchar('limit_type', { length: 50 }),
  isEnabled: boolean('is_enabled').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const organizationSubscriptions = pgTable('organization_subscriptions', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  planId: text('plan_id')
    .notNull()
    .references(() => billingPlans.id),
  status: varchar('status', { length: 50 }).default('active'),
  billingInterval: varchar('billing_interval', { length: 20 }).default(
    'monthly',
  ),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripeCustomerId: text('stripe_customer_id'),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  trialEndsAt: timestamp('trial_ends_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const entitlements = pgTable('entitlements', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  featureCode: varchar('feature_code', { length: 100 }).notNull(),
  isEnabled: boolean('is_enabled').default(true),
  limitValue: integer('limit_value'),
  currentUsage: integer('current_usage').default(0),
  expiresAt: timestamp('expires_at'),
  sourceType: varchar('source_type', { length: 50 }),
  sourceId: text('source_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const usagePools = pgTable('usage_pools', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  resourceType: varchar('resource_type', { length: 50 }).notNull(),
  totalCredits: integer('total_credits').default(0),
  usedCredits: integer('used_credits').default(0),
  reservedCredits: integer('reserved_credits').default(0),
  resetsAt: timestamp('resets_at'),
  autoTopUp: boolean('auto_top_up').default(false),
  topUpThreshold: integer('top_up_threshold'),
  topUpAmount: integer('top_up_amount'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const usageLedger = pgTable('usage_ledger', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  poolId: text('pool_id').references(() => usagePools.id),
  resourceType: varchar('resource_type', { length: 50 }).notNull(),
  amount: integer('amount').notNull(),
  balanceAfter: integer('balance_after'),
  operationType: varchar('operation_type', { length: 50 }).notNull(),
  description: text('description'),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: text('reference_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const organizationBranding = pgTable('organization_branding', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  customDomain: varchar('custom_domain', { length: 255 }),
  domainVerified: boolean('domain_verified').default(false),
  logoUrl: text('logo_url'),
  faviconUrl: text('favicon_url'),
  primaryColor: varchar('primary_color', { length: 20 }).default('#3B82F6'),
  secondaryColor: varchar('secondary_color', { length: 20 }).default('#1E40AF'),
  accentColor: varchar('accent_color', { length: 20 }).default('#F97316'),
  companyName: varchar('company_name', { length: 255 }),
  supportEmail: varchar('support_email', { length: 255 }),
  customCss: text('custom_css'),
  hideBuiltWithBadge: boolean('hide_built_with_badge').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const voiceMinutesPackages = pgTable('voice_minutes_packages', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  minutes: integer('minutes').notNull(),
  priceCents: integer('price_cents').notNull(),
  stripePriceId: text('stripe_price_id'),
  isActive: boolean('is_active').default(true),
  isPopular: boolean('is_popular').default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const voiceCallLogs = pgTable('voice_call_logs', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  botId: text('bot_id').references(() => bots.id),
  callerId: varchar('caller_id', { length: 50 }),
  calleeId: varchar('callee_id', { length: 50 }),
  direction: varchar('direction', { length: 20 }),
  durationSeconds: integer('duration_seconds').default(0),
  minutesUsed: real('minutes_used').default(0),
  status: varchar('status', { length: 50 }),
  recordingUrl: text('recording_url'),
  transcriptUrl: text('transcript_url'),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 20 }).notNull(),
  scopes: json('scopes').default([]),
  rateLimitPerMin: integer('rate_limit_per_min').default(60),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').default(true),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const apiRequestLogs = pgTable('api_request_logs', {
  id: text('id').primaryKey(),
  apiKeyId: text('api_key_id').references(() => apiKeys.id),
  organizationId: text('organization_id').references(() => organizations.id),
  endpoint: varchar('endpoint', { length: 255 }),
  method: varchar('method', { length: 10 }),
  statusCode: integer('status_code'),
  responseTimeMs: integer('response_time_ms'),
  ipAddress: varchar('ip_address', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const serviceOfferings = pgTable('service_offerings', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  serviceType: varchar('service_type', { length: 50 }).notNull(),
  priceCents: integer('price_cents').notNull(),
  stripePriceId: text('stripe_price_id'),
  deliveryDays: integer('delivery_days').default(3),
  features: json('features').default([]),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const serviceOrders = pgTable('service_orders', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id),
  serviceId: text('service_id')
    .notNull()
    .references(() => serviceOfferings.id),
  status: varchar('status', { length: 50 }).default('pending'),
  pricePaidCents: integer('price_paid_cents'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  notes: text('notes'),
  deliveryNotes: text('delivery_notes'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const templatePurchases = pgTable('template_purchases', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id),
  templateId: text('template_id')
    .notNull()
    .references(() => botTemplates.id),
  pricePaidCents: integer('price_paid_cents'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const landingPages = pgTable('landing_pages', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  botId: text('bot_id').references(() => bots.id),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  headline: varchar('headline', { length: 255 }),
  subheadline: text('subheadline'),
  heroImageUrl: text('hero_image_url'),
  ctaText: varchar('cta_text', { length: 100 }).default('Get Started'),
  formFields: json('form_fields').default([]),
  thankYouMessage: text('thank_you_message'),
  customCss: text('custom_css'),
  seoTitle: varchar('seo_title', { length: 255 }),
  seoDescription: text('seo_description'),
  isPublished: boolean('is_published').default(false),
  viewCount: integer('view_count').default(0),
  conversionCount: integer('conversion_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const creditPackages = pgTable('credit_packages', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  resourceType: varchar('resource_type', { length: 50 }).notNull(),
  credits: integer('credits').notNull(),
  priceCents: integer('price_cents').notNull(),
  stripePriceId: text('stripe_price_id'),
  isActive: boolean('is_active').default(true),
  isPopular: boolean('is_popular').default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const analyticsDailyMetrics = pgTable('analytics_daily_metrics', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  botId: text('bot_id').references(() => bots.id),
  metricDate: timestamp('metric_date').notNull(),
  totalConversations: integer('total_conversations').default(0),
  uniqueVisitors: integer('unique_visitors').default(0),
  leadsGenerated: integer('leads_generated').default(0),
  avgSessionDuration: real('avg_session_duration').default(0),
  avgMessagesPerSession: real('avg_messages_per_session').default(0),
  conversionRate: real('conversion_rate').default(0),
  sentimentPositive: integer('sentiment_positive').default(0),
  sentimentNeutral: integer('sentiment_neutral').default(0),
  sentimentNegative: integer('sentiment_negative').default(0),
  topIntents: json('top_intents').default([]),
  peakHours: json('peak_hours').default([]),
  createdAt: timestamp('created_at').defaultNow(),
});

export const supportTicketMessages = pgTable('support_ticket_messages', {
  id: text('id').primaryKey(),
  ticketId: text('ticket_id')
    .notNull()
    .references(() => supportTickets.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id),
  message: text('message').notNull(),
  isStaff: boolean('is_staff').default(false),
  attachments: json('attachments').default([]),
  createdAt: timestamp('created_at').defaultNow(),
});

export const billingPlansRelations = relations(billingPlans, ({ many }) => ({
  features: many(planFeatures),
  subscriptions: many(organizationSubscriptions),
}));

export const planFeaturesRelations = relations(planFeatures, ({ one }) => ({
  plan: one(billingPlans, {
    fields: [planFeatures.planId],
    references: [billingPlans.id],
  }),
}));

export const organizationSubscriptionsRelations = relations(
  organizationSubscriptions,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationSubscriptions.organizationId],
      references: [organizations.id],
    }),
    plan: one(billingPlans, {
      fields: [organizationSubscriptions.planId],
      references: [billingPlans.id],
    }),
  }),
);

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  organization: one(organizations, {
    fields: [entitlements.organizationId],
    references: [organizations.id],
  }),
}));

export const usagePoolsRelations = relations(usagePools, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [usagePools.organizationId],
    references: [organizations.id],
  }),
  ledgerEntries: many(usageLedger),
}));

export const usageLedgerRelations = relations(usageLedger, ({ one }) => ({
  organization: one(organizations, {
    fields: [usageLedger.organizationId],
    references: [organizations.id],
  }),
  pool: one(usagePools, {
    fields: [usageLedger.poolId],
    references: [usagePools.id],
  }),
}));

export const organizationBrandingRelations = relations(
  organizationBranding,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationBranding.organizationId],
      references: [organizations.id],
    }),
  }),
);

export const voiceMinutesPackagesRelations = relations(
  voiceMinutesPackages,
  ({}) => ({}),
);

export const voiceCallLogsRelations = relations(voiceCallLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [voiceCallLogs.organizationId],
    references: [organizations.id],
  }),
  bot: one(bots, {
    fields: [voiceCallLogs.botId],
    references: [bots.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [apiKeys.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [apiKeys.createdBy],
    references: [users.id],
  }),
  requestLogs: many(apiRequestLogs),
}));

export const apiRequestLogsRelations = relations(apiRequestLogs, ({ one }) => ({
  apiKey: one(apiKeys, {
    fields: [apiRequestLogs.apiKeyId],
    references: [apiKeys.id],
  }),
  organization: one(organizations, {
    fields: [apiRequestLogs.organizationId],
    references: [organizations.id],
  }),
}));

export const serviceOfferingsRelations = relations(
  serviceOfferings,
  ({ many }) => ({
    orders: many(serviceOrders),
  }),
);

export const serviceOrdersRelations = relations(serviceOrders, ({ one }) => ({
  organization: one(organizations, {
    fields: [serviceOrders.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [serviceOrders.userId],
    references: [users.id],
  }),
  service: one(serviceOfferings, {
    fields: [serviceOrders.serviceId],
    references: [serviceOfferings.id],
  }),
}));

export const templatePurchasesRelations = relations(
  templatePurchases,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [templatePurchases.organizationId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [templatePurchases.userId],
      references: [users.id],
    }),
    template: one(botTemplates, {
      fields: [templatePurchases.templateId],
      references: [botTemplates.id],
    }),
  }),
);

export const landingPagesRelations = relations(landingPages, ({ one }) => ({
  organization: one(organizations, {
    fields: [landingPages.organizationId],
    references: [organizations.id],
  }),
  bot: one(bots, {
    fields: [landingPages.botId],
    references: [bots.id],
  }),
}));

export const creditPackagesRelations = relations(creditPackages, ({}) => ({}));

export const analyticsDailyMetricsRelations = relations(
  analyticsDailyMetrics,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [analyticsDailyMetrics.organizationId],
      references: [organizations.id],
    }),
    bot: one(bots, {
      fields: [analyticsDailyMetrics.botId],
      references: [bots.id],
    }),
  }),
);

export const supportTicketMessagesRelations = relations(
  supportTicketMessages,
  ({ one }) => ({
    ticket: one(supportTickets, {
      fields: [supportTicketMessages.ticketId],
      references: [supportTickets.id],
    }),
    user: one(users, {
      fields: [supportTicketMessages.userId],
      references: [users.id],
    }),
  }),
);

export type BillingPlan = typeof billingPlans.$inferSelect;
export type InsertBillingPlan = typeof billingPlans.$inferInsert;
export type PlanFeature = typeof planFeatures.$inferSelect;
export type InsertPlanFeature = typeof planFeatures.$inferInsert;
export type OrganizationSubscription =
  typeof organizationSubscriptions.$inferSelect;
export type InsertOrganizationSubscription =
  typeof organizationSubscriptions.$inferInsert;
export type Entitlement = typeof entitlements.$inferSelect;
export type InsertEntitlement = typeof entitlements.$inferInsert;
export type UsagePool = typeof usagePools.$inferSelect;
export type InsertUsagePool = typeof usagePools.$inferInsert;
export type UsageLedgerEntry = typeof usageLedger.$inferSelect;
export type InsertUsageLedgerEntry = typeof usageLedger.$inferInsert;
export type OrganizationBranding = typeof organizationBranding.$inferSelect;
export type InsertOrganizationBranding =
  typeof organizationBranding.$inferInsert;
export type VoiceMinutesPackage = typeof voiceMinutesPackages.$inferSelect;
export type InsertVoiceMinutesPackage =
  typeof voiceMinutesPackages.$inferInsert;
export type VoiceCallLog = typeof voiceCallLogs.$inferSelect;
export type InsertVoiceCallLog = typeof voiceCallLogs.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;
export type ApiRequestLog = typeof apiRequestLogs.$inferSelect;
export type InsertApiRequestLog = typeof apiRequestLogs.$inferInsert;
export type ServiceOffering = typeof serviceOfferings.$inferSelect;
export type InsertServiceOffering = typeof serviceOfferings.$inferInsert;
export type ServiceOrder = typeof serviceOrders.$inferSelect;
export type InsertServiceOrder = typeof serviceOrders.$inferInsert;
export type TemplatePurchase = typeof templatePurchases.$inferSelect;
export type InsertTemplatePurchase = typeof templatePurchases.$inferInsert;
export type LandingPage = typeof landingPages.$inferSelect;
export type InsertLandingPage = typeof landingPages.$inferInsert;
export type CreditPackage = typeof creditPackages.$inferSelect;
export type InsertCreditPackage = typeof creditPackages.$inferInsert;
export type AnalyticsDailyMetric = typeof analyticsDailyMetrics.$inferSelect;
export type InsertAnalyticsDailyMetric =
  typeof analyticsDailyMetrics.$inferInsert;
export type SupportTicketMessage = typeof supportTicketMessages.$inferSelect;
export type InsertSupportTicketMessage =
  typeof supportTicketMessages.$inferInsert;
