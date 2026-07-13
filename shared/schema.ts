/**
 * Drizzle schema for the Express server (server/) and scripts/.
 *
 * REGENERATED 2026-07-08 by introspecting the production Supabase database
 * (project evkjlnbpntimbxklnhoz, public schema). Every table above the
 * "NOT YET IN PRODUCTION" marker matches the live database column-for-column.
 * If you change a table here, apply the same change to production with
 * `npm run db:push` (drizzle-kit) or a SQL migration in supabase/migrations/.
 */
import {
  boolean,
  doublePrecision,
  integer,
  json,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const analyticsEvents = pgTable('analytics_events', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  botId: text('bot_id'),
  userId: text('user_id'),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  eventData: json('event_data'),
  sessionId: text('session_id'),
  createdAt: timestamp('created_at'),
});

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  userId: text('user_id'),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 50 }),
  resourceId: text('resource_id'),
  oldValues: json('old_values'),
  newValues: json('new_values'),
  ipAddress: varchar('ip_address', { length: 50 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at'),
});

export const botDocuments = pgTable('bot_documents', {
  id: text('id').primaryKey(),
  botId: text('bot_id'),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 50 }).notNull(),
  fileSize: integer('file_size').notNull(),
  content: text('content'),
  createdAt: timestamp('created_at'),
});

export const botPerformanceDaily = pgTable('bot_performance_daily', {
  id: text('id').primaryKey(),
  botId: text('bot_id'),
  organizationId: text('organization_id'),
  date: timestamp('date').notNull(),
  conversationsStarted: integer('conversations_started'),
  conversationsCompleted: integer('conversations_completed'),
  averageDuration: doublePrecision('average_duration'),
  completionRate: doublePrecision('completion_rate'),
  leadsGenerated: integer('leads_generated'),
  conversionRate: doublePrecision('conversion_rate'),
  averageLeadQuality: doublePrecision('average_lead_quality'),
  positiveSentiment: integer('positive_sentiment'),
  neutralSentiment: integer('neutral_sentiment'),
  negativeSentiment: integer('negative_sentiment'),
  averageSentiment: doublePrecision('average_sentiment'),
  hourlyDistribution: json('hourly_distribution'),
  topTopics: json('top_topics'),
  createdAt: timestamp('created_at'),
});

export const botTemplates = pgTable('bot_templates', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 100 }),
  industry: varchar('industry', { length: 100 }),
  systemPrompt: text('system_prompt'),
  configuration: json('configuration'),
  isPublic: boolean('is_public'),
  isPremium: boolean('is_premium'),
  priceCents: integer('price_cents'),
  createdBy: text('created_by'),
  installCount: integer('install_count'),
  rating: doublePrecision('rating'),
  createdAt: timestamp('created_at'),
});

export const bots = pgTable('bots', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 100 }),
  systemPrompt: text('system_prompt'),
  model: varchar('model', { length: 100 }),
  temperature: doublePrecision('temperature'),
  knowledgeBase: jsonb('knowledge_base'),
  active: boolean('active'),
  conversationsCount: integer('conversations_count'),
  themeColor: varchar('theme_color', { length: 50 }),
  websiteUrl: text('website_url'),
  maxMessages: integer('max_messages'),
  randomizeIdentity: boolean('randomize_identity'),
  avatar: text('avatar'),
  responseDelay: integer('response_delay'),
  embedType: varchar('embed_type', { length: 50 }),
  leadCapture: json('lead_capture'),
  userId: text('user_id'),
  isPublic: boolean('is_public'),
  organizationId: text('organization_id'),
  analytics: json('analytics'),
  abTestConfig: json('ab_test_config'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const callLogs = pgTable('call_logs', {
  id: integer('id').primaryKey(),
  voiceAgentId: text('voice_agent_id').notNull(),
  botId: text('bot_id').notNull(),
  userId: text('user_id').notNull(),
  callSid: varchar('call_sid', { length: 255 }),
  provider: varchar('provider', { length: 20 }).notNull(),
  direction: varchar('direction', { length: 10 }).notNull(),
  callerNumber: varchar('caller_number', { length: 20 }),
  calledNumber: varchar('called_number', { length: 20 }),
  status: varchar('status', { length: 20 }),
  duration: integer('duration'),
  cost: numeric('cost'),
  transcript: json('transcript'),
  summary: text('summary'),
  sentiment: varchar('sentiment', { length: 20 }),
  leadScore: integer('lead_score'),
  leadId: text('lead_id'),
  recordingUrl: text('recording_url'),
  metadata: json('metadata'),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at'),
});

export const conversationMetrics = pgTable('conversation_metrics', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id'),
  botId: text('bot_id'),
  organizationId: text('organization_id'),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  durationSeconds: integer('duration_seconds'),
  messageCount: integer('message_count'),
  userMessageCount: integer('user_message_count'),
  botMessageCount: integer('bot_message_count'),
  completed: boolean('completed'),
  completionReason: varchar('completion_reason', { length: 100 }),
  overallSentiment: varchar('overall_sentiment', { length: 50 }),
  sentimentScore: doublePrecision('sentiment_score'),
  leadCaptured: boolean('lead_captured'),
  leadId: text('lead_id'),
  createdAt: timestamp('created_at'),
});

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  botId: text('bot_id'),
  messages: json('messages'),
  sentiment: varchar('sentiment', { length: 50 }),
  timestamp: timestamp('timestamp'),
  userId: text('user_id'),
  sessionId: text('session_id'),
  organizationId: text('organization_id'),
});

export const impersonationSessions = pgTable('impersonation_sessions', {
  id: text('id').primaryKey(),
  actorUserId: text('actor_user_id').notNull(),
  targetUserId: text('target_user_id').notNull(),
  reason: varchar('reason', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at'),
});

export const integrations = pgTable('integrations', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  provider: varchar('provider', { length: 50 }).notNull(),
  config: json('config'),
  isActive: boolean('is_active'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: text('id').primaryKey(),
  sourceId: text('source_id'),
  botId: text('bot_id'),
  content: text('content').notNull(),
  contentHash: varchar('content_hash', { length: 255 }),
  metadata: json('metadata'),
  chunkIndex: integer('chunk_index'),
  tokenCount: integer('token_count'),
  // pgvector column; drizzle reads/writes it as text and services convert
  embedding: text('embedding'),
  createdAt: timestamp('created_at'),
});

export const knowledgeSources = pgTable('knowledge_sources', {
  id: text('id').primaryKey(),
  botId: text('bot_id'),
  organizationId: text('organization_id'),
  sourceType: varchar('source_type', { length: 50 }).notNull(),
  sourceName: varchar('source_name', { length: 255 }).notNull(),
  sourceUrl: text('source_url'),
  status: varchar('status', { length: 50 }),
  errorMessage: text('error_message'),
  sourceText: text('source_text'),
  pageCount: integer('page_count'),
  processingState: json('processing_state'),
  retryCount: integer('retry_count'),
  lastError: text('last_error'),
  nextRetryAt: timestamp('next_retry_at'),
  deadLetteredAt: timestamp('dead_lettered_at'),
  pagesCrawled: integer('pages_crawled'),
  lastCrawledAt: timestamp('last_crawled_at'),
  lastProcessedAt: timestamp('last_processed_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const landingPages = pgTable('landing_pages', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  headline: text('headline'),
  subheadline: text('subheadline'),
  heroImageUrl: text('hero_image_url'),
  ctaText: varchar('cta_text', { length: 100 }),
  ctaColor: varchar('cta_color', { length: 20 }),
  formFields: json('form_fields'),
  thankYouMessage: text('thank_you_message'),
  seoTitle: varchar('seo_title', { length: 255 }),
  seoDescription: text('seo_description'),
  botId: text('bot_id'),
  isPublished: boolean('is_published'),
  viewCount: integer('view_count'),
  conversionCount: integer('conversion_count'),
  userId: text('user_id'),
  organizationId: text('organization_id'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const leadSources = pgTable('lead_sources', {
  id: text('id').primaryKey(),
  leadId: text('lead_id'),
  organizationId: text('organization_id'),
  source: varchar('source', { length: 100 }),
  medium: varchar('medium', { length: 100 }),
  campaign: varchar('campaign', { length: 255 }),
  firstTouchBotId: text('first_touch_bot_id'),
  lastTouchBotId: text('last_touch_bot_id'),
  touchCount: integer('touch_count'),
  utmSource: varchar('utm_source', { length: 255 }),
  utmMedium: varchar('utm_medium', { length: 255 }),
  utmCampaign: varchar('utm_campaign', { length: 255 }),
  utmContent: varchar('utm_content', { length: 255 }),
  qualityScore: doublePrecision('quality_score'),
  qualityFactors: json('quality_factors'),
  createdAt: timestamp('created_at'),
});

export const leads = pgTable('leads', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  score: integer('score'),
  status: varchar('status', { length: 50 }),
  sourceBotId: text('source_bot_id'),
  source: varchar('source', { length: 255 }),
  userId: text('user_id'),
  organizationId: text('organization_id'),
  // Outreach tracking (Phase 1)
  lastContactedAt: timestamp('last_contacted_at'),
  contactMethod: varchar('contact_method', { length: 50 }),
  contactCount: integer('contact_count'),
  notes: text('notes'),
  nextFollowupAt: timestamp('next_followup_at'),
  callTranscriptUrl: text('call_transcript_url'),
  emailThreadId: text('email_thread_id'),
  // AI agent tracking
  repliedAt: timestamp('replied_at'),
  followUpSentAt: timestamp('follow_up_sent_at'),
  lastAiActionAt: timestamp('last_ai_action_at'),
  aiNotes: text('ai_notes'),
  createdAt: timestamp('created_at'),
});

export const marketingMaterials = pgTable('marketing_materials', {
  id: text('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  type: varchar('type', { length: 50 }).notNull(),
  size: varchar('size', { length: 50 }),
  downloadUrl: text('download_url').notNull(),
  previewUrl: text('preview_url'),
  createdAt: timestamp('created_at'),
});

export const notificationReceipts = pgTable('notification_receipts', {
  id: text('id').primaryKey(),
  notificationId: text('notification_id').notNull(),
  userId: text('user_id').notNull(),
  deliveredAt: timestamp('delivered_at'),
  viewedAt: timestamp('viewed_at'),
  acknowledgedAt: timestamp('acknowledged_at'),
  createdAt: timestamp('created_at'),
});

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  isPopup: boolean('is_popup'),
  priority: varchar('priority', { length: 20 }),
  createdBy: text('created_by'),
  publishAt: timestamp('publish_at'),
  expiresAt: timestamp('expires_at'),
  audienceType: varchar('audience_type', { length: 50 }),
  audienceFilter: json('audience_filter'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const nurtureEnrollments = pgTable('nurture_enrollments', {
  id: text('id').primaryKey(),
  sequenceId: text('sequence_id').notNull(),
  leadId: text('lead_id').notNull(),
  currentStepOrder: integer('current_step_order'),
  nextStepDueAt: timestamp('next_step_due_at'),
  status: varchar('status', { length: 50 }),
  createdAt: timestamp('created_at'),
});

export const nurtureSequences = pgTable('nurture_sequences', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  triggerType: varchar('trigger_type', { length: 50 }).notNull(),
  isActive: boolean('is_active'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const nurtureSteps = pgTable('nurture_steps', {
  id: text('id').primaryKey(),
  sequenceId: text('sequence_id').notNull(),
  stepOrder: integer('step_order').notNull(),
  delayHours: integer('delay_hours'),
  actionType: varchar('action_type', { length: 50 }).notNull(),
  actionConfig: json('action_config').notNull(),
  createdAt: timestamp('created_at'),
});

export const organizationMembers = pgTable('organization_members', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  userId: text('user_id').notNull(),
  role: varchar('role', { length: 50 }),
  permissions: json('permissions'),
  invitedBy: text('invited_by'),
  joinedAt: timestamp('joined_at'),
});

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  ownerId: text('owner_id'),
  plan: varchar('plan', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 50 }),
  settings: json('settings'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const partnerClients = pgTable('partner_clients', {
  id: text('id').primaryKey(),
  partnerId: text('partner_id').notNull(),
  clientId: text('client_id').notNull(),
  organizationId: text('organization_id'),
  accessLevel: varchar('access_level', { length: 50 }),
  commissionRate: doublePrecision('commission_rate'),
  commissionType: varchar('commission_type', { length: 50 }),
  canImpersonate: boolean('can_impersonate'),
  createdAt: timestamp('created_at'),
});

export const partnerNotes = pgTable('partner_notes', {
  id: text('id').primaryKey(),
  partnerId: text('partner_id').notNull(),
  clientId: text('client_id'),
  note: text('note').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const partnerPayouts = pgTable('partner_payouts', {
  id: text('id').primaryKey(),
  partnerId: text('partner_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: varchar('status', { length: 50 }),
  periodStart: timestamp('period_start'),
  periodEnd: timestamp('period_end'),
  method: varchar('method', { length: 50 }),
  createdAt: timestamp('created_at'),
});

export const partnerTasks = pgTable('partner_tasks', {
  id: text('id').primaryKey(),
  partnerId: text('partner_id').notNull(),
  clientId: text('client_id'),
  title: varchar('title', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }),
  dueAt: timestamp('due_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const phoneNumbers = pgTable('phone_numbers', {
  id: integer('id').primaryKey(),
  voiceAgentId: text('voice_agent_id'),
  userId: text('user_id').notNull(),
  provider: varchar('provider', { length: 20 }).notNull(),
  providerNumberId: varchar('provider_number_id', { length: 255 }),
  phoneNumber: varchar('phone_number', { length: 20 }).notNull(),
  friendlyName: varchar('friendly_name', { length: 100 }),
  capabilities: json('capabilities'),
  monthlyCost: numeric('monthly_cost'),
  status: varchar('status', { length: 20 }),
  createdAt: timestamp('created_at'),
});

export const salesAgentClients = pgTable('sales_agent_clients', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  clientId: text('client_id').notNull(),
  organizationId: text('organization_id'),
  commissionRate: doublePrecision('commission_rate'),
  createdAt: timestamp('created_at'),
});

export const salesAgentPartners = pgTable('sales_agent_partners', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  partnerId: text('partner_id').notNull(),
  commissionOverrideRate: doublePrecision('commission_override_rate'),
  status: varchar('status', { length: 50 }),
  createdAt: timestamp('created_at'),
});

export const satisfactionRatings = pgTable('satisfaction_ratings', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id'),
  botId: text('bot_id'),
  organizationId: text('organization_id'),
  rating: integer('rating'),
  feedback: text('feedback'),
  wouldRecommend: boolean('would_recommend'),
  createdAt: timestamp('created_at'),
});

export const supportTickets = pgTable('support_tickets', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  userId: text('user_id'),
  subject: varchar('subject', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }),
  priority: varchar('priority', { length: 50 }),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: text('password_hash'),
  role: varchar('role', { length: 50 }),
  plan: varchar('plan', { length: 50 }),
  companyName: varchar('company_name', { length: 255 }),
  avatarUrl: text('avatar_url'),
  resellerCode: varchar('reseller_code', { length: 50 }),
  resellerClientCount: integer('reseller_client_count'),
  customDomain: varchar('custom_domain', { length: 255 }),
  referredBy: varchar('referred_by', { length: 50 }),
  phoneConfig: json('phone_config'),
  status: varchar('status', { length: 50 }),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  whitelabelEnabled: boolean('whitelabel_enabled'),
  whitelabelEnabledAt: timestamp('whitelabel_enabled_at'),
  whitelabelPaidThrough: timestamp('whitelabel_paid_through'),
  whitelabelSubscriptionId: text('whitelabel_subscription_id'),
  referralCredits: doublePrecision('referral_credits'),
  referralCreditsExpiry: timestamp('referral_credits_expiry'),
  trialStartedAt: timestamp('trial_started_at'),
  trialEndsAt: timestamp('trial_ends_at'),
  organizationId: text('organization_id'),
  lastLoginAt: timestamp('last_login_at'),
  preferences: json('preferences'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at'),
});

export const voiceAgents = pgTable('voice_agents', {
  id: text('id').primaryKey(),
  botId: text('bot_id').notNull(),
  organizationId: text('organization_id').notNull(),
  provider: varchar('provider', { length: 20 }),
  providerAgentId: varchar('provider_agent_id', { length: 255 }),
  enabled: boolean('enabled'),
  phoneNumber: varchar('phone_number', { length: 50 }),
  twilioSid: varchar('twilio_sid', { length: 255 }),
  voiceModel: varchar('voice_model', { length: 100 }),
  voiceId: varchar('voice_id', { length: 255 }),
  voiceName: varchar('voice_name', { length: 100 }),
  language: varchar('language', { length: 10 }),
  systemPrompt: text('system_prompt'),
  greeting: text('greeting'),
  businessHours: json('business_hours'),
  afterHoursMessage: text('after_hours_message'),
  endCallPhrase: text('end_call_phrase'),
  endCallPhrases: json('end_call_phrases'),
  transferEnabled: boolean('transfer_enabled'),
  transferNumber: varchar('transfer_number', { length: 50 }),
  transferTriggers: json('transfer_triggers'),
  leadCaptureEnabled: boolean('lead_capture_enabled'),
  calendarBookingUrl: varchar('calendar_booking_url', { length: 500 }),
  maxCallDuration: integer('max_call_duration'),
  recordCalls: boolean('record_calls'),
  escalationRules: json('escalation_rules'),
  plan: varchar('plan', { length: 50 }),
  minutesUsed: integer('minutes_used'),
  minutesLimit: integer('minutes_limit'),
  billingCycle: timestamp('billing_cycle'),
  isActive: boolean('is_active'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const voiceCallMessages = pgTable('voice_call_messages', {
  id: text('id').primaryKey(),
  voiceCallId: text('voice_call_id').notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content').notNull(),
  timestamp: timestamp('timestamp'),
  audioUrl: text('audio_url'),
  duration: doublePrecision('duration'),
});

export const voiceCalls = pgTable('voice_calls', {
  id: text('id').primaryKey(),
  voiceAgentId: text('voice_agent_id').notNull(),
  organizationId: text('organization_id').notNull(),
  botId: text('bot_id'),
  twilioCallSid: varchar('twilio_call_sid', { length: 255 }),
  fromNumber: varchar('from_number', { length: 50 }).notNull(),
  toNumber: varchar('to_number', { length: 50 }).notNull(),
  direction: varchar('direction', { length: 20 }),
  status: varchar('status', { length: 50 }),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  durationSeconds: integer('duration_seconds'),
  transcript: text('transcript'),
  sentiment: varchar('sentiment', { length: 50 }),
  leadCaptured: boolean('lead_captured'),
  leadId: text('lead_id'),
  transferredToHuman: boolean('transferred_to_human'),
  transferredAt: timestamp('transferred_at'),
  cost: doublePrecision('cost'),
  recordingUrl: text('recording_url'),
  createdAt: timestamp('created_at'),
});

export const webhookLogs = pgTable('webhook_logs', {
  id: text('id').primaryKey(),
  webhookId: text('webhook_id').notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: json('payload').notNull(),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  durationMs: integer('duration_ms'),
  error: text('error'),
  createdAt: timestamp('created_at'),
});

export const webhooks = pgTable('webhooks', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  url: text('url').notNull(),
  eventTypes: json('event_types'),
  secret: text('secret'),
  isActive: boolean('is_active'),
  description: text('description'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const sessions = pgTable('sessions', {
  sid: varchar('sid').notNull(),
  sess: jsonb('sess').notNull(),
  expire: timestamp('expire').notNull(),
});

// ═════════════════════════════════════════════════════════════════════════
// NOT YET IN PRODUCTION — these tables back features whose DDL was never
// applied to the live database. `npm run db:push` creates them on first use.
// ═════════════════════════════════════════════════════════════════════════

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  organizationId: text('organization_id'),
  botId: text('bot_id'),
  role: varchar('role', { length: 20 }),
  content: text('content'),
  sentiment: doublePrecision('sentiment'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const botVersions = pgTable('bot_versions', {
  id: text('id').primaryKey(),
  botId: text('bot_id').notNull(),
  organizationId: text('organization_id'),
  versionNumber: integer('version_number').notNull(),
  configJson: jsonb('config_json'),
  message: text('message'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
});

// DeploymentService addresses these columns with snake_case property names.
export const deploymentLogs = pgTable('deployment_logs', {
  id: text('id').primaryKey(),
  bot_id: text('bot_id').notNull(),
  organization_id: text('organization_id'),
  status: varchar('status', { length: 50 }),
  channels_status: jsonb('channels_status'),
  logs: jsonb('logs'),
  started_at: timestamp('started_at'),
  completed_at: timestamp('completed_at'),
  created_at: timestamp('created_at').defaultNow(),
});

export const knowledgeGaps = pgTable('knowledge_gaps', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  botId: text('bot_id'),
  question: text('question').notNull(),
  occurrences: integer('occurrences').default(1),
  status: varchar('status', { length: 50 }).default('open'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const repairLogs = pgTable('repair_logs', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id'),
  botId: text('bot_id').notNull(),
  issueType: varchar('issue_type', { length: 100 }).notNull(),
  description: text('description').notNull(),
  suggestedFix: text('suggested_fix'),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  attemptCount: integer('attempt_count').default(0).notNull(),
  lastAttemptAt: timestamp('last_attempt_at'),
  resolvedAt: timestamp('resolved_at'),
  metadata: jsonb('metadata').default('{}').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Inferred row/insert types ──────────────────────────────────────────────
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;
export type InsertAnalyticsEvent = typeof analyticsEvents.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type BotDocument = typeof botDocuments.$inferSelect;
export type NewBotDocument = typeof botDocuments.$inferInsert;
export type InsertBotDocument = typeof botDocuments.$inferInsert;
export type BotPerformanceDaily = typeof botPerformanceDaily.$inferSelect;
export type NewBotPerformanceDaily = typeof botPerformanceDaily.$inferInsert;
export type InsertBotPerformanceDaily = typeof botPerformanceDaily.$inferInsert;
export type BotTemplate = typeof botTemplates.$inferSelect;
export type NewBotTemplate = typeof botTemplates.$inferInsert;
export type InsertBotTemplate = typeof botTemplates.$inferInsert;
export type Bot = typeof bots.$inferSelect;
export type NewBot = typeof bots.$inferInsert;
export type InsertBot = typeof bots.$inferInsert;
export type CallLog = typeof callLogs.$inferSelect;
export type NewCallLog = typeof callLogs.$inferInsert;
export type InsertCallLog = typeof callLogs.$inferInsert;
export type ConversationMetric = typeof conversationMetrics.$inferSelect;
export type NewConversationMetric = typeof conversationMetrics.$inferInsert;
export type InsertConversationMetric = typeof conversationMetrics.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type InsertConversation = typeof conversations.$inferInsert;
export type ImpersonationSession = typeof impersonationSessions.$inferSelect;
export type NewImpersonationSession = typeof impersonationSessions.$inferInsert;
export type InsertImpersonationSession =
  typeof impersonationSessions.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type InsertIntegration = typeof integrations.$inferInsert;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type NewKnowledgeChunk = typeof knowledgeChunks.$inferInsert;
export type InsertKnowledgeChunk = typeof knowledgeChunks.$inferInsert;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type NewKnowledgeSource = typeof knowledgeSources.$inferInsert;
export type InsertKnowledgeSource = typeof knowledgeSources.$inferInsert;
export type LandingPage = typeof landingPages.$inferSelect;
export type NewLandingPage = typeof landingPages.$inferInsert;
export type InsertLandingPage = typeof landingPages.$inferInsert;
export type LeadSource = typeof leadSources.$inferSelect;
export type NewLeadSource = typeof leadSources.$inferInsert;
export type InsertLeadSource = typeof leadSources.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type InsertLead = typeof leads.$inferInsert;
export type MarketingMaterial = typeof marketingMaterials.$inferSelect;
export type NewMarketingMaterial = typeof marketingMaterials.$inferInsert;
export type InsertMarketingMaterial = typeof marketingMaterials.$inferInsert;
export type NotificationReceipt = typeof notificationReceipts.$inferSelect;
export type NewNotificationReceipt = typeof notificationReceipts.$inferInsert;
export type InsertNotificationReceipt =
  typeof notificationReceipts.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type InsertNotification = typeof notifications.$inferInsert;
export type NurtureEnrollment = typeof nurtureEnrollments.$inferSelect;
export type NewNurtureEnrollment = typeof nurtureEnrollments.$inferInsert;
export type InsertNurtureEnrollment = typeof nurtureEnrollments.$inferInsert;
export type NurtureSequence = typeof nurtureSequences.$inferSelect;
export type NewNurtureSequence = typeof nurtureSequences.$inferInsert;
export type InsertNurtureSequence = typeof nurtureSequences.$inferInsert;
export type NurtureStep = typeof nurtureSteps.$inferSelect;
export type NewNurtureStep = typeof nurtureSteps.$inferInsert;
export type InsertNurtureStep = typeof nurtureSteps.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;
export type InsertOrganizationMember = typeof organizationMembers.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type InsertOrganization = typeof organizations.$inferInsert;
export type PartnerClient = typeof partnerClients.$inferSelect;
export type NewPartnerClient = typeof partnerClients.$inferInsert;
export type InsertPartnerClient = typeof partnerClients.$inferInsert;
export type PartnerNote = typeof partnerNotes.$inferSelect;
export type NewPartnerNote = typeof partnerNotes.$inferInsert;
export type InsertPartnerNote = typeof partnerNotes.$inferInsert;
export type PartnerPayout = typeof partnerPayouts.$inferSelect;
export type NewPartnerPayout = typeof partnerPayouts.$inferInsert;
export type InsertPartnerPayout = typeof partnerPayouts.$inferInsert;
export type PartnerTask = typeof partnerTasks.$inferSelect;
export type NewPartnerTask = typeof partnerTasks.$inferInsert;
export type InsertPartnerTask = typeof partnerTasks.$inferInsert;
export type PhoneNumber = typeof phoneNumbers.$inferSelect;
export type NewPhoneNumber = typeof phoneNumbers.$inferInsert;
export type InsertPhoneNumber = typeof phoneNumbers.$inferInsert;
export type SalesAgentClient = typeof salesAgentClients.$inferSelect;
export type NewSalesAgentClient = typeof salesAgentClients.$inferInsert;
export type InsertSalesAgentClient = typeof salesAgentClients.$inferInsert;
export type SalesAgentPartner = typeof salesAgentPartners.$inferSelect;
export type NewSalesAgentPartner = typeof salesAgentPartners.$inferInsert;
export type InsertSalesAgentPartner = typeof salesAgentPartners.$inferInsert;
export type SatisfactionRating = typeof satisfactionRatings.$inferSelect;
export type NewSatisfactionRating = typeof satisfactionRatings.$inferInsert;
export type InsertSatisfactionRating = typeof satisfactionRatings.$inferInsert;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type InsertUser = typeof users.$inferInsert;
export type VoiceAgent = typeof voiceAgents.$inferSelect;
export type NewVoiceAgent = typeof voiceAgents.$inferInsert;
export type InsertVoiceAgent = typeof voiceAgents.$inferInsert;
export type VoiceCallMessage = typeof voiceCallMessages.$inferSelect;
export type NewVoiceCallMessage = typeof voiceCallMessages.$inferInsert;
export type InsertVoiceCallMessage = typeof voiceCallMessages.$inferInsert;
export type VoiceCall = typeof voiceCalls.$inferSelect;
export type NewVoiceCall = typeof voiceCalls.$inferInsert;
export type InsertVoiceCall = typeof voiceCalls.$inferInsert;
export type WebhookLog = typeof webhookLogs.$inferSelect;
export type NewWebhookLog = typeof webhookLogs.$inferInsert;
export type InsertWebhookLog = typeof webhookLogs.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type InsertWebhook = typeof webhooks.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type InsertSession = typeof sessions.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type InsertMessage = typeof messages.$inferInsert;
export type BotVersion = typeof botVersions.$inferSelect;
export type NewBotVersion = typeof botVersions.$inferInsert;
export type InsertBotVersion = typeof botVersions.$inferInsert;
export type DeploymentLog = typeof deploymentLogs.$inferSelect;
export type NewDeploymentLog = typeof deploymentLogs.$inferInsert;
export type InsertDeploymentLog = typeof deploymentLogs.$inferInsert;
export type KnowledgeGap = typeof knowledgeGaps.$inferSelect;
export type NewKnowledgeGap = typeof knowledgeGaps.$inferInsert;
export type InsertKnowledgeGap = typeof knowledgeGaps.$inferInsert;
export type RepairLog = typeof repairLogs.$inferSelect;
export type NewRepairLog = typeof repairLogs.$inferInsert;
export type InsertRepairLog = typeof repairLogs.$inferInsert;
