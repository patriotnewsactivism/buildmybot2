import pg from 'pg';
import { env } from '../server/env';

const { Client } = pg;

async function enableExtensions() {
  console.log('Enabling required extensions on Railway DB...');
  const client = new Client({
    connectionString: env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to Railway DB.');
    
    // Enable pgvector
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✅ Extension "vector" enabled.');
    
    // Enable uuid-ossp (common requirement)
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    console.log('✅ Extension "uuid-ossp" enabled.');

    await client.end();
    console.log('Extensions setup complete.');
  } catch (err: any) {
    console.error('❌ Failed to enable extensions:', err.message);
    process.exit(1);
  }
}

enableExtensions();
