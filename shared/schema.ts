import { pgTable, text, timestamp, boolean, integer, jsonb, varchar, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Utility for creating common fields
const createBaseFields = () => ({
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
});

// Organizations Table
export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  ownerId: text('owner_id').notNull(), // References users table
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: text('plan').default('free').notNull(), // e.g., 'free', 'pro', 'enterprise'
  isActive: boolean('is_active').default(true).notNull(),
  ...createBaseFields(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  bots: many(bots),
  knowledgeSources: many(knowledgeSources),
  repairLogs: many(repairLogs),
}));

// Users Table
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  email: text('email').unique().notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  role: text('role').default('user').notNull(), // e.g., 'admin', 'user', 'agent'
  profilePictureUrl: text('profile_picture_url'),
  lastLogin: timestamp('last_login'),
  ...createBaseFields(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, { fields: [users.organizationId], references: [organizations.id] }),
  bots: many(bots),
}));

// Bots Table
export const bots = pgTable('bots', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  creatorId: text('creator_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  persona: text('persona'),
  identity: text('identity'),
  tone: text('tone'),
  behavior: text('behavior'),
  model: text('model').default('gpt-5o-mini').notNull(),
  temperature: integer('temperature').default(70).notNull(), // Stored as integer, 0-100, representing 0.0-1.0
  maxTokens: integer('max_tokens').default(500).notNull(),
  voiceEnabled: boolean('voice_enabled').default(false).notNull(),
  voiceId: text('voice_id'), // Cartesia voice ID
  status: text('status').default('draft').notNull(), // e.g., 'draft', 'active', 'paused', 'archived'
  // CRM Configuration
  crmConfig: jsonb('crm_config').default('{}').notNull(), // e.g., { hotLeadThreshold: 80, integration: 'hubspot' }
  // Marketing Configuration
  marketingConfig: jsonb('marketing_config').default('{}').notNull(), // e.g., { viralContentEnabled: true, platforms: ['twitter'] }
  // Additional configurations as JSONB
  config: jsonb('config').default('{}').notNull(),
  ...createBaseFields(),
});

export const botsRelations = relations(bots, ({ one, many }) => ({
  organization: one(organizations, { fields: [bots.organizationId], references: [organizations.id] }),
  creator: one(users, { fields: [bots.creatorId], references: [users.id] }),
  knowledgeSources: many(knowledgeSources),
  repairLogs: many(repairLogs),
}));

// Knowledge Sources Table (for RAG)
export const knowledgeSources = pgTable('knowledge_sources', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  botId: text('bot_id').references(() => bots.id, { onDelete: 'cascade' }), // Optional, can be organization-wide
  type: text('type').notNull(), // e.g., 'pdf', 'website', 'text', 'api'
  name: text('name').notNull(),
  sourceUrl: text('source_url'), // For websites, PDFs
  textContent: text('text_content'), // For direct text input
  status: text('status').default('pending').notNull(), // 'pending', 'processing', 'completed', 'failed'
  lastProcessedAt: timestamp('last_processed_at'),
  processingError: text('processing_error'),
  metadata: jsonb('metadata').default('{}').notNull(), // e.g., { pageCount: 10, websiteDepth: 2 }
  ...createBaseFields(),
});

export const knowledgeSourcesRelations = relations(knowledgeSources, ({ one, many }) => ({
  organization: one(organizations, { fields: [knowledgeSources.organizationId], references: [organizations.id] }),
  bot: one(bots, { fields: [knowledgeSources.botId], references: [bots.id] }),
  knowledgeChunks: many(knowledgeChunks),
}));

// Knowledge Chunks Table (for RAG embeddings)
export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: text('id').primaryKey(),
  knowledgeSourceId: text('knowledge_source_id').references(() => knowledgeSources.id, { onDelete: 'cascade' }).notNull(),
  content: text('content').notNull(),
  embedding: text('embedding'), // Store as text, convert to vector on usage
  metadata: jsonb('metadata').default('{}').notNull(), // e.g., { pageNumber: 5, sectionTitle: 'Introduction' }
  ...createBaseFields(),
});

export const knowledgeChunksRelations = relations(knowledgeChunks, ({ one }) => ({
  knowledgeSource: one(knowledgeSources, { fields: [knowledgeChunks.knowledgeSourceId], references: [knowledgeSources.id] }),
}));

// Bot Templates Table
export const botTemplates = pgTable('bot_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  industry: text('industry').notNull(), // e.g., 'real_estate', 'healthcare', 'finance'
  persona: text('persona'),
  identity: text('identity'),
  tone: text('tone'),
  behavior: text('behavior'),
  model: text('model').default('gpt-5o-mini').notNull(),
  temperature: integer('temperature').default(70).notNull(),
  maxTokens: integer('max_tokens').default(500).notNull(),
  voiceEnabled: boolean('voice_enabled').default(false).notNull(),
  voiceId: text('voice_id'),
  crmConfig: jsonb('crm_config').default('{}').notNull(),
  marketingConfig: jsonb('marketing_config').default('{}').notNull(),
  config: jsonb('config').default('{}').notNull(),
  isPublic: boolean('is_public').default(false).notNull(),
  creatorId: text('creator_id').references(() => users.id, { onDelete: 'set null' }),
  ...createBaseFields(),
});

export const botTemplatesRelations = relations(botTemplates, ({ one }) => ({
  creator: one(users, { fields: [botTemplates.creatorId], references: [users.id] }),
}));

// Repair Logs Table
export const repairLogs = pgTable('repair_logs', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'no action' }),
  botId: text('bot_id').references(() => bots.id, { onDelete: 'cascade' }).notNull(),
  issueType: varchar('issue_type', { length: 100 }).notNull(),
  description: text('description').notNull(),
  suggestedFix: text('suggested_fix'),
  status: varchar('status', { length: 50 }).default('pending').notNull(), // 'pending', 'attempted', 'resolved', 'failed'
  attemptCount: integer('attempt_count').default(0).notNull(),
  lastAttemptAt: timestamp('last_attempt_at'),
  resolvedAt: timestamp('resolved_at'),
  metadata: jsonb('metadata').default('{}').notNull(),
  ...createBaseFields(),
});

export const repairLogsRelations = relations(repairLogs, ({ one }) => ({
  organization: one(organizations, { fields: [repairLogs.organizationId], references: [organizations.id] }),
  bot: one(bots, { fields: [repairLogs.botId], references: [bots.id] }),
}));

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Bot = typeof bots.$inferSelect;
export type NewBot = typeof bots.$inferInsert;

export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type NewKnowledgeSource = typeof knowledgeSources.$inferInsert;

export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type NewKnowledgeChunk = typeof knowledgeChunks.$inferInsert;

export type BotTemplate = typeof botTemplates.$inferSelect;
export type NewBotTemplate = typeof botTemplates.$inferInsert;

export type RepairLog = typeof repairLogs.$inferSelect;
export type NewRepairLog = typeof repairLogs.$inferInsert;
