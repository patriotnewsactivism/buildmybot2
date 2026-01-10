# Phase 1 Deployment Guide: Multi-Tenant Architecture Implementation

**Date:** January 6, 2026
**Version:** 1.0
**Status:** Ready for Deployment

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Pre-Deployment Checklist](#pre-deployment-checklist)
4. [Deployment Steps](#deployment-steps)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Rollback Procedure](#rollback-procedure)
7. [Troubleshooting](#troubleshooting)

---

## Overview

Phase 1 implements the foundation for BuildMyBot's transformation into an enterprise-grade, multi-tenant SaaS platform. This deployment adds:

- **Multi-tenant organization model** with data isolation
- **Role-Based Access Control (RBAC)** system
- **Comprehensive audit logging** for compliance and security
- **Security hardening** (rate limiting, input validation, CSRF protection)
- **Service layer architecture** for better code organization
- **Analytics infrastructure** for tracking and insights

### Changes Summary

**Database Changes:**
- 7 new tables: `organizations`, `organization_members`, `roles`, `audit_logs`, `partner_clients`, `analytics_events`, `bot_templates`
- 4 existing tables updated: `users`, `bots`, `leads`, `conversations`
- 20+ new indexes for performance optimization

**Application Changes:**
- 6 new service classes: `AuditService`, `BotService`, `LeadService`, `OrganizationService`, `UserService`, `AnalyticsService`
- Enhanced middleware: authentication, authorization, validation, audit logging, rate limiting
- 3 new API route modules: organizations, audit, analytics
- Data migration script to transition existing data

---

## Prerequisites

### System Requirements

- **Node.js:** v18.0.0 or higher
- **PostgreSQL:** v14.0 or higher
- **npm:** v9.0.0 or higher
- **Backup tool:** pg_dump or equivalent

### Environment Variables

Ensure the following environment variables are set:

```bash
DATABASE_URL=postgresql://user:password@host:port/database
SESSION_SECRET=your-session-secret
REPL_ID=your-repl-id (if using Replit)
APP_BASE_URL=https://your-domain.com
NODE_ENV=production
```

### Access Requirements

- Database administrator access
- Application server access
- Ability to take the application offline briefly (5-10 minutes recommended)

---

## Pre-Deployment Checklist

### 1. Backup Database

**CRITICAL:** Create a full database backup before proceeding.

```bash
# PostgreSQL backup command
pg_dump -h <host> -U <username> -d <database> > buildmybot_backup_$(date +%Y%m%d_%H%M%S).sql

# Or using environment variable
pg_dump $DATABASE_URL > buildmybot_backup_$(date +%Y%m%d_%H%M%S).sql
```

**Verify the backup:**
```bash
# Check backup file size (should not be empty)
ls -lh buildmybot_backup_*.sql

# Optionally test restore to a test database
createdb buildmybot_test
psql buildmybot_test < buildmybot_backup_*.sql
```

### 2. Verify Dependencies

```bash
# Check that all required packages are installed
npm install

# Verify critical packages
npm list express drizzle-orm helmet express-rate-limit zod
```

### 3. Test Database Connection

```bash
# Test PostgreSQL connection
psql $DATABASE_URL -c "SELECT version();"
```

### 4. Review Current Data

```bash
# Count existing records (helps verify migration success)
psql $DATABASE_URL -c "SELECT
  (SELECT COUNT(*) FROM users) as user_count,
  (SELECT COUNT(*) FROM bots) as bot_count,
  (SELECT COUNT(*) FROM leads) as lead_count,
  (SELECT COUNT(*) FROM conversations) as conversation_count;"
```

---

## Deployment Steps

### Step 1: Pull Latest Code

```bash
# Ensure you have the latest Phase 1 implementation
git pull origin main

# Verify new files are present
ls -la server/services/
ls -la server/middleware/
ls -la server/routes/
ls -la server/migrations/
```

### Step 2: Install Dependencies

```bash
# Install any new dependencies
npm install

# Verify installation
npm list helmet express-rate-limit zod
```

### Step 3: Run Database Schema Migration

```bash
# Apply the SQL migration
psql $DATABASE_URL < server/migrations/001_multi_tenant_architecture.sql

# Or if psql doesn't work with environment variable:
psql -h <host> -U <username> -d <database> < server/migrations/001_multi_tenant_architecture.sql
```

**Expected Output:**
```
CREATE TABLE
CREATE TABLE
CREATE TABLE
...
CREATE INDEX
CREATE INDEX
```

### Step 4: Verify Schema Changes

```bash
# Check that new tables were created
psql $DATABASE_URL -c "\dt"

# Verify organizations table
psql $DATABASE_URL -c "SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'organizations';"

# Check indexes
psql $DATABASE_URL -c "\di"
```

### Step 5: Run Data Migration

**IMPORTANT:** This step migrates existing users to the organization model.

```bash
# Build the TypeScript project first
npm run build

# Run the data migration script
tsx server/migrations/migrateToOrganizations.ts
```

**Expected Output:**
```
🚀 Starting data migration to organization model...

📊 Step 1: Finding users without organizations...
Found X users to migrate

🏢 Step 2: Creating organizations for each user...
✅ Created organization "Company Name" for user email@example.com
...

🤖 Step 3: Updating bots with organization IDs...
✅ Updated X bots

📋 Step 4: Updating leads with organization IDs...
✅ Updated X leads

💬 Step 5: Updating conversations with organization IDs...
✅ Updated X conversations

==================================================
📊 MIGRATION SUMMARY
==================================================
Organizations Created: X
Users Updated: X
Bots Updated: X
Leads Updated: X
Conversations Updated: X
Errors: 0
==================================================

✅ Migration completed successfully!
```

### Step 6: Verify Data Migration

```bash
# Check organizations were created
psql $DATABASE_URL -c "SELECT id, name, slug, owner_id FROM organizations LIMIT 5;"

# Check users have organization_id
psql $DATABASE_URL -c "SELECT id, name, email, organization_id FROM users WHERE organization_id IS NOT NULL LIMIT 5;"

# Check organization members were created
psql $DATABASE_URL -c "SELECT * FROM organization_members LIMIT 5;"

# Verify bots have organization_id
psql $DATABASE_URL -c "SELECT id, name, organization_id FROM bots WHERE organization_id IS NOT NULL LIMIT 5;"
```

### Step 7: Integrate New Routes (MANUAL STEP)

Add the following imports and routes to `server/index.ts`:

**At the top of the file (with other imports):**
```typescript
import { securityHeaders, apiLimiter } from './middleware';
import { organizationsRouter, auditRouter, analyticsRouter } from './routes';
```

**After `app.use(express.json());` add:**
```typescript
// Apply security headers
app.use(securityHeaders);

// Apply rate limiting to API routes
app.use('/api', apiLimiter);

// Register Phase 1 routes
app.use('/api/organizations', organizationsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/analytics', analyticsRouter);
```

### Step 8: Restart Application

```bash
# If using npm
npm run start

# If using pm2
pm2 restart buildmybot

# If using systemd
sudo systemctl restart buildmybot
```

### Step 9: Check Application Logs

```bash
# Check for any errors during startup
tail -f /var/log/buildmybot/error.log

# Or if using pm2
pm2 logs buildmybot

# Look for successful startup messages
grep "Server started" /var/log/buildmybot/app.log
```

---

## Post-Deployment Verification

### 1. Health Check

```bash
# Test the health endpoint
curl https://your-domain.com/api/health

# Expected response:
# {"status":"ok"}
```

### 2. Test New Endpoints

```bash
# Test organizations endpoint (requires authentication)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-domain.com/api/organizations/YOUR_ORG_ID

# Test analytics endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-domain.com/api/analytics/metrics/YOUR_ORG_ID
```

### 3. Verify Security Headers

```bash
# Check that security headers are present
curl -I https://your-domain.com/api/health

# Should see headers like:
# X-Frame-Options: SAMEORIGIN
# X-Content-Type-Options: nosniff
# X-XSS-Protection: 1; mode=block
```

### 4. Test Rate Limiting

```bash
# Make multiple rapid requests to test rate limiting
for i in {1..110}; do
  curl https://your-domain.com/api/health
done

# After 100 requests, should see:
# {"error":"Too many requests from this IP, please try again later"}
```

### 5. Verify Audit Logging

```bash
# Check audit_logs table
psql $DATABASE_URL -c "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;"

# Should see recent activities logged
```

### 6. Test User Login

- Log in to the application as a test user
- Verify dashboard loads correctly
- Check that user data is displayed properly
- Test creating a new bot
- Verify organization context is working

### 7. Data Integrity Check

```bash
# Verify all users have organizations
psql $DATABASE_URL -c "SELECT COUNT(*) as users_without_org FROM users
  WHERE organization_id IS NULL AND deleted_at IS NULL;"

# Result should be 0

# Verify all bots have organizations
psql $DATABASE_URL -c "SELECT COUNT(*) as bots_without_org FROM bots
  WHERE organization_id IS NULL AND deleted_at IS NULL;"

# Result should be 0
```

---

## Rollback Procedure

If issues are encountered, follow these steps to rollback:

### 1. Stop the Application

```bash
# Stop the application server
pm2 stop buildmybot
# or
sudo systemctl stop buildmybot
```

### 2. Restore Database from Backup

```bash
# Drop current database (CAREFUL!)
dropdb buildmybot_production

# Create fresh database
createdb buildmybot_production

# Restore from backup
psql buildmybot_production < buildmybot_backup_YYYYMMDD_HHMMSS.sql
```

### 3. Revert Code Changes

```bash
# Checkout previous commit
git log --oneline -n 10  # Find the commit before Phase 1
git checkout <previous-commit-hash>

# Or revert to a specific tag
git checkout v1.0-pre-phase1
```

### 4. Restart Application

```bash
npm run start
# or
pm2 start buildmybot
```

### 5. Verify Rollback

```bash
# Test application functionality
curl https://your-domain.com/api/health

# Verify database state
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
```

---

## Troubleshooting

### Issue: Migration Script Fails

**Symptoms:**
- `migrateToOrganizations.ts` exits with errors
- Organizations not created

**Solutions:**
1. Check database connection:
   ```bash
   psql $DATABASE_URL -c "SELECT 1;"
   ```

2. Verify schema migration completed:
   ```bash
   psql $DATABASE_URL -c "\dt" | grep organizations
   ```

3. Check for conflicting data:
   ```bash
   psql $DATABASE_URL -c "SELECT * FROM organizations LIMIT 1;"
   ```

4. Run migration again with verbose logging:
   ```bash
   DEBUG=* tsx server/migrations/migrateToOrganizations.ts
   ```

### Issue: Rate Limiting Too Aggressive

**Symptoms:**
- Legitimate users getting rate limited
- "Too many requests" errors

**Solutions:**
1. Adjust rate limits in `server/middleware/security.ts`:
   ```typescript
   export const apiLimiter = rateLimit({
     windowMs: 15 * 60 * 1000,
     max: 200, // Increase from 100
     ...
   });
   ```

2. Restart application to apply changes

### Issue: Audit Logs Table Growing Too Large

**Symptoms:**
- Database performance degradation
- Slow queries

**Solutions:**
1. Add retention policy (manual cleanup):
   ```sql
   DELETE FROM audit_logs
   WHERE created_at < NOW() - INTERVAL '90 days';
   ```

2. Set up automated cleanup cron job:
   ```bash
   # Add to crontab
   0 0 * * 0 psql $DATABASE_URL -c "DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';"
   ```

### Issue: Organization Members Not Created

**Symptoms:**
- Users can't access organization features
- Missing memberships

**Solutions:**
1. Check organization_members table:
   ```sql
   SELECT * FROM organization_members WHERE user_id = 'USER_ID';
   ```

2. Manually create membership:
   ```sql
   INSERT INTO organization_members (id, organization_id, user_id, role, permissions, joined_at)
   VALUES (
     'uuid-here',
     'org-id',
     'user-id',
     'owner',
     '["*"]'::jsonb,
     NOW()
   );
   ```

### Issue: Permission Denied Errors

**Symptoms:**
- 403 Forbidden responses
- Users can't access their own resources

**Solutions:**
1. Check user's organization membership:
   ```sql
   SELECT om.*, o.name
   FROM organization_members om
   JOIN organizations o ON om.organization_id = o.id
   WHERE om.user_id = 'USER_ID';
   ```

2. Verify permissions array:
   ```sql
   SELECT permissions FROM organization_members WHERE user_id = 'USER_ID';
   ```

3. Update permissions if needed:
   ```sql
   UPDATE organization_members
   SET permissions = '["*"]'::jsonb
   WHERE user_id = 'USER_ID' AND role = 'owner';
   ```

---

## Support

If you encounter issues not covered in this guide:

1. Check application logs for detailed error messages
2. Review database logs for query errors
3. Consult the comprehensive upgrade plan: `COMPREHENSIVE_UPGRADE_PLAN.md`
4. Review service implementations in `server/services/`

---

## Next Steps

After successful Phase 1 deployment:

1. **Monitor Performance:** Watch database query performance and API response times
2. **Review Audit Logs:** Ensure all important actions are being logged
3. **Gather User Feedback:** Identify any issues with the new authentication flow
4. **Plan Phase 2:** Begin preparations for Dashboard System Overhaul

---

**Deployment Prepared By:** Builder Agent (Phase 1 Implementation Team)
**Last Updated:** January 6, 2026
**Document Version:** 1.0
