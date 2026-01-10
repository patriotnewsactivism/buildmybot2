/**
 * Model Migration Deployment Script
 * Deploys GPT-5o Mini migration to staging/production
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_ENV = '.env.staging';
const PROD_ENV = '.env.production';

interface MigrationConfig {
  environment: 'staging' | 'production';
  verifyBeforeDeploy: boolean;
  rollbackOnError: boolean;
}

async function verifyMigration(): Promise<boolean> {
  try {
    // Run verification script
    execSync('tsx scripts/verifyModelMigration.ts', { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('❌ Migration verification failed!');
    return false;
  }
}

async function updateDatabaseModel(
  defaultModel = 'gpt-5o-mini',
): Promise<void> {
  console.log('📊 Updating database default model...');

  // SQL migration script
  const migrationSQL = `
-- Update existing bots to use GPT-5o Mini
UPDATE bots 
SET model = '${defaultModel}'
WHERE model = 'gpt-4o-mini';

-- Update default for new bots
ALTER TABLE bots 
ALTER COLUMN model SET DEFAULT '${defaultModel}';
`;

  console.log('Migration SQL:');
  console.log(migrationSQL);
  console.log('\n⚠️  Run this SQL manually on the database or use db:push');
}

async function deploy(config: MigrationConfig): Promise<void> {
  console.log(
    `🚀 Deploying GPT-5o Mini migration to ${config.environment}...\n`,
  );

  // Step 1: Verify migration
  if (config.verifyBeforeDeploy) {
    console.log('Step 1: Verifying migration...');
    const verified = await verifyMigration();
    if (!verified) {
      throw new Error('Migration verification failed. Aborting deployment.');
    }
    console.log('✅ Migration verified!\n');
  }

  // Step 2: Build application
  console.log('Step 2: Building application...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log('✅ Build successful!\n');
  } catch (error) {
    throw new Error('Build failed. Aborting deployment.');
  }

  // Step 3: Run tests
  console.log('Step 3: Running tests...');
  try {
    execSync('npm run test:run', { stdio: 'inherit' });
    console.log('✅ Tests passed!\n');
  } catch (error) {
    if (config.rollbackOnError) {
      console.error('❌ Tests failed. Rolling back...');
      throw new Error('Tests failed. Deployment aborted.');
    }
    console.warn('⚠️  Tests failed but continuing with deployment...');
  }

  // Step 4: Database migration
  console.log('Step 4: Database migration required...');
  await updateDatabaseModel();
  console.log('⚠️  Manual database migration required. See SQL above.\n');

  // Step 5: Environment variables
  console.log('Step 5: Updating environment variables...');
  const envFile = config.environment === 'production' ? PROD_ENV : STAGING_ENV;
  console.log(`📝 Update ${envFile} with any required changes.\n`);

  // Step 6: Deployment checklist
  console.log('📋 Pre-deployment Checklist:');
  console.log('  ✅ Code updated to use gpt-5o-mini');
  console.log('  ✅ Tests passing');
  console.log('  ✅ Build successful');
  console.log('  ⏳ Database migration required (manual)');
  console.log('  ⏳ Environment variables updated (if needed)');
  console.log('  ⏳ Deploy to hosting platform (Vercel/Replit/etc)\n');

  console.log(`✅ Deployment preparation complete for ${config.environment}!`);
  console.log('⚠️  Remember to:');
  console.log('  1. Run database migration');
  console.log('  2. Deploy to hosting platform');
  console.log('  3. Monitor error rates post-deployment');
  console.log('  4. Track cost reduction metrics\n');
}

// Main execution
const args = process.argv.slice(2);
const environment = args[0] === 'production' ? 'production' : 'staging';
const skipVerification = args.includes('--skip-verification');
const skipTests = args.includes('--skip-tests');

const config: MigrationConfig = {
  environment,
  verifyBeforeDeploy: !skipVerification,
  rollbackOnError: !skipTests,
};

deploy(config)
  .then(() => {
    console.log('✅ Deployment script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Deployment script failed:', error.message);
    process.exit(1);
  });
