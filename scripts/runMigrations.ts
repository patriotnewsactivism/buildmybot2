/**
 * Migration Runner Script
 * Runs Phase 1 database migrations using Drizzle ORM
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env and .env.local
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  config({ path: envPath });
}

const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  config({ path: envLocalPath, override: true });
}

async function runMigrations() {
  console.log('🚀 Starting Phase 1 Database Migrations...\n');

  // Check for DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set!');
    console.error(
      'Please set DATABASE_URL in your .env file or environment variables.',
    );
    process.exit(1);
  }

  // Remove PGPORT to prevent it from interfering with the connection
  // The DATABASE_URL already contains the correct connection details
  process.env.PGPORT = undefined;

  console.log('✓ Database URL found');

  // Read the SQL migration file
  const sqlPath = path.join(
    __dirname,
    '..',
    'server',
    'migrations',
    '001_multi_tenant_architecture.sql',
  );

  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ ERROR: Migration file not found at ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf-8');
  console.log('✓ Migration SQL loaded\n');

  // Connect to database
  console.log('📡 Connecting to database...');
  console.log(
    '⏳ Note: Neon databases may take a few seconds to wake up from sleep...',
  );
  const connection = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 30, // Give Neon time to wake up
    idle_timeout: 60,
    max_lifetime: 300,
  });

  try {
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => {
        // Remove empty statements
        if (s.length === 0) return false;

        // Remove comment-only lines
        const lines = s.split('\n').filter((line) => {
          const trimmed = line.trim();
          return trimmed.length > 0 && !trimmed.startsWith('--');
        });

        return lines.length > 0;
      });

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);
    console.log('⚙️  Executing migrations...\n');

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const preview = `${statement.substring(0, 60).replace(/\n/g, ' ')}...`;

      try {
        await connection.unsafe(statement);
        successCount++;

        // Show progress for major operations
        if (statement.includes('CREATE TABLE')) {
          const match = statement.match(/CREATE TABLE\s+(\w+)/i);
          const tableName = match ? match[1] : 'unknown';
          console.log(`  ✓ Created table: ${tableName}`);
        } else if (statement.includes('CREATE INDEX')) {
          const match = statement.match(/CREATE INDEX\s+(\w+)/i);
          const indexName = match ? match[1] : 'unknown';
          console.log(`  ✓ Created index: ${indexName}`);
        } else if (statement.includes('ALTER TABLE')) {
          const match = statement.match(/ALTER TABLE\s+(\w+)/i);
          const tableName = match ? match[1] : 'unknown';
          console.log(`  ✓ Altered table: ${tableName}`);
        }
      } catch (error) {
        // Check if error is because table/index already exists
        const errorMessage = (error as Error).message || String(error);
        const errorStr = JSON.stringify(error, null, 2);

        if (errorMessage.includes('already exists')) {
          console.log(`  ⚠️  Skipped (already exists): ${preview}`);
        } else {
          errorCount++;
          console.error(`  ❌ Error executing statement ${i + 1}:`);
          console.error(`     SQL: ${statement.substring(0, 200)}...`);
          console.error(`     Error message: ${errorMessage}`);
          console.error(`     Full error: ${errorStr}`);
          console.error('');
        }
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✓ Successful statements: ${successCount}`);
    console.log(`⚠️  Errors: ${errorCount}`);
    console.log('='.repeat(60));

    if (errorCount === 0) {
      console.log('\n✅ Schema migration completed successfully!');
      console.log('\n📌 NEXT STEPS:');
      console.log('1. Run the data migration: npm run migrate:data');
      console.log('2. Follow the deployment guide for remaining steps\n');
    } else {
      console.log('\n⚠️  Migration completed with some errors.');
      console.log(
        'Review the errors above. Some may be expected (e.g., "already exists").\n',
      );
    }
  } catch (error) {
    console.error('\n❌ FATAL ERROR during migration:');
    console.error(error);
    process.exit(1);
  } finally {
    await connection.end();
    console.log('📡 Database connection closed');
  }
}

// Run migrations
runMigrations().catch((error) => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});
