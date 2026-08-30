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

### Live state as measured on 2026-08-30

| Check | Result |
|---|---|
| `https://buildmybot2-fq5disxp2a-uc.a.run.app/api/health` | **200** `{"status":"ok","service":"buildmybot-api"}` |
| `https://buildmybot2-fq5disxp2a-uc.a.run.app/api/auth/user` | **401** `{"error":"Not authenticated"}` (correct unauthenticated behaviour) |
| `https://www.buildmybot.app/` | **200**, but serving an **older bundle** than `main` builds |
| `https://www.buildmybot.app/api/health` | **404** `{"code":404,"message":"Application not found"}` — Railway's edge |

The Cloud Run backend is healthy and current: a local `npm run build` on `main`
emits the same asset hash Cloud Run serves, while Cloudflare serves a different,
older one. So the split is **not** a backend problem — the public domain is
pinned to a stale Pages deployment whose `/api/*` route still points at the
retired Railway app.

Three consequences, all fixed or documented below:

1. Every AI-employee shift called `https://www.buildmybot.app/api/cron/...` and
   got Railway's 404. The scheduled workflows now call Cloud Run directly (see
   `BUILDMYBOT_API_ORIGIN` below).
2. Even against the healthy backend, `/api/cron/*` returned **HTTP 500**:
   `server.ts` forwarded the `:job` route param with `req.query = {...}`, which
   throws on Express 5 because `req.query` is getter-only. Fixed, with a
   regression test in `test/cron-route-query.test.ts`.
3. The Pages release is no longer left to Cloudflare's git integration —
   `.github/workflows/deploy-cloudflare-pages.yml` deploys it explicitly and
   then asserts that `/api/health` on the public domain is answered by Cloud
   Run rather than Railway.

The AI-team Supabase schema was verified ready on the same date: all six objects
`getAiTeamSchemaReadiness()` probes (`ai_agent_memories.organization_id`,
`agent_messages.context`, `escalations.context`, `audit_logs.user_email`,
`llm_usage_daily.call_count`, and the `match_agent_memories` RPC) exist, so
shifts will not be turned away with `schema_not_ready`.

## 1a. Pointing a frontend host at Cloud Run

Cloud Run is the only backend. Every frontend host must reach it by
**proxy (HTTP 200 rewrite), never redirect.** The session cookie is issued
host-only:

```
bmb_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/
```

With no `Domain` attribute it binds to whatever host the browser sees. A
301/302 to the Cloud Run hostname would land the browser on `*.run.app`, and
the cookie set there would never be sent back to `buildmybot.app` — login
would appear to succeed and then every authenticated call would 401.

| Host | Mechanism | State |
|---|---|---|
| Cloudflare Pages | `functions/api/[[path]].ts` | Correct in the repo; **not yet live** — production still serves a stale deployment whose `/api/*` reaches Railway |
| Netlify (`buildmybotapp`) | `netlify.toml` `[[redirects]]` | Proxy + SPA fallback added |

Cloudflare Pages ignores `netlify.toml`, and Netlify ignores the Pages
Function, so the two configurations coexist without interfering.

Netlify previously had **neither** rule, so the site could render the
marketing home page and nothing else — `/pricing` and `/api/health` both
returned Netlify's 404. It is now a complete origin, which also makes it a
usable fallback if the Cloudflare route cannot be repaired quickly.

Note that `_redirects` deliberately carries no `/api/*` rule: Cloudflare Pages
does not support proxying to an external origin from that file, and a rule it
degraded into a redirect would break auth exactly as described above.

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

### Scheduled workflow origin

The AI-team workflows (`ai-team-schedule`, `pulse`, `lead-followups`,
`email-dispatch-scheduled`) resolve their target from the
`BUILDMYBOT_API_ORIGIN` **repository variable**, defaulting to the Cloud Run
service URL. These are server-to-server calls with no reason to traverse the
CDN, so Cloud Run is the correct default. Point the variable at
`https://www.buildmybot.app` only after the public `/api/*` route is confirmed
off Railway.

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
- [x] Fix the Express 5 `req.query` crash that made every `/api/cron/*` call return 500.
- [x] Point the scheduled AI-team workflows at an origin that actually answers (Cloud Run).
- [x] Add an explicit, verified Cloudflare Pages release workflow instead of relying on the git integration.
- [ ] **Needs Cloudflare dashboard access:** set `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_PAGES_PROJECT`, then run *Deploy BuildMyBot Frontend to Cloudflare Pages*. Its final step fails loudly if `/api/*` is still Railway's.
- [ ] **Needs Cloudflare dashboard access:** if that verification still reports Railway, a route *ahead of* Pages is intercepting `/api/*` — check DNS records for `buildmybot.app`/`www` and any Worker route on `*/api/*`. (Checked 2026-08-30: the account's only two Workers, `tubescribe-yt-proxy` and `civil-rights-tool`, are unrelated, so DNS is the likelier culprit.)
- [ ] Verify `https://www.buildmybot.app/api/auth/user` returns 401 (not Railway's 404).
- [ ] Add/confirm optional production secrets such as OpenRouter, Base44, Stripe webhook, voice-provider credentials, and observability credentials as each feature requires them.
