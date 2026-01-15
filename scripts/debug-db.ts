import pg from 'pg';
import { env } from '../server/env';

const { Client } = pg;

async function debugDb() {
  console.log('Debugging Database Connection...');
  console.log('URL:', env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')); // Mask pass

  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Common fix for some cloud DBs
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully!');
    await client.end();
  } catch (err: any) {
    console.error('❌ Connection Failed:', err.message);
    if (err.code) console.error('   Code:', err.code);
    if (err.detail) console.error('   Detail:', err.detail);
    if (err.hint) console.error('   Hint:', err.hint);
  }
}

debugDb();
