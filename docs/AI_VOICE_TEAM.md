# AI Voice Team

BuildMyBot's production phone architecture uses Telnyx Call Control with Gemini Live. Receptionist, Sales, Support and Manager are independently configured agents. Every successful AI handoff opens a fresh Gemini session with the destination's voice, identity, role instructions and opening behavior while the phone connection and bounded caller context continue.

Optional experimental path: set `VOICE_ENGINE=deepgram` and `DEEPGRAM_API_KEY` to route Telnyx media to Deepgram Voice Agent (`api/voice/deepgram-agent.ts`) with raw PCMU/8 kHz. That path is single-agent only and does not replace the four-agent Gemini voice-team handoffs.

## Default staff

| Role | Name | Gemini voice | Intended delivery |
| --- | --- | --- | --- |
| Receptionist | Ava Brooks | Aoede | Warm, relaxed, moderate pace |
| Sales | Marcus Hale | Puck | Upbeat, confident, energetic |
| Customer Support | Sophie Reyes | Kore | Calm, clear, slightly slower |
| Manager / Escalations | Daniel Okonkwo | Charon | Measured, composed, deliberate |

These are configurable defaults. Audition the team on the actual phone path to assess perceptual separation; different IDs alone do not prove that every listener will distinguish the voices.

**No AI disclosure:** Default personas, openings, and `VOICE_TEAM_ROUTING` instruct every role to present as named staff. Agents must never say they are an AI, bot, or virtual assistant.

## Current code and the original fault

- `api/voice/telnyx-live.ts`: phone media, Gemini sessions, department handoffs, caller context and call logging.
- `shared/voice-team.ts`: four independent agent definitions, supported voices, strict validation and routing policy.
- `api/voice/team.ts`: authenticated settings and preview API.
- `api/voice/team-store.ts`: tenant-scoped persistence.
- `api/voice/team-preview.ts`: short previews using the same Gemini Live model and voice configuration as calls.
- `components/PhoneAgent/VoiceTeamEditor.tsx`: reusable team editor.
- `components/PhoneAgent/PhoneAgent.tsx` and `components/Team/CorporatePhonePanel.tsx`: customer and corporate entry points.

Previously, `route_department` returned instructions to the existing model connection. Its initial setup selected one voice by default, so the caller could hear the same person changing roles. The current implementation treats routing as a connection lifecycle and identity change.

## Non-negotiable identity boundary

Receptionist, Sales, Support, and Manager are four distinct production agents, not one assistant with dynamic role prompts.

Every AI-to-AI handoff must change the destination agent's:

- stable role/agent identity;
- voice ID;
- persona/system prompt;
- speaking style and role policy;
- first-message/transfer acknowledgement behavior.

Caller context may transfer. Outgoing persona/voice state may not.

## Handoff lifecycle

1. Validate the destination, require a factual summary, reject self-transfers, and enforce a bounded number of transfer attempts per call. Receptionist transfers are gated until name, contact, and interest/reason are present.
2. Keep the source available while starting the destination (so the verbal hold acknowledgement can finish) and buffer recent caller audio during setup.
3. When destination setup completes, clear queued source playback, retire the old session, play a short hold-music interval, then enable the destination greeting. Late source events cannot speak, execute tools, or finalize the new session.
4. Give the destination the caller number, known name/company/reason, handoff summary and a bounded recent transcript. After hold music ends, it introduces its own name and role, acknowledges the issue and avoids repeat questions.
5. If destination setup fails or times out, return a failed tool result to the source and preserve a deterministic fallback path.
6. On hangup or duration limit, close all agent sessions and timers. Preserve the original call duration limit across every handoff.

The call snapshot contains four agent definitions. Stable identity is `botId:department`; a successful transfer changes that identity and creates a new model session. Business instructions, knowledge access and confirmed tool results may be shared. Previous persona and voice settings are never used as the destination configuration.

`admin` may be accepted as a compatibility alias for `manager`. Explicit human requests remain human-transfer or follow-up requests; the AI manager has no extra billing, account or contractual permissions merely because it is the manager persona. Corporate outbound approval is unchanged. Approved outbound calls may begin with Sales and their approved objective.

## Persistence

The voice-team migration adds the backend-only `voice_teams` table while retaining the existing phone-number/bot binding model.

| Column | Purpose |
| --- | --- |
| bot_id | Primary key and foreign key to bots; one team per bot |
| user_id / organization_id | Owner and tenant copied from the verified bot |
| config | JSON object containing all four independently configured agents |
| revision | Positive integer used for optimistic concurrency |
| updated_by | Authenticated editor |
| created_at / updated_at | Audit timestamps |

Each agent contains `department`, `name`, `voice.provider`, `voice.voiceId`, `persona`, `speakingStyle` and `firstMessage`. The complete team is saved in one database write, allowing two departments to swap voices without a transient duplicate configuration.

Zod validates the API and runtime configuration. Database constraints/RLS must preserve all four roles, unique names/voices where required, supported voice IDs, nonempty agent fields, and tenant isolation. Client-supplied owner/tenant fields must never override verified ownership.

No saved team means the four default agents, revision 0. The first save creates revision 1. Updates must match the current revision; stale updates receive HTTP 409. A missing migration or database outage must produce an explicit error rather than pretending settings were saved.

New calls load a configuration snapshot. Editing the team does not change a call already in progress.

## Admin and customer flow

1. Open Phone settings; choose a business bot to configure its AI Voice Team above call settings. The corporate owner also has the editor inside the corporate phone panel.
2. Edit each name, select a voice, adjust speaking style/opening and optionally expand role instructions.
3. Preview each opening. Previews use Gemini Live and must not silently substitute another provider.
4. Save the whole team. Duplicate or invalid identity settings must be rejected clearly. A successful response confirms persistence for new calls, not that an already-active call changed midstream.

The separate legacy voice/greeting controls are fallback settings and must not be confused with the four-agent team identity contract.

## API

| Method / path | Behavior |
| --- | --- |
| GET /api/voice/team/bots | List the authenticated owner's bots for the team selector |
| GET /api/voice/team?botId=... | Read validated team and revision |
| PUT /api/voice/team?botId=... | Save config plus expected revision |
| POST /api/voice/team/preview?botId=... | Preview one validated agent; audio response |
| GET /api/corporate-phone/voice-team-bot | Corporate owner only: resolve the corporate bot |

## Call evidence

Call telemetry should identify the active department and record voice handoffs with source/destination agent IDs, source/destination voice IDs, summary, timestamps, result and failure reason. A handoff is completed only after destination setup succeeds.

## Release state — 2026-09-10

The application code for distinct voice teams was merged to `main` through PR #110. Merge commit:

`2c13fce5334027f79e78ae7b5178a720403c8654`

Railway automatically deployed that merge as deployment:

`cd866ecf-e184-40a6-843d-f7397b3069e1`

The deployment completed successfully and the runtime started on port 8080.

**Important:** application deployment does not prove the production database migration was applied. The repository has an active production migration-history reconciliation hold. Do not run `supabase db push` merely to enable this feature. The specific voice-team migration must be reconciled against the verified production schema under `docs/MIGRATION_BASELINE_RECONCILIATION.md` before any production schema write.

Therefore the correct current statement is:

- voice-team application code: deployed to Railway production;
- exact production database migration state: must be verified/reconciled before claiming persisted team configuration is fully live;
- live PSTN role-handoff listening test: still required before declaring end-to-end voice-team acceptance complete.

## Verification

Run the focused tests that exist in the repository for voice-team/API/media behavior, then the normal release gates:

```sh
npm run test:run
npm run lint
npm run build
```

Before declaring the feature end-to-end live, perform an inbound listening check: identify yourself and your company to Reception, request Sales, then Support, then a Manager. Confirm each voice and introduction changes, context is retained, interruptions work, and the call log records transitions. Preview-only or mocked tests do not establish PSTN audio quality.

Rollback the application release if needed. Do not destructively roll back the production database or release customer phone resources as part of an application rollback.

## Related documentation

- `docs/VOICE_TEAM_ARCHITECTURE_2026-09-10.md` — production architecture contract and acceptance criteria.
- `docs/CORPORATE_PHONE.md` — corporate phone routing/operations.
- `DEPLOYMENT.md` — production deployment authority and release verification.
- `AGENTS.md` — mandatory coding-agent constraints.
- `SECURITY.md` — security boundaries.
