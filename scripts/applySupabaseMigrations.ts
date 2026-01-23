import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applySupabaseMigrations() {
  console.log('🚀 Applying Supabase migrations...\n');

  const migrationsDir = path.join(__dirname, '../supabase/migrations');

  // Migrations in order
  const migrations = [
    '20260118140000_fix_bots_schema.sql',
    '20260118143000_knowledge_sources_processing.sql',
    '20260118151000_knowledge_chunks_embeddings.sql',
  ];

  for (const migrationFile of migrations) {
    const filePath = path.join(migrationsDir, migrationFile);

    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Migration file not found: ${migrationFile}`);
      continue;
    }

    console.log(`📝 Applying: ${migrationFile}`);
    const migrationSql = fs.readFileSync(filePath, 'utf-8');

    try {
      await db.execute(sql.raw(migrationSql));
      console.log(`✅ Applied: ${migrationFile}\n`);
    } catch (error: any) {
      console.error(`❌ Failed to apply ${migrationFile}:`);
      console.error(`   Error: ${error.message}`);

      // Continue if column already exists
      if (error.message?.includes('already exists') ||
          error.message?.includes('duplicate')) {
        console.log(`   ℹ️  Continuing (already exists)...\n`);
        continue;
      }

      throw error;
    }
  }

  console.log('✅ All Supabase migrations applied!\n');

  // Verify the changes
  console.log('🔍 Verifying schema changes...\n');

  // Check knowledge_base type
  const kbType = await db.execute(sql`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_name = 'bots' AND column_name = 'knowledge_base'
  `);
  console.log(`knowledge_base type: ${kbType.rows[0]?.data_type}`);

  // Check processing columns
  const processingCols = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'knowledge_sources'
    AND column_name IN ('processing_state', 'retry_count', 'last_error', 'source_text')
  `);
  console.log(`Processing columns found: ${processingCols.rows.length}/4\n`);

  if (processingCols.rows.length === 4) {
    console.log('✅ Schema verification passed!');
  } else {
    console.log('⚠️  Some columns may be missing');
  }

  process.exit(0);
}

applySupabaseMigrations().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
