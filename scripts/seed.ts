/**
 * Unified Seed Orchestrator
 *
 * CLI tool for managing database seeds with tracking and validation.
 *
 * Usage:
 *   npm run db:seed                      # Run all seeds in order
 *   npm run db:seed -- --force           # Force re-run all seeds
 *   npm run db:seed -- --only=user-roles # Run specific seed only
 *   npm run db:seed -- --dry-run         # Preview seeds without executing
 *
 * Features:
 * - Ordered execution with dependencies
 * - Seed history tracking
 * - Force re-run capability
 * - Individual seed selection
 * - Dry-run mode for testing
 */

import { fileURLToPath } from 'node:url';
import { seedUserRoles } from '../server/seeds/seedUserRoles';
import { seedTemplates } from '../server/seeds/seedTemplates';
import { seedRevenueTables } from '../server/seeds/revenue-seed';
import { seedIndustryKnowledgeBases } from '../server/seeds/industryKnowledgeBases';
import { env } from '../server/env';
import { MigrationRunner, type MigrationConfig } from './lib/migrationRunner';
import { db } from '../server/db';

const __filename = fileURLToPath(import.meta.url);

// Parse command-line arguments
const args = process.argv.slice(2);
const isForce = args.includes('--force');
const isDryRun = args.includes('--dry-run');
const onlyArg = args.find((arg) => arg.startsWith('--only='));
const onlySeed = onlyArg ? onlyArg.split('=')[1] : null;

/**
 * Seed configuration interface
 */
interface SeedConfig {
  name: string;
  description: string;
  order: number;
  function: () => Promise<{ success: boolean; [key: string]: unknown }>;
  required?: boolean; // If false, errors won't stop the process
  dependencies?: string[]; // Other seeds that must run first
}

/**
 * Define all seeds in execution order
 */
const SEEDS: SeedConfig[] = [
  {
    name: 'user-roles',
    description: 'Seed admin users and roles',
    order: 1,
    function: async () => {
      await seedUserRoles();
      return { success: true };
    },
    required: true,
  },
  {
    name: 'bot-templates',
    description: 'Seed marketplace bot templates',
    order: 2,
    function: async () => {
      const result = await seedTemplates();
      return { success: true, ...result };
    },
    required: false,
  },
  {
    name: 'revenue-tables',
    description: 'Seed billing plans and packages',
    order: 3,
    function: async () => {
      await seedRevenueTables();
      return { success: true };
    },
    required: false,
  },
  {
    name: 'industry-knowledge',
    description: 'Seed industry-specific knowledge bases',
    order: 4,
    function: async () => {
      const result = await seedIndustryKnowledgeBases();
      return { success: true, ...result };
    },
    required: false,
  },
];

/**
 * Seed result interface
 */
interface SeedResult {
  success: boolean;
  name: string;
  executionTimeMs: number;
  skipped?: boolean;
  skipReason?: string;
  error?: Error;
  details?: Record<string, unknown>;
}

/**
 * Seed orchestrator class
 */
class SeedOrchestrator {
  private runner: MigrationRunner;

  constructor() {
    this.runner = new MigrationRunner(db);
  }

  /**
   * Check if a seed has been executed
   */
  async isSeedExecuted(seedName: string): Promise<boolean> {
    try {
      const migrations = await this.runner.getExecutedMigrations();
      return migrations.some((m) => m.type === 'seed' && m.name === seedName);
    } catch (error) {
      return false;
    }
  }

  /**
   * Record seed execution in migration history
   */
  async recordSeed(
    seedName: string,
    result: { success: boolean; executionTimeMs: number; error?: Error },
  ): Promise<void> {
    const config: MigrationConfig = {
      version: `seed_${seedName}_${Date.now()}`,
      name: seedName,
      type: 'seed',
    };

    await this.runner.recordMigration(config, result, 'seed.ts');
  }

  /**
   * Execute a single seed
   */
  async executeSeed(
    seed: SeedConfig,
    force: boolean = false,
  ): Promise<SeedResult> {
    const startTime = Date.now();

    try {
      // Check if already executed
      if (!force) {
        const alreadyExecuted = await this.isSeedExecuted(seed.name);
        if (alreadyExecuted) {
          return {
            success: true,
            name: seed.name,
            executionTimeMs: 0,
            skipped: true,
            skipReason: 'Already executed (use --force to re-run)',
          };
        }
      }

      // Execute the seed
      console.log(`\nRunning: ${seed.name}`);
      console.log(`Description: ${seed.description}`);
      console.log('-'.repeat(80));

      const result = await seed.function();
      const executionTimeMs = Date.now() - startTime;

      // Record successful execution
      await this.recordSeed(seed.name, { success: true, executionTimeMs });

      return {
        success: true,
        name: seed.name,
        executionTimeMs,
        details: result,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      // Record failed execution
      await this.recordSeed(seed.name, {
        success: false,
        executionTimeMs,
        error: error as Error,
      });

      return {
        success: false,
        name: seed.name,
        executionTimeMs,
        error: error as Error,
      };
    }
  }

  /**
   * Execute all seeds or specific seed
   */
  async runSeeds(options: {
    force?: boolean;
    only?: string | null;
    dryRun?: boolean;
  } = {}): Promise<void> {
    const { force = false, only = null, dryRun = false } = options;

    console.log('🌱 Database Seed Orchestrator\n');

    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    if (force) {
      console.log('⚡ FORCE MODE - Re-running all seeds\n');
    }

    console.log('═'.repeat(80));

    // Check database connection
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
      console.error('❌ ERROR: DATABASE_URL environment variable is not set!');
      process.exit(1);
    }

    console.log('✓ Database URL found');
    console.log('✓ Seed orchestrator initialized\n');

    // Filter seeds based on --only flag
    let seedsToRun = SEEDS;
    if (only) {
      const selectedSeed = SEEDS.find((s) => s.name === only);
      if (!selectedSeed) {
        console.error(`❌ ERROR: Seed '${only}' not found!`);
        console.log('\nAvailable seeds:');
        SEEDS.forEach((s) => console.log(`  • ${s.name}: ${s.description}`));
        process.exit(1);
      }
      seedsToRun = [selectedSeed];
      console.log(`Running only: ${selectedSeed.name}\n`);
    }

    // Sort seeds by order
    seedsToRun.sort((a, b) => a.order - b.order);

    console.log(`Seeds to run (${seedsToRun.length}):\n`);
    for (const seed of seedsToRun) {
      const required = seed.required ? '(required)' : '(optional)';
      console.log(`  ${seed.order}. ${seed.name} ${required}`);
      console.log(`     ${seed.description}`);
    }

    console.log('\n' + '-'.repeat(80) + '\n');

    if (dryRun) {
      console.log('✅ Dry run complete - no changes made');
      return;
    }

    // Execute seeds
    const results: SeedResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const seed of seedsToRun) {
      try {
        const result = await this.executeSeed(seed, force);

        if (result.skipped) {
          console.log(`\n⏭️  Skipped: ${result.skipReason}`);
          skippedCount++;
        } else if (result.success) {
          console.log(`\n✅ Completed in ${result.executionTimeMs}ms`);

          // Show additional details if available
          if (result.details) {
            const details = result.details;
            if ('inserted' in details) console.log(`   Inserted: ${details.inserted}`);
            if ('skipped' in details) console.log(`   Skipped: ${details.skipped}`);
            if ('updated' in details) console.log(`   Updated: ${details.updated}`);
            if ('totalChunks' in details) console.log(`   Total chunks: ${details.totalChunks}`);
          }

          successCount++;
        } else {
          console.log(`\n❌ Failed: ${result.error?.message}`);
          errorCount++;

          // Stop on required seed failure
          if (seed.required) {
            console.log('\n⚠️  Stopping seeding due to required seed failure\n');
            break;
          }
        }

        results.push(result);
      } catch (error) {
        console.log(`\n❌ Unexpected error: ${(error as Error).message}`);
        errorCount++;
        results.push({
          success: false,
          name: seed.name,
          executionTimeMs: 0,
          error: error as Error,
        });

        // Stop on required seed failure
        if (seed.required) {
          break;
        }
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(80));
    console.log('📊 SEEDING SUMMARY');
    console.log('═'.repeat(80));
    console.log(`✓ Successful: ${successCount}`);
    console.log(`✗ Errors: ${errorCount}`);
    console.log(`⏭  Skipped: ${skippedCount}`);
    console.log('═'.repeat(80));

    if (errorCount === 0) {
      console.log('\n✅ All seeds completed successfully!');
      console.log('\n📌 NEXT STEPS:');
      console.log('1. Verify data with: npm run db:studio');
      console.log('2. Start the application: npm run dev\n');
    } else {
      console.log('\n⚠️  Some seeds failed. Review errors above.');
      process.exit(1);
    }
  }

  /**
   * Show seed status
   */
  async showStatus(): Promise<void> {
    console.log('📊 Seed Status\n');
    console.log('═'.repeat(80));

    // Get executed seeds
    const migrations = await this.runner.getExecutedMigrations();
    const executedSeeds = migrations.filter((m) => m.type === 'seed');
    const executedSeedNames = new Set(executedSeeds.map((m) => m.name));

    // Show all seeds with status
    console.log('Seeds:');
    console.log('-'.repeat(80));

    for (const seed of SEEDS) {
      const isExecuted = executedSeedNames.has(seed.name);
      const status = isExecuted ? '✅ Executed' : '⏳ Pending';
      const required = seed.required ? '[REQUIRED]' : '[OPTIONAL]';

      console.log(`${status} | ${seed.name} ${required}`);
      console.log(`         ${seed.description}`);

      if (isExecuted) {
        const seedInfo = executedSeeds.find((m) => m.name === seed.name);
        if (seedInfo) {
          const executedAt = seedInfo.executedAt
            ? new Date(seedInfo.executedAt).toLocaleString()
            : 'Unknown';
          const timeMs = seedInfo.executionTimeMs || 0;
          console.log(`         Executed: ${executedAt} (${timeMs}ms)`);
        }
      }

      console.log('');
    }

    // Summary
    console.log('═'.repeat(80));
    console.log('Statistics:');
    console.log(`  Total seeds defined: ${SEEDS.length}`);
    console.log(`  Executed: ${executedSeeds.length}`);
    console.log(`  Pending: ${SEEDS.length - executedSeeds.length}`);
    console.log('═'.repeat(80));
  }
}

/**
 * Main execution
 */
async function main() {
  const orchestrator = new SeedOrchestrator();

  try {
    const showStatus = args.includes('--status');

    if (showStatus) {
      await orchestrator.showStatus();
    } else {
      await orchestrator.runSeeds({
        force: isForce,
        only: onlySeed,
        dryRun: isDryRun,
      });
    }
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    console.error('\nError details:', (error as Error).message);
    console.error('\nStack trace:', (error as Error).stack);
    process.exit(1);
  } finally {
    console.log('\n📡 Seed orchestrator finished');
    process.exit(0);
  }
}

// Run if executed directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main();
}

export { SeedOrchestrator };
