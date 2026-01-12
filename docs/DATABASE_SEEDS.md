# Database Seeding Guide

Complete guide to managing database seeds in the buildmybotapp project.

## Table of Contents
- [Overview](#overview)
- [Quick Start](#quick-start)
- [Seed Commands](#seed-commands)
- [Available Seeds](#available-seeds)
- [Creating New Seeds](#creating-new-seeds)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

Seeds populate your database with initial data like:
- **Admin users** and roles
- **Bot templates** for the marketplace
- **Billing plans** and pricing
- **Industry knowledge bases** for RAG

### Seed System Features

✅ **Ordered Execution**: Seeds run in dependency order
✅ **Idempotent**: Safe to re-run (skips existing data)
✅ **Force Mode**: Re-run seeds even if already executed
✅ **Selective Execution**: Run specific seeds only
✅ **Tracking**: All seeds recorded in `migration_history`

### Seed Files

```
server/seeds/
├── seedUserRoles.ts            # Admin users (REQUIRED)
├── seedTemplates.ts            # Bot templates
├── revenue-seed.ts             # Billing plans
└── industryKnowledgeBases.ts   # Industry FAQs

scripts/
└── seed.ts                     # Seed orchestrator
```

---

## Quick Start

### Run All Seeds

```bash
npm run db:seed
```

### Check Seed Status

```bash
npm run db:seed:status
```

### Force Re-run All Seeds

```bash
npm run db:seed:force
```

### Run Specific Seed

```bash
npm run db:seed -- --only=user-roles
npm run db:seed -- --only=bot-templates
npm run db:seed -- --only=industry-knowledge
```

### Preview Seeds (Dry-Run)

```bash
npm run db:seed -- --dry-run
```

---

## Seed Commands

### Primary Commands

| Command | Description | Example |
|---------|-------------|---------|
| `npm run db:seed` | Run all seeds in order | `npm run db:seed` |
| `npm run db:seed:status` | Show seed status | `npm run db:seed:status` |
| `npm run db:seed:force` | Force re-run all seeds | `npm run db:seed:force` |
| `npm run db:seed -- --only=NAME` | Run specific seed | `npm run db:seed -- --only=user-roles` |
| `npm run db:seed -- --dry-run` | Preview without executing | `npm run db:seed -- --dry-run` |

### Deprecated Commands (Use New Ones)

| Old Command | New Command | Status |
|-------------|-------------|--------|
| `npm run seed:roles` | `npm run db:seed -- --only=user-roles` | ⚠️ DEPRECATED |
| `npm run seed:revenue` | `npm run db:seed -- --only=revenue-tables` | ⚠️ DEPRECATED |
| `npm run seed:kb` | `npm run db:seed -- --only=industry-knowledge` | ⚠️ DEPRECATED |
| `npm run seed:all` | `npm run db:seed` | ⚠️ DEPRECATED |

---

## Available Seeds

### 1. User Roles (REQUIRED)

**Name**: `user-roles`
**Order**: 1 (runs first)
**Required**: ✅ Yes

**What it does**:
- Creates admin users from environment variables
- Creates organizations for non-admin users
- Sets up organization memberships

**Environment Variables**:
```env
MASTER_ADMIN_EMAIL=mreardon@wtpnews.org
MASTER_ADMIN_PLAN=ENTERPRISE
ADMIN_EMAIL=jadj19@gmail.com
ADMIN_PLAN=ENTERPRISE
RESELLER_EMAIL=patriotnewsactivism@gmail.com
RESELLER_PLAN=PROFESSIONAL
CLIENT_EMAIL=news@wtpnews.org
CLIENT_PLAN=FREE
```

**Run individually**:
```bash
npm run db:seed -- --only=user-roles
```

**Expected Output**:
```
Running: user-roles
Description: Seed admin users and roles
────────────────────────────────────────────
Processing: mreardon@wtpnews.org
  ✅ Created user mreardon@wtpnews.org with role: MasterAdmin

Processing: jadj19@gmail.com
  ✅ Updated jadj19@gmail.com to Admin (ADMIN)

✅ Completed in 456ms
```

---

### 2. Bot Templates

**Name**: `bot-templates`
**Order**: 2
**Required**: ❌ No

**What it does**:
- Seeds 20+ pre-built bot templates
- Includes: Real Estate, SaaS Support, Dental, Legal, etc.
- Makes marketplace functional

**Templates Included**:
- Real Estate Scheduler
- SaaS Support Pro
- Dental Clinic Front Desk
- Legal Services Assistant
- Restaurant Reservation Bot
- Fitness Center Concierge
- E-commerce Sales Rep
- And 13+ more...

**Run individually**:
```bash
npm run db:seed -- --only=bot-templates
```

**Expected Output**:
```
Running: bot-templates
Description: Seed marketplace bot templates
────────────────────────────────────────────
  ✅ Inserted 20 templates

✅ Completed in 892ms
   Inserted: 20
   Skipped: 0
```

---

### 3. Revenue Tables

**Name**: `revenue-tables`
**Order**: 3
**Required**: ❌ No

**What it does**:
- Seeds billing plans (FREE, STARTER, PROFESSIONAL, ENTERPRISE)
- Seeds voice minute packages
- Seeds credit packages
- Seeds service offerings

**Plans Included**:
- **FREE**: $0/month
- **STARTER**: $49/month
- **PROFESSIONAL**: $99/month (Popular)
- **ENTERPRISE**: $299/month

**Run individually**:
```bash
npm run db:seed -- --only=revenue-tables
```

**Expected Output**:
```
Running: revenue-tables
Description: Seed billing plans and packages
────────────────────────────────────────────
  ✅ Seeded 4 billing plans
  ✅ Seeded voice packages
  ✅ Seeded service offerings

✅ Completed in 234ms
```

---

### 4. Industry Knowledge Bases

**Name**: `industry-knowledge`
**Order**: 4
**Required**: ❌ No

**What it does**:
- Seeds industry-specific FAQs for RAG
- Creates knowledge sources
- Inserts knowledge chunks for each FAQ

**Industries Included**:
- Real Estate (5 FAQs)
- Dental/Healthcare (5 FAQs)
- HVAC Services (5 FAQs)
- Legal Services (5 FAQs)
- Restaurant (5 FAQs)
- And 15+ more industries...

**Total**: 20 industries, 100+ FAQs

**Run individually**:
```bash
npm run db:seed -- --only=industry-knowledge
```

**Expected Output**:
```
Running: industry-knowledge
Description: Seed industry-specific knowledge bases
────────────────────────────────────────────
Processing: Real Estate FAQ (Real Estate)
  ✅ Created knowledge source: Real Estate FAQ
  📝 Inserted 5 FAQ chunks

Processing: Dental Practice FAQ (Healthcare)
  ✅ Created knowledge source: Dental Practice FAQ
  📝 Inserted 5 FAQ chunks

═══════════════════════════════════════════
📊 SEEDING SUMMARY
✅ Knowledge bases inserted: 20
⏭️  Knowledge bases skipped: 0
📝 Total FAQ chunks created: 100
═══════════════════════════════════════════

✅ Completed in 1234ms
   Inserted: 20
   Total chunks: 100
```

---

## Creating New Seeds

### Step 1: Create Seed Function

Create a new file in `server/seeds/`:

```typescript
// server/seeds/mySeed.ts
import { fileURLToPath } from 'node:url';
import { db } from '../db';
import { myTable } from '../../shared/schema';

export async function seedMyData() {
  console.log('🌱 Seeding my data...\n');

  try {
    // Check if already seeded (idempotent)
    const existing = await db.select().from(myTable).limit(1);

    if (existing.length > 0) {
      console.log('⏭️  Data already exists, skipping\n');
      return { success: true, inserted: 0, skipped: 1 };
    }

    // Insert your data
    await db.insert(myTable).values([
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
    ]);

    console.log('✅ Seeded 2 items\n');
    return { success: true, inserted: 2, skipped: 0 };
  } catch (error) {
    console.error('❌ Failed to seed:', error);
    throw error;
  }
}

// CLI execution support
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  seedMyData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
```

### Step 2: Register Seed

Add to `scripts/seed.ts`:

```typescript
const SEEDS: SeedConfig[] = [
  // ... existing seeds
  {
    name: 'my-data',
    description: 'Seed my custom data',
    order: 5, // Run after other seeds
    function: async () => {
      const result = await seedMyData();
      return { success: true, ...result };
    },
    required: false, // Optional seed
  },
];
```

### Step 3: Test Seed

```bash
# Test individually first
npm run db:seed -- --only=my-data

# Test with all seeds
npm run db:seed -- --dry-run

# If looks good, run it
npm run db:seed
```

---

## Best Practices

### ✅ DO

1. **Make seeds idempotent**:
   ```typescript
   // Check if data exists before inserting
   const existing = await db.select()...;
   if (existing.length > 0) {
     return { success: true, skipped: 1 };
   }
   ```

2. **Use environment variables for configurable data**:
   ```typescript
   import { env } from '../env';
   const adminEmail = env.MASTER_ADMIN_EMAIL || 'default@example.com';
   ```

3. **Return detailed results**:
   ```typescript
   return {
     success: true,
     inserted: 10,
     skipped: 5,
     updated: 2,
   };
   ```

4. **Add CLI execution support**:
   ```typescript
   const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
   if (isMainModule) {
     mySeed().then(() => process.exit(0));
   }
   ```

5. **Log progress clearly**:
   ```typescript
   console.log('Processing: Item Name');
   console.log('  ✅ Created 5 records');
   console.log('  ⏭️  Skipped 2 existing records');
   ```

### ❌ DON'T

1. **Don't seed production data in code** - Use environment variables
2. **Don't fail on duplicate data** - Make seeds idempotent
3. **Don't hardcode IDs** - Use UUIDs or database sequences
4. **Don't seed large datasets** - Consider bulk import scripts instead
5. **Don't seed sensitive data** - Use environment variables or secrets

---

## Seed Order & Dependencies

Seeds run in this order:

```
1. user-roles       (REQUIRED - creates admins)
   ↓
2. bot-templates    (marketplace templates)
   ↓
3. revenue-tables   (billing plans)
   ↓
4. industry-knowledge (RAG knowledge bases)
   ↓
5. your-custom-seed (add yours here)
```

**Important**: If a **required** seed fails, seeding stops. Optional seeds continue even on failure.

---

## Troubleshooting

### Seed Failed

1. **Check the error message**:
   ```bash
   npm run db:seed
   # Read error output
   ```

2. **Run seed individually**:
   ```bash
   npm run db:seed -- --only=problem-seed
   ```

3. **Check database state**:
   ```bash
   npm run db:studio
   # Visually inspect data
   ```

4. **Force re-run after fixing**:
   ```bash
   npm run db:seed:force -- --only=problem-seed
   ```

### Seed Keeps Skipping

If a seed says "Already executed" but you want to re-run:

```bash
# Option 1: Use force mode
npm run db:seed:force -- --only=seed-name

# Option 2: Clear from history
# Connect to database
psql $DATABASE_URL

# Delete seed record
DELETE FROM migration_history WHERE type = 'seed' AND name = 'seed-name';
```

### Duplicate Data

If you accidentally ran a seed twice without idempotency checks:

```sql
-- Find duplicates
SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1;

-- Delete duplicates (keep first)
DELETE FROM users a USING users b
WHERE a.id < b.id AND a.email = b.email;
```

### Environment Variables Not Loading

```bash
# Check .env file exists
ls -la .env

# Check .env.local (overrides .env)
ls -la .env.local

# Print variables
echo $MASTER_ADMIN_EMAIL

# Force reload
source .env
npm run db:seed -- --only=user-roles
```

---

## Seed Scenarios

### Fresh Database Setup

```bash
# 1. Run migrations
npm run db:migrate

# 2. Run all seeds
npm run db:seed

# 3. Verify
npm run db:seed:status
```

### Add New Admin User

```bash
# 1. Update .env
MASTER_ADMIN_EMAIL=new-admin@example.com

# 2. Re-run user seed
npm run db:seed:force -- --only=user-roles

# 3. Verify in database
npm run db:studio
```

### Reset All Seed Data

```bash
# WARNING: This deletes all seed data!

# 1. Connect to database
psql $DATABASE_URL

# 2. Clear seed history
DELETE FROM migration_history WHERE type = 'seed';

# 3. Delete seeded data (careful!)
DELETE FROM bot_templates;
DELETE FROM knowledge_sources;
-- etc.

# 4. Re-run seeds
npm run db:seed
```

### Production Seeding

```bash
# 1. Backup first!
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# 2. Set production env vars
export MASTER_ADMIN_EMAIL=admin@yourcompany.com
export MASTER_ADMIN_PLAN=ENTERPRISE

# 3. Dry-run first
npm run db:seed -- --dry-run

# 4. Execute
npm run db:seed

# 5. Verify
npm run db:seed:status
```

---

## Advanced Topics

### Seed with Transactions

For seeds that modify data:

```typescript
import { MigrationRunner } from '../../scripts/lib/migrationRunner';

export async function seedWithTransaction() {
  const runner = new MigrationRunner();

  await runner.runWithTransaction(async () => {
    // Your seed logic here
    // Automatically rolls back on error
  });
}
```

### Conditional Seeding

Seed different data based on environment:

```typescript
export async function seedConditionally() {
  const isDev = env.NODE_ENV === 'development';
  const isProd = env.NODE_ENV === 'production';

  if (isDev) {
    // Seed test data
    await db.insert(users).values({ email: 'test@example.com' });
  }

  if (isProd) {
    // Seed production data only
    await db.insert(users).values({ email: env.ADMIN_EMAIL });
  }
}
```

### Seed from CSV/JSON

```typescript
import fs from 'node:fs';
import csv from 'csv-parser';

export async function seedFromCSV() {
  const results = [];

  fs.createReadStream('data.csv')
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      await db.insert(myTable).values(results);
    });
}
```

---

## See Also

- [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md) - Migration guide
- [DATABASE_UPGRADE_CHECKLIST.md](./DATABASE_UPGRADE_CHECKLIST.md) - Production deployment
- [CLAUDE.md](../CLAUDE.md) - Project overview
