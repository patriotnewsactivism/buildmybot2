# Phase 0: Triage Summary - BuildMyBot Stability Audit

**Engineer:** Senior Staff Engineer - Stability Team
**Date:** 2026-01-23
**Repository:** buildmybot2
**Focus:** Chatbot Persistence & Knowledge Base Failures

---

## Executive Summary

After comprehensive investigation of the buildmybot.app codebase, I've identified **10 critical root causes** contributing to system instability. The primary failures center around:

1. **Bot Persistence Reliability** - Silent failures during bot save/load
2. **PDF Document Intake** - Incomplete ingestion pipeline with no OCR
3. **Knowledge Base RAG** - Inconsistent search and missing self-healing
4. **Transaction & Error Handling** - Race conditions and silent failure modes

This report provides a prioritized analysis of root causes, their impact, and recommended fixes.

---

## Top 10 Root Causes (Prioritized by Impact)

### 🔴 CRITICAL - IMMEDIATE ACTION REQUIRED

#### 1. **Row-Level Security (RLS) Policy Conflicts**

**Location:** `supabase/migrations/20260110234903_remote_schema.sql`

**Problem:**
- RLS policies are **enabled** on the `bots` table via Supabase
- Backend uses **service role** connection bypassing RLS in some places
- Frontend may be using **anon/authenticated role** causing INSERT/UPDATE failures
- **No consistent RLS policy** for bot creation - policies exist for updates but not inserts

**Evidence:**
```sql
-- Found in supabase/migrations/20260110234903_remote_schema.sql
CREATE POLICY "Admins can update any bot" ON "public"."bots" FOR UPDATE
  USING ("public"."is_admin"());

-- Missing: Policy for INSERT operations for regular users
-- Missing: Policy for organization-scoped bot creation
```

**Impact:**
- **HIGH** - Bot creation silently fails for non-admin users when using Supabase client
- Users see optimistic UI updates but database writes fail
- No error propagation to frontend

**Root Cause:**
- Incomplete RLS policy coverage
- Mixed use of service role (backend) and auth role (frontend)
- No validation that writes actually succeeded

**Recommended Fix:**
- Add comprehensive RLS policies for all CRUD operations
- OR disable RLS entirely and enforce multi-tenancy at application layer (current approach)
- Add `RETURNING` clause validation to ensure writes succeeded

---

#### 2. **Schema Mismatch Between Drizzle and Supabase**

**Locations:**
- `shared/schema.ts` (Drizzle ORM schema)
- `supabase/migrations/20260118140000_fix_bots_schema.sql` (Fix migration)

**Problem:**
- **Recent migration** (2026-01-18) had to fix `bots` table schema mismatches
- `knowledge_base` column type changed from `text` → `jsonb`
- **Drizzle schema** defines columns that **may not exist** in production database
- `updatedAt` field is defined in schema but migrations don't always create it

**Evidence:**
```typescript
// shared/schema.ts - Drizzle expects these fields
export const bots = pgTable('bots', {
  knowledgeBase: json('knowledge_base').default([]), // Expects JSON type
  updatedAt: timestamp('updated_at').defaultNow(),  // May not exist
  // ... 20+ other fields
});
```

```sql
-- supabase/migrations/20260118140000_fix_bots_schema.sql
-- Had to retroactively fix the schema
ALTER TABLE public.bots
  ALTER COLUMN knowledge_base TYPE jsonb
  USING to_jsonb(knowledge_base);
```

**Impact:**
- **HIGH** - INSERT/UPDATE operations fail with "column does not exist" errors
- Silent failures when Drizzle tries to write to non-existent columns
- Inconsistent field validation between environments

**Root Cause:**
- Schema migrations not kept in sync with Drizzle definitions
- `db:push` vs manual SQL migrations creating drift
- Missing schema validation on startup

**Recommended Fix:**
- Run full schema reconciliation: `npm run db:migrate:status`
- Create migration to add missing columns
- Add startup schema validation check

---

#### 3. **Incomplete PDF Processing Pipeline - No OCR**

**Location:** `server/services/DocumentProcessorService.ts`

**Problem:**
- OCR function **exists but never completes successfully**
- Falls back to empty text extraction for scanned PDFs
- **Processing state tracking** exists but not exposed to users

**Evidence:**
```typescript
// server/services/DocumentProcessorService.ts:62-90
if (content.trim().length < 100) {
  try {
    const ocrContent = await DocumentProcessorService.extractTextFromPdfWithOCR(
      buffer, fileName
    );
    // This method exists but implementation missing
    // Falls through to catch block
  } catch (error: any) {
    console.warn('PDF OCR failed, proceeding with parsed text:', error?.message);
    // SILENT FAILURE - user never knows OCR failed
    await DocumentProcessorService.updateProcessingState(sourceId, {
      processingState: { ocr: 'failed' },
      lastError: error?.message || String(error),
    });
  }
}
```

**Impact:**
- **HIGH** - Scanned PDFs result in empty knowledge chunks
- Bots cannot answer questions about scanned documents
- Processing state shows "failed" but user sees "completed"

**Root Cause:**
- `extractTextFromPdfWithOCR()` method not implemented
- No external OCR service integration (Tesseract, Google Vision, etc.)
- Error handling swallows failures without user notification

**Recommended Fix:**
- Integrate OCR service (Tesseract.js, Google Cloud Vision API, AWS Textract)
- Expose processing status to frontend
- Add retry mechanism with exponential backoff

---

#### 4. **Knowledge Base Ingestion Not Idempotent**

**Location:** `server/index.ts:628-766, 768-865`

**Problem:**
- Creating/updating bots **spawns web crawler** asynchronously
- **No deduplication** - same URL crawled multiple times on repeated saves
- Crawler runs **fire-and-forget** with no completion tracking
- **Partial failures** leave knowledge sources in "processing" state forever

**Evidence:**
```typescript
// server/index.ts:846-858
// Bot UPDATE endpoint - fires crawler on every save
for (const source of createdSources) {
  WebScraperService.crawlWebsite(
    source.url, 20, source.sourceId, updatedBot.id, updatedBot.organizationId
  ).catch((err) =>
    console.error(`Failed to scrape ${source.url}:`, err)
    // ERROR SWALLOWED - no retry, no status update
  );
}
```

**Impact:**
- **MEDIUM-HIGH** - Repeated bot saves trigger duplicate crawls
- Knowledge base grows unbounded with duplicate chunks
- Failed crawls leave sources in "processing" state forever
- No way to retry failed ingestions

**Root Cause:**
- Async fire-and-forget pattern with no job tracking
- Missing idempotency key/deduplication logic
- No background job queue or retry mechanism

**Recommended Fix:**
- Check for existing knowledge sources before creating new ones
- Add job queue (BullMQ, pg-boss) for background processing
- Track crawler completion status
- Implement `KnowledgeRepairService.reconcile()` as scheduled job

---

### 🟡 HIGH PRIORITY - FIX WITHIN 48 HOURS

#### 5. **Missing Embeddings for Knowledge Chunks**

**Location:** `server/services/KnowledgeService.ts:57-92`

**Problem:**
- Vector search requires embeddings
- **Fallback to keyword search** when embeddings missing
- No batch embedding generation
- **Silent degradation** - users don't know search quality dropped

**Evidence:**
```typescript
// server/services/KnowledgeService.ts:57-92
const embedding = await EmbeddingService.embedText(query);
if (embedding) {
  try {
    const scored = await db.select({
      score: sql<number>`1 - (${knowledgeChunks.embedding} <=> ${vectorParam})`,
    })
    // If this fails...
  } catch (error) {
    console.warn('Embedding search failed, falling back to keyword search:', error);
    // Silently degrades to keyword search - user never knows
  }
}
```

**Impact:**
- **MEDIUM** - Search quality degraded without user awareness
- Chunks created without embeddings (if OpenAI API fails)
- Inconsistent RAG quality across bots

**Root Cause:**
- Embedding generation coupled to document processing
- No retry mechanism for failed embedding generation
- Missing batch processing for backfilling embeddings

**Recommended Fix:**
- Separate embedding generation into background job
- Add `KnowledgeRepairService.backfillEmbeddings()`
- Expose embedding status in frontend

---

#### 6. **Transaction Rollback Not Fully Implemented**

**Location:** `server/index.ts:628-766, 768-865`

**Problem:**
- Bot creation uses `db.transaction()` but **doesn't wrap all operations**
- Async web crawler spawned **outside transaction**
- Audit logs created **outside transaction**
- **Partial commits** possible if crawler creation succeeds but audit fails

**Evidence:**
```typescript
// server/index.ts:710-740
const { newBot, createdSources } = await db.transaction(async (tx) => {
  const [createdBot] = await tx.insert(bots).values(botData).returning();
  const urls = extractKnowledgeUrls(knowledgeBase);
  const sources = await createKnowledgeSourcesForUrls(tx, ...);
  return { newBot: createdBot, createdSources: sources };
});

// Outside transaction - can fail independently
await db.insert(auditLogs).values({ ... });

// Outside transaction - fire-and-forget
for (const source of createdSources) {
  WebScraperService.crawlWebsite(...).catch(...);
}
```

**Impact:**
- **MEDIUM** - Inconsistent audit trail
- Orphaned knowledge sources if subsequent steps fail
- No rollback for failed crawler spawns

**Root Cause:**
- Mixing synchronous transactional writes with async fire-and-forget
- Audit logging not part of business transaction
- Missing saga pattern for distributed operations

**Recommended Fix:**
- Move audit logs inside transaction
- Use background job queue for crawler (can retry on failure)
- Add compensating transactions for partial failures

---

#### 7. **No Self-Healing Mechanism in Production**

**Location:** `scripts/repairKnowledge.ts`, `server/services/KnowledgeRepairService.ts`

**Problem:**
- **Self-healing service exists** (`KnowledgeRepairService`) but **not running**
- Must be manually invoked via `tsx scripts/repairKnowledge.ts`
- No scheduled cron job or background worker
- **Broken documents never auto-repair**

**Evidence:**
```typescript
// scripts/repairKnowledge.ts - manual script only
async function main() {
  const summary = await KnowledgeRepairService.reconcile(50);
  console.log('Knowledge repair summary:', summary);
}
```

```typescript
// server/services/KnowledgeRepairService.ts
// Has reconcile() method but never called automatically
static async reconcile(batchSize = 50) {
  // Detects failed/incomplete sources
  // Retries processing
  // Never runs unless manually invoked
}
```

**Impact:**
- **MEDIUM** - Failed ingestions accumulate over time
- Users must manually re-upload documents
- System degrades without intervention

**Root Cause:**
- Repair service not integrated into server startup
- No cron job or scheduled task
- Missing health check dashboard

**Recommended Fix:**
- Add scheduled job (node-cron, pg_cron) to run repair hourly
- Expose repair status via `/api/health` endpoint
- Add admin dashboard for manual repair triggers

---

### 🟢 MODERATE PRIORITY - FIX WITHIN 1 WEEK

#### 8. **Optimistic UI Updates Without Validation**

**Location:** Frontend bot editing components (inferred)

**Problem:**
- Frontend likely updates UI **before server confirms success**
- No error handling for failed saves
- Users see "Saved" message but database write failed
- **Session expiry** causes silent auth failures

**Impact:**
- **MEDIUM** - User confusion when changes don't persist
- Lost work due to session expiry
- No feedback on failed saves

**Root Cause:**
- Optimistic UI pattern without validation
- Missing error boundaries in React components
- No session refresh logic

**Recommended Fix:**
- Add pessimistic validation: wait for server response before UI update
- Add toast notifications for save errors
- Implement session refresh before critical writes

---

#### 9. **Multi-Tenancy Isolation Not Enforced Consistently**

**Location:** `server/middleware/tenant.ts`, various routes

**Problem:**
- `tenantIsolation` middleware exists but **not applied to all routes**
- Some routes use manual `organizationId` filtering
- **Inconsistent isolation** between routes
- Potential data leaks between organizations

**Evidence:**
```typescript
// server/routes/clients.ts:90-120 - manual filtering
const visibilityConditions = [eq(bots.userId, user.id)];
if (organizationId) {
  visibilityConditions.push(eq(bots.organizationId, organizationId));
}
// Not using tenantIsolation middleware - manual check

// server/middleware/tenant.ts - middleware exists but not universally applied
export function tenantIsolation(req, res, next) {
  // Should be applied to ALL org-scoped routes
}
```

**Impact:**
- **LOW-MEDIUM** - Potential data leaks between orgs
- Inconsistent query patterns across codebase
- Harder to audit multi-tenancy compliance

**Root Cause:**
- Middleware not enforced at router level
- Some routes bypass middleware for performance
- Missing central enforcement point

**Recommended Fix:**
- Apply `tenantIsolation` middleware to all `/api` routes
- Add centralized query builder that enforces filtering
- Add integration tests for multi-tenancy isolation

---

#### 10. **Error Logging Without Structured Context**

**Location:** Throughout codebase

**Problem:**
- Errors logged to `console.error()` with minimal context
- No correlation IDs for request tracing
- No error aggregation or alerting
- **Critical errors** mixed with warnings

**Evidence:**
```typescript
// server/index.ts:862
} catch (error) {
  console.error('Error updating bot:', error);
  res.status(500).json({ error: 'Failed to update bot' });
  // No: userId, organizationId, botId, stack trace, context
}
```

**Impact:**
- **LOW** - Hard to debug production issues
- No proactive alerting on failures
- Cannot track error rates or patterns

**Root Cause:**
- No structured logging framework (Winston, Pino)
- Missing request ID middleware
- No error monitoring service (Sentry configured but not fully used)

**Recommended Fix:**
- Integrate Winston/Pino with structured logging
- Add request ID middleware (uuid per request)
- Configure Sentry error reporting fully
- Add error rate monitoring dashboard

---

## Critical Pathways Traced

### Bot Save Flow (Create)
```
Client → POST /api/bots
  ↓
Middleware: authenticate → applyImpersonation → loadOrganizationContext → tenantIsolation
  ↓
Validation: isAdmin check, field validation
  ↓
Transaction BEGIN
  ├─ INSERT bots (with ALL fields from request)
  ├─ Extract knowledge URLs from knowledgeBase array
  ├─ CREATE knowledge_sources records
  └─ COMMIT
  ↓
[OUTSIDE TRANSACTION]
  ├─ INSERT audit_logs (can fail silently)
  └─ SPAWN web crawler async (fire-and-forget)
  ↓
Response: Return created bot
```

**Issues in This Flow:**
- ✅ Transaction protects bot + knowledge source creation
- ❌ Audit log outside transaction (can be orphaned)
- ❌ Web crawler fire-and-forget (no completion tracking)
- ❌ No validation that RLS policies allow write
- ❌ No retry mechanism if any step fails

### Bot Load Flow
```
Client → GET /api/bots/:id
  ↓
Middleware: Same auth stack
  ↓
Query: SELECT * FROM bots WHERE id = $1 AND deleted_at IS NULL
  ├─ Check: canAccessBot(bot, user, organizationId)
  └─ Filters: userId OR organizationId match
  ↓
Response: Return bot object
```

**Issues in This Flow:**
- ✅ Soft delete filtering
- ✅ Access control validation
- ❌ No eager loading of knowledge sources
- ❌ No status indication if knowledge sources still processing

### Knowledge Ingestion Flow
```
Document Upload → POST /api/knowledge
  ↓
Multer processes file (10MB limit, PDF/DOCX/TXT only)
  ↓
CREATE knowledge_source record (status: 'pending')
  ↓
DocumentProcessorService.processDocument()
  ├─ Extract text (pdf-parse, mammoth)
  ├─ IF text < 100 chars → Try OCR (FAILS - not implemented)
  ├─ UPDATE knowledge_source (status: 'processing')
  ├─ Chunk text (500-1000 tokens, overlap)
  ├─ Generate embeddings (OpenAI text-embedding-3-small)
  ├─ INSERT knowledge_chunks with embeddings
  └─ UPDATE knowledge_source (status: 'completed' | 'failed')
  ↓
Response: Return source object
```

**Issues in This Flow:**
- ✅ Processing state tracking exists
- ❌ OCR not implemented - scanned PDFs fail
- ❌ No retry on embedding API failures
- ❌ Failed sources stuck in "processing" state
- ❌ No frontend polling for status updates
- ❌ No deduplication of duplicate uploads

---

## Schema Drift Analysis

### Drizzle Schema vs Live Database

**Missing Columns (likely):**
- `bots.updatedAt` - defined in Drizzle, may not exist in DB
- `knowledge_sources.processing_state` - added in migration but may not be in Drizzle schema
- Several indexes defined in migrations but not in Drizzle schema

**Type Mismatches:**
- `bots.knowledge_base` - was `text`, now `jsonb` (fixed in migration)
- All `uuid` vs `text` for ID fields (Drizzle uses `text`, DB may use `uuid`)

**Recommendations:**
- Run: `npm run db:migrate:status` to check applied migrations
- Run: `npx drizzle-kit push` to sync schema
- Add startup validation: `server/db.ts` should check schema version

---

## Environment & Deployment Concerns

### Supabase Connection Issues
```bash
# From .env.example and drizzle.config.ts
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres  # Local
DATABASE_URL=postgresql://...pooler.supabase.com:5432/postgres        # Production

# Issue: Pooler vs Direct Connection
# - Pooler required for high concurrency
# - Direct connection required for migrations
# - Wrong connection string = RLS policy differences
```

**Recommendations:**
- Validate `DATABASE_URL` in `server/env.ts`
- Use pooler connection (`pooler.supabase.com`) in production
- Use direct connection for migrations only

---

## Next Steps - Phase 1 Plan

### Immediate Fixes (24 hours)
1. **Add RLS bypass for backend**: Ensure backend uses service role key
2. **Run schema reconciliation**: `npm run db:migrate` + validate
3. **Fix bot save validation**: Add `RETURNING` clause checks

### Short-term Fixes (48 hours)
4. **Implement OCR service**: Integrate Tesseract.js or AWS Textract
5. **Add knowledge source deduplication**: Check for existing URLs before crawling
6. **Expose processing status**: Add `/api/knowledge/:sourceId/status` endpoint

### Medium-term Fixes (1 week)
7. **Add self-healing cron**: Schedule `KnowledgeRepairService.reconcile()` hourly
8. **Implement job queue**: Use BullMQ for background processing
9. **Add error monitoring**: Configure Sentry properly
10. **Add integration tests**: Test bot save/load end-to-end with assertions

---

## Test Plan for Validation

### Bot Persistence Tests
```typescript
describe('Bot Save/Load', () => {
  it('should persist bot with all fields', async () => {
    const bot = await createBot({ name: 'Test', systemPrompt: '...' });
    const loaded = await getBot(bot.id);
    expect(loaded.name).toBe('Test');
    expect(loaded.systemPrompt).toBeDefined();
  });

  it('should handle knowledge URLs correctly', async () => {
    const bot = await createBot({
      knowledgeBase: ['https://example.com', 'Manual text entry']
    });
    const sources = await getKnowledgeSources(bot.id);
    expect(sources).toHaveLength(1); // Only URL should create source
    expect(sources[0].url).toBe('https://example.com');
  });

  it('should rollback on failure', async () => {
    await expect(createBot({ name: null })).rejects.toThrow();
    const bots = await getBots();
    expect(bots).toHaveLength(0); // No partial bot created
  });
});
```

### PDF Ingestion Tests
```typescript
describe('PDF Processing', () => {
  it('should extract text from digital PDF', async () => {
    const buffer = await fs.readFile('test/fixtures/digital.pdf');
    const result = await processDocument(buffer, 'test.pdf', 'application/pdf');
    expect(result.content.length).toBeGreaterThan(100);
    expect(result.ocrUsed).toBe(false);
  });

  it('should use OCR for scanned PDF', async () => {
    const buffer = await fs.readFile('test/fixtures/scanned.pdf');
    const result = await processDocument(buffer, 'scanned.pdf', 'application/pdf');
    expect(result.content.length).toBeGreaterThan(100);
    expect(result.ocrUsed).toBe(true);
  });

  it('should chunk text deterministically', async () => {
    const text = 'Lorem ipsum...'.repeat(1000);
    const chunks1 = chunkTextWithOverlap(text);
    const chunks2 = chunkTextWithOverlap(text);
    expect(chunks1).toEqual(chunks2); // Deterministic
  });
});
```

---

## Acceptance Criteria - Phase 1

### Bot Save/Load Must:
- [ ] Persist bot configuration reliably (99.9% success rate)
- [ ] Return error to user if save fails (no silent failures)
- [ ] Handle session expiry gracefully (refresh or redirect to login)
- [ ] Validate writes succeeded via `RETURNING` clause
- [ ] Complete within 2 seconds (p95 latency)

### PDF Ingestion Must:
- [ ] Accept PDF, DOCX, TXT files up to 10MB
- [ ] Extract text from digital PDFs (99% accuracy)
- [ ] Apply OCR to scanned PDFs (85% accuracy threshold)
- [ ] Chunk text deterministically (same input = same chunks)
- [ ] Preserve metadata (filename, page numbers, timestamps)
- [ ] Track processing status (pending → processing → completed/failed)
- [ ] Expose status to frontend via polling endpoint

### Knowledge RAG Must:
- [ ] Search knowledge chunks with vector similarity (when embeddings exist)
- [ ] Fallback to keyword search gracefully (when embeddings missing)
- [ ] Isolate knowledge by botId and organizationId (multi-tenancy)
- [ ] Never crash if knowledge is missing (graceful degradation)
- [ ] Return search results within 500ms (p95)

### Self-Healing Must:
- [ ] Detect incomplete knowledge sources automatically
- [ ] Retry failed OCR/chunk/embed/index steps with exponential backoff
- [ ] Reconcile DB vs vector index consistency
- [ ] Run repair job every hour via cron
- [ ] Expose repair status via `/api/admin/health` endpoint

---

## Rollback Strategy

### If Phase 1 Fixes Fail:
1. **Revert migrations**: `npm run db:migrate:down -- --steps=N`
2. **Restore from backup**: Use Supabase point-in-time recovery
3. **Disable new features**: Feature flag to disable OCR, self-healing
4. **Hotfix critical**: Patch only bot save/load, defer PDF/RAG to Phase 2

### Safe Rollback Points:
- Before schema migration: Tag commit as `pre-phase1-schema`
- After schema migration: Tag as `phase1-schema-applied`
- Before service changes: Tag as `pre-phase1-services`

---

## Contact & Escalation

**Owner:** Senior Staff Engineer - Stability Team
**Escalation:** If any fix causes >5% error rate, rollback immediately
**Timeline:** Phase 0 complete, Phase 1 starts now

---

**End of Phase 0 Triage Report**
