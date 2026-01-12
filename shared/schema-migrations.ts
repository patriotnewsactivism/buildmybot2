/**
 * Migration History Schema
 *
 * Tracks all database migrations, seeds, and schema changes.
 * This provides version control and audit trail for database changes.
 */

import { pgTable, text, timestamp, integer, varchar } from 'drizzle-orm/pg-core';

/**
 * Migration History Table
 *
 * Tracks all executed migrations including:
 * - Schema migrations (SQL or TypeScript)
 * - Data migrations (transformations)
 * - Index migrations (performance optimizations)
 * - Seed operations (initial data loading)
 */
export const migrationHistory = pgTable('migration_history', {
  /**
   * Unique identifier for this migration record
   */
  id: text('id').primaryKey(),

  /**
   * Migration version number (e.g., "001", "002", "003")
   * Used to determine execution order and prevent duplicate runs
   */
  version: varchar('version', { length: 50 }).notNull().unique(),

  /**
   * Human-readable migration name (e.g., "multi_tenant_architecture", "consolidated_indexes")
   */
  name: varchar('name', { length: 255 }).notNull(),

  /**
   * Type of migration:
   * - 'schema': Creates/modifies tables, columns, constraints
   * - 'data': Transforms existing data
   * - 'index': Adds/removes database indexes
   * - 'seed': Inserts initial/reference data
   */
  type: varchar('type', { length: 20 }).notNull(),

  /**
   * Timestamp when the migration was executed
   */
  executedAt: timestamp('executed_at').defaultNow().notNull(),

  /**
   * Time taken to execute the migration in milliseconds
   * Useful for performance monitoring and optimization
   */
  executionTimeMs: integer('execution_time_ms'),

  /**
   * Execution status:
   * - 'completed': Successfully executed
   * - 'failed': Execution failed (see errorMessage)
   * - 'rolled_back': Migration was rolled back
   */
  status: varchar('status', { length: 20 }).default('completed').notNull(),

  /**
   * Error message if migration failed
   * NULL for successful migrations
   */
  errorMessage: text('error_message'),

  /**
   * SHA-256 checksum of migration file contents
   * Used to detect if migration file has been modified after execution
   */
  checksum: varchar('checksum', { length: 64 }),

  /**
   * Script or user that executed the migration
   * (e.g., "migrate.ts", "manual-admin", "ci-cd-pipeline")
   */
  executedBy: varchar('executed_by', { length: 100 }),

  /**
   * Optional metadata in JSON format
   * Can include additional context like affected tables, row counts, etc.
   */
  metadata: text('metadata'),
});
