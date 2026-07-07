# Security Notes

## ⚠️ ACTION REQUIRED: rotate leaked credentials

The following credentials were found committed to this repository (now
removed from the working tree, but **still present in git history**). They
must be treated as compromised and rotated immediately:

| Credential | Where it leaked | Rotation |
|---|---|---|
| OpenAI API key (`sk-proj-Pvfo…`) | `attached_assets/Pasted-*.txt` (removed) | https://platform.openai.com/api-keys — revoke + reissue |
| Cartesia API key (`sk_car_CDBn…`) | `attached_assets/Pasted-*.txt` (removed) | Cartesia dashboard — revoke + reissue |
| Supabase Postgres password (project `qjwwkcore…`) | `FIX_AUTH_ISSUE.md`, `VERCEL_DEPLOYMENT.md` (redacted) | Supabase dashboard → Settings → Database → Reset password |
| `SESSION_SECRET` (base64, `2NtQ…`) | `FIX_AUTH_ISSUE.md` (redacted) | Generate new: `openssl rand -base64 64`; invalidates active sessions |

Because these values remain in git history, rotation is the only real
remediation — do not rely on the file removals alone.

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

- **Twilio webhook signature validation** is not enabled on
  `/api/webhooks/voice/twilio`. Enabling `twilio.webhook()` requires correct
  public-URL reconstruction behind Vercel/proxies; until then, the endpoint
  only returns TwiML and creates call log rows, but it can be spoofed.
  Enable validation once the deployed URL is stable.
- **Secrets in git history**: rotating (above) mitigates; a history rewrite
  (`git filter-repo`) would remove them permanently but requires
  coordinating a force-push with all collaborators.
