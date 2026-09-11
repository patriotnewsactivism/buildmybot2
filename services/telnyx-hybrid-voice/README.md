# Telnyx Hybrid Voice Orchestrator

Production-oriented starter for:

- Telnyx Call Control + bidirectional L16/16 kHz media streaming
- Gemini 3.1 Flash Live as the primary realtime voice model
- GPT-Realtime-2.1 as an automatic failover model
- Four internal roles: receptionist, sales, customer support, manager
- Server-enforced incentive ladder: 85% -> 70% -> 50% -> 33% of list
- Maximum two-month introductory pricing
- Confidential owner escalation through a server-side environment variable
- Telnyx SMS marketing consent/suppression controls
- Stripe setup Checkout + subscription schedule for temporary intro pricing
- Slack operational alerts
- Tavily public-information lookup
- PostgreSQL audit/consent persistence
- Railway Docker deployment

## Setup

1. Create a Railway service from this repository and attach PostgreSQL.
2. Copy `.env.example` values into Railway Variables.
3. Set the Telnyx Voice API application's webhook to:
   `https://YOUR_DOMAIN/webhooks/telnyx/voice`
4. Set the Telnyx Messaging Profile webhook to:
   `https://YOUR_DOMAIN/webhooks/telnyx/messaging`
5. Configure a Stripe webhook for:
   `https://YOUR_DOMAIN/webhooks/stripe`
   and subscribe to `checkout.session.completed`.
6. Configure the plan catalog with trusted Stripe Product/Price IDs.
7. Enable Telnyx Advanced Opt-Out for the messaging profile and keep the
   local suppression table enabled as a second protection layer.
8. Run a staging call and tune `FAILOVER_RESPONSE_SECONDS` and the local
   speech detector threshold before production rollout.

## Important operational notes

`OWNER_ESCALATION_PHONE` is never included in either model prompt.

The model cannot choose arbitrary discount prices. It can only ask the
server for the next authorized stage after value has been presented and
the Manager role confirms that price is the remaining blocker.

Marketing SMS is denied unless the phone number has active recorded
marketing consent. The admin consent endpoint should only be called from
your CRM/website after capturing valid consent evidence.

Python 3.12 is intentionally pinned because the starter uses `audioop`
for stateful PCM sample-rate conversion. Replace that module with a
dedicated streaming resampler before moving to Python 3.13+.
