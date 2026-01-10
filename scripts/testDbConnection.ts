import postgres from 'postgres';
import { env } from '../server/env';

async function testConnection() {
  console.log('Testing database connection...\n');

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not found!');
    process.exit(1);
  }

  console.log('DATABASE_URL found');
  console.log('Connecting to database...\n');
  console.log(
    '⏳ Neon database may be sleeping, waiting for it to wake up (this can take 10-30 seconds)...\n',
  );

  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 60, // 60 seconds to allow database to wake up
    idle_timeout: 120,
    max_lifetime: 600,
  });

  try {
    // Test 1: Simple query
    console.log('Test 1: Simple SELECT query');
    const result = await sql`SELECT NOW() as current_time`;
    console.log('✓ Success:', result[0]);

    // Test 2: Check if users table exists
    console.log('\nTest 2: Check if users table exists');
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'bots', 'leads', 'conversations', 'organizations')
      ORDER BY table_name
    `;
    console.log('✓ Found tables:');
    tables.forEach((t) => console.log(`  - ${t.table_name}`));

    // Test 3: Try creating a simple test table
    console.log('\nTest 3: Create a test table');
    await sql`CREATE TABLE IF NOT EXISTS test_migration (id TEXT PRIMARY KEY, name TEXT)`;
    console.log('✓ Test table created');

    // Test 4: Drop the test table
    console.log('\nTest 4: Drop test table');
    await sql`DROP TABLE IF EXISTS test_migration`;
    console.log('✓ Test table dropped');

    console.log('\n✅ All database tests passed!');
  } catch (error) {
    console.error('\n❌ Database test failed:');
    console.error('Error:', error);
    console.error('Error message:', (error as Error).message);
    console.error('Error stack:', (error as Error).stack);
  } finally {
    await sql.end();
    console.log('\n📡 Connection closed');
  }
}

testConnection().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
