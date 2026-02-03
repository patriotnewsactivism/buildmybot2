import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  json,
  pgTable,
  real,
  text,
  timestamp,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';

export * from './models/auth';
export * from './billing-schema';
export * from './schema-migrations';
export * from './schema-monitoring';
export * from './schema-agentic-os';

// ========================================
// ORGANIZATIONS & MULTI-TENANCY
// ========================================

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  ownerId: text('owner_id'),
  plan: varchar('plan', { length: 50 }).default('FREE'),
  subscriptionStatus: varchar('subscription_status', { length: 50 }).default(
    'active',
  ),
  settings: json('settings').default({}),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const organizationMembers = pgTable('organization_members', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).default('member'),
  permissions: json('permissions').default([]),
  invitedBy: text('invited_by').references(() => users.id),
  joinedAt: timestamp('joined_at').defaultNow(),
});

export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  permissions: json('permissions').default([]),
  isSystemRole: boolean('is_system_role').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// AUDIT & SECURITY
// ========================================

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  userId: text('user_id').references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 50 }),
  resourceId: text('resource_id'),
  oldValues: json('old_values'),
  newValues: json('new_values'),
  ipAddress: varchar('ip_address', { length: 50 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// PARTNER & CLIENT RELATIONSHIPS
// ========================================

export const partnerClients = pgTable('partner_clients', {
  id: text('id').primaryKey(),
  partnerId: text('partner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  clientId: text('client_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id, {
    onDelete: 'cascade',
  }),
  accessLevel: varchar('access_level', { length: 50 }).default('view'),
  commissionRate: real('commission_rate').default(0.0),
  commissionType: varchar('commission_type', { length: 50 }).default(
    'reseller',
  ), // 'reseller' or 'partner'
  canImpersonate: boolean('can_impersonate').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// PARTNER COLLABORATION & PAYOUTS
// ========================================

export const partnerNotes = pgTable('partner_notes', {
  id: text('id').primaryKey(),
  partnerId: text('partner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  clientId: text('client_id').references(() => users.id, {
    onDelete: 'cascade',
  }),
  note: text('note').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const partnerTasks = pgTable('partner_tasks', {
  id: text('id').primaryKey(),
  partnerId: text('partner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  clientId: text('client_id').references(() => users.id, {
    onDelete: 'cascade',
  }),
  title: varchar('title', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('open'),
  dueAt: timestamp('due_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const partnerPayouts = pgTable('partner_payouts', {
  id: text('id').primaryKey(),
  partnerId: text('partner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  amountCents: integer('amount_cents').notNull(),
  status: varchar('status', { length: 50 }).default('pending'),
  periodStart: timestamp('period_start'),
  periodEnd: timestamp('period_end'),
  method: varchar('method', { length: 50 }).default('bank_transfer'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// IMPERSONATION SESSIONS
// ========================================

export const impersonationSessions = pgTable('impersonation_sessions', {
  id: text('id').primaryKey(),
  actorUserId: text('actor_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  targetUserId: text('target_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  reason: varchar('reason', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// ANALYTICS
// ========================================

export const analyticsEvents = pgTable('analytics_events', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  botId: text('bot_id').references(() => bots.id),
  userId: text('user_id'),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  eventData: json('event_data'),
  sessionId: text('session_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Conversation metrics tracking
export const conversationMetrics = pgTable('conversation_metrics', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id, {
    onDelete: 'cascade',
  }),
  botId: text('bot_id').references(() => bots.id),
  organizationId: text('organization_id').references(() => organizations.id),

  // Duration tracking
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  durationSeconds: integer('duration_seconds'),

  // Engagement metrics
  messageCount: integer('message_count').default(0),
  userMessageCount: integer('user_message_count').default(0),
  botMessageCount: integer('bot_message_count').default(0),

  // Completion tracking
  completed: boolean('completed').default(false),
  completionReason: varchar('completion_reason', { length: 100 }), // 'goal_achieved', 'user_left', 'timeout', 'escalated'

  // Sentiment
  overallSentiment: varchar('overall_sentiment', { length: 50 }).default(
    'neutral',
  ),
  sentimentScore: real('sentiment_score'), // -1 to 1

  // Lead generation
  leadCaptured: boolean('lead_captured').default(false),
  leadId: text('lead_id').references(() => leads.id),

  createdAt: timestamp('created_at').defaultNow(),
});

// Lead source tracking
export const leadSources = pgTable('lead_sources', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id),

  // Source details
  source: varchar('source', { length: 100 }), // 'chat', 'form', 'phone', 'email'
  medium: varchar('medium', { length: 100 }), // 'organic', 'paid', 'referral', 'direct'
  campaign: varchar('campaign', { length: 255 }),

  // Attribution
  firstTouchBotId: text('first_touch_bot_id').references(() => bots.id),
  lastTouchBotId: text('last_touch_bot_id').references(() => bots.id),
  touchCount: integer('touch_count').default(1),

  // UTM tracking
  utmSource: varchar('utm_source', { length: 255 }),
  utmMedium: varchar('utm_medium', { length: 255 }),
  utmCampaign: varchar('utm_campaign', { length: 255 }),
  utmContent: varchar('utm_content', { length: 255 }),

  // Quality scoring
  qualityScore: real('quality_score'), // 0-100
  qualityFactors: json('quality_factors'), // { email_verified, phone_verified, engagement_score, etc }

  createdAt: timestamp('created_at').defaultNow(),
});

// Bot performance snapshots (daily aggregates)
export const botPerformanceDaily = pgTable('bot_performance_daily', {
  id: text('id').primaryKey(),
  botId: text('bot_id').references(() => bots.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id),
  date: timestamp('date').notNull(),

  // Conversation metrics
  conversationsStarted: integer('conversations_started').default(0),
  conversationsCompleted: integer('conversations_completed').default(0),
  averageDuration: real('average_duration'), // seconds
  completionRate: real('completion_rate'), // percentage

  // Lead metrics
  leadsGenerated: integer('leads_generated').default(0),
  conversionRate: real('conversion_rate'), // percentage
  averageLeadQuality: real('average_lead_quality'),

  // Sentiment
  positiveSentiment: integer('positive_sentiment').default(0),
  neutralSentiment: integer('neutral_sentiment').default(0),
  negativeSentiment: integer('negative_sentiment').default(0),
  averageSentiment: real('average_sentiment'),

  // Peak hours (JSON array of hour counts)
  hourlyDistribution: json('hourly_distribution'), // { "0": 5, "1": 3, ... "23": 12 }

  // Common questions/topics (top 10)
  topTopics: json('top_topics'), // [{ topic: "pricing", count: 45 }, ...]

  createdAt: timestamp('created_at').defaultNow(),
});

// User satisfaction ratings
export const satisfactionRatings = pgTable('satisfaction_ratings', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id),
  botId: text('bot_id').references(() => bots.id),
  organizationId: text('organization_id').references(() => organizations.id),

  rating: integer('rating'), // 1-5 stars
  feedback: text('feedback'),
  wouldRecommend: boolean('would_recommend'),

  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// BOT TEMPLATES
// ========================================

export const botTemplates = pgTable('bot_templates', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 100 }),
  industry: varchar('industry', { length: 100 }),
  systemPrompt: text('system_prompt'),
  configuration: json('configuration'),
  isPublic: boolean('is_public').default(false),
  isPremium: boolean('is_premium').default(false),
  priceCents: integer('price_cents').default(0),
  createdBy: text('created_by').references(() => users.id),
  installCount: integer('install_count').default(0),
  rating: real('rating').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// MARKETING MATERIALS & CONTENT
// ========================================

export const marketingMaterials = pgTable('marketing_materials', {
  id: text('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  type: varchar('type', { length: 50 }).notNull(),
  size: varchar('size', { length: 50 }),
  downloadUrl: text('download_url').notNull(),
  previewUrl: text('preview_url'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const emailTemplates = pgTable('email_templates', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 255 }).notNull(),
  body: text('body').notNull(),
  scope: varchar('scope', { length: 50 }).default('global'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ========================================
// SYSTEM SETTINGS & FEATURE FLAGS
// ========================================

export const featureFlags = pgTable('feature_flags', {
  id: text('id').primaryKey(),
  key: varchar('key', { length: 100 }).notNull(),
  description: text('description'),
  enabled: boolean('enabled').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const systemSettings = pgTable('system_settings', {
  id: text('id').primaryKey(),
  maintenanceMode: boolean('maintenance_mode').default(false),
  envOverrides: json('env_overrides').default({}),
  apiKeys: json('api_keys').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ========================================
// SUPPORT
// ========================================

export const supportTickets = pgTable('support_tickets', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id, {
    onDelete: 'cascade',
  }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  subject: varchar('subject', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('open'),
  priority: varchar('priority', { length: 50 }).default('normal'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ========================================
// USERS
// ========================================

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  role: varchar('role', { length: 50 }).default('OWNER'),
  plan: varchar('plan', { length: 50 }).default('FREE'),
  companyName: varchar('company_name', { length: 255 }).default(''),
  avatarUrl: text('avatar_url'),
  resellerCode: varchar('reseller_code', { length: 50 }),
  resellerClientCount: integer('reseller_client_count').default(0),
  customDomain: varchar('custom_domain', { length: 255 }),
  referredBy: varchar('referred_by', { length: 50 }),
  phoneConfig: json('phone_config'),
  status: varchar('status', { length: 50 }).default('Active'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  whitelabelEnabled: boolean('whitelabel_enabled').default(false),
  whitelabelEnabledAt: timestamp('whitelabel_enabled_at'),
  whitelabelPaidThrough: timestamp('whitelabel_paid_through'),
  whitelabelSubscriptionId: text('whitelabel_subscription_id'),
  referralCredits: real('referral_credits').default(0),
  referralCreditsExpiry: timestamp('referral_credits_expiry'),
  // Phase 1 additions
  organizationId: text('organization_id').references(() => organizations.id),
  lastLoginAt: timestamp('last_login_at'),
  preferences: json('preferences').default({}),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// BOTS
// ========================================

export const bots = pgTable('bots', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 100 }).default('customer_support'),
  systemPrompt: text('system_prompt').default(''),
  model: varchar('model', { length: 100 }).default('gpt-5o-mini'),
  temperature: real('temperature').default(0.7),
  knowledgeBase: json('knowledge_base').default([]),
  active: boolean('active').default(true),
  conversationsCount: integer('conversations_count').default(0),
  themeColor: varchar('theme_color', { length: 50 }).default('#3B82F6'),
  websiteUrl: text('website_url'),
  maxMessages: integer('max_messages').default(1000),
  randomizeIdentity: boolean('randomize_identity').default(false),
  avatar: text('avatar'),
  responseDelay: integer('response_delay').default(500),
  embedType: varchar('embed_type', { length: 50 }).default('hover'),
  leadCapture: json('lead_capture').default({
    enabled: false,
    promptAfter: 3,
    emailRequired: true,
    nameRequired: false,
    phoneRequired: false,
  }),
  userId: text('user_id').references(() => users.id),
  isPublic: boolean('is_public').default(false),
  // Phase 1 additions
  organizationId: text('organization_id').references(() => organizations.id),
  analytics: json('analytics').default({}),
  abTestConfig: json('ab_test_config').default({}), // Phase 5 A/B Testing
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ========================================
// LEADS
// ========================================

export const leads = pgTable('leads', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  score: integer('score').default(0),
  status: varchar('status', { length: 50 }).default('New'),
  sourceBotId: text('source_bot_id').references(() => bots.id),
  userId: text('user_id').references(() => users.id),
  // Phase 1 addition
  organizationId: text('organization_id').references(() => organizations.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// CONVERSATIONS
// ========================================

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  botId: text('bot_id').references(() => bots.id),
  messages: json('messages').default([]),
  sentiment: varchar('sentiment', { length: 50 }).default('Neutral'),
  timestamp: timestamp('timestamp').defaultNow(),
  userId: text('user_id').references(() => users.id),
  sessionId: text('session_id'),
  // Phase 1 addition
  organizationId: text('organization_id').references(() => organizations.id),
});

// ========================================
// BOT DOCUMENTS
// ========================================

export const botDocuments = pgTable('bot_documents', {
  id: text('id').primaryKey(),
  botId: text('bot_id').references(() => bots.id),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 50 }).notNull(),
  fileSize: integer('file_size').notNull(),
  content: text('content'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// KNOWLEDGE BASE
// ========================================

export const knowledgeSources = pgTable('knowledge_sources', {
  id: text('id').primaryKey(),
  botId: text('bot_id').references(() => bots.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id, {
    onDelete: 'cascade',
  }),
  sourceType: varchar('source_type', { length: 50 }).notNull(), // 'url', 'document', 'manual'
  sourceName: varchar('source_name', { length: 255 }).notNull(), // URL or filename
  sourceUrl: text('source_url'),
  status: varchar('status', { length: 50 }).default('pending'), // 'pending', 'processing', 'completed', 'failed'
  errorMessage: text('error_message'),
  sourceText: text('source_text'),
  pageCount: integer('page_count'),
  processingState: json('processing_state').default({}),
  retryCount: integer('retry_count').default(0),
  lastError: text('last_error'),
  nextRetryAt: timestamp('next_retry_at'),
  deadLetteredAt: timestamp('dead_lettered_at'),
  pagesCrawled: integer('pages_crawled').default(0),
  lastCrawledAt: timestamp('last_crawled_at'),
  lastProcessedAt: timestamp('last_processed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').references(() => knowledgeSources.id, {
    onDelete: 'cascade',
  }),
  botId: text('bot_id').references(() => bots.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  contentHash: varchar('content_hash', { length: 255 }),
  metadata: json('metadata').default({}),
  chunkIndex: integer('chunk_index'),
  tokenCount: integer('token_count'),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// INTEGRATIONS & WEBHOOKS
// ========================================

export const integrations = pgTable('integrations', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id, {
    onDelete: 'cascade',
  }),
  provider: varchar('provider', { length: 50 }).notNull(),
  config: json('config').default({}),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const webhooks = pgTable('webhooks', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  eventTypes: json('event_types').notNull().default([]), // ['lead.captured', 'conversation.ended', etc.]
  secret: text('secret'),
  isActive: boolean('is_active').default(true),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const webhookLogs = pgTable('webhook_logs', {
  id: text('id').primaryKey(),
  webhookId: text('webhook_id')
    .notNull()
    .references(() => webhooks.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: json('payload').notNull(),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  durationMs: integer('duration_ms'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const nurtureSequences = pgTable('nurture_sequences', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id, {
    onDelete: 'cascade',
  }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  triggerType: varchar('trigger_type', { length: 50 }).notNull(), // 'lead_captured', 'tag_added'
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const nurtureSteps = pgTable('nurture_steps', {
  id: text('id').primaryKey(),
  sequenceId: text('sequence_id')
    .notNull()
    .references(() => nurtureSequences.id, { onDelete: 'cascade' }),
  stepOrder: integer('step_order').notNull(),
  delayHours: integer('delay_hours').default(0),
  actionType: varchar('action_type', { length: 50 }).notNull(), // 'send_email', 'add_tag'
  actionConfig: json('action_config').notNull(), // { templateId, subject, etc. }
  createdAt: timestamp('created_at').defaultNow(),
});

export const nurtureEnrollments = pgTable('nurture_enrollments', {
  id: text('id').primaryKey(),
  sequenceId: text('sequence_id')
    .notNull()
    .references(() => nurtureSequences.id, { onDelete: 'cascade' }),
  leadId: text('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  currentStepOrder: integer('current_step_order').default(0),
  nextStepDueAt: timestamp('next_step_due_at'),
  status: varchar('status', { length: 50 }).default('active'), // active, completed, canceled
  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// RELATIONS
// ========================================

export const organizationsRelations = relations(
  organizations,
  ({ one, many }) => ({
    owner: one(users, {
      fields: [organizations.ownerId],
      references: [users.id],
    }),
    members: many(organizationMembers),
    roles: many(roles),
    bots: many(bots),
    leads: many(leads),
    conversations: many(conversations),
    analyticsEvents: many(analyticsEvents),
    partnerRelationships: many(partnerClients),
    integrations: many(integrations),
    webhooks: many(webhooks),
    nurtureSequences: many(nurtureSequences),
  }),
);

export const nurtureSequencesRelations = relations(
  nurtureSequences,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [nurtureSequences.organizationId],
      references: [organizations.id],
    }),
    steps: many(nurtureSteps),
  }),
);

export const nurtureStepsRelations = relations(nurtureSteps, ({ one }) => ({
  sequence: one(nurtureSequences, {
    fields: [nurtureSteps.sequenceId],
    references: [nurtureSequences.id],
  }),
}));

export const webhooksRelations = relations(webhooks, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [webhooks.organizationId],
    references: [organizations.id],
  }),
  logs: many(webhookLogs),
}));

export const webhookLogsRelations = relations(webhookLogs, ({ one }) => ({
  webhook: one(webhooks, {
    fields: [webhookLogs.webhookId],
    references: [webhooks.id],
  }),
}));

export const organizationMembersRelations = relations(
  organizationMembers,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationMembers.organizationId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [organizationMembers.userId],
      references: [users.id],
    }),
    inviter: one(users, {
      fields: [organizationMembers.invitedBy],
      references: [users.id],
    }),
  }),
);

export const rolesRelations = relations(roles, ({ one }) => ({
  organization: one(organizations, {
    fields: [roles.organizationId],
    references: [organizations.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const partnerClientsRelations = relations(partnerClients, ({ one }) => ({
  partner: one(users, {
    fields: [partnerClients.partnerId],
    references: [users.id],
  }),
  client: one(users, {
    fields: [partnerClients.clientId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [partnerClients.organizationId],
    references: [organizations.id],
  }),
}));

export const partnerNotesRelations = relations(partnerNotes, ({ one }) => ({
  partner: one(users, {
    fields: [partnerNotes.partnerId],
    references: [users.id],
  }),
  client: one(users, {
    fields: [partnerNotes.clientId],
    references: [users.id],
  }),
}));

export const partnerTasksRelations = relations(partnerTasks, ({ one }) => ({
  partner: one(users, {
    fields: [partnerTasks.partnerId],
    references: [users.id],
  }),
  client: one(users, {
    fields: [partnerTasks.clientId],
    references: [users.id],
  }),
}));

export const partnerPayoutsRelations = relations(partnerPayouts, ({ one }) => ({
  partner: one(users, {
    fields: [partnerPayouts.partnerId],
    references: [users.id],
  }),
}));

export const impersonationSessionsRelations = relations(
  impersonationSessions,
  ({ one }) => ({
    actor: one(users, {
      fields: [impersonationSessions.actorUserId],
      references: [users.id],
    }),
    target: one(users, {
      fields: [impersonationSessions.targetUserId],
      references: [users.id],
    }),
  }),
);

export const analyticsEventsRelations = relations(
  analyticsEvents,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [analyticsEvents.organizationId],
      references: [organizations.id],
    }),
    bot: one(bots, {
      fields: [analyticsEvents.botId],
      references: [bots.id],
    }),
  }),
);

export const conversationMetricsRelations = relations(
  conversationMetrics,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationMetrics.conversationId],
      references: [conversations.id],
    }),
    bot: one(bots, {
      fields: [conversationMetrics.botId],
      references: [bots.id],
    }),
    organization: one(organizations, {
      fields: [conversationMetrics.organizationId],
      references: [organizations.id],
    }),
    lead: one(leads, {
      fields: [conversationMetrics.leadId],
      references: [leads.id],
    }),
  }),
);

export const leadSourcesRelations = relations(leadSources, ({ one }) => ({
  lead: one(leads, {
    fields: [leadSources.leadId],
    references: [leads.id],
  }),
  organization: one(organizations, {
    fields: [leadSources.organizationId],
    references: [organizations.id],
  }),
  firstTouchBot: one(bots, {
    fields: [leadSources.firstTouchBotId],
    references: [bots.id],
  }),
  lastTouchBot: one(bots, {
    fields: [leadSources.lastTouchBotId],
    references: [bots.id],
  }),
}));

export const botPerformanceDailyRelations = relations(
  botPerformanceDaily,
  ({ one }) => ({
    bot: one(bots, {
      fields: [botPerformanceDaily.botId],
      references: [bots.id],
    }),
    organization: one(organizations, {
      fields: [botPerformanceDaily.organizationId],
      references: [organizations.id],
    }),
  }),
);

export const satisfactionRatingsRelations = relations(
  satisfactionRatings,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [satisfactionRatings.conversationId],
      references: [conversations.id],
    }),
    bot: one(bots, {
      fields: [satisfactionRatings.botId],
      references: [bots.id],
    }),
    organization: one(organizations, {
      fields: [satisfactionRatings.organizationId],
      references: [organizations.id],
    }),
  }),
);

export const integrationsRelations = relations(integrations, ({ one }) => ({
  organization: one(organizations, {
    fields: [integrations.organizationId],
    references: [organizations.id],
  }),
}));

export const botTemplatesRelations = relations(botTemplates, ({ one }) => ({
  creator: one(users, {
    fields: [botTemplates.createdBy],
    references: [users.id],
  }),
}));

export const marketingMaterialsRelations = relations(
  marketingMaterials,
  ({}) => ({}),
);

export const emailTemplatesRelations = relations(emailTemplates, ({}) => ({}));

export const featureFlagsRelations = relations(featureFlags, ({}) => ({}));

export const systemSettingsRelations = relations(systemSettings, ({}) => ({}));

export const supportTicketsRelations = relations(supportTickets, ({ one }) => ({
  organization: one(organizations, {
    fields: [supportTickets.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [supportTickets.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  bots: many(bots),
  leads: many(leads),
  conversations: many(conversations),
  organizationMemberships: many(organizationMembers),
  partneredClients: many(partnerClients, { relationName: 'partner' }),
  partnerRelationships: many(partnerClients, { relationName: 'client' }),
  createdTemplates: many(botTemplates),
}));

export const botsRelations = relations(bots, ({ one, many }) => ({
  user: one(users, {
    fields: [bots.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [bots.organizationId],
    references: [organizations.id],
  }),
  leads: many(leads),
  conversations: many(conversations),
  documents: many(botDocuments),
  analyticsEvents: many(analyticsEvents),
  knowledgeSources: many(knowledgeSources),
  knowledgeChunks: many(knowledgeChunks),
}));

export const botDocumentsRelations = relations(botDocuments, ({ one }) => ({
  bot: one(bots, {
    fields: [botDocuments.botId],
    references: [bots.id],
  }),
}));

export const knowledgeSourcesRelations = relations(
  knowledgeSources,
  ({ one, many }) => ({
    bot: one(bots, {
      fields: [knowledgeSources.botId],
      references: [bots.id],
    }),
    organization: one(organizations, {
      fields: [knowledgeSources.organizationId],
      references: [organizations.id],
    }),
    chunks: many(knowledgeChunks),
  }),
);

export const knowledgeChunksRelations = relations(
  knowledgeChunks,
  ({ one }) => ({
    source: one(knowledgeSources, {
      fields: [knowledgeChunks.sourceId],
      references: [knowledgeSources.id],
    }),
    bot: one(bots, {
      fields: [knowledgeChunks.botId],
      references: [bots.id],
    }),
  }),
);

// ========================================
// LANDING PAGES
// ========================================

export const landingPages = pgTable('landing_pages', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  headline: text('headline'),
  subheadline: text('subheadline'),
  heroImageUrl: text('hero_image_url'),
  ctaText: varchar('cta_text', { length: 100 }).default('Get Started'),
  ctaColor: varchar('cta_color', { length: 20 }).default('#F97316'),
  formFields: json('form_fields').default([]),
  thankYouMessage: text('thank_you_message'),
  seoTitle: varchar('seo_title', { length: 255 }),
  seoDescription: text('seo_description'),
  botId: text('bot_id').references(() => bots.id, { onDelete: 'set null' }),
  isPublished: boolean('is_published').default(false),
  viewCount: integer('view_count').default(0),
  conversionCount: integer('conversion_count').default(0),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id, {
    onDelete: 'cascade',
  }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const landingPagesRelations = relations(landingPages, ({ one }) => ({
  user: one(users, {
    fields: [landingPages.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [landingPages.organizationId],
    references: [organizations.id],
  }),
  bot: one(bots, {
    fields: [landingPages.botId],
    references: [bots.id],
  }),
}));

export const nurtureEnrollmentsRelations = relations(
  nurtureEnrollments,
  ({ one }) => ({
    sequence: one(nurtureSequences, {
      fields: [nurtureEnrollments.sequenceId],
      references: [nurtureSequences.id],
    }),
    lead: one(leads, {
      fields: [nurtureEnrollments.leadId],
      references: [leads.id],
    }),
  }),
);

export const leadsRelations = relations(leads, ({ one, many }) => ({
  user: one(users, {
    fields: [leads.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [leads.organizationId],
    references: [organizations.id],
  }),
  sourceBot: one(bots, {
    fields: [leads.sourceBotId],
    references: [bots.id],
  }),
  enrollments: many(nurtureEnrollments),
}));

export const conversationsRelations = relations(conversations, ({ one }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [conversations.organizationId],
    references: [organizations.id],
  }),
  bot: one(bots, {
    fields: [conversations.botId],
    references: [bots.id],
  }),
}));

// ========================================
// DISCOUNT & PROMO CODES
// ========================================

export const discountCodes = pgTable('discount_codes', {
  id: text('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  type: varchar('type', { length: 20 }).notNull().default('percentage'),
  value: integer('value').notNull(),
  description: text('description'),
  maxUses: integer('max_uses'),
  currentUses: integer('current_uses').default(0),
  minPurchaseAmount: integer('min_purchase_amount'),
  applicablePlans: json('applicable_plans').default([]),
  validFrom: timestamp('valid_from'),
  validUntil: timestamp('valid_until'),
  isActive: boolean('is_active').default(true),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const discountCodeRedemptions = pgTable('discount_code_redemptions', {
  id: text('id').primaryKey(),
  discountCodeId: text('discount_code_id')
    .notNull()
    .references(() => discountCodes.id),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  orderId: text('order_id'),
  amountSaved: integer('amount_saved'),
  redeemedAt: timestamp('redeemed_at').defaultNow(),
});

export const freeAccessCodes = pgTable('free_access_codes', {
  id: text('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  plan: varchar('plan', { length: 50 }).notNull(),
  durationDays: integer('duration_days').notNull().default(30),
  description: text('description'),
  maxUses: integer('max_uses').default(1),
  currentUses: integer('current_uses').default(0),
  validUntil: timestamp('valid_until'),
  isActive: boolean('is_active').default(true),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const freeAccessRedemptions = pgTable('free_access_redemptions', {
  id: text('id').primaryKey(),
  freeCodeId: text('free_code_id')
    .notNull()
    .references(() => freeAccessCodes.id),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  planGranted: varchar('plan_granted', { length: 50 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  redeemedAt: timestamp('redeemed_at').defaultNow(),
});

// ========================================
// NOTIFICATIONS
// ========================================

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  isPopup: boolean('is_popup').default(false),
  priority: varchar('priority', { length: 20 }).default('normal'),
  createdBy: text('created_by').references(() => users.id),
  publishAt: timestamp('publish_at'),
  expiresAt: timestamp('expires_at'),
  audienceType: varchar('audience_type', { length: 50 }).default('all'),
  audienceFilter: json('audience_filter').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const notificationReceipts = pgTable('notification_receipts', {
  id: text('id').primaryKey(),
  notificationId: text('notification_id')
    .notNull()
    .references(() => notifications.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  deliveredAt: timestamp('delivered_at'),
  viewedAt: timestamp('viewed_at'),
  acknowledgedAt: timestamp('acknowledged_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const notificationsRelations = relations(
  notifications,
  ({ one, many }) => ({
    creator: one(users, {
      fields: [notifications.createdBy],
      references: [users.id],
    }),
    receipts: many(notificationReceipts),
  }),
);

export const notificationReceiptsRelations = relations(
  notificationReceipts,
  ({ one }) => ({
    notification: one(notifications, {
      fields: [notificationReceipts.notificationId],
      references: [notifications.id],
    }),
    user: one(users, {
      fields: [notificationReceipts.userId],
      references: [users.id],
    }),
  }),
);

// ========================================
// VOICE AGENTS
// ========================================

export const voiceAgents = pgTable('voice_agents', {
  id: text('id').primaryKey(),
  botId: text('bot_id')
    .notNull()
    .references(() => bots.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').default(false),
  phoneNumber: varchar('phone_number', { length: 50 }), // Twilio phone number
  twilioSid: varchar('twilio_sid', { length: 255 }), // Twilio phone number SID
  voiceModel: varchar('voice_model', { length: 100 }).default('cartesia-sonic'), // Cartesia voice model
  voiceId: varchar('voice_id', { length: 255 }).default(''), // Cartesia voice ID
  language: varchar('language', { length: 10 }).default('en'),
  greeting: text('greeting').default('Hello! How can I help you today?'),
  endCallPhrase: text('end_call_phrase').default(
    'Is there anything else I can help you with?',
  ),
  transferEnabled: boolean('transfer_enabled').default(false),
  transferNumber: varchar('transfer_number', { length: 50 }),
  transferTriggers: json('transfer_triggers').default([]), // Keywords that trigger transfer
  leadCaptureEnabled: boolean('lead_capture_enabled').default(true),
  // Voice plan tracking
  plan: varchar('plan', { length: 50 }).default('VOICE_BASIC'), // VOICE_BASIC, VOICE_STANDARD, VOICE_PROFESSIONAL
  minutesUsed: integer('minutes_used').default(0),
  minutesLimit: integer('minutes_limit').default(150), // Based on plan
  billingCycle: timestamp('billing_cycle').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const voiceCalls = pgTable('voice_calls', {
  id: text('id').primaryKey(),
  voiceAgentId: text('voice_agent_id')
    .notNull()
    .references(() => voiceAgents.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id),
  botId: text('bot_id').references(() => bots.id),
  twilioCallSid: varchar('twilio_call_sid', { length: 255 }).unique(),
  fromNumber: varchar('from_number', { length: 50 }).notNull(),
  toNumber: varchar('to_number', { length: 50 }).notNull(),
  direction: varchar('direction', { length: 20 }).default('inbound'), // inbound, outbound
  status: varchar('status', { length: 50 }).default('initiated'), // initiated, in-progress, completed, failed, no-answer
  startedAt: timestamp('started_at').defaultNow(),
  endedAt: timestamp('ended_at'),
  durationSeconds: integer('duration_seconds').default(0),
  transcript: text('transcript'),
  sentiment: varchar('sentiment', { length: 50 }).default('neutral'),
  leadCaptured: boolean('lead_captured').default(false),
  leadId: text('lead_id').references(() => leads.id),
  transferredToHuman: boolean('transferred_to_human').default(false),
  transferredAt: timestamp('transferred_at'),
  cost: real('cost').default(0), // Cost in dollars
  recordingUrl: text('recording_url'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const voiceCallMessages = pgTable('voice_call_messages', {
  id: text('id').primaryKey(),
  voiceCallId: text('voice_call_id')
    .notNull()
    .references(() => voiceCalls.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(), // 'user' or 'assistant'
  content: text('content').notNull(),
  timestamp: timestamp('timestamp').defaultNow(),
  audioUrl: text('audio_url'), // URL to Cartesia-generated audio
  duration: real('duration'), // Duration in seconds
});

// Voice Agent Relations
export const voiceAgentsRelations = relations(voiceAgents, ({ one, many }) => ({
  bot: one(bots, {
    fields: [voiceAgents.botId],
    references: [bots.id],
  }),
  organization: one(organizations, {
    fields: [voiceAgents.organizationId],
    references: [organizations.id],
  }),
  calls: many(voiceCalls),
}));

export const voiceCallsRelations = relations(voiceCalls, ({ one, many }) => ({
  voiceAgent: one(voiceAgents, {
    fields: [voiceCalls.voiceAgentId],
    references: [voiceAgents.id],
  }),
  organization: one(organizations, {
    fields: [voiceCalls.organizationId],
    references: [organizations.id],
  }),
  bot: one(bots, {
    fields: [voiceCalls.botId],
    references: [bots.id],
  }),
  lead: one(leads, {
    fields: [voiceCalls.leadId],
    references: [leads.id],
  }),
  messages: many(voiceCallMessages),
}));

export const voiceCallMessagesRelations = relations(
  voiceCallMessages,
  ({ one }) => ({
    voiceCall: one(voiceCalls, {
      fields: [voiceCallMessages.voiceCallId],
      references: [voiceCalls.id],
    }),
  }),
);

// ========================================
// TYPE EXPORTS
// ========================================

export type DiscountCode = typeof discountCodes.$inferSelect;
export type InsertDiscountCode = typeof discountCodes.$inferInsert;
export type DiscountCodeRedemption =
  typeof discountCodeRedemptions.$inferSelect;
export type InsertDiscountCodeRedemption =
  typeof discountCodeRedemptions.$inferInsert;
export type FreeAccessCode = typeof freeAccessCodes.$inferSelect;
export type InsertFreeAccessCode = typeof freeAccessCodes.$inferInsert;
export type FreeAccessRedemption = typeof freeAccessRedemptions.$inferSelect;
export type InsertFreeAccessRedemption =
  typeof freeAccessRedemptions.$inferInsert;

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type InsertOrganizationMember = typeof organizationMembers.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type InsertRole = typeof roles.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type PartnerClient = typeof partnerClients.$inferSelect;
export type InsertPartnerClient = typeof partnerClients.$inferInsert;
export type PartnerNote = typeof partnerNotes.$inferSelect;
export type InsertPartnerNote = typeof partnerNotes.$inferInsert;
export type PartnerTask = typeof partnerTasks.$inferSelect;
export type InsertPartnerTask = typeof partnerTasks.$inferInsert;
export type PartnerPayout = typeof partnerPayouts.$inferSelect;
export type InsertPartnerPayout = typeof partnerPayouts.$inferInsert;
export type ImpersonationSession = typeof impersonationSessions.$inferSelect;
export type InsertImpersonationSession =
  typeof impersonationSessions.$inferInsert;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEvents.$inferInsert;
export type BotTemplate = typeof botTemplates.$inferSelect;
export type InsertBotTemplate = typeof botTemplates.$inferInsert;
export type MarketingMaterial = typeof marketingMaterials.$inferSelect;
export type InsertMarketingMaterial = typeof marketingMaterials.$inferInsert;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = typeof featureFlags.$inferInsert;
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = typeof integrations.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = typeof webhooks.$inferInsert;
export type WebhookLog = typeof webhookLogs.$inferSelect;
export type InsertWebhookLog = typeof webhookLogs.$inferInsert;
export type NurtureSequence = typeof nurtureSequences.$inferSelect;
export type InsertNurtureSequence = typeof nurtureSequences.$inferInsert;
export type NurtureStep = typeof nurtureSteps.$inferSelect;
export type InsertNurtureStep = typeof nurtureSteps.$inferInsert;
export type NurtureEnrollment = typeof nurtureEnrollments.$inferSelect;
export type InsertNurtureEnrollment = typeof nurtureEnrollments.$inferInsert;

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Bot = typeof bots.$inferSelect;
export type InsertBot = typeof bots.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type BotDocument = typeof botDocuments.$inferSelect;
export type InsertBotDocument = typeof botDocuments.$inferInsert;

export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type InsertKnowledgeSource = typeof knowledgeSources.$inferInsert;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type InsertKnowledgeChunk = typeof knowledgeChunks.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
export type NotificationReceipt = typeof notificationReceipts.$inferSelect;
export type InsertNotificationReceipt =
  typeof notificationReceipts.$inferInsert;

export type VoiceAgent = typeof voiceAgents.$inferSelect;
export type InsertVoiceAgent = typeof voiceAgents.$inferInsert;
export type VoiceCall = typeof voiceCalls.$inferSelect;
export type InsertVoiceCall = typeof voiceCalls.$inferInsert;
export type VoiceCallMessage = typeof voiceCallMessages.$inferSelect;
export type InsertVoiceCallMessage = typeof voiceCallMessages.$inferInsert;
