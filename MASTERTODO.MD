# BuildMyBot2 — Master Launch TODO

Compiled from a skeptical 4-part code audit (security, billing, engineering health, core product) plus live verification of the AI Team automation. Ranked by real business risk, not by how much work each item is. **Do the items in order — later tiers assume earlier tiers are done.**

Last updated: 2026-07-10

---

## TIER 0 — Security ✅ COMPLETE

- [x] Fixed: every signup got `role: 'OWNER'`, and 6 admin-gated endpoints treated OWNER as a platform admin → any customer could see every other tenant's data. Closed by removing owner/OWNER from those admin gates.
- [x] Fixed: IDOR on bots-by-id and leads-by-id (any logged-in user could read/edit/delete any tenant's record by guessing a UUID).
- [x] Fixed: `handleSearch` leaked cross-tenant bot/lead names to any logged-in user — now scoped.
- [x] Fixed: `handleAudit` — now scoped to tenant for non-admins (audit_logs has a real organization_id column).
- [x] Fixed: `handleBotErrors` — restricted to platform admins (error_logs has no defined schema, couldn't safely scope by tenant).
- [x] **Verified ownerFilter coverage**: audited all handlers in gateway.ts — every data-access handler uses `ownerFilter(user)` consistently. Added standing rule: all future handlers must include ownerFilter from day one.
- [x] npm vulnerabilities: 48 → 17. Updated nodemailer (v7→v9), railway CLI (v2→v3), and ran `npm audit fix`. Remaining 17 are deep transitive deps in `@vercel/node` (undici, ajv, minimatch, path-to-regexp) and `vite/esbuild` — can't be fixed without breaking changes; will resolve when upstream packages release compatible updates.
- [x] Sentry wired into production `api/gateway.ts` — errors now captured with route context via `Sentry.captureException()`. Set `SENTRY_DSN` env var in Vercel to activate.
- [x] Hardcoded fallback Supabase project URL removed from `api/gateway.ts`, `api/auth/login.ts`, `api/auth/signup.ts`, `api/auth/user.ts`, and `api/stripe-webhook.ts`. All now use env-only (`SUPABASE_URL` / `VITE_SUPABASE_URL`).

---

## TIER 1 — Core product ✅ COMPLETE

- [x] **`handleChat` is a real LLM-backed handler** — uses multi-provider fallback chain (gemini → groq → cerebras → openrouter → openai). Route-matching bug fixed: correctly parses `/api/chat/bot/{id}`. Public route bypass added so anonymous widget visitors don't get 401. Rate-limited (30 msg/min per IP+bot).
- [x] **RAG pipeline built and wired in production.** New `api/rag.ts` module provides: text chunking (500-token overlapping chunks), OpenAI embeddings (text-embedding-3-small, 1536 dims matching DB schema), vector similarity search via Supabase RPC `match_knowledge_chunks()`, keyword fallback when embeddings unavailable. `handleKnowledge` scrape endpoint now actually fetches URLs. Upload endpoint chunks + embeds content. `handleChat` uses RAG retrieval (vector search first, keyword fallback, inline KB last resort).
- [x] **Voice agent deployed on Railway.** Fixed `server.js` (was referencing `server` before creation), added health check endpoint, CORS, billing callback to BuildMyBot API. Added `Dockerfile` and `railway.json`. Deployed to Railway with all env vars set (OPENAI, DEEPGRAM, CARTESIA, TWILIO, etc). URL: `buildmybot2-backend-production.up.railway.app`. Frontend VoiceCallSimulator wired to Railway WebSocket URL.

---

## TIER 2 — Monetization ✅ COMPLETE

- [x] `invoice.payment_failed` handler added to `api/stripe-webhook.ts` — tracks attempt count, marks user as past_due, auto-downgrades to FREE after 3 failed attempts. Logs failures to audit_logs for admin visibility.
- [x] **Usage/quota enforcement implemented.** `checkQuota()` function enforces plan limits on bot creation (FREE=1, STARTER=3, PROFESSIONAL=10, ENTERPRISE=unlimited). Returns structured error with upgrade prompt when limit hit. PLAN_LIMITS_CONFIG centralized with per-plan caps for bots, conversations/month, knowledge sources, and leads.
- [x] **No free trial (Don's decision).** Generous free tier instead: 1 bot, 250 conversations/month, 3 knowledge sources, 50 leads. Trial code left inert (trial_days: 0) in case policy changes.
- [x] **Agency dashboard returns real data.** Added `profit-report` endpoint with real bot/lead/conversation counts, wallet balance, top bots by conversations, and 6-month monthly breakdown. Added `overview` endpoint.
- [x] **Partner dashboard built with real data.** `case 'partners'` added to router. Endpoints: profile (auto-creates on first visit), clients list, earnings/payouts history, referral code lookup. Backed by new `partners`, `partner_clients`, `partner_payouts` tables.
- [x] **Reseller dashboard built with real data.** `case 'resellers'` added to router. Endpoints: profile, client list, summary with real totals. Backed by new `resellers`, `reseller_clients` tables.
- [x] Partner/reseller commission tracking wired into Stripe webhook — auto-credits partner/reseller when a referred customer's subscription activates.

---

## TIER 3 — Testing, monitoring, and technical debt ✅ COMPLETE

- [x] **Real test coverage for gateway.ts.** 19 new tests covering: routing (public vs authenticated, CORS preflight, 404), authentication (Bearer token, cookie, expired/tampered tokens, suspended users), bot CRUD with tenant isolation, lead capture (public), health check, cron auth (CRON_SECRET), chat (public), admin guard, quota enforcement. Full suite: 10 files, 173 tests, all passing.
- [x] **Lint cleaned up.** Biome auto-fixed 75 files. Deleted orphaned `tsconfig.server.json` (referenced deleted server/). Reduced from 156 errors to 0 errors. Remaining warnings are `noExplicitAny` (TypeScript style) and accessibility — non-blocking, explicitly accepted as tech debt.
- [x] **Deleted ~30,000+ lines of dead code**: removed `server/` Express backend, `functions/` (Cloudflare proxy), `BuildMyBot_jad/`, old `drizzle/` migrations, root-level `Dockerfile`, `railway.json`, `.replit`, `launch-ready.patch`, `backup.sql`, `.dockerignore`, `nginx.conf`. Voice-agent kept (needed for Railway deployment).
- [x] **Deleted 50+ contradictory root-level status docs** (PHASE1-10_COMPLETE.md, EXECUTIVE_SUMMARY.md, TEST_COVERAGE_80_PERCENT.md, etc.). Kept only: README.md, SECURITY.md, DEPLOYMENT.md, MASTERTODO.md, CLAUDE.md, AGENTS.md.
- [x] **MASTER_ADMINS unified** across `App.tsx` and `api/auth/signup.ts` — both now include the same 3 emails: mreardon@wtpnews.org, jadj19@gmail.com, patriotnewsactivism@gmail.com.
- [x] **Deleted orphaned test files** referencing deleted `server/` code (6 files: originValidation, voiceAgentService, webScraperService, documentProcessorService, openaiService, services-integration, templates).

---

## TIER 4 — AI Team automation ✅ COMPLETE

- [x] All 13 roles + Frankie Mercer (Social) migrated off Base44 to native GitHub Actions + Vercel — no more integration-credit ceiling.
- [x] `ai_team_log` persistence confirmed live; Marcus's executive rollup reads real shift data.
- [x] Lead-researcher pipeline confirmed working end-to-end (manually verified: found 7 real candidates on a live test call).
- [x] **Eli (Engineering) shift wired to real system-health data.** `getEngineeringHealth()` pulls: live Vercel deployment statuses (last 5 deploys via Vercel API), recent error/warning audit logs, and function error logs. Luke Bradley's prompt updated to report on actual data instead of placeholders.
- [x] Brianna (Billing) uses `STRIPE_SECRET_KEY` which is already set in Vercel production. No additional key needed.
- [x] **Frankie (Social) fully built.** `runSocialMediaShift()` drafts real content based on team activity, handles Twitter/X OAuth 1.0a posting, LinkedIn UGC posting, mention replies. Gracefully handles missing credentials — saves as `draft_awaiting_credentials`. **Blocked on Twitter/LinkedIn API credentials from Don.**
- [x] Sales agent researchers are pre-launch (research-only mode). Flip `SALES_AGENTS_MODE=outreach` once the lead database is deep enough to start real outreach — no redeploy needed, it's an env var toggle.
- [x] **Voice/conference-call briefing loop built.** `GET /api/ai-employees/briefing/audio` converts Marcus's latest executive summary to MP3 via OpenAI TTS (voice: onyx). `GET /api/ai-employees/briefing` returns recent briefings as JSON. Admin-only endpoints.

---

## Standing constraints (do not violate these while working through the above)

- Maintain the inbound-email loop guard in `api/gateway.ts` at all times.
- AI email replies: keep the 2–15 min randomized send delay, and always include a direct app link when free trials come up.
- All Vercel prod deploys use `VERCEL_TOKEN_3`; all GitHub pushes to `patriotnewsactivism/buildmybot2` use `$GITHUB_TOKEN_3`.
- Builds use `npm ci --omit=dev`.

---

## Supabase migrations applied ✅

1. `20260710200000_rag_vector_search.sql` — `match_knowledge_chunks` RPC function ✅
2. `20260710200100_trial_and_billing_fields.sql` — Trial fields, partners/resellers/audit_logs tables ✅ (fixed user_id type: text not uuid)

## Env vars set in Vercel ✅

| Variable | Purpose | Status |
|----------|---------|--------|
| `OPENAI_API_KEY` | RAG embeddings + chat fallback | ✅ Set |
| `STRIPE_SECRET_KEY` | Billing / Brianna AI employee | ✅ Set |
| `VOICE_AGENT_URL` | Railway voice agent WebSocket URL | ✅ Set |
| `VERCEL_PROJECT_ID` | Eli engineering health checks | ✅ Set |
| `SENTRY_DSN` | Production error monitoring | ⏳ Waiting on Don |

## Credentials still needed from Don

| Credential | Purpose |
|-----------|---------|
| `SENTRY_DSN` | Production error monitoring in gateway.ts |
| Twitter API keys (4 keys) | Frankie Social publishing to X/Twitter |
| LinkedIn access token + org URN | Frankie Social publishing to LinkedIn |
