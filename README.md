# BuildMyBot.app

BuildMyBot is a white-label AI customer-engagement platform for web chat, voice, CRM, lead automation, SMS marketing, and agency/reseller workflows.

Production site: `https://www.buildmybot.app`

## Current architecture

The repository is no longer Vercel-only and Railway is not prohibited.

```text
buildmybot.app / www.buildmybot.app
        |
        v
Cloudflare Pages + Pages Functions
        |
        +--> Railway: buildmybot2-web (PRIMARY application/API origin)
        |
        +--> Google Cloud Run: buildmybot2 (GET/HEAD fallback)
        |
        v
Supabase project blyebndyrojmreensbxe
```

The production application is a Node/Express container (`server.ts`, `Dockerfile`) that also serves the built Vite SPA. Cloudflare keeps browser traffic on the public BuildMyBot domain while proxying to Railway. Cloud Run remains a warm fallback for idempotent reads; mutating requests are never automatically replayed to a second backend.

The Railway service domain is `https://buildmybot2-web-production.up.railway.app`. The Cloud Run fallback is `https://buildmybot2-fq5disxp2a-uc.a.run.app`.

See `DEPLOYMENT.md` for the authoritative deployment/runbook details.

## Production database safety hold

The active Supabase project is `blyebndyrojmreensbxe`.

The September 5, 2026 production audit found existing BuildMyBot application relations but no usable Supabase CLI migration-history baseline. Therefore **do not run `supabase db push` against production until repository history and the live schema are reconciled**.

The production migration workflow is intentionally audit-only. Follow `docs/MIGRATION_BASELINE_RECONCILIATION.md` before re-enabling migration writes.

## Product areas

### AI chatbot and knowledge

- No-code bot/persona configuration.
- PDF, website, and text knowledge ingestion.
- RAG retrieval using `knowledge_chunks` with embeddings and keyword fallback.
- Firecrawl-backed website scraping/crawling with SSRF protections.
- Shared business knowledge can be reused by chat, SMS, and voice paths.

### AI phone agent

- Customer activation flow for a new number, forwarding an existing number, or porting a number.
- Gemini Live is the realtime voice engine.
- Shared chatbot/voice knowledge by default, with channel-specific knowledge modes supported by the activation model.
- Twilio remains the current realtime bidirectional media-stream implementation in `api/voice/twilio-live.ts`.
- Telnyx is used by the newer telephony/SMS provisioning path. Full replacement of the legacy Twilio realtime voice bridge is still a separate migration and must not be claimed complete until an inbound Telnyx call passes end-to-end.

### SMS marketing and automation

The backend includes Telnyx-oriented SMS accounts, contacts, campaigns, keywords, sequences, welcome/after-hours automation, birthday clubs, appointment reminders, Text-to-Win contest records/draws, consent/STOP handling, spend controls, provisioning, and worker queues.

`/app/sms-marketing` is linked from the client dashboard nav (`navConfig.tsx`) and presented on the public pricing/features pages as of the 2026-09-05 product-surface refresh. Actual message sending still gates on each tenant completing Telnyx 10DLC brand+campaign registration (`api/sms/register.ts`) — that is a carrier compliance requirement, not a BuildMyBot-side hold, so it does not block advertising or linking the feature. This is unrelated to the production database migration-write hold above.

### CRM, leads, billing, and AI workforce

- Lead scoring and CRM workflows.
- Hot-lead notification paths.
- Stripe billing/webhook integration.
- AI employee/research workflows and scheduled jobs.
- Reseller/partner tooling.

## Firecrawl contract note

For Firecrawl crawl requests, `webhook.events` uses the short event filters such as `page`, `completed`, and `failed`. Firecrawl webhook payloads use qualified `type` values such as `crawl.page`, `crawl.completed`, and `crawl.failed`. Do not replace the request filter names with payload type names.

## Local development

Prerequisites: Node.js 22+ and the required environment variables from `.env.example`.

```bash
npm ci
npm run dev
```

Release gates:

```bash
npm run lint
npm run test:run
npm run build
```

Production container:

```bash
docker build -t buildmybot2 .
docker run --rm -p 8080:8080 --env-file .env buildmybot2
```

Health/provenance endpoints:

```text
GET /health
GET /api/health
```

Both report the deployed Git SHA. Railway uses its injected `RAILWAY_GIT_COMMIT_SHA`; Cloud Run receives `BUILD_SHA` from its deployment workflow.

## Environment and secrets

Never commit real credentials. Server secrets belong in Railway/GitHub production secrets and, for the Cloud Run fallback, Google Secret Manager or its existing deployment bindings. `VITE_*` variables are public build-time values and must never contain service-role or private provider credentials.

Core server configuration includes Supabase, session signing, encryption, AI provider credentials, Stripe, Firecrawl, Telnyx, Gemini, email, and scheduled-worker secrets. See `.env.example` for the annotated list.

## Deployment rule

A commit is not considered released merely because it is on `main`. Verify the exact SHA on:

1. GitHub `main`;
2. CI;
3. Railway `/api/health`;
4. the public `https://www.buildmybot.app/api/health` route with `x-buildmybot-origin: railway`;
5. Cloudflare Pages for the frontend/origin function when those files changed.

Cloud Run is the fallback, not a reason to silently report a failed Railway release as successful.
