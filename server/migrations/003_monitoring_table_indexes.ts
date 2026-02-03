/**
 * Monitoring Tables Indexes Migration
 *
 * Creates indexes for the new monitoring and analytics tables:
 * - audit_log_changes
 * - query_performance_logs
 * - system_health_metrics
 * - api_usage_metrics
 * - feature_usage_metrics
 * - error_logs
 *
 * All indexes are created with CONCURRENT to avoid blocking operations.
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
export async function monitoringTableIndexes(): Promise<IndexResult> {
  const result: IndexResult = {
    success: false,
    indexesCreated: [],
    errors: [],
  };

  console.log('🚀 Creating monitoring table indexes...\n');

  const indexes = [
    // ========================================
    // AUDIT_LOG_CHANGES TABLE
    // ========================================
    {
      name: 'idx_audit_log_changes_audit_log_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_changes_audit_log_id
            ON audit_log_changes(audit_log_id)`,
      description: 'Changes by audit log',
    },
    {
      name: 'idx_audit_log_changes_field_name',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_changes_field_name
            ON audit_log_changes(field_name)`,
      description: 'Changes by field name',
    },
    {
      name: 'idx_audit_log_changes_created_at',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_changes_created_at
            ON audit_log_changes(created_at DESC)`,
      description: 'Recent changes',
    },

    // ========================================
    // QUERY_PERFORMANCE_LOGS TABLE
    // ========================================
    {
      name: 'idx_query_performance_org_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_org_id
            ON query_performance_logs(organization_id, created_at DESC)`,
      description: 'Performance by organization',
    },
    {
      name: 'idx_query_performance_query_type',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_query_type
            ON query_performance_logs(query_type, execution_time_ms DESC)`,
      description: 'Slow queries by type',
    },
    {
      name: 'idx_query_performance_execution_time',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_execution_time
            ON query_performance_logs(execution_time_ms DESC, created_at DESC)`,
      description: 'Slowest queries',
    },
    {
      name: 'idx_query_performance_created_at',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_created_at
            ON query_performance_logs(created_at DESC)
            WHERE created_at > NOW() - INTERVAL '30 days'`,
      description: 'Partial: Recent query logs (30 days)',
    },

    // ========================================
    // SYSTEM_HEALTH_METRICS TABLE
    // ========================================
    {
      name: 'idx_system_health_metric_type',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_health_metric_type
            ON system_health_metrics(metric_type, recorded_at DESC)`,
      description: 'Metrics by type',
    },
    {
      name: 'idx_system_health_metric_name',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_health_metric_name
            ON system_health_metrics(metric_name, recorded_at DESC)`,
      description: 'Metrics by name',
    },
    {
      name: 'idx_system_health_recorded_at',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_health_recorded_at
            ON system_health_metrics(recorded_at DESC)`,
      description: 'Recent health metrics',
    },
    {
      name: 'idx_system_health_type_name_time',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_health_type_name_time
            ON system_health_metrics(metric_type, metric_name, recorded_at DESC)`,
      description: 'Composite: Time-series queries',
    },

    // ========================================
    // API_USAGE_METRICS TABLE
    // ========================================
    {
      name: 'idx_api_usage_org_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_usage_org_id
            ON api_usage_metrics(organization_id, created_at DESC)`,
      description: 'API usage by organization',
    },
    {
      name: 'idx_api_usage_user_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_usage_user_id
            ON api_usage_metrics(user_id, created_at DESC)`,
      description: 'API usage by user',
    },
    {
      name: 'idx_api_usage_endpoint',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_usage_endpoint
            ON api_usage_metrics(endpoint, method)`,
      description: 'API usage by endpoint',
    },
    {
      name: 'idx_api_usage_status_code',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_usage_status_code
            ON api_usage_metrics(status_code, created_at DESC)`,
      description: 'API errors and status codes',
    },
    {
      name: 'idx_api_usage_ip_address',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_usage_ip_address
            ON api_usage_metrics(ip_address, created_at DESC)`,
      description: 'Rate limiting by IP',
    },
    {
      name: 'idx_api_usage_response_time',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_usage_response_time
            ON api_usage_metrics(response_time_ms DESC)
            WHERE response_time_ms > 1000`,
      description: 'Partial: Slow API calls (>1s)',
    },
    {
      name: 'idx_api_usage_created_at',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_usage_created_at
            ON api_usage_metrics(created_at DESC)
            WHERE created_at > NOW() - INTERVAL '7 days'`,
      description: 'Partial: Recent API logs (7 days)',
    },

    // ========================================
    // FEATURE_USAGE_METRICS TABLE
    // ========================================
    {
      name: 'idx_feature_usage_org_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feature_usage_org_id
            ON feature_usage_metrics(organization_id, last_used_at DESC)`,
      description: 'Feature usage by organization',
    },
    {
      name: 'idx_feature_usage_user_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feature_usage_user_id
            ON feature_usage_metrics(user_id, last_used_at DESC)`,
      description: 'Feature usage by user',
    },
    {
      name: 'idx_feature_usage_feature_name',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feature_usage_feature_name
            ON feature_usage_metrics(feature_name, usage_count DESC)`,
      description: 'Most used features',
    },
    {
      name: 'idx_feature_usage_org_feature',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feature_usage_org_feature
            ON feature_usage_metrics(organization_id, feature_name, last_used_at DESC)`,
      description: 'Composite: Org feature tracking',
    },

    // ========================================
    // ERROR_LOGS TABLE
    // ========================================
    {
      name: 'idx_error_logs_org_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_error_logs_org_id
            ON error_logs(organization_id, created_at DESC)`,
      description: 'Errors by organization',
    },
    {
      name: 'idx_error_logs_user_id',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_error_logs_user_id
            ON error_logs(user_id, created_at DESC)`,
      description: 'Errors by user',
    },
    {
      name: 'idx_error_logs_severity',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_error_logs_severity
            ON error_logs(severity, created_at DESC)`,
      description: 'Errors by severity',
    },
    {
      name: 'idx_error_logs_category',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_error_logs_category
            ON error_logs(category, severity, created_at DESC)`,
      description: 'Errors by category',
    },
    {
      name: 'idx_error_logs_unresolved',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_error_logs_unresolved
            ON error_logs(created_at DESC)
            WHERE resolved_at IS NULL`,
      description: 'Partial: Unresolved errors',
    },
    {
      name: 'idx_error_logs_created_at',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_error_logs_created_at
            ON error_logs(created_at DESC)
            WHERE created_at > NOW() - INTERVAL '30 days'`,
      description: 'Partial: Recent errors (30 days)',
    },
  ];

  console.log(`Creating ${indexes.length} monitoring indexes...\n`);

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

  console.log('\n📊 Monitoring Index Creation Summary:');
  console.log(`   Total indexes: ${indexes.length}`);
  console.log(`   Created: ${result.indexesCreated.length}`);
  console.log(
    `   Already existed: ${indexes.length - result.indexesCreated.length - result.errors.length}`,
  );
  console.log(`   Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log('\n⚠️  Errors encountered:');
    for (const error of result.errors) {
      console.log(`   - ${error}`);
    }
  }

  console.log('\n✅ Monitoring table indexes migration complete!');

  return result;
}
