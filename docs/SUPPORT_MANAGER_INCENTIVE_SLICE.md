# Support Manager incentive slice

Vertical slice for the Manager voice agent to turn price/competitor objections into yeses using a **pre-approved** incentive playbook (not open-ended discounts).

## Components

| Piece | Location |
| --- | --- |
| Workspace playbook (offer codes, max % off, free-month ceiling) | `shared/incentive-playbook.ts` (+ optional `organizations.settings.incentivePlaybook`) |
| Gated `grant_incentive` tool | `api/voice/grant-incentive.ts` |
| Telnyx Live wiring (apply patch) | `patches/support-manager-incentive-telnyx-live.patch` |
| Lead CRM / timeline write | `rememberMemory` → `ai_agent_memories` + lead `ai_notes` |
| Telnyx SMS (once per offer/call) | `sendSms` from `api/lib/telephony-provider.ts` |

## Done-checks

- **A)** Grant refuses unless `objectionTag` is set and `valuePitchAttempted === true` (enforced in `authorizeGrantIncentive`; covered by unit tests).
- **B)** Successful grant writes who/when/why/offer code onto the lead timeline under workspace caps (`executeGrantIncentive`).
- **C)** The same incentive terms are sent once via Telnyx SMS for that offer on the call (`executeGrantIncentive` + call_logs metadata `incentiveGrants`).

## Apply Telnyx Live wiring

Remote MCP edits cannot safely rewrite the full `api/voice/telnyx-live.ts` (~55KB). Apply the focused patch locally:

```bash
git apply patches/support-manager-incentive-telnyx-live.patch
```

That registers `grant_incentive` for the manager department, updates operating rules, and routes the tool case to `executeGrantIncentive`.

## Verify A/B/C

```bash
npx vitest run test/incentive-playbook.test.ts test/grant-incentive.test.ts
```

- **A:** tests assert refuse without objection tag and/or without value-pitch attempt; allow when both set and under caps.
- **B:** `executeGrantIncentive` tests / code path write timeline via `rememberMemory` + lead notes with offer code.
- **C:** same path calls `sendSms` once; repeat grant for same offer/call is suppressed via call_logs metadata.

## Migration safety

`supabase/migrations/20260911180000_workspace_incentive_playbook.sql` is optional for a future durable table. Do **not** run `supabase db push` against production while the migration-history reconciliation hold is active. Runtime defaults + `organizations.settings.incentivePlaybook` are sufficient for this slice.

## Follow-ups

- Apply/merge the telnyx-live patch (or equivalent) so live voice can invoke the tool.
- Optional admin UI for workspace incentive playbook.
- Optional twilio-live parity wiring.
