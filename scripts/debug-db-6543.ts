import pg from 'pg';
import { env } from '../server/env';

const { Client } = pg;

async function debugDb() {
  // Construct URL for Port 6543 (Transaction Pooler)
  // Original: ...pooler.supabase.com:5432/postgres
  // New: ...pooler.supabase.com:6543/postgres
  const originalUrl = env.DATABASE_URL;
  const url6543 = originalUrl.replace(':5432', ':6543');

  console.log('Testing Supabase Transaction Pooler (Port 6543)...');
  console.log('URL:', url6543.replace(/:[^:@]+@/, ':****@'));

  const client = new Client({
    connectionString: url6543,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully to Port 6543!');
    await client.end();
  } catch (err: any) {
    console.error('❌ Connection Failed:', err.message);
    if (err.code) console.error('   Code:', err.code);
  }
}

debugDb();
