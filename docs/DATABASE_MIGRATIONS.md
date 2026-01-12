# Database Migrations Guide

Complete guide to managing database migrations in the buildmybotapp project.

## Table of Contents
- [Overview](#overview)
- [Quick Start](#quick-start)
- [Migration Commands](#migration-commands)
- [Creating New Migrations](#creating-new-migrations)
- [Migration Types](#migration-types)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

The buildmybotapp project uses a custom migration system built on Drizzle ORM with:

✅ **Version Tracking**: All migrations tracked in `migration_history` table
✅ **Transaction Support**: Automatic rollback on errors via PostgreSQL SAVEPOINTs
✅ **Checksum Validation**: Detect modified migration files
✅ **Dependency Resolution**: Migrations run in correct order
✅ **Dry-Run Mode**: Test migrations without executing
✅ **Rollback Support**: Undo migrations with `down` functions

### Migration System Files

```
scripts/
├── migrate.ts              # Migration orchestrator (main entry point)
├── lib/
│   └── migrationRunner.ts  # Core migration runner with transaction support
server/migrations/
├── 001_multi_tenant_architecture.sql
├── 002_consolidated_indexes.ts
├── 003_monitoring_table_indexes.ts
└── ...
shared/
├── schema.ts               # Main schema definition
├── schema-migrations.ts    # Migration history table
└── schema-monitoring.ts    # Monitoring tables
```

---

## Quick Start

### Run All Pending Migrations

```bash
npm run db:migrate
```

### Check Migration Status

```bash
npm run db:migrate:status
```

### Preview Migrations (Dry-Run)

```bash
npm run db:migrate -- --dry-run
```

### Rollback Last Migration

```bash
npm run db:migrate:down
```

### Rollback Multiple Migrations

```bash
npm run db:migrate:down -- --steps=3
```

---

## Migration Commands

### Primary Commands

| Command | Description | Example |
|---------|-------------|---------|
| `npm run db:migrate` | Run all pending migrations | `npm run db:migrate` |
| `npm run db:migrate:status` | Show migration history | `npm run db:migrate:status` |
| `npm run db:migrate -- --dry-run` | Preview without executing | `npm run db:migrate -- --dry-run` |
| `npm run db:migrate:down` | Rollback last migration | `npm run db:migrate:down` |
| `npm run db:migrate:down -- --steps=N` | Rollback N migrations | `npm run db:migrate:down -- --steps=3` |

### Deprecated Commands (Use New Ones)

| Old Command | New Command | Status |
|-------------|-------------|--------|
| `npm run migrate:schema` | `npm run db:migrate` | ⚠️ DEPRECATED |
| `npm run migrate:data` | `npm run db:migrate` | ⚠️ DEPRECATED |
| `npm run migrate:all` | `npm run db:setup` | ⚠️ DEPRECATED |

---

## Creating New Migrations

### Step 1: Determine Migration Type

Choose the appropriate type:
- **Schema**: Tables, columns, constraints
- **Data**: Transform existing data
- **Index**: Performance indexes
- **Seed**: Initial/reference data

### Step 2: Create Migration File

#### Option A: Schema Changes via Drizzle

1. Update `shared/schema.ts` with new tables/columns
2. Run `npm run db:push` to apply changes
3. Create a migration to record it:

```typescript
// server/migrations/006_add_new_table.ts
export async function addNewTable(): Promise<void> {
  console.log('  New table created via Drizzle schema');
  // Table is already created by db:push, just record it
}
```

#### Option B: TypeScript Migration

```typescript
// server/migrations/007_my_migration.ts
import { sql } from 'drizzle-orm';
import { db } from '../db';

export async function myMigration(): Promise<void> {
  console.log('  Executing my migration...');

  // Your migration logic here
  await db.execute(sql`
    -- Your SQL here
  `);

  console.log('  ✅ Migration complete');
}
```

#### Option C: SQL Migration

```sql
-- server/migrations/008_my_migration.sql
CREATE TABLE IF NOT EXISTS my_new_table (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_my_new_table_name ON my_new_table(name);
```

### Step 3: Register Migration

Add to `scripts/migrate.ts`:

```typescript
const MIGRATIONS: MigrationConfig[] = [
  // ... existing migrations
  {
    version: '006',
    name: 'add_new_table',
    type: 'schema',
    up: async () => {
      await addNewTable();
    },
    // Optional: Add rollback
    down: async () => {
      await db.execute(sql`DROP TABLE IF EXISTS my_new_table`);
    },
  },
];
```

### Step 4: Test Migration

```bash
# Test with dry-run first
npm run db:migrate -- --dry-run

# If looks good, execute
npm run db:migrate

# Verify it worked
npm run db:migrate:status
```

---

## Migration Types

### Schema Migrations

Create/modify tables, columns, constraints:

```typescript
{
  version: '006',
  name: 'add_user_preferences',
  type: 'schema',
  up: async () => {
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT '{}'::jsonb
    `);
  },
  down: async () => {
    await db.execute(sql`
      ALTER TABLE users DROP COLUMN preferences
    `);
  },
}
```

### Data Migrations

Transform existing data:

```typescript
{
  version: '007',
  name: 'migrate_user_settings',
  type: 'data',
  up: async () => {
    // Wrap in transaction for safety
    const runner = new MigrationRunner();

    await runner.runWithTransaction(async () => {
      const users = await db.select().from(users);

      for (const user of users) {
        // Transform data
        await db.update(users)
          .set({ preferences: { theme: 'light' } })
          .where(eq(users.id, user.id));
      }
    });
  },
}
```

### Index Migrations

Add performance indexes:

```typescript
{
  version: '008',
  name: 'add_search_indexes',
  type: 'index',
  up: async () => {
    await db.execute(sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_search
      ON users USING gin(to_tsvector('english', name || ' ' || email))
    `);
  },
  down: async () => {
    await db.execute(sql`DROP INDEX IF EXISTS idx_users_search`);
  },
}
```

---

## Best Practices

### ✅ DO

1. **Always use transactions** for data migrations:
   ```typescript
   await runner.runWithTransaction(async () => {
     // Your migration code
   });
   ```

2. **Test on staging first** before production

3. **Use CONCURRENT for indexes**:
   ```sql
   CREATE INDEX CONCURRENTLY ...  -- Non-blocking
   ```

4. **Add rollback functions** when possible:
   ```typescript
   down: async () => {
     // Undo the migration
   }
   ```

5. **Include checksums** for validation:
   ```typescript
   checksum: runner.generateChecksum(migrationCode)
   ```

6. **Document complex migrations**:
   ```typescript
   // Migration 009: Migrate legacy user data to new format
   // Context: We're changing from separate first/last name to single name field
   // Estimated time: 30 seconds for 10k users
   ```

### ❌ DON'T

1. **Don't modify executed migrations** - Create a new one instead
2. **Don't skip version numbers** - Keep sequential: 001, 002, 003...
3. **Don't use blocking operations** - Always use `CONCURRENTLY` for indexes
4. **Don't forget backups** - Always backup before production migrations
5. **Don't run multiple migrations in parallel** - They execute sequentially by design

---

## Troubleshooting

### Migration Failed - What Now?

1. **Check the error message**:
   ```bash
   npm run db:migrate
   # Read the error output carefully
   ```

2. **Check migration history**:
   ```bash
   npm run db:migrate:status
   # Look for 'failed' status
   ```

3. **Fix the issue** in the migration file

4. **Mark as not executed** (if needed):
   ```sql
   DELETE FROM migration_history WHERE version = '006';
   ```

5. **Re-run the migration**:
   ```bash
   npm run db:migrate
   ```

### Migration Stuck

If a migration seems stuck:

1. **Check for long-running queries**:
   ```sql
   SELECT pid, now() - query_start AS duration, query
   FROM pg_stat_activity
   WHERE state = 'active' AND query NOT ILIKE '%pg_stat_activity%'
   ORDER BY duration DESC;
   ```

2. **Check for locks**:
   ```sql
   SELECT * FROM pg_locks WHERE NOT granted;
   ```

3. **Cancel if needed** (careful!):
   ```sql
   SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE query LIKE '%YOUR_MIGRATION%';
   ```

### Rollback Failed

1. **Check if rollback function exists**:
   ```typescript
   // Does your migration have a down() function?
   down: async () => { ... }
   ```

2. **Manual rollback**:
   ```bash
   # Connect to database
   psql $DATABASE_URL

   # Manually undo changes
   DROP TABLE IF EXISTS ...;
   ALTER TABLE ... DROP COLUMN ...;
   ```

3. **Update migration history**:
   ```sql
   UPDATE migration_history
   SET status = 'rolled_back'
   WHERE version = '006';
   ```

### Checksum Mismatch

If you see "Checksum mismatch":

1. **Understand the warning**: The migration file was modified after being run
2. **Verify changes are intentional**
3. **If safe, ignore the warning** - Migration won't re-run anyway
4. **If serious, investigate** - Someone may have tampered with migrations

---

## Migration Workflow

### Local Development

```bash
# 1. Pull latest code
git pull origin main

# 2. Check migration status
npm run db:migrate:status

# 3. Run pending migrations
npm run db:migrate

# 4. Update schema
npm run db:push

# 5. Start development
npm run dev
```

### Staging Deployment

```bash
# 1. Backup database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# 2. Dry-run migrations
npm run db:migrate -- --dry-run

# 3. Execute migrations
npm run db:migrate

# 4. Verify
npm run db:migrate:status

# 5. Test application
npm start
```

### Production Deployment

See [DATABASE_UPGRADE_CHECKLIST.md](./DATABASE_UPGRADE_CHECKLIST.md) for complete production deployment process.

---

## Advanced Topics

### Custom Migration Validation

```typescript
import { MigrationRunner, type ValidationCheck } from './lib/migrationRunner';

const checks: ValidationCheck[] = [
  {
    name: 'no_duplicate_emails',
    description: 'Check for duplicate user emails',
    query: 'SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1',
    expectedResult: 'empty',
  },
];

const results = await runner.validateData(checks);
```

### Migration Dependencies

```typescript
{
  version: '010',
  name: 'add_foreign_key',
  type: 'schema',
  dependencies: ['008', '009'], // Must run after these
  up: async () => {
    // Migration code
  },
}
```

### Large Data Migrations

For migrations affecting millions of rows:

```typescript
{
  version: '011',
  name: 'migrate_large_table',
  type: 'data',
  up: async () => {
    // Process in batches
    let offset = 0;
    const batchSize = 1000;

    while (true) {
      const batch = await db.select()
        .from(largeTable)
        .limit(batchSize)
        .offset(offset);

      if (batch.length === 0) break;

      // Process batch
      for (const row of batch) {
        // Transform data
      }

      offset += batchSize;
      console.log(`  Processed ${offset} rows...`);
    }
  },
}
```

---

## Support

- **Issues**: Check the error output and migration history
- **Questions**: Review this guide and the code comments
- **Updates**: When updating migrations, create new ones instead of modifying existing

---

## See Also

- [DATABASE_SEEDS.md](./DATABASE_SEEDS.md) - Seeding guide
- [DATABASE_UPGRADE_CHECKLIST.md](./DATABASE_UPGRADE_CHECKLIST.md) - Production deployment
- [CLAUDE.md](../CLAUDE.md) - Project overview
