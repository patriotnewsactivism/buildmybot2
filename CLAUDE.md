# CLAUDE.md

Guidance for Claude Code and other autonomous coding agents working in `patriotnewsactivism/buildmybot2`.

## Production architecture

Production is Railway-first, fronted by Cloudflare Pages/Functions, with Google Cloud Run retained as a GET/HEAD fallback. Vercel is not a production runtime for this repository.

- Public app: `https://www.buildmybot.app`
- Railway primary service: `buildmybot2-web`
- Production branch: `main`
- Active Supabase project: `blyebndyrojmreensbxe`
- Root server: `server.ts`
- Container: `Dockerfile`
- Main API router: `api/gateway.ts`

Read `DEPLOYMENT.md` before changing production routing, deployment workflows, or environment configuration.

## Do not invent a server/ tree

A historical `server/` Express tree referenced by older scripts/documentation does not exist. Do not create assumptions around `server/index.ts`. Inspect the real filesystem and `package.json` before using scripts that may still reference stale paths.

The production runtime is the root `server.ts` plus handlers under `api/`.

## Distinct production voice agents

Receptionist, Sales, Support, and Manager are four distinct realtime voice agents. Never simplify them into one agent that merely changes prompts.

Every AI-to-AI handoff must change:

- role/agent identity;
- voice ID;
- persona/system prompt;
- speaking style/role policy;
- first-message/transfer acknowledgement behavior.

Caller context may transfer in a bounded envelope; outgoing persona and voice state may not.

Primary implementation/documentation:

- `shared/voice-team.ts`
- `api/voice/team.ts`
- `api/voice/team-store.ts`
- `api/voice/team-preview.ts`
- `api/voice/telnyx-live.ts`
- `components/PhoneAgent/VoiceTeamEditor.tsx`
- `docs/VOICE_TEAM_ARCHITECTURE_2026-09-10.md`
- `docs/AI_VOICE_TEAM.md`
- `docs/CORPORATE_PHONE.md`

Deepgram Voice Agent is the realtime conversational voice engine on the Telnyx live phone path. Gemini Live remains an explicit `VOICE_ENGINE=gemini` fallback and is still used by some Twilio/browser preview paths. Telnyx is the telephony/SMS carrier. Some legacy Twilio-compatible code may remain during migration; do not delete it until the replacement passes an actual inbound end-to-end test.

## Database safety

The active production Supabase project is `blyebndyrojmreensbxe`.

There is an active production migration-history reconciliation hold. Do not run `supabase db push`, reset production, replay all migrations, or otherwise mutate the production schema simply because repository migrations exist.

Follow `docs/MIGRATION_BASELINE_RECONCILIATION.md` and verify the specific migration against the live schema before any production schema write.

Tenant isolation is mandatory. Do not trust client-supplied organization IDs, roles, or ownership claims where the server can resolve them from authenticated/live data.

## Commands

Typical safe development/release commands:

```bash
npm ci
npm run client
npm run lint
npm run test:run
npm run build
```

Production container validation:

```bash
docker build -t buildmybot2 .
docker run --rm -p 8080:8080 --env-file .env buildmybot2
```

## Authentication

Authentication uses the repository's custom signed session flow. Server-side authorization must resolve current trusted user/tenant state; do not make authorization decisions solely from browser state or unsigned/unverified claims.

Any mutation touching customers, bots, telephony, SMS, billing, campaigns, or AI-agent configuration must validate authentication and tenant scope server-side.

## AI workforce

Autonomous employee workflows live under `api/ai-team/` and related scheduled endpoints/workflows. Keep autonomous actions bounded and observable.

For model/provider calls:

- cap retries;
- bound timeouts;
- avoid uncontrolled fallback cascades;
- distinguish model/provider errors from credential/quota errors;
- do not put all credentials into cooldown because one model timed out;
- avoid frivolous token spend during repeated failures;
- log structured diagnostics without leaking secrets.

## Pricing and limits

`constants.ts` `PLANS` is the canonical source for product plan pricing/limits used by the application. Reuse shared helpers rather than hard-coding plan prices or limits in prompts/components.

## Frontend routing

The app uses `react-router-dom` with authenticated dashboard routes. `components/Dashboard/navConfig.tsx` is the canonical navigation definition. Preserve shared layout/routing rather than reintroducing view-state navigation patterns.

## Secrets

Never commit real credentials. Never place private server secrets in `VITE_*` variables. Treat all `VITE_*` values as public build-time configuration.

Use `.env.example` as the variable inventory and update it whenever a new required variable is introduced.

## Release verification

A merge to `main` is not the same as a completed production release. Verify:

1. exact Git SHA on `main`;
2. CI;
3. Railway deployment status;
4. Railway `/api/health`;
5. public `https://www.buildmybot.app/api/health` and origin header;
6. Cloudflare when frontend/proxy functions changed;
7. feature-specific smoke tests.

For voice changes, perform actual realtime call-path testing. A passing build or preview audio is not sufficient proof of PSTN handoff quality.

## Documentation rule

Architecture-changing work must update the relevant docs in the same change. Check `README.md`, `AGENTS.md`, `CLAUDE.md`, `DEPLOYMENT.md`, and the feature-specific documents under `docs/`.

Do not keep documentation known to be false merely because it was once accurate; Git history is the archive.
