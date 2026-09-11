# Security Notes

_Last reviewed: 2026-09-10._

## Credential rotation history

Historical repository commits contained sensitive credentials. Removing a secret from the working tree does not remove it from Git history; leaked credentials must be rotated at the provider. A coordinated history rewrite may reduce future exposure but does not replace rotation.

Do not copy any historical credential from Git history into a current deployment.

## Current production trust boundary

Production is Railway-first behind Cloudflare, with Google Cloud Run retained as a read fallback. The active application runtime is the root `server.ts` plus `api/*` handlers. Do not rely on obsolete Vercel/serverless-only or nonexistent `server/` architecture descriptions.

The active production Supabase project is `blyebndyrojmreensbxe`.

Server-side Supabase access using the service-role key bypasses RLS. Every tenant-scoped query therefore must enforce authenticated user/organization ownership in application code even where database RLS also exists.

Never expose `SUPABASE_SERVICE_ROLE_KEY` or another server credential through a `VITE_*` variable.

## Authentication and authorization

Authentication and authorization decisions must be based on verified server-side state. Never trust browser-provided roles, organization IDs, caller IDs, bot ownership, or other identity claims without verification.

Platform-administrator privileges and tenant-owner privileges are different security domains. Customer/tenant ownership must never be treated as platform administration.

Every state-changing route for bots, voice teams, phone resources, SMS, campaigns, billing, AI employees, or customer data must authenticate the caller and verify tenant scope.

## Distinct voice-team security boundary

Receptionist, Sales, Support, and Manager are separate conversational identities, but **persona hierarchy does not grant authorization hierarchy**.

In particular:

- the Manager persona does not automatically gain billing, contract, admin, or account-management permissions;
- Sales cannot access private support/account data merely because a caller asks;
- caller ID is not authentication;
- transferred context must be bounded to information needed for the call and tenant;
- a handoff must not leak system prompts, provider keys, hidden tool results, cross-tenant knowledge, or privileged internal metadata;
- destination agents must inherit only explicitly allowed tool capabilities;
- human-transfer requests must not be simulated as completed human transfers when no human actually joined.

Call telemetry should record agent/voice transitions without storing secrets. Sensitive transcript data should be minimized and handled under the same tenant controls as other customer conversation data.

See `docs/VOICE_TEAM_ARCHITECTURE_2026-09-10.md` and `docs/AI_VOICE_TEAM.md`.

## Telephony and webhook verification

Telnyx/Twilio-compatible provider webhooks must be cryptographically verified according to the active provider path and fail closed in production when verification is required.

Do not treat the presence of a provider call ID or caller number as proof a webhook is authentic.

Outbound calls and other high-impact provider actions must preserve explicit approval/authorization controls. Ambiguous provider responses must be reconciled against provider state before retrying to avoid duplicate calls, messages, purchases, ports, or provisioning actions.

## Billing integrity

Billing/entitlement changes must come from trusted, signature-verified payment events or another explicitly authorized server-side workflow. Never accept client-supplied plan limits, wallet balances, minutes, credits, or organization identity as authoritative.

Stripe webhook verification requires the exact request bytes. Preserve raw-body handling on the webhook path.

Provider retries/webhook redelivery must be idempotent.

## SSRF

Customer-controlled outbound URLs used for scraping, callbacks, webhook tests, or similar features must pass the repository's outbound URL validation and redirect-hop validation.

Reject localhost, metadata endpoints, private/link-local networks, embedded credentials, unsupported schemes, and unsafe redirects.

## RAG and tenant knowledge

Shared knowledge is tenant-owned data. Chat, voice, and SMS may share knowledge within a tenant, but cross-tenant knowledge IDs or retrieved evidence must never be accepted.

Do not weaken tenant ownership checks to make an integration test pass.

Agents must not invent private account facts when retrieval has no evidence.

## Production database migration hold

There is an active migration-history reconciliation hold for production Supabase. Do not run `supabase db push`, destructive migrations, resets, or wholesale replay of repository migrations against production until `docs/MIGRATION_BASELINE_RECONCILIATION.md` is completed for the affected migration.

This applies to the additive voice-team migration as well. Application code being deployed does not prove the production table exists.

## AI/provider reliability and spend safety

AI/provider failure handling is also a security/cost boundary.

- bound timeouts and retries;
- prevent infinite provider/model fallback loops;
- do not put all credentials into cooldown because one model timed out;
- distinguish credential, quota, provider, validation, and network failures;
- avoid uncontrolled token/credit spend during failure cascades;
- never log full API keys, bearer tokens, or provider secrets.

## Secrets

Use `.env.example` as the variable inventory, but never put real values in it.

Server secrets belong in Railway/GitHub/cloud secret storage. Public `VITE_*` values must contain only data safe to expose to every browser user.

Webhook secrets, encryption keys, session-signing keys, service-role keys, AI provider credentials, Telnyx/Twilio credentials, Stripe secrets, Resend keys, and cron/worker secrets are server-only.

## Security review checklist for significant changes

Before merging a security-sensitive change, verify:

1. authentication is required where appropriate;
2. tenant ownership is verified server-side;
3. privileged roles are not inferred from customer roles;
4. webhook signatures remain verified;
5. retries are bounded/idempotent;
6. no secret moved into client-visible code/logs;
7. no new SSRF path bypasses validation;
8. voice handoffs do not expand permissions or leak hidden context;
9. database changes respect the migration hold;
10. public health/provenance confirms the intended release SHA.
