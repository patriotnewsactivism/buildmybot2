# BASE44.md — BuildMyBot repository operating guidance

This file contains repo-specific safety and operations guidance for Base44 or any other automation acting on `patriotnewsactivism/buildmybot2`. Product and deployment facts live in `README.md` and `DEPLOYMENT.md`.

## Non-negotiable rules

1. Use only the currently authorized GitHub connection/credential path. Never copy credentials from another app or resurrect an old token because a workflow is failing.
2. Do not alter production database migrations casually. The active production Supabase project is `blyebndyrojmreensbxe`, and production migration writes are held until `docs/MIGRATION_BASELINE_RECONCILIATION.md` is completed.
3. Never run a blind production `supabase db push`, reset, or schema recreation to repair missing migration history.
4. Preserve tenant isolation, RLS, provider signature validation, encryption boundaries, and server-only credentials. Never expose a service-role key with a `VITE_` prefix.
5. Keep Stripe/Telnyx/Twilio/Firecrawl webhook verification intact. Do not weaken signature checks or raw-body handling merely to make tests pass.
6. Mutating public requests must not be automatically replayed from Railway to Cloud Run. Only idempotent `GET`/`HEAD` traffic may use automatic origin fallback.
7. CI and deployment claims must be evidence-based. A local build, a Git commit, or a provider dashboard status alone does not prove the public release is complete.
8. Before saying a release is live, verify the exact GitHub SHA through the public `https://www.buildmybot.app/api/health` path and confirm `x-buildmybot-origin: railway`.
9. If production access or provider credentials block a step, report the exact blocker and continue every safe independent step rather than inventing success.

## Current architecture reality

As of September 5, 2026:

- Cloudflare Pages is the public edge for `buildmybot.app` and `www.buildmybot.app`.
- Railway service `buildmybot2-web` is the approved primary application/API origin.
- Google Cloud Run service `buildmybot2` is the approved read fallback.
- The runtime is a real Node/Express container (`server.ts` + `Dockerfile`), not Vercel-only serverless code.
- Supabase production project ref is `blyebndyrojmreensbxe`.
- Gemini Live is the intended realtime voice engine.
- The current realtime bidirectional voice bridge is still Twilio-based; Telnyx voice migration is not complete merely because Telnyx SMS/provisioning code exists.
- SMS marketing, Text-to-Win, birthday automation, and appointment-reminder backend code exists, but customer-facing launch remains gated by database-baseline reconciliation and real provider verification.

There is no special operating dependency on Viktor. Do not add workflow rules, deployment constraints, or review policy that assume Viktor is participating in this repository.

## Firecrawl

Do not confuse Firecrawl request event filters with webhook payload types:

- request filters: `page`, `completed`, `failed`;
- webhook payload types: `crawl.page`, `crawl.completed`, `crawl.failed`.

Keep SSRF validation around customer-supplied URLs.

## Where to look

| Question | Source |
|---|---|
| What is BuildMyBot and what is the current stack? | `README.md` |
| What is the production topology and release procedure? | `DEPLOYMENT.md` |
| Why are production database migrations held? | `docs/MIGRATION_BASELINE_RECONCILIATION.md` |
| What environment variables exist? | `.env.example` |
| What are the repo coding rules? | `AGENTS.md` / `CLAUDE.md` where still applicable |
| What remains before launch? | `MASTERTODO.md` plus current GitHub issues/CI, not stale prose alone |

When documentation conflicts with observed production behavior, update the documentation after verifying the actual environment rather than forcing production to match stale documentation.
