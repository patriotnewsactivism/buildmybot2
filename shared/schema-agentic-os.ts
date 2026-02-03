/**
 * Agentic OS Schema Extensions
 * Complete transformation from Chatbot Platform to Autonomous Agent Operating System
 * Supports: Voice AI, Agency Ecosystem, Multi-Agent, Multimodal, Enterprise Features
 */

import {
  boolean,
  integer,
  json,
  pgTable,
  real,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { bots, organizations, users } from './schema';

// ========================================
// AGENCY BILLING ARBITRAGE
// ========================================

/**
 * Agency-specific pricing tiers for usage arbitrage
 * Agencies buy at wholesale, sell at retail
 */
export const agencyPricingTiers = pgTable('agency_pricing_tiers', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),

  // Wholesale costs (what agency pays BuildMyBot)
  wholesaleVoicePerMinute: real('wholesale_voice_per_minute').default(0.1),
  wholesalePremiumTokensPer1k: real('wholesale_premium_tokens_per1k').default(
    0.05,
  ),
  wholesaleStandardTokensPer1k: real('wholesale_standard_tokens_per1k').default(
    0.01,
  ),

  // Retail pricing (what agency charges clients)
  retailVoicePerMinute: real('retail_voice_per_minute').default(0.2),
  retailPremiumTokensPer1k: real('retail_premium_tokens_per1k').default(0.1),
  retailStandardTokensPer1k: real('retail_standard_tokens_per1k').default(0.02),

  // Markup limits based on agency tier
  maxMarkupPercentage: real('max_markup_percentage').default(25.0),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Usage wallets for credit-based billing
 * Tracks credits for both agencies and their clients
 */
export const usageWallets = pgTable('usage_wallets', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),

  // Credit balances (in cents for precision)
  balanceCents: integer('balance_cents').default(0),
  lifetimeSpentCents: integer('lifetime_spent_cents').default(0),

  // Auto-recharge settings
  autoRechargeEnabled: boolean('auto_recharge_enabled').default(false),
  autoRechargeThresholdCents: integer('auto_recharge_threshold_cents').default(
    500,
  ),
  autoRechargeAmountCents: integer('auto_recharge_amount_cents').default(5000),

  // Low balance alerts
  lowBalanceAlertSent: boolean('low_balance_alert_sent').default(false),
  lastAlertAt: timestamp('last_alert_at'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Revenue share ledger - tracks every billable event
 * Captures wholesale cost, retail charge, and agency profit
 */
export const revenueShareLedger = pgTable('revenue_share_ledger', {
  id: text('id').primaryKey(),

  // Party relationships
  agencyOrganizationId: text('agency_organization_id')
    .notNull()
    .references(() => organizations.id),
  clientOrganizationId: text('client_organization_id').references(
    () => organizations.id,
  ),

  // Event details
  eventType: varchar('event_type', { length: 50 }).notNull(), // 'voice_minute', 'premium_tokens', 'standard_tokens'
  quantity: real('quantity').notNull(), // minutes or token count

  // Financial tracking (all in cents)
  wholesaleCostCents: integer('wholesale_cost_cents').notNull(), // What agency pays BuildMyBot
  retailChargeCents: integer('retail_charge_cents').notNull(), // What client pays agency
  agencyProfitCents: integer('agency_profit_cents').notNull(), // Difference (markup)

  // Related resources
  conversationId: text('conversation_id'),
  botId: text('bot_id').references(() => bots.id),

  // Billing cycle
  billedAt: timestamp('billed_at'),
  billingPeriodStart: timestamp('billing_period_start'),
  billingPeriodEnd: timestamp('billing_period_end'),

  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Agency subscription packages (SaaS Configurator)
 * Agencies define custom pricing tiers for their clients
 */
export const agencySubscriptionPackages = pgTable(
  'agency_subscription_packages',
  {
    id: text('id').primaryKey(),
    agencyOrganizationId: text('agency_organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    // Package details
    name: varchar('name', { length: 100 }).notNull(), // "Silver", "Gold", "Platinum"
    description: text('description'),
    monthlyPriceCents: integer('monthly_price_cents').notNull(),

    // Included credits
    includedVoiceMinutes: integer('included_voice_minutes').default(0),
    includedPremiumTokens: integer('included_premium_tokens').default(0),
    includedStandardTokens: integer('included_standard_tokens').default(0),

    // Overage rates (when included credits exhausted)
    overageVoicePerMinute: real('overage_voice_per_minute'),
    overagePremiumTokensPer1k: real('overage_premium_tokens_per1k'),
    overageStandardTokensPer1k: real('overage_standard_tokens_per1k'),

    // Stripe integration
    stripeProductId: varchar('stripe_product_id', { length: 255 }),
    stripePriceId: varchar('stripe_price_id', { length: 255 }),

    active: boolean('active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
);

// ========================================
// AGENTIC ACTIONS & TOOL USE
// ========================================

/**
 * Tool definitions - reusable actions that agents can execute
 * Supports webhooks, API calls, database operations
 */
export const toolDefinitions = pgTable('tool_definitions', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),

  // Tool metadata
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description').notNull(), // Used by LLM to decide when to call
  category: varchar('category', { length: 50 }).default('webhook'), // 'webhook', 'database', 'email', 'document'

  // Configuration
  config: json('config').notNull(), // { method: 'POST', url: '...', headers: {...}, auth: {...} }

  // Function calling schema (OpenAI standard)
  functionSchema: json('function_schema').notNull(), // { type: 'object', properties: {...}, required: [...] }

  // Security & permissions
  requiresApproval: boolean('requires_approval').default(false), // HITL flag
  approvalThreshold: json('approval_threshold'), // { amount: 100, currency: 'USD' } for conditional approval

  // OAuth/API keys
  authType: varchar('auth_type', { length: 50 }), // 'none', 'api_key', 'oauth2', 'bearer'
  encryptedCredentials: text('encrypted_credentials'), // Stored securely

  // Usage tracking
  executionCount: integer('execution_count').default(0),
  lastExecutedAt: timestamp('last_executed_at'),
  averageExecutionTimeMs: integer('average_execution_time_ms'),

  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Bot-specific tool assignments
 * Which tools are available to which bots
 */
export const botTools = pgTable('bot_tools', {
  id: text('id').primaryKey(),
  botId: text('bot_id')
    .notNull()
    .references(() => bots.id, { onDelete: 'cascade' }),
  toolId: text('tool_id')
    .notNull()
    .references(() => toolDefinitions.id, { onDelete: 'cascade' }),

  // Override tool settings per bot
  enabled: boolean('enabled').default(true),
  customConfig: json('custom_config'), // Bot-specific overrides

  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Action execution log - audit trail of all tool invocations
 */
export const actionExecutionLog = pgTable('action_execution_log', {
  id: text('id').primaryKey(),

  // Context
  botId: text('bot_id').references(() => bots.id),
  conversationId: text('conversation_id'),
  toolId: text('tool_id').references(() => toolDefinitions.id),

  // Execution details
  status: varchar('status', { length: 50 }).notNull(), // 'pending', 'approved', 'executing', 'success', 'failed'
  inputParameters: json('input_parameters').notNull(),
  outputData: json('output_data'),
  errorMessage: text('error_message'),

  // Timing
  startedAt: timestamp('started_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  durationMs: integer('duration_ms'),

  // Approval workflow
  requiresApproval: boolean('requires_approval').default(false),
  approvedBy: text('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),

  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// MULTI-AGENT ORCHESTRATION
// ========================================

/**
 * Agent roles within a bot (Supervisor-Worker pattern)
 */
export const agentRoles = pgTable('agent_roles', {
  id: text('id').primaryKey(),
  botId: text('bot_id')
    .notNull()
    .references(() => bots.id, { onDelete: 'cascade' }),

  // Role definition
  roleName: varchar('role_name', { length: 100 }).notNull(), // 'router', 'sales', 'support', 'billing'
  roleType: varchar('role_type', { length: 50 }).default('worker'), // 'supervisor', 'worker'
  description: text('description'),

  // Specialized configuration
  systemPrompt: text('system_prompt').notNull(),
  model: varchar('model', { length: 100 }).default('gpt-4o-mini'),
  temperature: real('temperature').default(0.7),

  // Tool access (which tools this role can use)
  availableTools: json('available_tools').default([]), // Array of tool IDs

  // Knowledge access (which sources this role can query)
  knowledgeSourceIds: json('knowledge_source_ids').default([]),

  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Agent handoffs - routing logic between roles
 */
export const agentHandoffRules = pgTable('agent_handoff_rules', {
  id: text('id').primaryKey(),
  botId: text('bot_id')
    .notNull()
    .references(() => bots.id, { onDelete: 'cascade' }),

  // Routing logic
  fromRoleId: text('from_role_id').references(() => agentRoles.id, {
    onDelete: 'cascade',
  }),
  toRoleId: text('to_role_id')
    .notNull()
    .references(() => agentRoles.id, { onDelete: 'cascade' }),

  // Trigger conditions
  triggerType: varchar('trigger_type', { length: 50 }).notNull(), // 'intent', 'sentiment', 'keyword', 'manual'
  triggerCondition: json('trigger_condition').notNull(), // { intent: 'billing_question' } or { sentiment < -0.5 }

  // Handoff message
  handoffMessage: text('handoff_message'), // "Let me connect you with our billing specialist..."

  priority: integer('priority').default(0), // For conflict resolution
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Shared conversation memory across agents
 */
export const agentMemory = pgTable('agent_memory', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),

  // Key-value store for context passing
  memoryKey: varchar('memory_key', { length: 100 }).notNull(), // 'user_name', 'company_size', 'budget_range'
  memoryValue: json('memory_value').notNull(),

  // Which agent wrote this
  writtenByRoleId: text('written_by_role_id').references(() => agentRoles.id),

  // Persistence
  expiresAt: timestamp('expires_at'), // For temporary context
  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// VOICE AI ENHANCEMENTS
// ========================================

/**
 * Voice session analytics
 * Tracks latency, sentiment, interruptions for optimization
 */
export const voiceSessionAnalytics = pgTable('voice_session_analytics', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  botId: text('bot_id').references(() => bots.id),

  // Latency metrics (in milliseconds)
  avgResponseLatency: integer('avg_response_latency'),
  p95ResponseLatency: integer('p95_response_latency'),
  avgTtsLatency: integer('avg_tts_latency'),
  avgLlmLatency: integer('avg_llm_latency'),

  // Interaction quality
  interruptionCount: integer('interruption_count').default(0),
  successfulBargeIns: integer('successful_barge_ins').default(0),
  failedBargeIns: integer('failed_barge_ins').default(0),

  // Sentiment analysis
  avgSentimentScore: real('avg_sentiment_score'), // -1 to 1
  sentimentProgression: json('sentiment_progression'), // Array of scores over time
  escalatedToHuman: boolean('escalated_to_human').default(false),
  escalationReason: varchar('escalation_reason', { length: 100 }),

  // Voice characteristics
  voiceId: varchar('voice_id', { length: 255 }),
  voiceSwitchCount: integer('voice_switch_count').default(0), // Emotional modulation changes

  // Call outcome
  callDurationSeconds: integer('call_duration_seconds'),
  callStatus: varchar('call_status', { length: 50 }), // 'completed', 'user_hangup', 'escalated', 'error'

  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Sentiment events - real-time emotional state tracking
 */
export const sentimentEvents = pgTable('sentiment_events', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),

  // Sentiment analysis
  sentimentScore: real('sentiment_score').notNull(), // -1 (angry) to 1 (happy)
  sentimentLabel: varchar('sentiment_label', { length: 50 }), // 'frustrated', 'neutral', 'satisfied'

  // Acoustic features
  pitch: real('pitch'),
  volume: real('volume'),
  speechRate: real('speech_rate'), // words per minute

  // Transcript context
  userMessage: text('user_message'),
  agentResponse: text('agent_response'),

  // Action taken
  triggeredVoiceChange: boolean('triggered_voice_change').default(false),
  triggeredEscalation: boolean('triggered_escalation').default(false),

  timestamp: timestamp('timestamp').defaultNow(),
});

// ========================================
// DOCUMENT GENERATION
// ========================================

/**
 * Document templates (FOIA, legal, contracts)
 */
export const documentTemplates = pgTable('document_templates', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id, {
    onDelete: 'cascade',
  }),

  // Template metadata
  name: varchar('name', { length: 255 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(), // 'legal', 'foia', 'contract', 'report'
  description: text('description'),

  // Template content (Handlebars syntax)
  templateContent: text('template_content').notNull(),

  // Dynamic fields
  requiredFields: json('required_fields').notNull(), // [{ name: 'agency_name', type: 'text', label: 'Agency Name' }]
  optionalFields: json('optional_fields').default([]),

  // Styling
  cssStyles: text('css_styles'),
  headerHtml: text('header_html'),
  footerHtml: text('footer_html'),

  // Access control
  isPublic: boolean('is_public').default(false), // Available to all orgs
  isSystemTemplate: boolean('is_system_template').default(false), // Built-in templates

  // Usage tracking
  usageCount: integer('usage_count').default(0),

  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Generated documents log
 */
export const generatedDocuments = pgTable('generated_documents', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id),

  // Template used
  templateId: text('template_id').references(() => documentTemplates.id),

  // Generated content
  documentName: varchar('document_name', { length: 255 }).notNull(),
  fieldValues: json('field_values').notNull(), // Actual data filled in
  renderedHtml: text('rendered_html'),

  // File storage
  pdfUrl: varchar('pdf_url', { length: 500 }),
  docxUrl: varchar('docx_url', { length: 500 }),

  // Related context
  conversationId: text('conversation_id'),
  botId: text('bot_id').references(() => bots.id),

  // Delivery
  emailedTo: varchar('emailed_to', { length: 255 }),
  emailedAt: timestamp('emailed_at'),

  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// MULTIMODAL (VISION)
// ========================================

/**
 * Vision analysis results
 */
export const visionAnalysisResults = pgTable('vision_analysis_results', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  botId: text('bot_id').references(() => bots.id),

  // Image details
  imageUrl: varchar('image_url', { length: 500 }).notNull(),
  imageType: varchar('image_type', { length: 50 }), // 'diagnostic', 'product_search', 'ocr', 'general'

  // Analysis results
  analysisPrompt: text('analysis_prompt'),
  analysisResult: text('analysis_result').notNull(),

  // Extracted data (for OCR/document parsing)
  extractedText: text('extracted_text'),
  extractedData: json('extracted_data'), // Structured data (form fields, etc.)

  // Model used
  model: varchar('model', { length: 100 }).default('gpt-4o'),

  // Tokens used
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),

  createdAt: timestamp('created_at').defaultNow(),
});

// ========================================
// INDUSTRY SNAPSHOTS
// ========================================

/**
 * Pre-built industry bot templates (Snapshots)
 */
export const industrySnapshots = pgTable('industry_snapshots', {
  id: text('id').primaryKey(),

  // Snapshot metadata
  name: varchar('name', { length: 255 }).notNull(),
  industry: varchar('industry', { length: 100 }).notNull(), // 'dentist', 'law_firm', 'real_estate'
  description: text('description'),
  thumbnailUrl: varchar('thumbnail_url', { length: 500 }),

  // Complete bot configuration
  botConfig: json('bot_config').notNull(), // Full bot settings, prompts, tools, knowledge

  // Pre-loaded knowledge
  knowledgeBaseContent: text('knowledge_base_content'), // Industry-specific FAQs, scripts

  // Pre-configured tools
  includedTools: json('included_tools').default([]), // Tool definitions to auto-install

  // Pricing
  priceType: varchar('price_type', { length: 50 }).default('free'), // 'free', 'one_time', 'subscription'
  priceCents: integer('price_cents').default(0),

  // Agency marketplace
  createdByOrganizationId: text('created_by_organization_id').references(
    () => organizations.id,
  ),
  isMarketplaceTemplate: boolean('is_marketplace_template').default(false),
  commissionRate: real('commission_rate').default(0.2), // BuildMyBot takes 20% on sales

  // Usage tracking
  installCount: integer('install_count').default(0),
  rating: real('rating'),
  reviewCount: integer('review_count').default(0),

  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Snapshot installations - track which orgs installed which templates
 */
export const snapshotInstallations = pgTable('snapshot_installations', {
  id: text('id').primaryKey(),
  snapshotId: text('snapshot_id')
    .notNull()
    .references(() => industrySnapshots.id),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),

  // Created bot
  createdBotId: text('created_bot_id').references(() => bots.id),

  // Customizations applied
  customizations: json('customizations'),

  // Payment (if paid template)
  paidAmountCents: integer('paid_amount_cents').default(0),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),

  installedAt: timestamp('installed_at').defaultNow(),
});

// ========================================
// ENTERPRISE SECURITY
// ========================================

/**
 * PII redaction rules
 */
export const piiRedactionRules = pgTable('pii_redaction_rules', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),

  // Rule definition
  ruleName: varchar('rule_name', { length: 100 }).notNull(),
  piiType: varchar('pii_type', { length: 50 }).notNull(), // 'ssn', 'credit_card', 'phone', 'email', 'custom'

  // Regex pattern for detection
  detectionPattern: text('detection_pattern').notNull(),

  // Redaction strategy
  redactionStrategy: varchar('redaction_strategy', { length: 50 }).default(
    'mask',
  ), // 'mask', 'remove', 'tokenize'
  replacementText: varchar('replacement_text', { length: 100 }).default(
    '[REDACTED]',
  ),

  // Where to apply
  applyToLogs: boolean('apply_to_logs').default(true),
  applyToLlmInput: boolean('apply_to_llm_input').default(true),
  applyToStorage: boolean('apply_to_storage').default(true),

  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * BYOK (Bring Your Own Key) configurations
 */
export const byokConfigurations = pgTable('byok_configurations', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),

  // Provider
  provider: varchar('provider', { length: 50 }).notNull(), // 'openai', 'anthropic', 'google'

  // Encrypted API key
  encryptedApiKey: text('encrypted_api_key').notNull(),

  // Usage tracking (for their own billing)
  totalTokensUsed: integer('total_tokens_used').default(0),
  lastUsedAt: timestamp('last_used_at'),

  // Health check
  lastHealthCheckAt: timestamp('last_health_check_at'),
  isHealthy: boolean('is_healthy').default(true),
  lastErrorMessage: text('last_error_message'),

  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Export all tables
export * from './schema';
