import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function checkBotSchema() {
  console.log('🔍 Checking bots table schema...\n');

  try {
    // Get all columns from bots table
    const columns = await db.execute(sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bots'
      ORDER BY ordinal_position
    `);

    console.log('Bots table columns:');
    console.log('═'.repeat(80));

    const columnNames = columns.rows.map((col: any) => col.column_name);

    // Expected columns from Drizzle schema
    const expectedColumns = [
      'id', 'name', 'type', 'system_prompt', 'model', 'temperature',
      'knowledge_base', 'active', 'conversations_count', 'theme_color',
      'website_url', 'max_messages', 'randomize_identity', 'avatar',
      'response_delay', 'embed_type', 'lead_capture', 'user_id',
      'is_public', 'organization_id', 'analytics', 'ab_test_config',
      'deleted_at', 'created_at', 'updated_at'
    ];

    const missingColumns: string[] = [];
    const presentColumns: string[] = [];

    for (const col of expectedColumns) {
      if (columnNames.includes(col)) {
        presentColumns.push(col);
      } else {
        missingColumns.push(col);
      }
    }

    console.log(`✅ Present columns (${presentColumns.length}):`);
    presentColumns.forEach(col => console.log(`   ${col}`));

    if (missingColumns.length > 0) {
      console.log(`\n❌ Missing columns (${missingColumns.length}):`);
      missingColumns.forEach(col => console.log(`   ${col}`));
    } else {
      console.log('\n✅ All expected columns present!');
    }

    // Check knowledge_base column type
    const knowledgeBaseCol = columns.rows.find((col: any) => col.column_name === 'knowledge_base');
    if (knowledgeBaseCol) {
      console.log(`\n📊 knowledge_base column type: ${knowledgeBaseCol.data_type}`);
      if (knowledgeBaseCol.data_type !== 'jsonb') {
        console.log('   ⚠️  Should be jsonb, not', knowledgeBaseCol.data_type);
      } else {
        console.log('   ✅ Correct type (jsonb)');
      }
    }

    // Check if knowledge_sources table exists and has processing columns
    console.log('\n🔍 Checking knowledge_sources table...\n');
    const ksColumns = await db.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'knowledge_sources'
      ORDER BY ordinal_position
    `);

    if (ksColumns.rows.length > 0) {
      console.log('✅ knowledge_sources table exists');
      const ksColumnNames = ksColumns.rows.map((col: any) => col.column_name);

      const processingColumns = [
        'processing_state', 'retry_count', 'last_error',
        'last_processed_at', 'source_text', 'page_count',
        'next_retry_at', 'dead_lettered_at'
      ];

      const missingKsColumns = processingColumns.filter(col => !ksColumnNames.includes(col));

      if (missingKsColumns.length > 0) {
        console.log(`❌ Missing processing columns (${missingKsColumns.length}):`);
        missingKsColumns.forEach(col => console.log(`   ${col}`));
      } else {
        console.log('✅ All processing state columns present!');
      }
    } else {
      console.log('❌ knowledge_sources table does not exist!');
    }

    // Check for migration_history table
    console.log('\n🔍 Checking migration tracking...\n');
    const migrationHistory = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'migration_history'
      ) as exists
    `);

    if (migrationHistory.rows[0]?.exists) {
      console.log('✅ migration_history table exists');
      const migrations = await db.execute(sql`
        SELECT version, name, executed_at
        FROM migration_history
        ORDER BY executed_at DESC
        LIMIT 5
      `);
      console.log('\nRecent migrations:');
      migrations.rows.forEach((m: any) => {
        console.log(`   ${m.version} - ${m.name} (${m.executed_at})`);
      });
    } else {
      console.log('❌ migration_history table does not exist');
      console.log('   ℹ️  Migrations may not be tracked');
    }

  } catch (error) {
    console.error('❌ Error checking schema:', error);
  }

  process.exit(0);
}

checkBotSchema();
