
import { db, pool } from '../server/db';
import { sql } from 'drizzle-orm';

async function checkDb() {
  try {
    console.log('Checking database connection and pgvector...');
    const result = await db.execute(sql`SELECT 1 as connected`);
    console.log('Connection test:', result[0]);

    const extensions = await db.execute(sql`SELECT * FROM pg_extension WHERE extname = 'vector'`);
    if (extensions.length > 0) {
      console.log('✅ pgvector extension is already installed.');
    } else {
      console.log('Installing pgvector extension...');
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
      console.log('✅ pgvector extension installed successfully.');
    }
  } catch (err) {
    console.error('❌ Database check failed:', err);
  } finally {
    await pool.end();
  }
}

checkDb();
