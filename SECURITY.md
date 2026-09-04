# Security Notes

## ⚠️ ACTION REQUIRED: rotate leaked credentials

The following credentials were found committed to this repository (removed
from the working tree, but **still present in git history** — commits
`58847d0` and `9eb649e`). Rotation status below was verified live on
2026-09-04 by probing each provider with the leaked value:

| Credential | Where it leaked | Verified status (2026-09-04) | Action |
|---|---|---|---|
| OpenAI API key (`sk-proj-Pvfo…`) | `attached_assets/Pasted-*.txt` | ✅ **ROTATED** — provider returns `401 Incorrect API key provided` | none |
| Cartesia API key (`sk_car_CDBn…`) | `attached_assets/Pasted-*.txt` | 🚨 **STILL LIVE** — `GET https://api.cartesia.ai/voices` returned `200` with this org's voice list | **Revoke in the Cartesia dashboard immediately and reissue** |
| Supabase Postgres password (project `qjwwkcore…`) | `FIX_AUTH_ISSUE.md`, `VERCEL_DEPLOYMENT.md` | ❓ **UNVERIFIED** — cannot be probed without attempting a DB login from an allowed network | Reset: Supabase → Settings → Database → Reset password, then confirm the old value fails |
| `SESSION_SECRET` (base64, `2NtQ…`) | `FIX_AUTH_ISSUE.md` | ❓ **UNVERIFIED** — cannot be tested externally | Compare the deployed `SESSION_JWT_SECRET` against the leaked value; if equal, regenerate (`openssl rand -base64 64`). Any session token signed with the leaked secret is forgeable, which is a full authentication bypass |

Because these values remain in git history, rotation is the only real
remediation — file removal does not help. A history rewrite
(`git filter-repo`) would remove them permanently but needs a coordinated
force-push.

## Supabase Row Level Security (RLS)

RLS policies live in `supabase/migrations/20260110234903_remote_schema.sql`
(search for `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY`). They cover
`bots`, `leads`, `conversations`, `profiles`, `phone_calls`, `usage_events`,
`marketplace_templates`, `website_pages`, and others, keyed on
`auth.uid()` and the `is_admin()` helper.

**Important:** RLS only protects access made with the **anon key**
(`VITE_SUPABASE_ANON_KEY`). Two code paths bypass RLS entirely and must
enforce tenancy themselves:

1. **Vercel serverless functions** (`api/gateway.ts`, `api/auth/*.ts`) use
   `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS. Every query there must
   filter by the authenticated user/organization — never trust client-supplied
   IDs without an ownership check.
2. **The Express server** (`server/`) connects directly to Postgres via
   `DATABASE_URL` (Drizzle), which also bypasses RLS. Tenancy is enforced by
   the middleware stack: `authenticate` → `loadOrganizationContext` →
   `tenantIsolation()`. Any new org-scoped route must use this stack.

Never expose the service-role key with a `VITE_`/`NEXT_PUBLIC_` prefix and
never hardcode it as a fallback in source.

## Authorization model (OWNER vs ADMIN)

`api/security/authz.ts` is the single source of truth:

- **OWNER** (also `ORG_OWNER`, `ACCOUNT_OWNER`) — the customer who owns an
  organization. Full rights inside their own tenant, **zero** platform-wide
  rights. `api/auth/signup.ts` gives every self-service signup this role.
- **ADMIN / MasterAdmin / SUPER_ADMIN / PLATFORM_ADMIN / STAFF** — BuildMyBot
  staff. Platform-wide access.

Never write `['admin','ADMIN','owner','OWNER'].includes(user.role)` again —
that pattern (removed in this pass) handed every customer platform-admin
access to `/api/admin/*`, `/api/audit`, `/api/bots/errors`, `/api/ai-employees`
and `/api/email/*`. Use `isPlatformAdmin(user)` / `denyIfNotPlatformAdmin()`.

Self-service signup must never promote by email address. The hard-coded
`MASTER_ADMINS` lists in `api/auth/signup.ts` and `App.tsx` have been removed;
staff access is granted out-of-band against the database
(`scripts/setAdminPermissions.ts`).

## Billing integrity

- Entitlements (plan, voice plan, phone minutes, wallet credit, usage pools)
  are written **only** by `api/stripe-webhook.ts` after a signature-verified
  Stripe event. `POST /api/phone/voice-plan` and
  `POST /api/agency/wallet/(auto-)recharge` now return `402 PAYMENT_REQUIRED`.
- `POST /api/stripe/checkout|portal|whitelabel/checkout` take identity from
  the session only. Client-supplied `userId`, `organizationId`, plan limits,
  `minutes` and `credits` are ignored.
- Stripe signature verification needs the **exact bytes**. `server.ts`
  preserves them on `req.rawBody` (Cloud Run/Express previously consumed and
  re-serialized the body, so every webhook silently failed verification).
- Duplicate/retried events have exactly one effect, enforced by the unique
  `stripe_webhook_events.event_id` claim
  (`supabase-migrations/20260904_stripe_webhook_idempotency.sql`).

## SSRF

Any customer-controlled outbound URL (website scraping, webhook delivery and
webhook tests, booking callbacks) must go through
`assertSafeOutboundUrl()` / `safeFetch()` in `api/security/ssrf.ts`, which
rejects non-http(s) schemes, embedded credentials, `localhost`,
`*.internal`, the cloud metadata endpoints and all loopback / RFC1918 /
link-local / CGNAT ranges — re-validating every redirect hop.

## Route authentication map

- Public by design: `/api/health`, `/api/auth/*`, `GET /api/templates`,
  `POST /api/chat/demo` (rate-limited), `POST /api/chat/bot/:botId`
  (rate-limited, powers the embeddable widget), `POST /api/leads/capture`
  (rate-limited), `GET /api/public/bots/:id`, provider webhook paths
  (`/api/webhooks/voice/twilio`, `/api/voice-providers/webhooks/*`),
  Stripe checkout/portal/webhook endpoints.
- Everything else requires `authenticate` (session auth), applied either at
  mount in `server/index.ts` or via `router.use(...)` inside the route file.
- `/api/admin` additionally requires an admin role; `/api/partners` a
  partner/reseller role; `POST/PUT /api/revenue/plans` an admin role.

## x-user-id header authentication (Express server only)

The Express server's `authenticate` middleware historically accepted a
client-supplied `x-user-id` header (user id *or email*) as a full identity —
an authentication bypass, since anyone can send any value. As of this
hardening pass the header is only honored when `NODE_ENV !== 'production'`,
or when `DANGEROUSLY_ALLOW_HEADER_AUTH=true` is explicitly set. Production
deployments of the Express server must rely on session cookies
(`POST /api/auth/login` sets `session.userId`). The Vercel serverless path
(`api/gateway.ts`) is unaffected — it uses signed session JWTs.

The SPA (`services/dbService.ts`) still sends `x-user-id` alongside
`credentials: 'include'`; once sessions are confirmed working in every
deployed topology, that header should be dropped from the client too.

## Known gaps (accepted for now)

- ~~Twilio webhook signature validation~~ — **fixed**. `api/twilio/webhooks.ts`
  and `api/twilio/inbound.ts` now validate `X-Twilio-Signature` against the
  full public URL (`APP_BASE_URL`, plus the `x-forwarded-host` variant) and
  **fail closed** in production. The old code fell back to "does the body
  contain a `CallSid`?" whenever the token was missing, the header was
  absent, or validation threw — all trivially forgeable.
- **Secrets in git history**: rotating (above) mitigates; a history rewrite
  (`git filter-repo`) would remove them permanently but requires
  coordinating a force-push with all collaborators.
