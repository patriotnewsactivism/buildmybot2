/**
 * Consolidated Performance Indexes Migration
 *
 * This migration consolidates all performance indexes into a single source of truth.
 * Replaces:
 * - server/migrations/add-performance-indexes.sql (152+ indexes, blocking)
 * - server/migrations/addPerformanceIndexes.ts (28 indexes, concurrent)
 *
 * Features:
 * - All indexes created with CONCURRENT (non-blocking)
 * - Idempotent (checks existence before creating)
 * - Comprehensive coverage of all tables
 * - Full-text search support (GIN indexes)
 * - JSON column indexing (GIN indexes)
 * - Composite indexes for common query patterns
 * - Partial indexes for filtered queries
 *
 * Usage: Called by scripts/migrate.ts as migration 002
 */

import { sql } from 'drizzle-orm';
import { db } from '../db';

interface IndexResult {
  success: boolean;
  indexesCreated: string[];
  errors: string[];
}

/**
 * Check if an index exists
 */
async function indexExists(indexName: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT 1 FROM pg_indexes WHERE indexname = ${indexName}
    `);
    return result.rows.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Create an index if it doesn't exist
 */
async function createIndexIfNotExists(
  indexName: string,
  createStatement: string,
): Promise<boolean> {
  try {
    if (await indexExists(indexName)) {
      console.log(`  ⏭️  Index ${indexName} already exists, skipping`);
      return false;
    }

    await db.execute(sql.raw(createStatement));
    console.log(`  ✅ Created index: ${indexName}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to create index ${indexName}:`, error);
    throw error;
  }
}

/**
 * Main migration function
 */
export async function consolidatedIndexes(): Promise<IndexResult> {
  const result: IndexResult = {
    success: false,
    indexesCreated: [],
    errors: [],
  };

  console.log('🚀 Creating consolidated performance indexes...\n');

  const indexes = [
    // ========================================
    // USERS TABLE - Authentication & User Management
    // ========================================
    {
      name: 'idx_users_email',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
            ON users(email) WHERE deleted_at IS NULL`,
      description: 'Fast email lookups for authentication',
    },
    {
      name: 'idx_users_organization_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_organization_id
            ON users(organization_id) WHERE deleted_at IS NULL`,
      description: 'User queries filtered by organization',
    },
    {
      name: 'idx_users_role',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role
            ON users(role) WHERE deleted_at IS NULL`,
      description: 'User queries by role (admin, client, etc.)',
    },
    {
      name: 'idx_users_plan',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_plan
            ON users(plan)`,
      description: 'Billing and subscription queries',
    },
    {
      name: 'idx_users_status',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_status
            ON users(status)`,
      description: 'Active/inactive user filtering',
    },
    {
      name: 'idx_users_referred_by',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_referred_by
            ON users(referred_by) WHERE referred_by IS NOT NULL`,
      description: 'Referral tracking',
    },
    {
      name: 'idx_users_stripe_customer_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_stripe_customer_id
            ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL`,
      description: 'Stripe integration lookups',
    },
    {
      name: 'idx_users_created_at',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at
            ON users(created_at DESC)`,
      description: 'Recent user queries',
    },
    {
      name: 'idx_users_org_role',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_org_role
            ON users(organization_id, role) WHERE deleted_at IS NULL`,
      description: 'Composite: Users by org and role',
    },
    {
      name: 'idx_users_plan_status_created',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_plan_status_created
            ON users(plan, status, created_at DESC) WHERE deleted_at IS NULL`,
      description: 'Composite: Admin dashboard queries',
    },

    // ========================================
    // BOTS TABLE - Bot Management & Analytics
    // ========================================
    {
      name: 'idx_bots_organization_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bots_organization_id
            ON bots(organization_id) WHERE deleted_at IS NULL`,
      description: 'Bots by organization',
    },
    {
      name: 'idx_bots_user_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bots_user_id
            ON bots(user_id) WHERE deleted_at IS NULL`,
      description: 'Bots by creator',
    },
    {
      name: 'idx_bots_active',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bots_active
            ON bots(active, created_at DESC) WHERE deleted_at IS NULL`,
      description: 'Active bot filtering',
    },
    {
      name: 'idx_bots_type',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bots_type
            ON bots(type)`,
      description: 'Bot type filtering',
    },
    {
      name: 'idx_bots_is_public',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bots_is_public
            ON bots(is_public)`,
      description: 'Public bot discovery',
    },
    {
      name: 'idx_bots_org_active_public',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bots_org_active_public
            ON bots(organization_id, active, is_public) WHERE deleted_at IS NULL`,
      description: 'Composite: Active bots by org',
    },
    {
      name: 'idx_bots_org_active_created',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bots_org_active_created
            ON bots(organization_id, active, created_at DESC) WHERE deleted_at IS NULL`,
      description: 'Composite: Recent active bots',
    },
    {
      name: 'idx_bots_system_prompt_fulltext',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bots_system_prompt_fulltext
            ON bots USING gin(to_tsvector('english', system_prompt))`,
      description: 'Full-text search on bot prompts',
    },
    {
      name: 'idx_bots_analytics_gin',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bots_analytics_gin
            ON bots USING gin(analytics)`,
      description: 'JSON search on analytics data',
    },

    // ========================================
    // LEADS TABLE - CRM & Lead Management
    // ========================================
    {
      name: 'idx_leads_organization_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_organization_id
            ON leads(organization_id)`,
      description: 'Leads by organization',
    },
    {
      name: 'idx_leads_user_id_created',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_user_id_created
            ON leads(user_id, created_at DESC)`,
      description: 'Leads by user with recency',
    },
    {
      name: 'idx_leads_bot_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_bot_id
            ON leads(source_bot_id)`,
      description: 'Leads by source bot',
    },
    {
      name: 'idx_leads_status',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_status
            ON leads(status, created_at DESC)`,
      description: 'Leads by status',
    },
    {
      name: 'idx_leads_score',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_score
            ON leads(score DESC)`,
      description: 'Lead scoring and prioritization',
    },
    {
      name: 'idx_leads_email',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_email
            ON leads(email)`,
      description: 'Lead email lookups',
    },
    {
      name: 'idx_leads_org_status_created',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_org_status_created
            ON leads(organization_id, status, created_at DESC)`,
      description: 'Composite: CRM dashboard queries',
    },
    {
      name: 'idx_leads_bot_created',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_bot_created
            ON leads(source_bot_id, created_at DESC)`,
      description: 'Composite: Bot performance tracking',
    },

    // ========================================
    // CONVERSATIONS TABLE - Chat History & Analytics
    // ========================================
    {
      name: 'idx_conversations_organization_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_organization_id
            ON conversations(organization_id)`,
      description: 'Conversations by organization',
    },
    {
      name: 'idx_conversations_bot_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_bot_id
            ON conversations(bot_id, created_at DESC)`,
      description: 'Conversations by bot',
    },
    {
      name: 'idx_conversations_session_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_session_id
            ON conversations(session_id)`,
      description: 'Conversation thread tracking',
    },
    {
      name: 'idx_conversations_user_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_user_id
            ON conversations(user_id)`,
      description: 'User conversation history',
    },
    {
      name: 'idx_conversations_sentiment',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_sentiment
            ON conversations(sentiment)`,
      description: 'Sentiment analysis queries',
    },
    {
      name: 'idx_conversations_org_bot_timestamp_sentiment',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_org_bot_timestamp_sentiment
            ON conversations(organization_id, bot_id, timestamp DESC, sentiment)
            WHERE deleted_at IS NULL`,
      description: 'Composite: Dashboard analytics',
    },

    // ========================================
    // ORGANIZATIONS TABLE - Multi-Tenancy
    // ========================================
    {
      name: 'idx_organizations_owner_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_owner_id
            ON organizations(owner_id)`,
      description: 'Organizations by owner',
    },
    {
      name: 'idx_organizations_slug',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_slug
            ON organizations(slug) WHERE deleted_at IS NULL`,
      description: 'Org slug lookups (unique constraint)',
    },
    {
      name: 'idx_organizations_plan',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_plan
            ON organizations(plan)`,
      description: 'Organizations by subscription plan',
    },
    {
      name: 'idx_organizations_subscription_status',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_subscription_status
            ON organizations(subscription_status)`,
      description: 'Billing status queries',
    },
    {
      name: 'idx_organizations_created_at',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_created_at
            ON organizations(created_at DESC)`,
      description: 'Recent organization queries',
    },

    // ========================================
    // ORGANIZATION_MEMBERS TABLE - Team Management
    // ========================================
    {
      name: 'idx_org_members_user',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_user
            ON organization_members(user_id)`,
      description: 'User memberships',
    },
    {
      name: 'idx_org_members_org',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_org
            ON organization_members(organization_id)`,
      description: 'Organization team members',
    },
    {
      name: 'idx_org_members_role',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_role
            ON organization_members(role)`,
      description: 'Members by role',
    },
    {
      name: 'idx_org_members_permissions_gin',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_permissions_gin
            ON organization_members USING gin(permissions)`,
      description: 'JSON search on permissions',
    },

    // ========================================
    // AUDIT_LOGS TABLE - Security & Compliance
    // ========================================
    {
      name: 'idx_audit_logs_org_action',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_org_action
            ON audit_logs(organization_id, action, created_at DESC)`,
      description: 'Audit queries by action',
    },
    {
      name: 'idx_audit_logs_user_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_id
            ON audit_logs(user_id, created_at DESC)`,
      description: 'User activity tracking',
    },
    {
      name: 'idx_audit_logs_resource',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_resource
            ON audit_logs(resource_type, resource_id)`,
      description: 'Resource change history',
    },
    {
      name: 'idx_audit_logs_created_at',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at
            ON audit_logs(created_at DESC)`,
      description: 'Recent activity queries',
    },

    // ========================================
    // ANALYTICS_EVENTS TABLE - Event Tracking
    // ========================================
    {
      name: 'idx_analytics_events_org',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_org
            ON analytics_events(organization_id, created_at DESC)`,
      description: 'Analytics by organization',
    },
    {
      name: 'idx_analytics_events_bot',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_bot
            ON analytics_events(bot_id, created_at DESC)`,
      description: 'Bot-specific analytics',
    },
    {
      name: 'idx_analytics_events_type',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_type
            ON analytics_events(event_type, created_at DESC)`,
      description: 'Event type filtering',
    },
    {
      name: 'idx_analytics_events_session_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_session_id
            ON analytics_events(session_id)`,
      description: 'Session tracking',
    },
    {
      name: 'idx_analytics_events_org_type_timestamp',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_org_type_timestamp
            ON analytics_events(organization_id, event_type, created_at DESC)
            WHERE created_at > NOW() - INTERVAL '90 days'`,
      description: 'Partial: Recent analytics (90 days)',
    },

    // ========================================
    // PARTNER_CLIENTS TABLE - Partner Management
    // ========================================
    {
      name: 'idx_partner_clients_partner_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_partner_clients_partner_id
            ON partner_clients(partner_id)`,
      description: 'Clients by partner',
    },
    {
      name: 'idx_partner_clients_client_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_partner_clients_client_id
            ON partner_clients(client_id)`,
      description: 'Partner by client (reverse lookup)',
    },
    {
      name: 'idx_partner_clients_organization_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_partner_clients_organization_id
            ON partner_clients(organization_id)`,
      description: 'Clients by organization',
    },
    {
      name: 'idx_partner_clients_partner_org',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_partner_clients_partner_org
            ON partner_clients(partner_id, organization_id)`,
      description: 'Composite: Partner dashboard',
    },

    // ========================================
    // BOT_TEMPLATES TABLE - Marketplace
    // ========================================
    {
      name: 'idx_bot_templates_public',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bot_templates_public
            ON bot_templates(is_public, rating DESC) WHERE is_public = true`,
      description: 'Public templates by rating',
    },
    {
      name: 'idx_bot_templates_category',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bot_templates_category
            ON bot_templates(category, industry)`,
      description: 'Templates by category and industry',
    },
    {
      name: 'idx_bot_templates_is_premium',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bot_templates_is_premium
            ON bot_templates(is_premium)`,
      description: 'Premium template filtering',
    },
    {
      name: 'idx_bot_templates_install_count',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bot_templates_install_count
            ON bot_templates(install_count DESC)`,
      description: 'Popular templates',
    },

    // ========================================
    // IMPERSONATION_SESSIONS TABLE - Security
    // ========================================
    {
      name: 'idx_impersonation_sessions_actor',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_impersonation_sessions_actor
            ON impersonation_sessions(actor_user_id, created_at DESC)`,
      description: 'Impersonation by admin',
    },
    {
      name: 'idx_impersonation_sessions_target',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_impersonation_sessions_target
            ON impersonation_sessions(target_user_id)`,
      description: 'Impersonation of user',
    },
    {
      name: 'idx_impersonation_sessions_active',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_impersonation_sessions_active
            ON impersonation_sessions(is_active, expires_at) WHERE is_active = true`,
      description: 'Active impersonation sessions',
    },

    // ========================================
    // KNOWLEDGE_SOURCES TABLE - Knowledge Base
    // ========================================
    {
      name: 'idx_knowledge_sources_bot_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_sources_bot_id
            ON knowledge_sources(bot_id)`,
      description: 'Knowledge by bot',
    },
    {
      name: 'idx_knowledge_sources_org_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_sources_org_id
            ON knowledge_sources(organization_id)`,
      description: 'Knowledge by organization',
    },
    {
      name: 'idx_knowledge_sources_status',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_sources_status
            ON knowledge_sources(status, created_at DESC)`,
      description: 'Knowledge processing status',
    },

    // ========================================
    // KNOWLEDGE_CHUNKS TABLE - RAG System
    // ========================================
    {
      name: 'idx_knowledge_chunks_bot_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_chunks_bot_id
            ON knowledge_chunks(bot_id)`,
      description: 'Chunks by bot',
    },
    {
      name: 'idx_knowledge_chunks_source_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_chunks_source_id
            ON knowledge_chunks(source_id)`,
      description: 'Chunks by source',
    },
    {
      name: 'idx_knowledge_chunks_content_hash',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_chunks_content_hash
            ON knowledge_chunks(content_hash)`,
      description: 'Deduplication via hash',
    },
    {
      name: 'idx_knowledge_chunks_content_fulltext',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_chunks_content_fulltext
            ON knowledge_chunks USING gin(to_tsvector('english', content))`,
      description: 'Full-text search on content',
    },
    {
      name: 'idx_knowledge_chunks_metadata_gin',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_chunks_metadata_gin
            ON knowledge_chunks USING gin(metadata)`,
      description: 'JSON search on metadata',
    },

    // ========================================
    // SESSIONS TABLE - Authentication
    // ========================================
    {
      name: 'idx_sessions_expire',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_expire
            ON sessions(expire)`,
      description: 'Session cleanup by expiry',
    },

    // ========================================
    // PARTNER_PAYOUTS TABLE - Financial
    // ========================================
    {
      name: 'idx_partner_payouts_partner_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_partner_payouts_partner_id
            ON partner_payouts(partner_id, created_at DESC)`,
      description: 'Payouts by partner',
    },
    {
      name: 'idx_partner_payouts_status',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_partner_payouts_status
            ON partner_payouts(status)`,
      description: 'Payout status filtering',
    },

    // ========================================
    // SUPPORT_TICKETS TABLE - Customer Support
    // ========================================
    {
      name: 'idx_support_tickets_org_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_support_tickets_org_id
            ON support_tickets(organization_id, created_at DESC)`,
      description: 'Tickets by organization',
    },
    {
      name: 'idx_support_tickets_user_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_support_tickets_user_id
            ON support_tickets(user_id)`,
      description: 'Tickets by user',
    },
    {
      name: 'idx_support_tickets_status',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_support_tickets_status
            ON support_tickets(status, priority DESC)`,
      description: 'Tickets by status and priority',
    },
  ];

  console.log(`Creating ${indexes.length} performance indexes...\n`);

  for (const index of indexes) {
    try {
      const created = await createIndexIfNotExists(index.name, index.sql);
      if (created) {
        result.indexesCreated.push(index.name);
      }
    } catch (error) {
      result.errors.push(`${index.name}: ${error}`);
    }
  }

  result.success = result.errors.length === 0;

  console.log('\n📊 Index Creation Summary:');
  console.log(`   Total indexes: ${indexes.length}`);
  console.log(`   Created: ${result.indexesCreated.length}`);
  console.log(`   Already existed: ${indexes.length - result.indexesCreated.length - result.errors.length}`);
  console.log(`   Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log('\n⚠️  Errors encountered:');
    for (const error of result.errors) {
      console.log(`   - ${error}`);
    }
  }

  console.log('\n✅ Consolidated indexes migration complete!');

  return result;
}
