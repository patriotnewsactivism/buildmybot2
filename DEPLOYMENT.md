# BuildMyBot — Official Deployment & Operations

_Last updated: 2026-08-30. Frontend remains on Cloudflare Pages; backend is live on Google Cloud Run._

> 🚫 **BANNED INFRASTRUCTURE — zero exceptions, no "just this once":**
> - **Vercel** — decommissioned, billing closed
> - **Railway** — dead and no longer an accepted origin
> - **AWS** (Lightsail, EC2, ECR, CodeBuild, RDS) — no longer used
>
> **Only acceptable hosting targets: Google Cloud Run, Cloudflare, and Netlify.**

## 1. The official stack

| Layer | What we officially run | Where |
|---|---|---|
| **Frontend** | Vite + React SPA (this repo, built by `npm run build:client`) | **Cloudflare Pages** — owns **buildmybot.app** and **www.buildmybot.app**. Auto-deploys from `patriotnewsactivism/buildmybot2@main`. |
| **Backend (API)** | Express/Node container wrapping the existing `api/` handlers | **Google Cloud Run**, project `buildmybot-507112`, service `buildmybot2`, region `us-central1`. Production service URL: `https://buildmybot2-fq5disxp2a-uc.a.run.app`. |
| **Frontend → API bridge** | Cloudflare Pages Function at `functions/api/[[path]].ts` proxies same-origin `/api/*` requests to Cloud Run | **Cloudflare Pages**. This keeps browser clients on `buildmybot.app` while the API runs on Cloud Run. |
| **Database** | Supabase Postgres, accessed by the backend over the Supabase REST API with the service-role key | Supabase project `evkjlnbpntimbxklnhoz` |
| **Email (outbound)** | Resend HTTP API, or the SMTP_* block | — |
| **Email (inbound)** | Mail provider forwards to `POST /api/email/inbound` | — |
| **LLM (AI Team)** | OpenRouter DeepSeek V4 stack — same config as Apex | Key: `OPENROUTER_API_KEY_2` (fallback: `OPENROUTER_API_KEY`) |

**Vercel and Railway are no longer used for production.**

### Current deployment verification

The Cloud Run deployment workflow authenticates through GitHub OIDC / Google Workload Identity as `buildmybotsa@buildmybot-507112.iam.gserviceaccount.com`, builds and pushes an immutable container to Artifact Registry, deploys it to Cloud Run, and verifies both `/health` build provenance and an auth API smoke test.

The backend release for commit `66001b7f512f825b12e0b6bcacfe6b390a732270` completed successfully and Cloud Run reported revision `buildmybot2-00003-92b` serving 100% of traffic. The verified production URL is `https://buildmybot2-fq5disxp2a-uc.a.run.app`.

The Cloudflare Pages proxy source is committed on `main`. If `https://www.buildmybot.app/api/*` still returns the historical Railway response, the remaining issue is the live Cloudflare Pages/Worker route or deployment state, not the Cloud Run backend.

## 2. Environment variables

### Cloud Run backend

The deployment workflow loads required runtime secrets from Google Secret Manager and applies available GitHub production secrets without deleting existing Cloud Run values.

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | All DB access from `api/`. Never expose with a `VITE_` prefix. |
| `SESSION_JWT_SECRET` | ✅ | Signs session cookies. |
| `SUPABASE_URL` | ✅ | `https://evkjlnbpntimbxklnhoz.supabase.co` |
| `OPENROUTER_API_KEY_2` | ✅ for primary AI stack | Primary OpenRouter key. Fallback: `OPENROUTER_API_KEY`. |
| `RESEND_API_KEY` | ✅ for email | Outbound mail for the AI employees. |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | ✅ for inbound email | Shared secret for `POST /api/email/inbound`. |
| `CRON_SECRET` | ✅ for scheduled jobs | Authenticates cron invocations and workforce triggers. |
| `PORTFOLIO_INTAKE_SECRET` | ✅ for portfolio leads | Shared secret for `POST /api/leads/capture`. |
| `PORTFOLIO_OWNER_EMAIL` | optional | Defaults to `president@buildmybot.app`. |
| `BASE44_SUPERAGENT_API_KEY` | optional until configured | Server-side Base44 Superagent credential. Never expose to the client. |

The two minimum startup secrets are stored in Google Secret Manager as:

- `buildmybot-supabase-service-role-key`
- `buildmybot-session-jwt-secret`

### Cloudflare Pages frontend

Frontend `VITE_*` values are baked in at build time, so redeploy after changing them.

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Same Supabase URL. |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Public anon key (RLS applies). |
| `VITE_API_URL` | leave empty | Same-origin `/api` remains the browser-facing API path. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | when billing goes live | Stripe publishable key. |
| `BUILDMYBOT_API_ORIGIN` | optional Pages Function override | Cloud Run origin used by `functions/api/[[path]].ts`; defaults to the verified production Cloud Run URL. |

The full annotated list is in `.env.example`.

## 3. LLM Provider Chain (AI Team)

The AI Team uses an OpenRouter DeepSeek V4 stack, matching Apex's configuration:

| Provider | Model | Cost (per M tokens) | Role |
|---|---|---|---|
| `openrouter-flash` | `~deepseek/deepseek-v4-flash-latest` | $0.03 in / $0.10 out | Primary |
| `openrouter-flash-0731` | `deepseek/deepseek-v4-flash-0731` | $0.06 in / $0.12 out | Fallback |
| `openrouter-pro` | `deepseek/deepseek-v4-pro-0813` | $0.66 in / $1.98 out | Heavy reasoning |

All three use `OPENROUTER_API_KEY_2` (falls back to `OPENROUTER_API_KEY`).

Code: `api/ai-team/lib.ts`

## 4. SQL migrations — runbook

Migrations live in `supabase/migrations/` and are ordered by timestamp:

1. `20260110234903_remote_schema.sql` — baseline
2. `20260118140000_fix_bots_schema.sql`
3. `20260118143000_knowledge_sources_processing.sql`
4. `20260118151000_knowledge_chunks_embeddings.sql`
5. `20260707240000_ai_employee_org.sql` — AI employee roster/emails/hierarchy, `agent_messages`, `email_messages`, `escalations` (+ seeds the six employees). Idempotent.

Apply with the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref evkjlnbpntimbxklnhoz
npx supabase db push
```

## 5. AI employee organization

The human at the top: **president@buildmybot.app**.

| AI Employee | Title | Mailbox | Reports to |
|---|---|---|---|
| Alex Morgan | Executive Admin | admin@buildmybot.app | president |
| Sam Rivera | Customer Support Lead | support@buildmybot.app | Alex (admin) |
| Vera Cross | VP of Sales | sales@buildmybot.app | president |
| Devon Reyes | VP of Agent Development | agents@buildmybot.app | president |
| Maya Chen | Marketing Director | marketing@buildmybot.app | president |
| Harper Lane | Head of People (HR) | careers@buildmybot.app | president |

## 6. Migration / cutover status

- [x] Containerize the API/backend for Cloud Run.
- [x] Create Google Workload Identity authentication for GitHub Actions.
- [x] Store the minimum Supabase and session secrets in Google Secret Manager.
- [x] Deploy `buildmybot2` to Cloud Run and verify `/health` plus auth smoke test.
- [x] Add `functions/api/[[path]].ts` Cloudflare Pages proxy to the Cloud Run backend.
- [x] Remove stale Vercel deployment files.
- [ ] Confirm the latest Cloudflare Pages production deployment includes the Pages Function.
- [ ] Remove/replace any remaining Cloudflare Worker/route that still sends `/api/*` to Railway.
- [ ] Verify `https://www.buildmybot.app/api/auth/user` is no longer served by Railway.
- [ ] Add/confirm optional production secrets such as OpenRouter, Base44, Stripe webhook, voice-provider credentials, and observability credentials as each feature requires them.
