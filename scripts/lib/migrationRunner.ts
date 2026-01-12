/**
 * Migration Runner Library
 *
 * Provides utilities for safely executing database migrations with:
 * - Transaction support with SAVEPOINTs
 * - Checksum validation
 * - Execution time tracking
 * - Error handling and rollback
 * - Migration history tracking
 */

import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../server/db';
import { migrationHistory } from '../../shared/schema-migrations';

export interface MigrationConfig {
  version: string; // e.g., "001", "002", "003"
  name: string; // e.g., "multi_tenant_architecture"
  type: 'schema' | 'data' | 'index' | 'seed';
  path?: string; // File path for file-based migrations
  up?: () => Promise<void>; // Function-based migration
  down?: () => Promise<void>; // Rollback function
  dependencies?: string[]; // Version numbers that must run first
  checksum?: string; // SHA-256 of migration content
}

export interface MigrationResult {
  success: boolean;
  version: string;
  name: string;
  executionTimeMs: number;
  error?: Error;
  skipped?: boolean;
  skipReason?: string;
}

export interface ValidationCheck {
  name: string;
  description: string;
  query: string;
  expectedResult: 'empty' | 'not_empty' | { count: number } | { min: number; max?: number };
}

export interface ValidationResult {
  check: string;
  passed: boolean;
  message: string;
  actualResult?: unknown;
}

/**
 * Migration Runner Class
 * Handles safe execution of database migrations with transaction support
 */
export class MigrationRunner {
  constructor(private database: PostgresJsDatabase = db) {}

  /**
   * Execute a migration within a transaction with automatic rollback on error
   */
  async runWithTransaction<T>(
    migration: () => Promise<T>,
    options: { savepoint?: string } = {},
  ): Promise<{ success: boolean; result?: T; error?: Error }> {
    const savepoint = options.savepoint || `migration_${Date.now()}`;

    try {
      // Start a savepoint
      await this.database.execute(sql.raw(`SAVEPOINT ${savepoint}`));

      // Execute the migration
      const result = await migration();

      // Release the savepoint if successful
      await this.database.execute(sql.raw(`RELEASE SAVEPOINT ${savepoint}`));

      return { success: true, result };
    } catch (error) {
      // Rollback to the savepoint on error
      try {
        await this.database.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${savepoint}`));
      } catch (rollbackError) {
        console.error('Failed to rollback:', rollbackError);
      }

      return { success: false, error: error as Error };
    }
  }

  /**
   * Check if a migration has already been executed
   */
  async isMigrationExecuted(version: string): Promise<boolean> {
    try {
      const results = await this.database
        .select()
        .from(migrationHistory)
        .where(sql`${migrationHistory.version} = ${version}`)
        .limit(1);

      return results.length > 0;
    } catch (error) {
      // If migration_history table doesn't exist yet, assume migration not executed
      return false;
    }
  }

  /**
   * Record a migration execution in the history table
   */
  async recordMigration(
    config: MigrationConfig,
    result: { success: boolean; executionTimeMs: number; error?: Error },
    executedBy: string = 'migrate.ts',
  ): Promise<void> {
    try {
      await this.database.insert(migrationHistory).values({
        id: uuidv4(),
        version: config.version,
        name: config.name,
        type: config.type,
        executedAt: new Date(),
        executionTimeMs: result.executionTimeMs,
        status: result.success ? 'completed' : 'failed',
        errorMessage: result.error ? result.error.message : null,
        checksum: config.checksum || null,
        executedBy: executedBy,
        metadata: null,
      });
    } catch (error) {
      console.error('Failed to record migration in history:', error);
      // Don't throw - migration may have succeeded even if history recording failed
    }
  }

  /**
   * Get all executed migrations from history
   */
  async getExecutedMigrations(): Promise<
    Array<{
      version: string;
      name: string;
      type: string;
      status: string;
      executedAt: Date | null;
      executionTimeMs: number | null;
    }>
  > {
    try {
      const results = await this.database
        .select()
        .from(migrationHistory)
        .orderBy(migrationHistory.executedAt);

      return results.map((r) => ({
        version: r.version,
        name: r.name,
        type: r.type,
        status: r.status || 'completed',
        executedAt: r.executedAt,
        executionTimeMs: r.executionTimeMs,
      }));
    } catch (error) {
      console.warn('Could not fetch migration history:', error);
      return [];
    }
  }

  /**
   * Generate SHA-256 checksum for migration content
   */
  generateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Validate checksum matches recorded value
   */
  async validateChecksum(version: string, currentChecksum: string): Promise<boolean> {
    try {
      const results = await this.database
        .select()
        .from(migrationHistory)
        .where(sql`${migrationHistory.version} = ${version}`)
        .limit(1);

      if (results.length === 0) {
        return true; // No recorded checksum, consider valid
      }

      const recordedChecksum = results[0].checksum;
      if (!recordedChecksum) {
        return true; // No checksum recorded, consider valid
      }

      return currentChecksum === recordedChecksum;
    } catch (error) {
      console.warn('Could not validate checksum:', error);
      return true; // Default to valid on error
    }
  }

  /**
   * Execute a migration and track its execution
   */
  async executeMigration(
    config: MigrationConfig,
    executedBy: string = 'migrate.ts',
  ): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      // Check if already executed
      const alreadyExecuted = await this.isMigrationExecuted(config.version);
      if (alreadyExecuted) {
        return {
          success: true,
          version: config.version,
          name: config.name,
          executionTimeMs: 0,
          skipped: true,
          skipReason: 'Already executed',
        };
      }

      // Validate checksum if migration was previously run
      if (config.checksum) {
        const checksumValid = await this.validateChecksum(config.version, config.checksum);
        if (!checksumValid) {
          console.warn(`⚠️  Checksum mismatch for migration ${config.version}`);
          console.warn('   Migration file may have been modified after execution');
        }
      }

      // Execute the migration
      if (config.up) {
        await config.up();
      } else {
        throw new Error('No migration function provided (config.up is undefined)');
      }

      const executionTimeMs = Date.now() - startTime;

      // Record successful execution
      await this.recordMigration(
        config,
        { success: true, executionTimeMs },
        executedBy,
      );

      return {
        success: true,
        version: config.version,
        name: config.name,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      // Record failed execution
      await this.recordMigration(
        config,
        { success: false, executionTimeMs, error: error as Error },
        executedBy,
      );

      return {
        success: false,
        version: config.version,
        name: config.name,
        executionTimeMs,
        error: error as Error,
      };
    }
  }

  /**
   * Execute a rollback migration
   */
  async rollbackMigration(config: MigrationConfig): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      // Check if migration was executed
      const wasExecuted = await this.isMigrationExecuted(config.version);
      if (!wasExecuted) {
        return {
          success: true,
          version: config.version,
          name: config.name,
          executionTimeMs: 0,
          skipped: true,
          skipReason: 'Not executed, nothing to rollback',
        };
      }

      // Execute the rollback
      if (config.down) {
        await config.down();
      } else {
        throw new Error('No rollback function provided (config.down is undefined)');
      }

      const executionTimeMs = Date.now() - startTime;

      // Record rollback in history
      await this.database.insert(migrationHistory).values({
        id: uuidv4(),
        version: `${config.version}_rollback`,
        name: `${config.name}_rollback`,
        type: config.type,
        executedAt: new Date(),
        executionTimeMs: executionTimeMs,
        status: 'rolled_back',
        errorMessage: null,
        checksum: null,
        executedBy: 'migrate.ts',
        metadata: JSON.stringify({ rolledBackVersion: config.version }),
      });

      return {
        success: true,
        version: config.version,
        name: config.name,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      return {
        success: false,
        version: config.version,
        name: config.name,
        executionTimeMs,
        error: error as Error,
      };
    }
  }

  /**
   * Validate data integrity with custom checks
   */
  async validateData(checks: ValidationCheck[]): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const check of checks) {
      try {
        const queryResult = await this.database.execute(sql.raw(check.query));
        const rows = queryResult.rows;

        let passed = false;
        let message = '';
        let actualResult: unknown;

        if (check.expectedResult === 'empty') {
          passed = rows.length === 0;
          actualResult = rows.length;
          message = passed
            ? `${check.name}: No rows found (expected)`
            : `${check.name}: Found ${rows.length} rows (expected 0)`;
        } else if (check.expectedResult === 'not_empty') {
          passed = rows.length > 0;
          actualResult = rows.length;
          message = passed
            ? `${check.name}: Found ${rows.length} rows (expected)`
            : `${check.name}: No rows found (expected some)`;
        } else if ('count' in check.expectedResult) {
          passed = rows.length === check.expectedResult.count;
          actualResult = rows.length;
          message = passed
            ? `${check.name}: Found ${rows.length} rows (expected)`
            : `${check.name}: Found ${rows.length} rows (expected ${check.expectedResult.count})`;
        } else if ('min' in check.expectedResult) {
          const min = check.expectedResult.min;
          const max = check.expectedResult.max;
          const count = rows.length;

          if (max !== undefined) {
            passed = count >= min && count <= max;
            message = passed
              ? `${check.name}: Found ${count} rows (within range)`
              : `${check.name}: Found ${count} rows (expected ${min}-${max})`;
          } else {
            passed = count >= min;
            message = passed
              ? `${check.name}: Found ${count} rows (>= ${min})`
              : `${check.name}: Found ${count} rows (expected >= ${min})`;
          }

          actualResult = count;
        }

        results.push({
          check: check.name,
          passed,
          message,
          actualResult,
        });
      } catch (error) {
        results.push({
          check: check.name,
          passed: false,
          message: `${check.name}: Query failed - ${(error as Error).message}`,
        });
      }
    }

    return results;
  }

  /**
   * Check migration dependencies
   */
  async checkDependencies(dependencies: string[]): Promise<{ satisfied: boolean; missing: string[] }> {
    const executedMigrations = await this.getExecutedMigrations();
    const executedVersions = new Set(executedMigrations.map((m) => m.version));

    const missing = dependencies.filter((dep) => !executedVersions.has(dep));

    return {
      satisfied: missing.length === 0,
      missing,
    };
  }

  /**
   * Get migration statistics
   */
  async getStats(): Promise<{
    totalMigrations: number;
    completedMigrations: number;
    failedMigrations: number;
    totalExecutionTimeMs: number;
  }> {
    try {
      const migrations = await this.getExecutedMigrations();

      return {
        totalMigrations: migrations.length,
        completedMigrations: migrations.filter((m) => m.status === 'completed').length,
        failedMigrations: migrations.filter((m) => m.status === 'failed').length,
        totalExecutionTimeMs: migrations.reduce(
          (sum, m) => sum + (m.executionTimeMs || 0),
          0,
        ),
      };
    } catch (error) {
      return {
        totalMigrations: 0,
        completedMigrations: 0,
        failedMigrations: 0,
        totalExecutionTimeMs: 0,
      };
    }
  }
}

/**
 * Default singleton instance
 */
export const migrationRunner = new MigrationRunner();
