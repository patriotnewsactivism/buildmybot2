/**
 * Database Performance Indexes Migration
 *
 * ⚠️  DEPRECATED - This file has been replaced by 002_consolidated_indexes.ts
 *
 * This script adds indexes to improve query performance across the application.
 * Run this after the initial schema is set up.
 *
 * Usage: npx tsx server/migrations/addPerformanceIndexes.ts
 *
 * @deprecated Use scripts/migrate.ts with migration 002_consolidated_indexes.ts instead
 */

import { sql } from 'drizzle-orm';
import { db } from '../db';

interface IndexResult {
  success: boolean;
  indexesCreated: string[];
  errors: string[];
}

async function createIndexIfNotExists(
  indexName: string,
  createStatement: string,
): Promise<boolean> {
  try {
    // Check if index exists
    const result = await db.execute(sql`
      SELECT 1 FROM pg_indexes WHERE indexname = ${indexName}
    `);

    if (result.rows.length > 0) {
      console.log(`  ⏭️  Index ${indexName} already exists, skipping`);
      return false;
    }

    // Create the index
    await db.execute(sql.raw(createStatement));
    console.log(`  ✅ Created index: ${indexName}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to create index ${indexName}:`, error);
    throw error;
  }
}

export async function addPerformanceIndexes(): Promise<IndexResult> {
  const result: IndexResult = {
    success: false,
    indexesCreated: [],
    errors: [],
  };

  console.log('🚀 Adding performance indexes...\n');

  const indexes = [
    // ========================================
    // BOTS TABLE INDEXES
    // ========================================
    {
      name: 'idx_bots_organization_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bots_organization_id
            ON bots(organization_id) WHERE deleted_at IS NULL`,
    },
    {
      name: 'idx_bots_user_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bots_user_id
            ON bots(user_id) WHERE deleted_at IS NULL`,
    },
    {
      name: 'idx_bots_active',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bots_active
            ON bots(active, created_at DESC) WHERE deleted_at IS NULL`,
    },

    // ========================================
    // LEADS TABLE INDEXES
    // ========================================
    {
      name: 'idx_leads_user_id_created',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_user_id_created
            ON leads(user_id, created_at DESC)`,
    },
    {
      name: 'idx_leads_bot_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_bot_id
            ON leads(bot_id)`,
    },
    {
      name: 'idx_leads_status',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_status
            ON leads(status, created_at DESC)`,
    },
    {
      name: 'idx_leads_organization_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_organization_id
            ON leads(organization_id)`,
    },

    // ========================================
    // CONVERSATIONS TABLE INDEXES
    // ========================================
    {
      name: 'idx_conversations_bot_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_bot_id
            ON conversations(bot_id, created_at DESC)`,
    },
    {
      name: 'idx_conversations_session_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_session_id
            ON conversations(session_id)`,
    },

    // ========================================
    // USERS TABLE INDEXES
    // ========================================
    {
      name: 'idx_users_email',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
            ON users(email) WHERE deleted_at IS NULL`,
    },
    {
      name: 'idx_users_organization_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_organization_id
            ON users(organization_id)`,
    },
    {
      name: 'idx_users_role',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role
            ON users(role) WHERE deleted_at IS NULL`,
    },
    {
      name: 'idx_users_referred_by',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_referred_by
            ON users(referred_by) WHERE referred_by IS NOT NULL`,
    },

    // ========================================
    // PARTNER_CLIENTS TABLE INDEXES
    // ========================================
    {
      name: 'idx_partner_clients_partner_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_partner_clients_partner_id
            ON partner_clients(partner_id)`,
    },
    {
      name: 'idx_partner_clients_client_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_partner_clients_client_id
            ON partner_clients(client_id)`,
    },

    // ========================================
    // AUDIT_LOGS TABLE INDEXES
    // ========================================
    {
      name: 'idx_audit_logs_org_action',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_org_action
            ON audit_logs(organization_id, action, created_at DESC)`,
    },
    {
      name: 'idx_audit_logs_user_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_id
            ON audit_logs(user_id, created_at DESC)`,
    },
    {
      name: 'idx_audit_logs_resource',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_resource
            ON audit_logs(resource_type, resource_id)`,
    },

    // ========================================
    // ANALYTICS_EVENTS TABLE INDEXES
    // ========================================
    {
      name: 'idx_analytics_events_org',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_org
            ON analytics_events(organization_id, created_at DESC)`,
    },
    {
      name: 'idx_analytics_events_bot',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_bot
            ON analytics_events(bot_id, created_at DESC)`,
    },
    {
      name: 'idx_analytics_events_type',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_type
            ON analytics_events(event_type, created_at DESC)`,
    },

    // ========================================
    // ORGANIZATION_MEMBERS TABLE INDEXES
    // ========================================
    {
      name: 'idx_org_members_user',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_user
            ON organization_members(user_id)`,
    },
    {
      name: 'idx_org_members_org',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_org
            ON organization_members(organization_id)`,
    },

    // ========================================
    // BOT_TEMPLATES TABLE INDEXES
    // ========================================
    {
      name: 'idx_bot_templates_public',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bot_templates_public
            ON bot_templates(is_public, rating DESC) WHERE is_public = true`,
    },
    {
      name: 'idx_bot_templates_category',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bot_templates_category
            ON bot_templates(category, industry)`,
    },

    // ========================================
    // IMPERSONATION_SESSIONS TABLE INDEXES
    // ========================================
    {
      name: 'idx_impersonation_sessions_actor',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_impersonation_sessions_actor
            ON impersonation_sessions(actor_user_id, created_at DESC)`,
    },
    {
      name: 'idx_impersonation_sessions_target',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_impersonation_sessions_target
            ON impersonation_sessions(target_user_id)`,
    },
    {
      name: 'idx_impersonation_sessions_active',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_impersonation_sessions_active
            ON impersonation_sessions(is_active, expires_at) WHERE is_active = true`,
    },

    // ========================================
    // KNOWLEDGE_SOURCES TABLE INDEXES
    // ========================================
    {
      name: 'idx_knowledge_sources_bot_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_sources_bot_id
            ON knowledge_sources(bot_id)`,
    },
    {
      name: 'idx_knowledge_sources_status',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_sources_status
            ON knowledge_sources(status, created_at DESC)`,
    },

    // ========================================
    // KNOWLEDGE_CHUNKS TABLE INDEXES
    // ========================================
    {
      name: 'idx_knowledge_chunks_bot_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_chunks_bot_id
            ON knowledge_chunks(bot_id)`,
    },
    {
      name: 'idx_knowledge_chunks_source_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_chunks_source_id
            ON knowledge_chunks(source_id)`,
    },
    {
      name: 'idx_knowledge_chunks_content_hash',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_chunks_content_hash
            ON knowledge_chunks(content_hash)`,
    },

    // ========================================
    // SESSIONS TABLE INDEX (for faster session lookups)
    // ========================================
    {
      name: 'idx_sessions_expire',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_expire
            ON sessions(expire)`,
    },

    // ========================================
    // COMPOSITE INDEXES FOR COMMON QUERIES
    // ========================================
    {
      name: 'idx_bots_org_active_public',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bots_org_active_public
            ON bots(organization_id, active, is_public) WHERE deleted_at IS NULL`,
    },
    {
      name: 'idx_leads_org_status_created',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_org_status_created
            ON leads(organization_id, status, created_at DESC)`,
    },
  ];

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

  console.log('\n📊 Migration Summary:');
  console.log(`   Indexes created: ${result.indexesCreated.length}`);
  console.log(`   Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log('\n⚠️  Errors encountered:');
    for (const error of result.errors) {
      console.log(`   - ${error}`);
    }
  }

  console.log('\n✅ Performance indexes migration complete!');

  return result;
}

// Run if executed directly (ES module compatible)
const isMainModule =
  import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMainModule) {
  addPerformanceIndexes()
    .then((result) => {
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
