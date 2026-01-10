# Phase 1 Deployment Guide - Windows PowerShell

**For Windows users deploying Phase 1 on their local machine or Replit**

---

## ✅ Prerequisites Completed

- [x] Code pushed to GitHub
- [x] All Phase 1 files created
- [x] Migration scripts ready

---

## 🚀 Easy Deployment Steps

### Step 1: Install Dependencies

```powershell
npm install
```

### Step 2: Run Schema Migration

This creates all the new database tables (organizations, audit_logs, etc.):

```powershell
npm run migrate:schema
```

**Expected output:**
```
🚀 Starting Phase 1 Database Migrations...
✓ Database URL found
✓ Migration SQL loaded
📝 Found X SQL statements to execute
⚙️  Executing migrations...
  ✓ Created table: organizations
  ✓ Created table: organization_members
  ✓ Created table: roles
  ... (and more)
✅ Schema migration completed successfully!
```

### Step 3: Run Data Migration

This migrates your existing users to the organization model:

```powershell
npm run migrate:data
```

**Expected output:**
```
🔄 Starting Data Migration to Organizations Model...
🚀 Starting data migration to organization model...
📊 Step 1: Finding users without organizations...
Found X users to migrate
🏢 Step 2: Creating organizations for each user...
✅ Created organization "Company Name" for user email@example.com
... (continues for all users)
✅ Data migration completed successfully!
```

### Step 4: Verify Migrations

Check that everything worked:

```powershell
npm run db:studio
```

This opens Drizzle Studio where you can view your database:
- Look for new tables: `organizations`, `organization_members`, `audit_logs`, etc.
- Verify existing users now have `organization_id` values
- Check that bots, leads, and conversations have `organization_id` values

### Step 5: Integrate Routes into server/index.ts

**MANUAL STEP REQUIRED**

Open `server/index.ts` and add these lines:

**At the top (around line 17):**
```typescript
// Phase 1: Multi-tenant architecture imports
import { securityHeaders, apiLimiter } from './middleware';
import { organizationsRouter, auditRouter, analyticsRouter } from './routes';
```

**After `app.use(express.json());` (around line 140):**
```typescript
// Phase 1: Apply security headers
app.use(securityHeaders);

// Phase 1: Apply rate limiting to API routes
app.use('/api', apiLimiter);
```

**Before static file serving (around line 750):**
```typescript
// ========================================
// PHASE 1: MULTI-TENANT ARCHITECTURE ROUTES
// ========================================

// Organization management
app.use('/api/organizations', organizationsRouter);

// Audit logging
app.use('/api/audit', auditRouter);

// Analytics and insights
app.use('/api/analytics', analyticsRouter);
```

See `server/INTEGRATION_INSTRUCTIONS.md` for detailed integration guide.

### Step 6: Restart the Application

```powershell
# Stop the current server (Ctrl+C if running)

# Start the server
npm run dev
```

### Step 7: Verify Deployment

Test the new endpoints:

```powershell
# In a new PowerShell window:

# Test health endpoint
curl http://localhost:5000/api/health

# Test that security headers are present
curl -I http://localhost:5000/api/health

# You should see headers like:
# X-Frame-Options: SAMEORIGIN
# X-Content-Type-Options: nosniff
```

---

## 🎉 You're Done!

Phase 1 is now deployed! Your application now has:

✅ Multi-tenant organizations
✅ Role-based access control
✅ Comprehensive audit logging
✅ Security hardening (rate limiting, headers)
✅ Analytics infrastructure
✅ Service layer architecture

---

## 📚 Quick Reference

### Migration Commands

```powershell
# Run both migrations at once
npm run migrate:all

# Or run them separately:
npm run migrate:schema  # Schema migration only
npm run migrate:data    # Data migration only
```

### Database Commands

```powershell
npm run db:studio    # Open Drizzle Studio (database viewer)
npm run db:push      # Push schema changes (use with caution)
```

### Application Commands

```powershell
npm run dev      # Development mode (client + server)
npm run build    # Build for production
npm run start    # Start production server
```

---

## ⚠️ Troubleshooting

### "DATABASE_URL is not set"

Make sure you have a `.env` file with:
```
DATABASE_URL=your-postgres-connection-string
```

Or set it in PowerShell:
```powershell
$env:DATABASE_URL="your-postgres-connection-string"
```

### "Cannot find module"

Run:
```powershell
npm install
```

### "Migration already applied"

This is normal if you run migrations twice. The script will skip already-created tables.

### "Port already in use"

Stop any running instances of the app:
```powershell
# Find process using port 5000
netstat -ano | findstr :5000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

---

## 📖 Next Steps

1. **Test the new features** - Try creating organizations, viewing audit logs
2. **Monitor production** - Watch for any errors in the console
3. **Review documentation:**
   - `PHASE1_README.md` - Overview of Phase 1
   - `PHASE1_CHANGES_SUMMARY.md` - Detailed changes
   - `PHASE1_DEPLOYMENT_GUIDE.md` - Full deployment guide (Linux/Mac)

4. **Prepare for Phase 2** - Dashboard system overhaul coming next!

---

## 🆘 Need Help?

- **Deployment issues:** Check `PHASE1_DEPLOYMENT_GUIDE.md` troubleshooting section
- **Code integration:** See `server/INTEGRATION_INSTRUCTIONS.md`
- **Understanding changes:** Read `PHASE1_CHANGES_SUMMARY.md`

---

**Deployment Guide Version:** 1.0
**Platform:** Windows PowerShell
**Date:** January 6, 2026
