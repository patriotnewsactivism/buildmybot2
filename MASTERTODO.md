# BuildMyBot2 — Master Launch TODO

Compiled from a skeptical 4-part code audit (security, billing, engineering health, core product) plus live verification of the AI Team automation. Ranked by real business risk, not by how much work each item is. **Do the items in order — later tiers assume earlier tiers are done.**

Last updated: 2026-07-10

---

## TIER 0 — Security (mostly done, verify the rest)

- [x] Fixed: every signup got `role: 'OWNER'`, and 6 admin-gated endpoints treated OWNER as a platform admin → any customer could see every other tenant's data. Closed by removing owner/OWNER from those admin gates.
- [x] Fixed: IDOR on bots-by-id and leads-by-id (any logged-in user could read/edit/delete any tenant's record by guessing a UUID).
- [x] Fixed: `handleSearch` leaked cross-tenant bot/lead names to any logged-in user — now scoped.
- [x] Fixed: `handleAudit` — now scoped to tenant for non-admins (audit_logs has a real organization_id column).
- [x] Fixed: `handleBotErrors` — restricted to platform admins (error_logs has no defined schema, couldn't safely scope by tenant).
- [ ] **Verify no RLS bypass gap remains**: the Supabase service-role key bypasses ALL row-level security. Every tenant boundary in this app lives 100% in `api/gateway.ts` application code — there is no DB-level safety net. Any future handler MUST use `ownerFilter(user)` from day one. Consider adding an automated lint rule or code-review checklist item for this.
- [ ] 48 npm vulnerabilities exist (3 critical, 22 high, 22 moderate) — run `npm audit fix` and manually review anything it can't auto-fix.
- [ ] No production error monitoring (Sentry is wired into the dead `server/` path only). Wire Sentry into the actual `api/*.ts` Vercel functions — right now production errors are invisible until a customer complains.
- [ ] Hardcoded fallback Supabase project URL in `api/gateway.ts` and `api/auth/*.ts` — low risk alone, but couples code to one project ref. Move to env-only.

---

## TIER 1 — Core product doesn't work yet (highest priority, blocks real usage)

- [ ] **`handleChat` in `api/gateway.ts` is a hardcoded stub** — it inserts a row and returns the literal string `"Chat endpoint active"`. No bot anywhere in production (dashboard preview, embed widget, live customer chat) can currently hold a real AI conversation. This is the single biggest blocker to launch — the entire premise of the product doesn't function yet in the live path.
- [ ] There's also a route-matching bug in the chat path: the frontend calls `/api/chat/bot/{id}` but `handleChat` reads `pathParts[0]` (`"bot"`) as if it were the bot ID.
- [ ] **No RAG ingestion/retrieval wired in production.** The pgvector schema exists (`knowledge_chunks` with embeddings + ivfflat index) but nothing in the live `api/gateway.ts` path ever chunks, embeds, or does a similarity search. `scrape` inserts empty content and never fetches the URL; `upload` stores raw unchunked text. There's no Postgres RPC function for vector search either — needs to be built from scratch on the Vercel/Supabase path (the working version only exists in the dead `server/` Express code).
- [ ] **Voice agent has no production deployment path.** The only real STT/TTS/telephony pipeline (`voice-agent/server.js`) is a long-running Node/WebSocket process that cannot run on Vercel serverless. The in-app "voice simulator" hardcodes `ws://localhost:3000` and never captures a real microphone — it's one-way TTS playback, not a real call. `handlePhone`'s number "purchase" just inserts a fake `+10000000000` row — no real Twilio call happens. Decide: either stand up `voice-agent/` on a real always-on host (Railway/Fly/Render) and wire the frontend to it, or replace it with a managed voice API (Vapi/Retell) called directly from Vercel functions.

---

## TIER 2 — Monetization (payment capture works, everything downstream doesn't)

- [ ] Stripe webhook + Checkout + Billing Portal are genuinely wired and would take real money — this part is solid. But `invoice.payment_failed` isn't handled (no dunning/past-due flow).
- [ ] **No usage/quota enforcement anywhere.** `PLAN_LIMITS` exists only to populate *display* numbers on the client-overview page — nothing actually checks a user's plan or usage before letting them use the product. A cancelled/FREE user behaves identically to an ENTERPRISE user.
- [ ] **No free trial system exists.** Zero code for trial start, trial expiry tracking, or forced upgrade on expiry, despite trial messaging in marketing copy and AI email prompts.
- [ ] **Agency dashboard is fake.** All 4 widgets either read the wrong response shape (falling back to hardcoded zeros/defaults) or hit a `/agency/profit-report` route that doesn't exist (404 → defaults).
- [ ] **Partner dashboard is fake.** There is no `case 'partners'` in the gateway router at all — every `/partners/*` call 404s, every widget silently falls back to hardcoded defaults (Starter tier, 20% commission, empty payouts).
- [ ] **Reseller dashboard is fake.** `/resellers/{code}/summary` and `/users/referrals/{code}` don't exist server-side; the one real fallback stat calculator (`computeFallbackStats`) is unreachable dead code because the subscribe callback that would trigger it never fires.
- [ ] Decide scope for launch: either build real Agency/Partner/Reseller billing logic, or hide those dashboards entirely until they're real — showing fabricated commission/revenue numbers to users is worse than not showing the feature.

---

## TIER 3 — Testing, monitoring, and technical debt

- [ ] **Zero test coverage of the actual production API.** All 196 passing tests exercise the dead `server/` Express backend, not the 3,372-line `api/gateway.ts` that runs in production. Install `@vitest/coverage-v8` (currently missing — the widely-cited "80% coverage" figure was never actually measured) and write real tests for gateway.ts's core paths: auth, bot CRUD, chat, lead capture, Stripe webhook handling.
- [ ] CI is green but lint is non-gating (`continue-on-error: true`, 346 pre-existing errors flow into main unchecked). Decide whether to gate lint before launch or explicitly accept the debt.
- [ ] **Delete ~35,500 lines of dead code**: the entire `server/` Express backend (can't even start — crashes on missing `DATABASE_URL`/schema exports), `voice-agent/` (unless resurrected per Tier 1), `Dockerfile`, `railway.json`, `.replit`, `functions/` (Cloudflare Pages proxy to a dead Railway URL), old `drizzle/` migrations (production uses `supabase/migrations/` instead), `launch-ready.patch`, `backup.sql`, `BuildMyBot_jad/`. This is pure upside — zero functionality lost, removes the dual-auth/dual-DB confusion that's actively misleading anyone (including AI coding assistants) who reads the repo.
- [ ] **Delete the 56 contradictory root-level status `.md`/`.txt` files** (PHASE1-10_COMPLETE.md, EXECUTIVE_SUMMARY.md, TEST_COVERAGE_80_PERCENT.md, etc.) — they claim four different completion percentages for the same work on the same dates, and actively lie about test coverage and architecture. Keep only README.md (accurate), SECURITY.md, DEPLOYMENT.md, and this file.
- [ ] Two mismatched hardcoded `MASTER_ADMINS` lists (`App.tsx` vs `api/auth/signup.ts`, different email sets) — single-source this, ideally into a Supabase-backed admin flag rather than a hardcoded array in source.

---

## TIER 4 — AI Team automation (working scaffold, a few real gaps left)

- [x] All 13 roles + Frankie Mercer (Social) migrated off Base44 to native GitHub Actions + Vercel — no more integration-credit ceiling.
- [x] `ai_team_log` persistence confirmed live; Marcus's executive rollup reads real shift data.
- [x] Lead-researcher pipeline confirmed working end-to-end (manually verified: found 7 real candidates on a live test call).
- [ ] Eli (Engineering) shift is an honest placeholder — no real system-health data source wired in yet.
- [ ] Brianna (Billing) needs `BUILDMYBOT_STRIPE_SECRET_KEY` set in Vercel to pull real subscription data instead of placeholder text.
- [ ] Frankie (Social) drafts content but has no live Twitter/LinkedIn API credentials — nothing publishes yet.
- [ ] Sales agent researchers are pre-launch (research-only mode). Flip `SALES_AGENTS_MODE=outreach` once the lead database is deep enough to start real outreach — no redeploy needed, it's an env var toggle.
- [ ] No voice/conference-call briefing loop yet (text-based manager briefing exists; voice doesn't).

---

## Standing constraints (do not violate these while working through the above)

- Do not modify `shared/schema.ts` without explicit coordination (dead Railway backend, but shared file — merge-conflict risk).
- Maintain the inbound-email loop guard in `api/gateway.ts` at all times.
- AI email replies: keep the 2–15 min randomized send delay, and always include a direct app link when free trials come up.
- All Vercel prod deploys use `VERCEL_TOKEN_3`; all GitHub pushes to `patriotnewsactivism/buildmybot2` use `$GITHUB_TOKEN_3`.
- Builds use `npm ci --omit=dev`.
