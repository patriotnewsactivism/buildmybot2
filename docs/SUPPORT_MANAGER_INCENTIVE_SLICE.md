# Support Manager incentive slice

Vertical slice for the Manager voice agent to turn price/competitor objections into yeses using a **pre-approved** incentive playbook (not open-ended discounts).

## Components

| Piece | Location |
| --- | --- |
| Workspace playbook (offer codes, max % off, free-month ceiling) | `shared/incentive-playbook.ts` (+ optional `organizations.settings.incentivePlaybook`) |
| Gated `grant_incentive` tool | `api/voice/grant-incentive.ts`, wired in `api/voice/telnyx-live.ts` |
| Lead CRM / timeline write | `rememberMemory` → `ai_agent_memories` + lead `ai_notes` |
| Telnyx SMS (once per offer/call) | `sendSms` from `api/lib/telephony-provider.ts` |

## Done-checks

- **A)** Grant refuses unless `objectionTag` is set and `valuePitchAttempted === true`.
- **B)** Successful grant writes who/when/why/offer code onto the lead timeline under workspace caps.
- **C)** The same incentive terms are sent once via Telnyx SMS for that offer on the call.

## Migration safety

`supabase/migrations/20260911180000_workspace_incentive_playbook.sql` is added for a future durable table. Do **not** run `supabase db push` against production while the migration-history reconciliation hold is active. Runtime defaults + `organizations.settings.incentivePlaybook` are sufficient for this slice.
