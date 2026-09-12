# Repository Agent Guidelines

This file is the operating contract for coding agents working in `patriotnewsactivism/buildmybot2`.

## Production authority

Production is **Railway-first**, fronted by Cloudflare, with Google Cloud Run retained as a GET/HEAD fallback. Vercel is not a production runtime for this repository.

Current primary service:

- Railway project: `BuildMyBot2`
- Railway service: `buildmybot2-web`
- Production branch: `main`
- Public site: `https://www.buildmybot.app`
- Active Supabase project: `blyebndyrojmreensbxe`

Read `DEPLOYMENT.md` before changing deployment behavior.

## Real repository structure

Do not invent or rely on a `server/` directory. The production server is the root `server.ts` plus `Dockerfile`, which mounts handlers under `api/` and serves the built Vite SPA.

Important areas:

- `App.tsx`, `index.tsx`, `index.html` — Vite/React entry surface.
- `components/` — product UI.
- `components/Dashboard/navConfig.tsx` — canonical authenticated navigation.
- `api/gateway.ts` — main API router.
- `api/gateway-legacy.ts` — large legacy gateway implementation still used by the router.
- `api/voice/` — realtime voice, voice-team, and telephony behavior.
- `api/phone/` — phone activation and corporate/tenant phone workflows.
- `api/sms/` — SMS marketing and carrier workflows.
- `api/rag.ts` and related knowledge handlers — RAG/knowledge ingestion.
- `api/ai-team/` — autonomous employee workflows.
- `shared/` — shared types, schemas, and voice-team definitions.
- `supabase/migrations/` — repository migration history.
- `docs/` — implementation/runbook documentation.

## Non-negotiable voice-team architecture

Receptionist, Sales, Support, and Manager are **four distinct realtime voice agents**. Never collapse them into one assistant that changes prompts.

At every AI-to-AI handoff, the destination must receive its own:

1. stable role/agent identity;
2. voice ID;
3. persona/system prompt;
4. speaking style and role policy;
5. opening/transfer acknowledgement behavior.

The caller's bounded context may transfer, including transcript summary, facts already collected, intent, tool results, promises, compliance flags, and transfer reason. The outgoing agent's voice/persona must not leak into the receiving agent.

A refactor that causes Receptionist, Sales, Support, or Manager to sound like the same person is a production regression even if the textual prompt changes correctly.

Authoritative voice documentation: `docs/VOICE_TEAM_ARCHITECTURE_2026-09-10.md` and `docs/AI_VOICE_TEAM.md`.

## Realtime voice and telephony

Deepgram Voice Agent is the realtime conversational voice engine on the Telnyx live phone path. Gemini Live remains an explicit `VOICE_ENGINE=gemini` fallback and is still used by some Twilio/browser preview paths. Telnyx is the telephony/SMS carrier (Call Control + bidirectional PCMU streaming). Some Twilio-compatible realtime voice paths remain during migration.

Do not remove or bypass a legacy telephony bridge until its replacement has passed a real inbound end-to-end test, including role transfer behavior.

Voice changes require tests for at least:

- Receptionist -> Sales;
- Receptionist -> Support;
- escalation -> Manager;
- repeated/multi-hop transfer without context loss;
- distinct audible identity after every transfer;
- preview voice matching production configuration.

## Local development and release gates

Use Node.js 22+.

```bash
npm ci
npm run client
npm run lint
npm run test:run
npm run build
```

Do not rely on stale package scripts that reference a nonexistent `server/index.ts`. When in doubt, inspect `package.json` and the actual filesystem before invoking a script.

Production container validation:

```bash
docker build -t buildmybot2 .
docker run --rm -p 8080:8080 --env-file .env buildmybot2
```

## Database safety

The active production Supabase project is `blyebndyrojmreensbxe`.

There is a production migration-history reconciliation hold. Do **not** run `supabase db push`, destructive migrations, resets, or schema rewrites against production until `docs/MIGRATION_BASELINE_RECONCILIATION.md` has been completed and the hold is explicitly removed.

Never infer that a repository migration is safe merely because it applies cleanly to a fresh/local database.

Tenant-scoped queries must preserve organization isolation. Server-side authorization must be based on live trusted data, not client-supplied role or organization claims.

## Authentication and authorization

Session authentication uses the repository's custom signed session flow. Do not weaken authentication, authorization, tenant isolation, webhook verification, carrier compliance, or secrets handling for convenience.

Any endpoint that mutates customer, billing, telephony, SMS, bot, or agent state must validate the caller and tenant scope server-side.

## Secrets

Never commit real credentials.

- Server/provider secrets belong in Railway/GitHub production secrets and appropriate cloud secret stores.
- `VITE_*` values are public at build time and must never contain service-role keys or private provider credentials.
- Webhook secrets must be verified before processing inbound events.
- Never log bearer tokens, service-role keys, API keys, full payment credentials, or sensitive customer content.

Use `.env.example` as the documented environment-variable inventory.

## Code style

- TypeScript strict mode.
- React/TypeScript for client components.
- Biome for linting/formatting.
- Single quotes, semicolons, 2-space indentation.
- Prefer explicit types at API boundaries.
- Validate untrusted input with Zod or equivalent runtime validation.
- Avoid `any`; use `unknown` plus narrowing when practical.
- Preserve existing path aliases and module boundaries.

## Error handling and reliability

Production errors must fail deterministically and observably. Do not create unbounded retries, provider loops, or fallback cascades that can burn tokens/credits indefinitely.

For external AI/provider calls:

- bound timeouts;
- cap retries;
- use backoff where appropriate;
- distinguish provider, credential, quota, validation, and network failures;
- avoid placing every credential into cooldown because one model/provider timed out;
- log enough structured metadata to diagnose failures without leaking secrets.

## Pricing and limits

`constants.ts` `PLANS` is the canonical source for product plan pricing/limits used by the application. Do not duplicate plan pricing or limits in prompts or components when a shared helper/source already exists.

## Pull requests and commits

Prefer focused commits with imperative subjects. For significant changes, use a feature branch and PR. Include:

- what changed;
- why;
- tests run;
- deployment/configuration impact;
- migrations or environment variables;
- screenshots for material UI changes;
- rollout/rollback notes for risky production changes.

Do not merge a failing build merely to trigger deployment.

## Release verification

A change is not released just because it is merged into `main`.

Verify:

1. exact Git SHA on `main`;
2. CI status;
3. Railway deployment status;
4. Railway `/api/health` SHA;
5. public `https://www.buildmybot.app/api/health` origin/SHA;
6. Cloudflare deployment when frontend/proxy functions changed;
7. feature-specific smoke tests.

For voice work, a health endpoint alone is insufficient. Execute an actual call-path or equivalent realtime integration test.

## Documentation discipline

When architecture changes, update the relevant documentation in the same change. At minimum check:

- `README.md`;
- `AGENTS.md`;
- `CLAUDE.md`;
- `DEPLOYMENT.md`;
- `docs/VOICE_TEAM_ARCHITECTURE_2026-09-10.md` / `docs/AI_VOICE_TEAM.md` for voice changes;
- `docs/CORPORATE_PHONE.md` for phone routing changes;
- `SECURITY.md` for security-boundary changes;
- `.env.example` for configuration changes.

Do not preserve known-false documentation merely for historical continuity. Git history already preserves old text.
