# BuildMyBot.app Market-Readiness Roadmap

This roadmap translates the current platform state into a practical execution plan for shipping a market-ready product that businesses can buy, deploy, and trust.

## Current State Snapshot

| Area | Status | Summary |
|---|---|---|
| Frontend | ✅ Strong | React + TypeScript + Vite + Tailwind UI foundation is in place. |
| Backend | ✅ Strong | Express API server is implemented. |
| Database | ✅ Strong | Postgres + Drizzle schema/migrations/seeds are wired. |
| AI Chat | ✅ Functional | OpenAI integration exists for production chat use cases. |
| Voice Agent | ⚠️ Partial | Cartesia support exists, but full real-time telephony pipeline is incomplete. |
| Workflow Automation | ⚠️ Partial | Feature intent exists, but trigger/condition/action engine is not complete. |
| Billing | ⚠️ Partial | Stripe keys and pieces exist, but full lifecycle + metered overage enforcement is incomplete. |
| DevOps | ❌ Missing | Docker, CI/CD, and one-click deployment path need to be formalized. |
| Testing | ⚠️ In Progress | Vitest is configured, but deeper integration/e2e coverage is still needed. |
| Docs & Onboarding | ⚠️ In Progress | Basic docs exist; guided onboarding and operational playbooks are needed. |

## Product Success Criteria

To be considered market-ready, BuildMyBot should satisfy all of the following:

1. A new business can go from signup to embedded chatbot in under 10 minutes.
2. Voice calls feel human and respond quickly (target: <500ms perceived turn latency).
3. Lead capture and handoff are automated through actionable workflows.
4. Billing and usage limits are enforced automatically by plan.
5. Deployment and monitoring are standardized, repeatable, and production-safe.

## Priority 1 — Voice Agent (Differentiator)

### Goal
Deliver a reliable AI receptionist pipeline that can answer calls, qualify leads, and escalate when needed.

### Recommended launch approach
- **Phase-in strategy:** launch with a managed voice platform (Vapi/Retell) for speed, then migrate high-volume tenants to a custom stack (Twilio + Deepgram + OpenAI + Cartesia) for margin optimization.
- **Reasoning:** usage-based cost model, fast GTM, clear migration path.

### Required implementation milestones
1. Add `server/voice/` module with session manager + state machine for active calls.
2. Implement inbound call webhook + websocket audio bridge.
3. Add intent/action dispatch for `book_appointment`, `transfer_to_human`, `emergency`, and `continue`.
4. Persist transcripts + call outcomes to CRM entities.
5. Implement hot-lead alerts on call completion based on lead score threshold.
6. Add guardrails: voicemail detection, interruption handling (barge-in), transfer fallback behavior.

### Voice quality acceptance checklist
- [ ] End-to-end response latency remains below 500ms in production-like tests.
- [ ] Caller interruption stops active TTS playback safely.
- [ ] Calls include recording disclosure where required.
- [ ] Every call stores timestamped transcript + summarized outcome.
- [ ] Warm transfer includes context handoff payload.

## Priority 2 — Workflow Automation Engine

### Goal
Turn captured conversations into business outcomes (alerts, bookings, CRM updates, follow-ups).

### Required components
1. Workflow schema (`workflows`, `workflow_steps`, `workflow_executions`).
2. Trigger ingestion (new lead, call ended, form submit, schedule, webhook).
3. Execution engine with step types: condition, action, delay, branch.
4. Action adapters (SMS, email, webhook, CRM update, calendar booking, team alerts).
5. Dashboard UI for activating/deactivating workflows and viewing execution logs.

### Launch templates (minimum set)
- Hot lead alert
- After-hours receptionist follow-up
- Appointment confirmation/reminders
- Missed call recovery SMS
- New chat lead qualification routing
- Post-appointment review request

## Priority 3 — Zero-Friction Onboarding & Deployment

### Goal
Reduce time-to-value and onboarding drop-off.

### Must-have onboarding wizard
1. Business profile + website URL input.
2. Industry template selection for bot behaviors.
3. Persona/tone customization with preview.
4. One-line embed code generation.
5. Voice add-on setup (number provisioning + business hours).

### Widget launch requirements
- Shadow DOM isolation to prevent host-style conflicts.
- Lightweight script payload target (~30KB gzipped).
- Domain-aware metadata in chat payload.
- API authentication tied to bot + allowed domains.

## Priority 4 — Cost & Scalability Architecture

### Goal
Keep fixed costs low while scaling usage-based COGS.

### Financial model guardrails
- Fixed cost target at launch: ~$25/month infra baseline (excluding usage).
- Voice/SMS usage passed through with markup.
- Plan-level included quotas + overage billing.

### Technical scaling phases
1. **0–100 customers:** single app instance + managed Postgres.
2. **100–1,000 customers:** introduce Redis queue/cache and stronger background workers.
3. **1,000+ customers:** multi-region strategy, stronger observability, higher availability architecture.

## Priority 5 — Production Readiness Essentials

### Billing completion
- Stripe checkout + customer portal + webhook lifecycle.
- Plan entitlements for bots/messages/voice minutes.
- Metered usage reporting for voice overages.

### Security baseline (non-negotiable)
- API rate limiting across public endpoints. ✅ (implemented)
- Strict CORS by tenant domain. ✅ (implemented)
- API key auth for embeddable widget traffic. 🚧 (next)
- Input validation and sanitization on all ingestion points. ✅ (implemented baseline; continue hardening)
- Audit logging for sensitive admin actions. ✅ (implemented baseline)

### Progress update (current sprint)
- Added widget-domain enforcement for public bot chat endpoints using bot `websiteUrl` host validation against `Origin`/`Referer` headers.
- Added dedicated test coverage for origin validation rules.

### Reliability baseline
- `/health` endpoint with DB/provider checks.
- Centralized error tracking (e.g., Sentry).
- Queue visibility dashboards and retry policy.
- Alerting for failed billing webhooks and failed workflow runs.

## Execution Plan (12 Weeks)

### Phase 1 (Weeks 1–4): Sellable MVP
1. Managed voice integration + basic call routing.
2. Voice configuration UI (greeting, hours, transfer rules).
3. Stripe plans + usage limit enforcement.
4. Onboarding wizard (5-step flow).
5. Embeddable widget release.
6. Core security controls.
7. Docker + CI/CD path to Railway/Render.

### Phase 2 (Weeks 5–8): Hardening
1. Workflow engine runtime.
2. Workflow templates.
3. Call recording/transcript playback in dashboard.
4. Hot-lead SMS/notification paths.
5. Website auto-scraper for knowledge ingestion.
6. Observability and health monitoring.
7. End-to-end tests for core revenue journey.

### Phase 3 (Weeks 9–12): Growth
1. White-label reseller controls.
2. One-click CMS/ecommerce plugins.
3. Analytics dashboard for funnel and conversion KPIs.
4. Voice stack margin optimization migration.
5. Ecosystem integrations (Zapier/Make).
6. Multi-language expansion and customer education assets.

## Definition of Done (Market Launch)

BuildMyBot is launch-ready when:
- Signup → deployed web chatbot is under 10 minutes for non-technical users.
- Voice agent can handle real inbound calls with transfer + transcript + CRM logging.
- Workflows can automate at least 6 high-value business outcomes.
- Stripe billing lifecycle and plan enforcement run without manual intervention.
- Deployment, monitoring, and incident response are documented and operational.
