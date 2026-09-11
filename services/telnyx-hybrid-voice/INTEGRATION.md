# Hybrid voice → BuildMyBot integration

Do not point production Telnyx, Stripe, or Gemini webhooks at this service until Don approves a live cutover.

## What this service is
Telnyx Call Control + media streaming, Gemini Live primary, GPT-Realtime failover, four roles (receptionist, sales, support, manager). Manager incentives are server-enforced (85% → 70% → 50% → 33% of list, max two intro months). Marketing SMS requires recorded consent.

## Prototype (Activate Your AI Phone Agent)
Map onto the existing 6-step wizard without real carrier writes:

- **Voice & knowledge:** Gemini Live default (Maya / Aoede). Optional channel-specific knowledge overrides stay workspace-scoped.
- **Handoff:** human handoff + after-hours. Show that every call produces a **recording** and a **transcript** (Telnyx TeXML `<Record>` / `<Transcription>` or realtime model transcripts).
- **Activate checklist:** number path, workspace mapping (phone + chatbot + voice + shared KB), Gemini Live, recording+transcript on, consent/STOP, Manager incentive policy (gated, not free-form discounts).
- **Lead CRM:** simulated grant row on the lead timeline with reason + offer code; SMS-in-writing is simulated until webhooks are live.

## Product (`buildmybot2`)
After issues #117–#120:

1. Ship this folder as `services/telnyx-hybrid-voice/` (Railway Dockerfile already in-tree).
2. Persist offer_audit + transcripts onto Lead CRM timeline keyed by call/lead id.
3. Gated tool `request_next_intro_offer` only after value-presented + price objection; SMS confirmation via existing Telnyx messaging (consent required).
4. Store Telnyx recording URLs and transcript text on the call/lead; never put `OWNER_ESCALATION_PHONE` in model prompts.

## Docs Don attached
TeXML Calls, Recordings, Transcripts, Update recording on a call — use those for the CRM timeline, not a second telephony stack.
