# BuildMyBot — Production Deployment & Operations

_Last updated: 2026-09-10._

This file is the deployment authority for `patriotnewsactivism/buildmybot2`.

## Supported production topology

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

Railway is the primary application/API origin. Cloud Run is a warm read fallback. Cloudflare may fail over idempotent GET/HEAD traffic but must never automatically replay POST/PUT/PATCH/DELETE requests to another backend because doing so could duplicate writes, provisioning, payments, calls, or messages.

Vercel is not a production runtime for this repository.

## Deployment identities

### Railway primary

```text
Project:     e1170aa8-02f5-4fe3-8fce-e066133938c1
Environment: 6ce38db0-789b-4fe9-ad02-f068fe6866ae
Service:     60b6d260-f5d8-463d-87be-58339545eaaf
Domain:      buildmybot2-web-production.up.railway.app
```

Railway injects `RAILWAY_GIT_COMMIT_SHA`, which is used by health/provenance responses.

### Cloud Run fallback

```text
Google project: buildmybot-507112
Region:         us-central1
Service:        buildmybot2
Service URL:    https://buildmybot2-fq5disxp2a-uc.a.run.app
```

Cloud Run receives an immutable release SHA through its deployment workflow.

## Runtime

```text
Entrypoint: server.ts
Container:  Dockerfile
Port:       8080
Frontend:   Vite output in dist/
Backend:    api/* mounted through Express handlers
Voice:      Deepgram Voice Agent + Telnyx Call Control (Gemini Live fallback)
```

Core release gates:

```bash
npm ci
npm run lint
npm run test:run
npm run build
```

## Public release verification

A merge is not a completed release until the intended SHA is visible through the serving stack.

Check:

```bash
curl -fsS https://buildmybot2-web-production.up.railway.app/api/health
curl -i https://www.buildmybot.app/api/health
```

Expected public result:

- HTTP 200;
- JSON status reports healthy;
- reported build SHA equals the intended GitHub `main` SHA;
- `x-buildmybot-origin: railway` for the healthy primary path.

`x-buildmybot-origin: cloud-run-fallback` means the public read path is alive but Railway primary is degraded/unavailable.

## 2026-09-10 distinct voice-team release

PR #110 introduced the production four-agent voice-team architecture and was merged as:

`2c13fce5334027f79e78ae7b5178a720403c8654`

Railway automatically deployed that merge as deployment:

`cd866ecf-e184-40a6-843d-f7397b3069e1`

The deployment completed successfully and the BuildMyBot server started on port 8080.

Receptionist, Sales, Support, and Manager are separate realtime voice agents. Every AI-to-AI handoff must change the destination voice ID, persona/system prompt, speaking style, and first-message behavior while preserving only a bounded caller/call context envelope.

See:

- `docs/VOICE_TEAM_ARCHITECTURE_2026-09-10.md`
- `docs/AI_VOICE_TEAM.md`
- `docs/CORPORATE_PHONE.md`

A successful application deployment does **not** establish that every required production database migration or PSTN acceptance test has completed.

## Production Supabase migration hold

Active project:

```text
blyebndyrojmreensbxe
https://blyebndyrojmreensbxe.supabase.co
```

Do not blindly run `supabase db push`.

The production database has an unresolved migration-history baseline. Repository migration files cannot safely be assumed to be unapplied merely because they exist in Git.

Follow `docs/MIGRATION_BASELINE_RECONCILIATION.md` before any production schema write. Do not reset, recreate, or replay the production database to repair migration history.

For the voice-team release specifically, verify the exact state of the additive voice-team migration against the live schema before claiming persisted team configuration is fully live.

## Voice production acceptance

A health check or successful build is not sufficient for realtime voice acceptance.

Before declaring the distinct voice team end-to-end complete, perform a real inbound call and verify:

1. Receptionist answers with its configured voice/persona;
2. Receptionist -> Sales produces a clearly different voice and role behavior;
3. Receptionist/other -> Support produces another distinct voice/persona;
4. escalation -> Manager produces a fourth distinct identity;
5. caller context survives handoffs without forcing repetition;
6. stale/source agent audio does not continue after handoff;
7. barge-in/interruption remains functional;
8. call telemetry records source/destination agent and voice identities;
9. tenant knowledge remains correctly scoped;
10. failure paths do not silently collapse roles back into one voice.

## Core runtime configuration

Never commit secret values.

Important server variables include:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_JWT_SECRET`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`
- `OPENROUTER_API_KEY_2`, `OPENROUTER_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `FIRECRAWL_API_KEY`
- `FIRECRAWL_WEBHOOK_SECRET`
- `TELNYX_API_KEY`
- `TELNYX_MESSAGING_PROFILE_ID`
- `TELNYX_PUBLIC_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `CRON_SECRET`
- `SMS_WORKER_SECRET`
- `SMS_LAUNCH_ENABLED`

The complete annotated inventory belongs in `.env.example`.

Cloudflare origin configuration includes:

```text
BUILDMYBOT_PRIMARY_API_ORIGIN
BUILDMYBOT_FALLBACK_API_ORIGIN
BUILDMYBOT_API_ORIGIN
```

## Firecrawl

For crawl requests, `webhook.events` uses short event names such as `page`, `completed`, and `failed`. Firecrawl webhook payload `type` values are qualified (for example `crawl.page`). Do not confuse request filters with payload types.

Customer-supplied crawl URLs remain subject to SSRF validation.

## SMS/telephony safety

Provider operations are external state changes. Never blindly retry an ambiguous call, SMS, provisioning, payment, port, or number-purchase result. Reconcile provider state first.

Carrier compliance, consent, STOP/START handling, launch gates, and tenant isolation remain mandatory.

## Safe deployment order

For application-only releases:

1. run clean CI/tests/build;
2. merge to `main`;
3. confirm exact Git SHA;
4. verify Railway deployed that SHA;
5. verify Railway health/provenance;
6. update/verify Cloud Run fallback where applicable;
7. verify Cloudflare/public domain when frontend/proxy code changed;
8. run feature-specific smoke tests against the public domain.

For releases requiring schema changes, stop until migration reconciliation is complete and the specific migration has been reviewed as safe.

## Rollback

Application rollback should move the affected host to a known-good commit/image.

Do not:

- reset/recreate production Supabase;
- automatically release customer numbers;
- delete carrier/port state without reconciliation;
- replay failed mutating requests against multiple backends;
- assume application rollback reverses external provider state.

Disable the affected feature if necessary, inspect real provider/database state, and reconcile explicitly.
