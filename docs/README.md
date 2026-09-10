# BuildMyBot Documentation Index

_Current as of 2026-09-10._

This directory contains implementation notes and operational runbooks for BuildMyBot. The authoritative production overview is `../README.md`; coding-agent rules are in `../AGENTS.md`; deployment authority is `../DEPLOYMENT.md`.

## Voice and phone

- `VOICE_TEAM_ARCHITECTURE_2026-09-10.md` — authoritative four-agent voice-team architecture and acceptance criteria.
- `AI_VOICE_TEAM.md` — implementation details, persistence model, API, release state, and validation requirements.
- `CORPORATE_PHONE.md` — corporate Telnyx phone routing, outbound approval, SMS interactions, and end-to-end checks.

The production rule is simple: Receptionist, Sales, Support, and Manager are four distinct realtime voice agents. Every AI-to-AI handoff changes voice ID, persona/system prompt, speaking style, and opening behavior while preserving only a bounded caller/call context envelope.

## Database

- `MIGRATION_BASELINE_RECONCILIATION.md` — mandatory production migration-history reconciliation procedure.
- `DATABASE_MIGRATIONS.md` — migration implementation/reference notes.
- `DATABASE_SEEDS.md` — seed data documentation.
- `DATABASE_UPGRADE_CHECKLIST.md` — upgrade checklist.

Production Supabase currently has a migration-history reconciliation hold. Do not run `supabase db push` against production simply because a migration exists in Git.

## AI workforce

- `AI_TEAM_DAILY_BLUEPRINT.md` — autonomous AI-team operating blueprint.

AI/provider workflows must use bounded retries/timeouts and avoid uncontrolled token-spend/fallback cascades.

## Release state

The distinct voice-team application code was merged through PR #110 as commit `2c13fce5334027f79e78ae7b5178a720403c8654` and successfully deployed by Railway as deployment `cd866ecf-e184-40a6-843d-f7397b3069e1`.

Application deployment does not prove the voice-team production database migration is present or that PSTN handoff acceptance has completed. Verify both separately before marking the feature end-to-end complete.

## Documentation maintenance

When architecture changes, update the relevant documents in the same change. Do not leave known-false instructions in place merely for history; Git already preserves prior revisions.
