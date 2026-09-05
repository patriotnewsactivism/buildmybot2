# BuildMyBot — Production Deployment & Operations

_Last updated: 2026-09-05._

This file is the deployment authority for `patriotnewsactivism/buildmybot2`.

## 1. Supported production topology

Target and approved topology:

```text
buildmybot.app / www.buildmybot.app
        |
        v
Cloudflare Pages + Pages Functions
        |
        +--> Railway buildmybot2-web                  PRIMARY
        |    https://buildmybot2-web-production.up.railway.app
        |
        +--> Google Cloud Run buildmybot2             GET/HEAD FALLBACK
             https://buildmybot2-fq5disxp2a-uc.a.run.app
        |
        v
Supabase blyebndyrojmreensbxe
```

Railway is an approved production host and is the primary application/API origin. The previous blanket rule forbidding Railway is obsolete and must not be restored. Cloud Run remains an approved warm fallback.

Cloudflare keeps the public hostname stable and proxies application traffic through `functions/[[path]].ts` and API traffic through `functions/api/[[path]].ts`. The proxy may fail over idempotent `GET`/`HEAD` requests from Railway to Cloud Run on a network failure or 5xx response. It **must not** automatically replay `POST`, `PUT`, `PATCH`, or `DELETE` to another backend because that could duplicate payments, messages, provisioning, or database writes.

Vercel/Netlify artifacts may remain for compatibility/history but are not the current production authority.

## 2. Deployment identities

### Railway primary

```text
Project:     e1170aa8-02f5-4fe3-8fce-e066133938c1
Environment: 6ce38db0-789b-4fe9-ad02-f068fe6866ae
Service:     60b6d260-f5d8-463d-87be-58339545eaaf
Domain:      buildmybot2-web-production.up.railway.app
```

GitHub's Railway status context is `BuildMyBot2 - buildmybot2-web`. Railway injects `RAILWAY_GIT_COMMIT_SHA`, which `/health` and `/api/health` use for release provenance.

`.github/workflows/deploy-railway.yml` synchronizes approved production configuration from GitHub secrets into this service. Do not copy credentials from another application or account merely to make a deploy pass.

### Cloud Run fallback

```text
Google project: buildmybot-507112
Region:         us-central1
Service:        buildmybot2
Service URL:    https://buildmybot2-fq5disxp2a-uc.a.run.app
Identity:       buildmybotsa@buildmybot-507112.iam.gserviceaccount.com
```

`.github/workflows/deploy-cloud-run.yml` builds an immutable container and deploys it through Google authentication. Cloud Run receives `BUILD_SHA=$GITHUB_SHA`.

## 3. Public release verification

A merge is not a completed production release until the exact SHA is visible through the serving stack.

Required checks:

```bash
# Railway primary
curl -fsS https://buildmybot2-web-production.up.railway.app/api/health

# Public domain through Cloudflare
curl -i https://www.buildmybot.app/api/health
```

Expected public result:

- HTTP 200;
- JSON `status: "ok"`;
- `build.sha` equals the intended GitHub `main` SHA;
- response header `x-buildmybot-origin: railway`.

`x-buildmybot-origin: cloud-run-fallback` means the public read path is alive but Railway primary is unhealthy or unavailable. Treat that as degraded production, not a successful Railway release.

## 4. Production Supabase project — migration hold

Active project:

```text
blyebndyrojmreensbxe
https://blyebndyrojmreensbxe.supabase.co
```

### DO NOT BLINDLY RUN `supabase db push`

The September 5, 2026 production audit found existing BuildMyBot application relations but no usable Supabase CLI migration-history baseline. Repository migration files therefore cannot safely be assumed to be unapplied.

`.github/workflows/supabase-migrations.yml` is intentionally audit-only. It may link the project and inspect migration history; it must not apply migrations until the baseline is reconciled.

Follow `docs/MIGRATION_BASELINE_RECONCILIATION.md` before any production migration write. The process requires inventorying the live schema and repository history object-by-object, repairing migration history only for migrations proven to be represented in production, then inspecting a dry-run before applying reviewed deltas.

Do not solve missing migration history by resetting, recreating, or blindly replaying the production schema.

## 5. Container/runtime

The production application is a real Express/Node server, not Vercel-only serverless code.

```text
Entrypoint: server.ts
Container:  Dockerfile
Port:       8080
Frontend:   Vite output in dist/
Backend:    api/* mounted through Express handlers
WebSocket:  /api/voice/twilio-media
```

The Dockerfile builds the Vite client and copies the server/API/shared runtime into the final Node image.

Core release gates:

```bash
npm ci
npm run lint
npm run test:run
npm run build
```

CI is authoritative after push/PR because it runs in a clean Linux environment.

## 6. Core runtime configuration

Never commit secret values.

Important server variables include:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Production Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase access; never expose with `VITE_` prefix |
| `SESSION_JWT_SECRET` | Session signing |
| `SESSION_SECRET` | Session/runtime secret where still used |
| `ENCRYPTION_KEY` | Encrypts provider/subaccount credentials |
| `OPENROUTER_API_KEY_2`, `OPENROUTER_API_KEY` | AI provider chain |
| `OPENAI_API_KEY` | Embeddings/legacy OpenAI paths |
| `GEMINI_API_KEY` | Gemini Live voice |
| `FIRECRAWL_API_KEY` | Website scraping/crawl |
| `FIRECRAWL_WEBHOOK_SECRET` | Optional Firecrawl webhook verification |
| `TELNYX_API_KEY` | Telnyx provisioning/SMS |
| `TELNYX_MESSAGING_PROFILE_ID` | Telnyx messaging profile |
| `TELNYX_PUBLIC_KEY` | Telnyx webhook signature validation |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing |
| `RESEND_API_KEY` | Outbound email |
| `CRON_SECRET` | Scheduled worker authentication |
| `SMS_WORKER_SECRET` | SMS durable worker authentication |
| `SMS_LAUNCH_ENABLED` | Production SMS launch gate |

The complete annotated set belongs in `.env.example`.

Cloudflare Pages Functions support:

```text
BUILDMYBOT_PRIMARY_API_ORIGIN
BUILDMYBOT_FALLBACK_API_ORIGIN
BUILDMYBOT_API_ORIGIN          # legacy; treated as fallback
```

Defaults are Railway primary and Cloud Run fallback.

## 7. Firecrawl contract

`api/rag.ts` uses Firecrawl for JS-rendered website ingestion.

Important distinction:

- crawl request `webhook.events` filters use short names such as `page`, `completed`, and `failed`;
- webhook payload `type` values are qualified, e.g. `crawl.page`, `crawl.completed`, `crawl.failed`.

Do not change the request event filters to qualified payload-type strings. Handler comparisons must use the qualified payload `type` values.

Customer-supplied crawl URLs remain subject to SSRF validation.

## 8. SMS marketing, Text-to-Win, and reminders

The repository includes the durable SMS release model and runtime for:

- Telnyx-oriented account/provisioning state;
- contacts and consent records;
- campaigns and keyword autoresponders;
- welcome and after-hours automation;
- sequences;
- birthday clubs;
- appointment reminders;
- Text-to-Win contests, entries, draws, and approval records;
- queued delivery jobs and inbound event processing;
- STOP/HELP/START handling and spend controls.

The migration files being present does not prove these tables/functions can be replayed into production. Keep `SMS_LAUNCH_ENABLED` off and customer-facing launch gated until the database baseline and provider E2E checks are complete.

A production acceptance test must prove a real provider send/receive path, consent/opt-out behavior, worker execution, and the relevant UI before the feature is advertised as live.

## 9. Shared knowledge

Chat, voice, and SMS should use the same tenant-owned knowledge by default. `api/knowledge/business.ts` is the conservative SMS adapter: it resolves the configured shared knowledge mapping where available, falls back to a direct bot id for older deployments, retrieves RAG evidence, and refuses to invent an answer when no evidence is available.

Cross-tenant knowledge IDs must be rejected at configuration time. Never loosen tenant ownership checks to make an integration test pass.

## 10. Voice status

Gemini Live is the intended realtime voice engine.

Current reality:

- realtime bidirectional media is still implemented in `api/voice/twilio-live.ts`;
- Telnyx is present in the newer SMS/telephony provisioning stack;
- full Telnyx replacement of the realtime Twilio media bridge is **not yet complete**.

Do not claim Telnyx voice migration complete until a real inbound Telnyx number reaches Gemini Live, uses the correct tenant knowledge, logs the call, and passes handoff/tool tests.

## 11. Safe deployment order

For application-only releases that do not require a database migration:

1. Run clean CI/tests/build.
2. Merge to `main`.
3. Confirm the exact SHA on GitHub.
4. Wait for Railway to deploy that SHA and verify Railway `/api/health`.
5. Keep the Cloud Run fallback updated through its workflow.
6. Deploy/verify Cloudflare Pages when frontend/origin-function files changed.
7. Verify the public domain is serving the exact SHA from Railway.
8. Run feature smoke tests against `https://www.buildmybot.app`, not only local or provider URLs.

For a release requiring schema changes, stop before step 2 unless the migration baseline has been reconciled and the specific migration has been reviewed as safe.

## 12. Rollback

Application rollback should move the affected host back to a known-good commit/image. Database and telephony rollback is deliberately conservative:

- do not reset or recreate production Supabase;
- do not automatically release customer numbers;
- do not delete carrier/port records that may correspond to real external state;
- do not replay failed mutating requests against both Railway and Cloud Run;
- disable the affected feature, inspect provider/database state, and reconcile explicitly.
