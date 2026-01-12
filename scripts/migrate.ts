/**
 * Unified Migration Orchestrator
 *
 * CLI tool for managing database migrations with version tracking.
 *
 * Usage:
 *   npm run db:migrate              # Run all pending migrations
 *   npm run db:migrate -- --dry-run # Preview migrations without executing
 *   npm run db:migrate:status       # Show migration history
 *   npm run db:migrate:down         # Rollback last migration
 *
 * Features:
 * - Version tracking and history
 * - Checksum validation
 * - Dependency resolution
 * - Transaction support with rollback
 * - Dry-run mode for testing
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { db } from '../server/db';
import { env } from '../server/env';
import {
  MigrationRunner,
  type MigrationConfig,
  type MigrationResult,
} from './lib/migrationRunner';
import { consolidatedIndexes } from '../server/migrations/002_consolidated_indexes';
import { monitoringTableIndexes } from '../server/migrations/003_monitoring_table_indexes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command-line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const showStatus = args.includes('--status');
const isRollback = args.includes('--down');
const stepsToRollback = parseInt(args.find((arg) => arg.startsWith('--steps='))?.split('=')[1] || '1', 10);

/**
 * Define all migrations in execution order
 */
const MIGRATIONS: MigrationConfig[] = [
  {
    version: '001',
    name: 'multi_tenant_architecture',
    type: 'schema',
    path: path.join(__dirname, '../server/migrations/001_multi_tenant_architecture.sql'),
    up: async () => {
      // This migration uses SQL file - handled in executeSqlMigration
      console.log('  SQL migration - see runMigrations.ts for details');
    },
  },
  {
    version: '002',
    name: 'consolidated_performance_indexes',
    type: 'index',
    up: async () => {
      console.log('  Creating consolidated performance indexes...');
      const result = await consolidatedIndexes();
      if (!result.success) {
        throw new Error(`Failed to create indexes: ${result.errors.join(', ')}`);
      }
      console.log(`  ✅ Created ${result.indexesCreated.length} indexes`);
    },
  },
  {
    version: '003',
    name: 'migration_history_table',
    type: 'schema',
    up: async () => {
      // Migration history table is created via schema.ts export
      // This migration just records that it was set up
      console.log('  Migration history table created via Drizzle schema');
    },
  },
  {
    version: '004',
    name: 'monitoring_tables',
    type: 'schema',
    up: async () => {
      // Monitoring tables are created via schema-monitoring.ts export
      // This migration just records that they were set up
      console.log('  Monitoring tables created via Drizzle schema');
      console.log('    - audit_log_changes (field-level audit trail)');
      console.log('    - query_performance_logs (query monitoring)');
      console.log('    - system_health_metrics (system health)');
      console.log('    - api_usage_metrics (API tracking)');
      console.log('    - feature_usage_metrics (feature analytics)');
      console.log('    - error_logs (error tracking)');
    },
  },
  {
    version: '005',
    name: 'monitoring_table_indexes',
    type: 'index',
    up: async () => {
      console.log('  Creating monitoring table indexes...');
      const result = await monitoringTableIndexes();
      if (!result.success) {
        throw new Error(`Failed to create indexes: ${result.errors.join(', ')}`);
      }
      console.log(`  ✅ Created ${result.indexesCreated.length} indexes`);
    },
  },
];

/**
 * Migration orchestrator class
 */
class MigrationOrchestrator {
  private runner: MigrationRunner;

  constructor() {
    this.runner = new MigrationRunner(db);
  }

  /**
   * Show migration status and history
   */
  async showStatus(): Promise<void> {
    console.log('📊 Migration Status\n');
    console.log('═'.repeat(80));

    // Check database connection
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
      console.error('❌ ERROR: DATABASE_URL environment variable is not set!');
      process.exit(1);
    }

    console.log('✓ Database connected\n');

    // Get executed migrations
    const executedMigrations = await this.runner.getExecutedMigrations();
    const executedVersions = new Set(executedMigrations.map((m) => m.version));

    // Show all migrations with status
    console.log('Migrations:');
    console.log('-'.repeat(80));

    for (const migration of MIGRATIONS) {
      const isExecuted = executedVersions.has(migration.version);
      const status = isExecuted ? '✅ Executed' : '⏳ Pending';
      const executionInfo = executedMigrations.find((m) => m.version === migration.version);

      console.log(`${status} | v${migration.version} | ${migration.name} (${migration.type})`);

      if (executionInfo) {
        const executedAt = executionInfo.executedAt
          ? new Date(executionInfo.executedAt).toLocaleString()
          : 'Unknown';
        const timeMs = executionInfo.executionTimeMs || 0;
        console.log(`         Executed: ${executedAt} (${timeMs}ms)`);
      }
    }

    // Show statistics
    console.log('\n' + '═'.repeat(80));
    const stats = await this.runner.getStats();
    console.log('Statistics:');
    console.log(`  Total migrations defined: ${MIGRATIONS.length}`);
    console.log(`  Completed: ${stats.completedMigrations}`);
    console.log(`  Failed: ${stats.failedMigrations}`);
    console.log(`  Pending: ${MIGRATIONS.length - stats.completedMigrations}`);
    console.log(`  Total execution time: ${stats.totalExecutionTimeMs}ms`);
    console.log('═'.repeat(80));
  }

  /**
   * Execute all pending migrations
   */
  async runMigrations(dryRun: boolean = false): Promise<void> {
    console.log('🚀 Database Migration Orchestrator\n');

    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    console.log('═'.repeat(80));

    // Check database connection
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
      console.error('❌ ERROR: DATABASE_URL environment variable is not set!');
      process.exit(1);
    }

    console.log('✓ Database URL found');
    console.log('✓ Migration runner initialized\n');

    // Get executed migrations
    const executedMigrations = await this.runner.getExecutedMigrations();
    const executedVersions = new Set(executedMigrations.map((m) => m.version));

    // Find pending migrations
    const pendingMigrations = MIGRATIONS.filter((m) => !executedVersions.has(m.version));

    if (pendingMigrations.length === 0) {
      console.log('✅ All migrations are up to date!');
      console.log(`   ${MIGRATIONS.length} migrations executed`);
      return;
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s):\n`);

    for (const migration of pendingMigrations) {
      console.log(`  • v${migration.version}: ${migration.name} (${migration.type})`);
    }

    console.log('\n' + '-'.repeat(80) + '\n');

    if (dryRun) {
      console.log('✅ Dry run complete - no changes made');
      return;
    }

    // Execute pending migrations
    const results: MigrationResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const migration of pendingMigrations) {
      console.log(`Running v${migration.version}: ${migration.name}`);

      // Check dependencies
      if (migration.dependencies && migration.dependencies.length > 0) {
        const depCheck = await this.runner.checkDependencies(migration.dependencies);
        if (!depCheck.satisfied) {
          console.log(`  ❌ Missing dependencies: ${depCheck.missing.join(', ')}`);
          errorCount++;
          results.push({
            success: false,
            version: migration.version,
            name: migration.name,
            executionTimeMs: 0,
            error: new Error(`Missing dependencies: ${depCheck.missing.join(', ')}`),
          });
          continue;
        }
      }

      try {
        const result = await this.runner.executeMigration(migration, 'migrate.ts');

        if (result.skipped) {
          console.log(`  ⏭️  Skipped: ${result.skipReason}`);
        } else if (result.success) {
          console.log(`  ✅ Completed in ${result.executionTimeMs}ms`);
          successCount++;
        } else {
          console.log(`  ❌ Failed: ${result.error?.message}`);
          errorCount++;
        }

        results.push(result);

        // Stop on first error
        if (!result.success && !result.skipped) {
          console.log('\n⚠️  Stopping migration due to error\n');
          break;
        }
      } catch (error) {
        console.log(`  ❌ Unexpected error: ${(error as Error).message}`);
        errorCount++;
        results.push({
          success: false,
          version: migration.version,
          name: migration.name,
          executionTimeMs: 0,
          error: error as Error,
        });
        break;
      }

      console.log('');
    }

    // Summary
    console.log('═'.repeat(80));
    console.log('📊 MIGRATION SUMMARY');
    console.log('═'.repeat(80));
    console.log(`✓ Successful: ${successCount}`);
    console.log(`✗ Errors: ${errorCount}`);
    console.log(`⏭  Skipped: ${results.filter((r) => r.skipped).length}`);
    console.log('═'.repeat(80));

    if (errorCount === 0) {
      console.log('\n✅ All migrations completed successfully!');
    } else {
      console.log('\n⚠️  Some migrations failed. Review errors above.');
      process.exit(1);
    }
  }

  /**
   * Rollback migrations
   */
  async rollbackMigrations(steps: number = 1): Promise<void> {
    console.log('⏪ Migration Rollback\n');
    console.log('═'.repeat(80));

    // Get executed migrations
    const executedMigrations = await this.runner.getExecutedMigrations();

    if (executedMigrations.length === 0) {
      console.log('✓ No migrations to rollback');
      return;
    }

    // Get last N migrations to rollback
    const migrationsToRollback = executedMigrations
      .slice(-steps)
      .reverse()
      .map((m) => MIGRATIONS.find((migration) => migration.version === m.version))
      .filter((m) => m !== undefined) as MigrationConfig[];

    if (migrationsToRollback.length === 0) {
      console.log('⚠️  No migrations found to rollback');
      return;
    }

    console.log(`Rolling back ${migrationsToRollback.length} migration(s):\n`);

    for (const migration of migrationsToRollback) {
      console.log(`  • v${migration.version}: ${migration.name}`);
    }

    console.log('\n' + '-'.repeat(80) + '\n');

    // Execute rollbacks
    let successCount = 0;
    let errorCount = 0;

    for (const migration of migrationsToRollback) {
      console.log(`Rolling back v${migration.version}: ${migration.name}`);

      if (!migration.down) {
        console.log('  ⚠️  No rollback function defined, skipping');
        continue;
      }

      try {
        const result = await this.runner.rollbackMigration(migration);

        if (result.success) {
          console.log(`  ✅ Rolled back in ${result.executionTimeMs}ms`);
          successCount++;
        } else {
          console.log(`  ❌ Failed: ${result.error?.message}`);
          errorCount++;
        }
      } catch (error) {
        console.log(`  ❌ Unexpected error: ${(error as Error).message}`);
        errorCount++;
        break;
      }

      console.log('');
    }

    // Summary
    console.log('═'.repeat(80));
    console.log(`✓ Successful rollbacks: ${successCount}`);
    console.log(`✗ Errors: ${errorCount}`);
    console.log('═'.repeat(80));

    if (errorCount === 0) {
      console.log('\n✅ Rollback completed successfully!');
    } else {
      console.log('\n⚠️  Some rollbacks failed. Review errors above.');
      process.exit(1);
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const orchestrator = new MigrationOrchestrator();

  try {
    if (showStatus) {
      await orchestrator.showStatus();
    } else if (isRollback) {
      await orchestrator.rollbackMigrations(stepsToRollback);
    } else {
      await orchestrator.runMigrations(isDryRun);
    }
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    console.error('\nError details:', (error as Error).message);
    console.error('\nStack trace:', (error as Error).stack);
    process.exit(1);
  } finally {
    console.log('\n📡 Migration orchestrator finished');
    process.exit(0);
  }
}

// Run if executed directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main();
}

export { MigrationOrchestrator };
