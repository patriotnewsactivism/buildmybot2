import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './shared/schema';

// Never fall back to a checked-in database credential. Supply the intended
// environment explicitly so this diagnostic cannot target a retired backend.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

async function checkConnection() {
  console.log('Testing database connection...');
  try {
    const client = postgres(connectionString);
    const db = drizzle(client, { schema });

    // Simple query to list a few users
    const result = await db.select().from(schema.users).limit(1);
    console.log('Connection successful!');
    console.log('Query result:', result);

    await client.end();
  } catch (error) {
    console.error('Database connection failed:', error);
  }
}

checkConnection();
