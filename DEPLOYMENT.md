# BuildMyBot — Official Deployment & Operations

_Last updated: 2026-08-29. Vercel is fully decommissioned. Frontend is on Cloudflare._

## 1. The official stack

| Layer | What we officially run | Where |
|---|---|---|
| **Frontend** | Vite + React SPA (this repo, built by `npm run build:client`) | **Cloudflare Pages** — owns **buildmybot.app** and **www.buildmybot.app**. Auto-deploys from `patriotnewsactivism/buildmybot2@main`. Uses `_headers` and `_redirects` for routing/security. |
| **Backend (API)** | Serverless functions in `api/` — `api/gateway.ts` serves every `/api/*` route, `api/auth/*.ts` serve login/signup/session/logout | ⚠️ **Currently proxied through Cloudflare to Railway** — needs migration to Cloudflare Pages Functions (`functions/` directory) or Google Cloud Run per the no-Railway standing rule. |
| **Database** | Supabase Postgres, accessed by the backend over the Supabase REST API with the service-role key | Supabase project `evkjlnbpntimbxklnhoz` |
| **Email (outbound)** | Resend HTTP API, or the SMTP_* block (already configured on production) | — |
| **Email (inbound)** | Your mail provider forwards to `POST /api/email/inbound` | — |
| **LLM (AI Team)** | OpenRouter DeepSeek V4 stack — same config as Apex | Key: `OPENROUTER_API_KEY_2` (fallback: `OPENROUTER_API_KEY`) |

**Vercel is no longer used.** The `vercel.json` and `.vercelignore` files have been removed. All Vercel projects (`buildmybot20`, `buildmybot2`, etc.) are decommissioned — Vercel billing is closed.

> ⚠️ **API migration needed:** The `_redirects` file references `functions/api/[[path]].ts` for API routing on Cloudflare Pages, but the `functions/` directory doesn't exist yet. API requests currently fall through to the Railway backend behind the Cloudflare proxy. This must be migrated to either:
> - Cloudflare Pages Functions (create `functions/api/` directory), OR
> - Google Cloud Run (containerize the API)
>
> Per the standing rule: **Railway is never an acceptable hosting target.**

## 2. Environment variables

Set these on **Cloudflare Pages** → Project → Settings → Environment Variables
(Production + Preview). Frontend `VITE_*` values are baked in at build time,
so redeploy after changing them.

### Backend (serverless functions)

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | All DB access from `api/`. Never expose with a `VITE_` prefix. |
| `SESSION_JWT_SECRET` | ✅ | Signs session cookies (`openssl rand -hex 32`). Same value for all functions. |
| `SUPABASE_URL` | ✅ | `https://evkjlnbpntimbxklnhoz.supabase.co` |
| `OPENROUTER_API_KEY_2` | ✅ | Primary LLM key for AI Team (OpenRouter DeepSeek V4). Fallback: `OPENROUTER_API_KEY`. |
| `RESEND_API_KEY` | ✅ for email | Outbound mail for the AI employees (or set `SMTP_HOST/PORT/USER/PASS` instead). |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | ✅ for email | Shared secret for `POST /api/email/inbound` (`openssl rand -hex 32`). |
| `CRON_SECRET` | ✅ | Auths cron invocations + APEX `buildmybot_run_workforce`. |
| `DISCORD_WEBHOOK_URL` | recommended | Agent notifications (shift summaries, critical errors, lead follow-ups). |
| `SLACK_WEBHOOK_URL` | recommended | Same notifications, Slack channel. |
| `PORTFOLIO_INTAKE_SECRET` | ✅ for portfolio leads | Shared secret for `POST /api/leads/capture` portfolio intake (donmatthews.live). |
| `PORTFOLIO_OWNER_EMAIL` | optional | `users` row that owns portfolio leads; defaults to `president@buildmybot.app`. |

**Removed (no longer needed):**
- `OPENAI_API_KEY` — replaced by OpenRouter DeepSeek V4
- `AI_TEAM_LLM_PROVIDER` — no longer used (OpenRouter is the only provider)
- `CEREBRAS_API_KEY`, `GROQ_API_KEY`, `COHERE_API_KEY`, `GEMINI_API_KEY` — all removed from the LLM chain
- `GITHUB_TOKEN_4` (for GitHub Models) — provider removed

### Frontend (build-time)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Same Supabase URL. |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Public anon key (RLS applies). |
| `VITE_API_URL` | leave empty | Same-origin `/api` is correct. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | when billing goes live | Stripe publishable key. |

The full annotated list is in `.env.example`.

## 3. LLM Provider Chain (AI Team)

The AI Team uses an OpenRouter DeepSeek V4 stack, matching Apex's configuration:

| Provider | Model | Cost (per M tokens) | Role |
|---|---|---|---|
| `openrouter-flash` | `~deepseek/deepseek-v4-flash-latest` | $0.03 in / $0.10 out | Primary |
| `openrouter-flash-0731` | `deepseek/deepseek-v4-flash-0731` | $0.06 in / $0.12 out | Fallback |
| `openrouter-pro` | `deepseek/deepseek-v4-pro-0813` | $0.66 in / $1.98 out | Heavy reasoning |

All three use `OPENROUTER_API_KEY_2` (falls back to `OPENROUTER_API_KEY`).
Previous providers (Cerebras, Groq, Cohere, Gemini, GitHub Models, OpenAI) have been removed.

Code: `api/ai-team/lib.ts`

## 4. SQL migrations — runbook

Migrations live in `supabase/migrations/` and are ordered by timestamp:

1. `20260110234903_remote_schema.sql` — baseline (already applied to prod)
2. `20260118140000_fix_bots_schema.sql`
3. `20260118143000_knowledge_sources_processing.sql`
4. `20260118151000_knowledge_chunks_embeddings.sql`
5. `20260707240000_ai_employee_org.sql` — AI employee roster/emails/hierarchy, `agent_messages`, `email_messages`, `escalations` (+ seeds the six employees). Idempotent — safe to run repeatedly.

Apply with the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref evkjlnbpntimbxklnhoz
npx supabase db push          # applies anything not yet recorded remotely
```

## 5. AI employee organization

The human at the top: **president@buildmybot.app** (Don Matthews).

| AI Employee | Title | Mailbox | Reports to |
|---|---|---|---|
| Alex Morgan | Executive Admin | admin@buildmybot.app | president |
| Sam Rivera | Customer Support Lead | support@buildmybot.app | Alex (admin) |
| Vera Cross | VP of Sales | sales@buildmybot.app | president |
| Devon Reyes | VP of Agent Development | agents@buildmybot.app | president |
| Maya Chen | Marketing Director | marketing@buildmybot.app | president |
| Harper Lane | Head of People (HR) | careers@buildmybot.app | president |

## 6. Migration TODO

- [ ] Create `functions/api/` directory for Cloudflare Pages Functions (or containerize API for Cloud Run)
- [ ] Set `OPENROUTER_API_KEY_2` on Cloudflare Pages
- [x] Remove stale `vercel.json` and `.vercelignore`
- [ ] Migrate API backend off Railway (currently proxied through Cloudflare)
- [ ] Verify `_redirects` API proxy path works with Cloudflare Pages Functions
- [ ] Update GitHub Actions cron workflows to point at the new API host
