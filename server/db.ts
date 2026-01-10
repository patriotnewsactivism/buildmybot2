import fs from 'node:fs';
import path from 'node:path';
// Load environment variables
import { config } from 'dotenv';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  config({ path: envPath });
}

const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  config({ path: envLocalPath, override: true });
}

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../shared/schema';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL must be set. Did you forget to provision a database?',
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });
