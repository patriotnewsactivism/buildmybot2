# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Critical: Dead code in package.json

`server/` **does not exist and was never committed.** The following scripts all fail: `dev`, `server`, `start`, `check:server`, and every `seed:*` alias. Do not attempt to run them. For local frontend development use `npm run client` (Vite on port 5000).

## Real architecture

| Layer | What runs | Notes |
|---|---|---|
| Frontend | Vite + React 18 SPA | Builds to `dist/`, deployed to Vercel project **buildmybot20** |
| Backend | Vercel serverless functions in `api/` | `api/gateway.ts` handles every `/api/*` route except cron and auth |
| Database | Supabase Postgres | Accessed via Supabase REST API with service-role key — **not** Drizzle ORM in production |
| Email outbound | Resend (`RESEND_API_KEY`) | |
| Email inbound | Webhook to `POST /api/email/inbound` | Verified with `x-webhook-secret` header |

### vercel.json routing
- `/api/*` (except `/api/cron/*`) → rewritten to `/api/gateway`
- `/api/auth/*` and `/api/chat/demo` serve their own files directly
- SPA fallback: everything else → `/index.html`
- `/chat/*` allows iframe embedding; `/embed.js` has `Access-Control-Allow-Origin: *`
- Cron: `api/cron/all-shifts` runs daily at 13:00 UTC. Other workers (`_lead-followups.ts`, `_pulse.ts`, `_sales-outreach.ts`) exist but have **no cron entry** — they must be triggered manually or via `api/cron/[job].ts`

## Commands that work

```bash
npm run client            # Vite dev server, port 5000 (frontend only)
npm run build             # Production frontend build → dist/
npm run lint              # Biome linter (NOT ESLint/Prettier)
npm test                  # Vitest watch
npm run test:run          # Vitest single pass
npm run test:coverage     # Coverage report
npx vitest run path/to/file.test.tsx   # Single test file
```

### Database (local scripts only — these do NOT affect how serverless functions query data)
```bash
npm run db:push           # Drizzle-kit push to Supabase (needs DATABASE_URL in env)
npm run db:migrate        # Run scripts/migrate.ts
npm run db:seed           # Run scripts/seed.ts
npm run db:studio         # Drizzle Studio GUI
```

Supabase migrations live in `supabase/migrations/`. Apply with:
```bash
npx supabase link --project-ref evkjlnbpntimbxklnhoz
npx supabase db push
```

## Authentication

Custom JWT, **not** a standard JWT library. Tokens are minted by `api/auth/login.ts` and `api/auth/signup.ts` as `base64url(payload).base64url(hmac-sha256(payload, SESSION_JWT_SECRET))`, stored in cookie `bmb_session`.

`getAuthUser()` in `api/gateway.ts` verifies the HMAC, then **fetches the live user row from Supabase** — role, organizationId, and plan are never trusted from the token. This means role changes take effect immediately.

Frontend-side `MASTER_ADMINS` array in `App.tsx` forces the `MasterAdmin` role for those emails regardless of the stored role.

Roles: `MasterAdmin` > `Admin` > `Reseller` > `Owner` > `Client`.

## How serverless functions query data

`api/gateway.ts` uses raw `fetch` against the Supabase REST API:
```
${SUPABASE_URL}/rest/v1/<table>?select=...&filter=...
```
with `apikey` and `Authorization: Bearer <service-role-key>` headers. There is no Drizzle or ORM in the serverless path — `shared/schema.ts` is only for local scripts.

Always filter by `organization_id` when querying tenant-scoped tables. The gateway enforces this using the auth user's `organizationId`.

## Database schema files

- `shared/schema.ts` — main tables (Drizzle, used by scripts)
- `shared/schema-ai-employees.ts` — AI employee tables (also Drizzle, scripts only)

Key tables: `users`, `organizations`, `organization_members`, `bots`, `leads`, `conversations`, `knowledge_sources`, `knowledge_chunks`, `bot_templates`, `analytics_events`, `audit_logs`, `ai_employees`, `agent_messages`, `email_messages`, `escalations`.

## AI Team (six AI employees)

Managed by `api/ai-team/lib.ts` and triggered via cron + inbound email.

| Employee | Title | Mailbox |
|---|---|---|
| Alex Morgan | Executive Admin | admin@buildmybot.app |
| Sam Rivera | Customer Support | support@buildmybot.app |
| Vera Cross | VP Sales | sales@buildmybot.app |
| Devon Reyes | VP Agent Development | agents@buildmybot.app |
| Maya Chen | Marketing Director | marketing@buildmybot.app |
| Harper Lane | Head of People | careers@buildmybot.app |

LLM provider waterfall (first with a key configured wins): `AI_TEAM_LLM_PROVIDER` env override → Gemini → Groq → Cerebras → OpenRouter → OpenRouter2 → GitHub Models → OpenAI. Set e.g. `AI_TEAM_LLM_PROVIDER=groq` to pin a provider. OpenRouter's free model catalog churns — if AI team shift logs show errors, re-verify the model IDs against `GET https://openrouter.ai/api/v1/models`.

Partners with 251+ accounts (Platinum) or `$499/mo Partner Access` members bypass the AI hierarchy and go straight to `PRESIDENT_EMAIL`.

## Environment variables

Backend (serverless functions — set in Vercel dashboard, never `VITE_` prefixed):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — required for all DB access
- `SESSION_JWT_SECRET` — signs session cookies (`openssl rand -hex 32`)
- `OPENAI_API_KEY` — chat + AI team fallback
- `RESEND_API_KEY` — outbound email
- `INBOUND_EMAIL_WEBHOOK_SECRET` — authenticates `POST /api/email/inbound`
- `CRON_SECRET` — authenticates Vercel cron calls
- `DISCORD_WEBHOOK_URL`, `SLACK_WEBHOOK_URL` — agent notifications (recommended)
- `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`, `GITHUB_TOKEN_4` — AI team free-tier providers
- `XAI_API_KEY` — xAI/Grok TTS for `api/voice/preview.ts` (preview endpoint) and `api/twilio/webhooks.ts` (Twilio calls via `<Play>`). Falls back to Polly.Joanna when absent.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — billing (not yet live)

Frontend (baked in at build time, must redeploy after changing):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL` — leave empty; `/api` is same-origin on Vercel

Production Vercel project: **buildmybot20** (team `don-matthews-projects`). Only set env vars there — `buildmybot2` under `patriotnewsactivisms-projects` auto-builds PRs but serves no production domain.

## Pricing & plan limits — single source of truth

`constants.ts` `PLANS` is canonical for **both** marketing display and backend enforcement. The gateway imports the derived `PLAN_LIMITS` from it (`api/gateway.ts` has no limits table of its own), and AI agent prompts (gateway AI-team + Twilio calls) quote prices via `formatPricingForPrompt()`. Never hardcode plan prices/limits anywhere else — that's how Executive customers ended up throttled to Free-tier limits before this was consolidated.

## Frontend structure

`App.tsx` uses **real URL routing** via `react-router-dom` (v7) — `index.tsx` wraps `<App/>` in `<BrowserRouter>`. `App.tsx` holds auth/session/impersonation state and renders a `<Routes>` tree: public marketing routes (`/`, `/pricing`, `/chat/:botId`, …) and an authenticated dashboard tree gated on login.

Every authenticated section is a real path under a single shared `components/Dashboard/DashboardLayout.tsx` shell (grouped sidebar + top bar, `NavLink` + `Outlet`). Route prefixes by role:
- `admin` (MasterAdmin/Admin) → `/admin/*` (Overview, Users, Partners, Agents, Clients, Affiliates, Bots, Conversations, AI Team, Support, System, Analytics, Financial)
- `partner`/`reseller` → `/partner/*` (`PartnerDashboardV2`, tab driven by URL)
- `client`/`owner` → `/app/*` (BotBuilder, CRM, Analytics, Phone, Billing, …)
- `agent` → `/agent`, `affiliate` → `/affiliate`

Navigation is defined once in `components/Dashboard/navConfig.tsx` (`NAV`, `getNavRole`, `ROLE_HOME`) — the single source of truth for every role's menu. The old `currentView`-state system, `DashboardShell`, `Layout/Sidebar`, and `dashboardNav.ts` were removed in the routing overhaul.

Path aliases: `@/` → repo root, `@shared/` → `./shared`.

## Code style

Biome (`npm run lint`). Single quotes, semicolons, 2-space indent. TypeScript strict mode — fix all type errors before committing.
