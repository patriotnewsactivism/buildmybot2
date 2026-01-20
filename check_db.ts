
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './shared/schema';

// Use the connection string from .env
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:RDjJpNGcVePaqxGTMBcVrUKeTlGwfRnc@yamanote.proxy.rlwy.net:29459/railway';

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
