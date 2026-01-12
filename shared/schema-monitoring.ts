/**
 * Monitoring & Analytics Schema
 *
 * Enhanced monitoring tables for:
 * - Field-level audit logging
 * - Query performance tracking
 * - System health metrics
 * - API usage analytics
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  varchar,
  json,
  real,
} from 'drizzle-orm/pg-core';
import { auditLogs, organizations, users } from './schema';

// ========================================
// ENHANCED AUDIT LOGGING
// ========================================

/**
 * Audit Log Changes Table
 *
 * Provides field-level change tracking for detailed audit trails.
 * Links to main audit_logs table to show exactly what changed.
 */
export const auditLogChanges = pgTable('audit_log_changes', {
  /**
   * Unique identifier for this change record
   */
  id: text('id').primaryKey(),

  /**
   * Reference to parent audit log entry
   */
  auditLogId: text('audit_log_id')
    .notNull()
    .references(() => auditLogs.id, { onDelete: 'cascade' }),

  /**
   * Name of the field that changed (e.g., 'email', 'status', 'plan')
   */
  fieldName: varchar('field_name', { length: 100 }).notNull(),

  /**
   * Previous value before the change (stored as text)
   */
  oldValue: text('old_value'),

  /**
   * New value after the change (stored as text)
   */
  newValue: text('new_value'),

  /**
   * Data type of the value for proper parsing
   * Values: 'string', 'number', 'boolean', 'json', 'date'
   */
  valueType: varchar('value_type', { length: 20 }),

  /**
   * Timestamp when this change was recorded
   */
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========================================
// QUERY PERFORMANCE MONITORING
// ========================================

/**
 * Query Performance Logs Table
 *
 * Tracks database query execution times to identify slow queries
 * and optimization opportunities.
 */
export const queryPerformanceLogs = pgTable('query_performance_logs', {
  /**
   * Unique identifier for this performance log
   */
  id: text('id').primaryKey(),

  /**
   * Organization executing the query (null for system queries)
   */
  organizationId: text('organization_id').references(() => organizations.id),

  /**
   * Type/category of query (e.g., 'dashboard_load', 'bot_list', 'lead_search')
   */
  queryType: varchar('query_type', { length: 100 }).notNull(),

  /**
   * Query execution time in milliseconds
   */
  executionTimeMs: integer('execution_time_ms').notNull(),

  /**
   * Number of rows returned by the query
   */
  rowsReturned: integer('rows_returned'),

  /**
   * Number of rows affected (for UPDATE/DELETE queries)
   */
  rowsAffected: integer('rows_affected'),

  /**
   * Query parameters (stored as JSON for analysis)
   */
  queryParams: json('query_params'),

  /**
   * Error message if query failed
   */
  errorMessage: text('error_message'),

  /**
   * Timestamp when query was executed
   */
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========================================
// SYSTEM HEALTH METRICS
// ========================================

/**
 * System Health Metrics Table
 *
 * Stores periodic system health measurements including database size,
 * table statistics, index usage, and system performance.
 */
export const systemHealthMetrics = pgTable('system_health_metrics', {
  /**
   * Unique identifier for this metric record
   */
  id: text('id').primaryKey(),

  /**
   * Category of metric
   * Values: 'database_size', 'table_size', 'index_usage', 'connection_pool',
   *         'cache_hit_ratio', 'active_connections', 'slow_queries'
   */
  metricType: varchar('metric_type', { length: 50 }).notNull(),

  /**
   * Specific metric name (e.g., 'users_table_size', 'conversations_index_usage')
   */
  metricName: varchar('metric_name', { length: 100 }).notNull(),

  /**
   * Numeric value of the metric
   */
  value: real('value').notNull(),

  /**
   * Unit of measurement (e.g., 'MB', 'GB', 'rows', 'percentage', 'count', 'ms')
   */
  unit: varchar('unit', { length: 20 }),

  /**
   * Additional metadata about the metric (JSON)
   * Can include: {threshold, status, trend, details}
   */
  metadata: json('metadata').default({}),

  /**
   * Timestamp when metric was recorded
   */
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
});

// ========================================
// API USAGE TRACKING
// ========================================

/**
 * API Usage Metrics Table
 *
 * Tracks all API calls for rate limiting, billing, and usage analytics.
 */
export const apiUsageMetrics = pgTable('api_usage_metrics', {
  /**
   * Unique identifier for this API call record
   */
  id: text('id').primaryKey(),

  /**
   * Organization making the API call
   */
  organizationId: text('organization_id').references(() => organizations.id),

  /**
   * User making the API call (null for API key calls)
   */
  userId: text('user_id').references(() => users.id),

  /**
   * API endpoint path (e.g., '/api/bots', '/api/chat')
   */
  endpoint: varchar('endpoint', { length: 255 }).notNull(),

  /**
   * HTTP method (GET, POST, PUT, DELETE, PATCH)
   */
  method: varchar('method', { length: 10 }).notNull(),

  /**
   * HTTP status code (200, 400, 500, etc.)
   */
  statusCode: integer('status_code'),

  /**
   * Response time in milliseconds
   */
  responseTimeMs: integer('response_time_ms'),

  /**
   * Client IP address (for rate limiting and security)
   */
  ipAddress: varchar('ip_address', { length: 50 }),

  /**
   * User agent string
   */
  userAgent: text('user_agent'),

  /**
   * API key used (if applicable, hashed)
   */
  apiKeyHash: varchar('api_key_hash', { length: 64 }),

  /**
   * Request payload size in bytes
   */
  requestSizeBytes: integer('request_size_bytes'),

  /**
   * Response payload size in bytes
   */
  responseSizeBytes: integer('response_size_bytes'),

  /**
   * Error message if request failed
   */
  errorMessage: text('error_message'),

  /**
   * Additional metadata (JSON)
   * Can include: {route_params, query_params, rate_limit_remaining}
   */
  metadata: json('metadata'),

  /**
   * Timestamp when API call was made
   */
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========================================
// FEATURE USAGE ANALYTICS
// ========================================

/**
 * Feature Usage Metrics Table
 *
 * Tracks which features are being used by organizations and users
 * to inform product decisions and identify unused features.
 */
export const featureUsageMetrics = pgTable('feature_usage_metrics', {
  /**
   * Unique identifier for this usage record
   */
  id: text('id').primaryKey(),

  /**
   * Organization using the feature
   */
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id),

  /**
   * User using the feature
   */
  userId: text('user_id').references(() => users.id),

  /**
   * Feature identifier (e.g., 'bot_builder', 'analytics_dashboard', 'crm')
   */
  featureName: varchar('feature_name', { length: 100 }).notNull(),

  /**
   * Number of times feature was used
   */
  usageCount: integer('usage_count').default(1).notNull(),

  /**
   * Duration of feature usage in seconds (if applicable)
   */
  durationSeconds: integer('duration_seconds'),

  /**
   * Last time the feature was used
   */
  lastUsedAt: timestamp('last_used_at').defaultNow().notNull(),

  /**
   * First time the feature was used
   */
  firstUsedAt: timestamp('first_used_at').defaultNow().notNull(),

  /**
   * Additional metadata (JSON)
   * Can include: {context, source, device_type}
   */
  metadata: json('metadata'),
});

// ========================================
// ERROR TRACKING
// ========================================

/**
 * Error Logs Table
 *
 * Centralized error logging for application errors, exceptions,
 * and system failures.
 */
export const errorLogs = pgTable('error_logs', {
  /**
   * Unique identifier for this error
   */
  id: text('id').primaryKey(),

  /**
   * Organization context (null for system errors)
   */
  organizationId: text('organization_id').references(() => organizations.id),

  /**
   * User context (null if not user-specific)
   */
  userId: text('user_id').references(() => users.id),

  /**
   * Error severity level
   * Values: 'debug', 'info', 'warning', 'error', 'critical'
   */
  severity: varchar('severity', { length: 20 }).notNull(),

  /**
   * Error category (e.g., 'database', 'api', 'validation', 'authentication')
   */
  category: varchar('category', { length: 50 }).notNull(),

  /**
   * Error message
   */
  message: text('message').notNull(),

  /**
   * Stack trace (for debugging)
   */
  stackTrace: text('stack_trace'),

  /**
   * Context where error occurred (e.g., API route, component name)
   */
  context: varchar('context', { length: 255 }),

  /**
   * Additional error details (JSON)
   * Can include: {request_id, session_id, user_agent, ip_address}
   */
  metadata: json('metadata'),

  /**
   * Whether error has been resolved
   */
  resolved: timestamp('resolved_at'),

  /**
   * Timestamp when error occurred
   */
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
