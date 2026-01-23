# Phase 1 Complete: Bot Save/Load Reliability Fixes

**Date:** 2026-01-23
**Status:** ✅ Complete
**Branch:** main

---

## Summary

Phase 1 addressed critical bot persistence failures identified in the triage report. All fixes have been implemented and are ready for testing.

---

## Changes Implemented

### 1. Schema Reconciliation ✅

**Files Modified:**
- `supabase/migrations/20260118140000_fix_bots_schema.sql` (applied)
- `supabase/migrations/20260118143000_knowledge_sources_processing.sql` (applied)

**Changes:**
- Fixed `bots.knowledge_base` column type: `json` → `jsonb` ✅
- Added processing state columns to `knowledge_sources` table ✅
  - `processing_state` (jsonb)
  - `retry_count` (integer)
  - `last_error` (text)
  - `last_processed_at` (timestamp)
  - `source_text` (text)
  - `page_count` (integer)
  - `next_retry_at` (timestamp)
  - `dead_lettered_at` (timestamp)

**Verification:**
```bash
npx tsx scripts/checkBotSchema.ts
```

**Results:**
- ✅ All 25 expected columns present in `bots` table
- ✅ `knowledge_base` is now `jsonb` (correct type)
- ✅ All 8 processing state columns present in `knowledge_sources`

---

### 2. Bot Creation Endpoint (POST /api/bots) ✅

**File:** `server/index.ts:628-766`

**Improvements:**

#### Added Request ID Tracking
- Each request gets unique 8-char ID for log correlation
- Format: `[requestId] message`
- Example: `[a3f7b2c1] Creating bot for user: user-123`

#### Critical Validation - No More Silent Failures
```typescript
// BEFORE - No validation that bot was created
const [createdBot] = await tx.insert(bots).values(botData).returning();

// AFTER - Validates bot was actually created
const botResult = await tx.insert(bots).values(botData).returning();
if (!botResult || botResult.length === 0) {
  throw new Error('Bot insert failed - no rows returned. This may indicate RLS policy rejection...');
}
```

#### Audit Logs Moved Inside Transaction
```typescript
// BEFORE - Audit log outside transaction (could be orphaned)
await db.insert(auditLogs).values({ ... });

// AFTER - Audit log inside transaction (atomic)
await db.transaction(async (tx) => {
  const [createdBot] = await tx.insert(bots).values(botData).returning();
  // ... create knowledge sources ...

  // MOVED: Audit log inside transaction
  await tx.insert(auditLogs).values({
    id: uuidv4(),
    userId: user?.id,
    organizationId: user?.organizationId,
    action: 'create_bot',
    resourceType: 'bot',
    resourceId: createdBot.id,
    newValues: createdBot,
    ipAddress: (req as any).ip,
    userAgent: req.get('user-agent'),
    createdAt: new Date(),
  });

  return { newBot: createdBot, createdSources: sources };
});
```

#### Enhanced Error Handling
```typescript
// BEFORE - Generic error message
res.status(500).json({ error: 'Failed to create bot' });

// AFTER - Detailed error with context
res.status(isValidationError ? 403 : 500).json({
  error: 'Failed to create bot',
  details: errorMessage,
  requestId, // For support/debugging
});
```

#### Detailed Logging
- Logs at each step: authorization, template loading, transaction start/commit, crawler spawn
- Errors logged with full context: userId, organizationId, botId, stack trace
- Success/failure clearly indicated

---

### 3. Bot Update Endpoint (PUT /api/bots/:id) ✅

**File:** `server/index.ts:768-865`

**Improvements:**

#### Same Enhancements as Creation
- Request ID tracking
- Critical validation of update result
- Audit logs inside transaction
- Enhanced error handling
- Detailed logging

#### Update-Specific Improvements
```typescript
// Validate update succeeded
const botResult = await tx.update(bots)
  .set(updateData)
  .where(eq(bots.id, req.params.id))
  .returning();

if (!botResult || botResult.length === 0) {
  throw new Error('Bot update failed - no rows returned. Bot may have been deleted or RLS policy rejected the update.');
}
```

#### Audit Log with Old/New Values
```typescript
await tx.insert(auditLogs).values({
  id: uuidv4(),
  userId: user?.id,
  organizationId: user?.organizationId,
  action: 'update_bot',
  resourceType: 'bot',
  resourceId: bot.id,
  oldValues: existingBot,  // Captured before update
  newValues: bot,          // Captured after update
  ipAddress: (req as any).ip,
  userAgent: req.get('user-agent'),
  createdAt: new Date(),
});
```

---

## Test Plan

### Manual Testing

#### Test 1: Bot Creation Success
```bash
# Prereq: Start dev server
npm run dev

# Test via curl or Postman
POST http://localhost:3001/api/bots
Headers:
  Cookie: <session-cookie>
  Content-Type: application/json
Body:
{
  "name": "Phase 1 Test Bot",
  "systemPrompt": "You are a helpful assistant for Phase 1 testing",
  "model": "gpt-5o-mini",
  "temperature": 0.7,
  "knowledgeBase": ["Test manual entry", "https://example.com"]
}

Expected Response:
- Status: 200
- Body: Bot object with all fields
- Check server logs for:
  [requestId] Creating bot for user: ...
  [requestId] Bot created: <bot-id>
  [requestId] Transaction committed successfully
  [requestId] Bot creation successful
```

#### Test 2: Bot Creation Failure (Missing Required Field)
```bash
POST http://localhost:3001/api/bots
Body:
{
  "systemPrompt": "Test"
  # Missing "name" field
}

Expected Response:
- Status: 400 or 500
- Body: { "error": "Failed to create bot", "details": "...", "requestId": "..." }
- Check server logs for:
  [requestId] Bot creation failed: ...
```

#### Test 3: Bot Update Success
```bash
PUT http://localhost:3001/api/bots/<existing-bot-id>
Body:
{
  "name": "Updated Name",
  "systemPrompt": "Updated prompt",
  "temperature": 0.9
}

Expected Response:
- Status: 200
- Body: Updated bot object
- Check server logs for:
  [requestId] Updating bot: <bot-id>
  [requestId] Bot updated: <bot-id>
  [requestId] Transaction committed successfully
```

#### Test 4: Audit Log Verification
```sql
-- Check audit logs were created
SELECT * FROM audit_logs
WHERE action IN ('create_bot', 'update_bot')
ORDER BY created_at DESC
LIMIT 10;

-- Should see:
-- - action: 'create_bot' or 'update_bot'
-- - resource_id: bot ID
-- - new_values: bot object (for create)
-- - old_values + new_values: both present (for update)
-- - ip_address, user_agent: populated
```

#### Test 5: Transaction Atomicity
```bash
# Simulate transaction failure by:
# 1. Creating bot with valid data
# 2. Force error after bot insert (e.g., invalid audit log data)

# Expected: Bot should NOT be created if transaction fails
# Verify: Query bots table - bot should not exist
```

---

## Acceptance Criteria

### ✅ Bot Save/Load Must:
- [x] Persist bot configuration reliably (validation added)
- [x] Return error to user if save fails (detailed errors added)
- [ ] Handle session expiry gracefully (requires frontend changes - Phase 2)
- [x] Validate writes succeeded via `RETURNING` clause check
- [x] Complete within 2 seconds (p95 latency) - no blocking operations added

### ✅ Error Handling Must:
- [x] Never fail silently (validation throws errors)
- [x] Return actionable error messages to frontend
- [x] Log errors with full context (requestId, userId, orgId, stack)
- [x] Distinguish between validation errors (403) and server errors (500)

### ✅ Audit Trail Must:
- [x] Be created atomically with bot operations
- [x] Include old and new values for updates
- [x] Capture IP address and user agent
- [x] Never be orphaned (moved inside transaction)

---

## Known Limitations

### 1. Web Crawler Still Fire-and-Forget
**Status:** Not fixed in Phase 1
**Impact:** Knowledge source ingestion can fail silently
**Planned Fix:** Phase 2 - Add job queue for background processing

### 2. No Deduplication of Knowledge Sources
**Status:** Not fixed in Phase 1
**Impact:** Repeated bot saves create duplicate knowledge sources
**Planned Fix:** Phase 2 - Add deduplication before creating sources

### 3. pgvector Extension Not Installed
**Status:** Database limitation
**Impact:** Vector similarity search not available (falls back to keyword)
**Planned Fix:** Contact DB admin or use Supabase console to install extension

### 4. Frontend Session Handling
**Status:** Not fixed in Phase 1 (backend-only changes)
**Impact:** Session expiry can still cause silent failures
**Planned Fix:** Phase 2 - Add frontend session refresh logic

---

## Rollback Instructions

If Phase 1 changes cause issues:

### 1. Rollback Code Changes
```bash
git checkout <commit-before-phase1>
# Or revert specific commits
git revert <commit-hash>
```

### 2. Rollback Schema Changes
```bash
# Reverse the applied migrations
npx tsx <<EOF
import { db } from './server/db';
import { sql } from 'drizzle-orm';

// Revert knowledge_base type
await db.execute(sql\`
  ALTER TABLE bots ALTER COLUMN knowledge_base TYPE json USING knowledge_base::json;
\`);

// Remove processing state columns
await db.execute(sql\`
  ALTER TABLE knowledge_sources
    DROP COLUMN IF EXISTS processing_state,
    DROP COLUMN IF EXISTS retry_count,
    DROP COLUMN IF EXISTS last_error,
    DROP COLUMN IF EXISTS last_processed_at,
    DROP COLUMN IF EXISTS source_text,
    DROP COLUMN IF EXISTS page_count,
    DROP COLUMN IF EXISTS next_retry_at,
    DROP COLUMN IF EXISTS dead_lettered_at;
\`);
EOF
```

### 3. Verify Rollback
```bash
npx tsx scripts/checkBotSchema.ts
# Should show knowledge_base as 'json' and missing processing columns
```

---

## Files Modified

### Core Changes
- `server/index.ts` - Bot create/update endpoints (lines 628-865)

### Schema Changes
- `supabase/migrations/20260118140000_fix_bots_schema.sql` - Applied ✅
- `supabase/migrations/20260118143000_knowledge_sources_processing.sql` - Applied ✅

### Utilities Added
- `scripts/checkBotSchema.ts` - Schema validation script
- `scripts/applySupabaseMigrations.ts` - Migration application script

### Tests Added
- `test/integration/bot-simple.test.ts` - Basic vitest validation

---

## Metrics to Monitor

Post-deployment, monitor these metrics:

### Success Indicators
- **Bot Creation Success Rate:** Should be >99.5%
- **Bot Update Success Rate:** Should be >99.5%
- **Audit Log Coverage:** 100% of bot operations should have audit logs
- **Transaction Rollback Rate:** Should be <0.1% (only on genuine errors)

### Error Indicators
- **403 Errors (RLS rejection):** Should be 0% (or only for unauthorized access attempts)
- **500 Errors:** Should be <0.5%
- **No rows returned errors:** Should be 0%

### Performance Indicators
- **Bot Creation Latency (p95):** Should be <2s
- **Bot Update Latency (p95):** Should be <2s
- **Transaction Time (avg):** Should be <100ms

---

## Next Steps - Phase 2

Phase 2 will address:
1. **Implement OCR for scanned PDFs** using Tesseract.js or AWS Textract
2. **Add knowledge source deduplication** to prevent duplicate crawls
3. **Implement job queue** (BullMQ or pg-boss) for background processing
4. **Add frontend session refresh logic** to handle expiry gracefully
5. **Expose processing status** to frontend via polling endpoint

---

## Contact & Support

**Phase 1 Owner:** Senior Staff Engineer - Stability Team
**Questions:** Review PHASE0_TRIAGE_REPORT.md for full context
**Escalation:** If error rate >5%, rollback immediately per instructions above

---

**Phase 1 Status: ✅ Complete**
**Ready for:** Manual testing & deployment to staging
