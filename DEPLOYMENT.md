# BuildMyBot — Official Deployment & Operations

_Last updated: 2026-09-01. This document describes the supported production topology and the phone-agent activation rollout._

> **Allowed hosting targets:** Google Cloud Run, Cloudflare, and Netlify.
>
> **Do not restore Vercel, Railway, or AWS as BuildMyBot production hosts.**
> Old references may remain in history or compatibility code, but they are not
> deployment authority.

## 1. Production topology

| Layer | Production responsibility | Location |
|---|---|---|
| Frontend | Vite + React SPA | Cloudflare Pages for `buildmybot.app` / `www.buildmybot.app` |
| Backend/API | Express/Node container wrapping the existing `api/` handlers | Google Cloud Run |
| Cloud Run project | `buildmybot-507112` | Google Cloud |
| Cloud Run service | `buildmybot2` | `us-central1` |
| Verified service URL | `https://buildmybot2-fq5disxp2a-uc.a.run.app` | Google Cloud Run |
| Browser API bridge | Same-origin `/api/*` proxy | Cloudflare Pages Function `functions/api/[[path]].ts` |
| Database | Supabase Postgres / REST | project `evkjlnbpntimbxklnhoz` |
| Primary AI-team provider | OpenRouter DeepSeek stack | server-side only |
| Realtime voice | Gemini Live | server-side only |
| Telephony | Twilio Programmable Voice + bidirectional Media Streams | tenant-isolated Twilio subaccounts for new activations |

Cloud Run is the backend authority. Frontend hosts must **proxy** `/api/*` to it;
do not redirect authenticated browser traffic to `*.run.app`, because the
host-only session cookie would no longer be sent to the application domain.

### Last verified backend state

On 2026-08-30 the Cloud Run backend answered:

```text
GET /api/health      -> 200 {"status":"ok","service":"buildmybot-api"}
GET /api/auth/user   -> 401 {"error":"Not authenticated"}  # correct when logged out
```

At that time the public Cloudflare Pages release was stale and its `/api/*`
path still reached a retired Railway edge. The repository contains an explicit
Cloudflare Pages deployment workflow and a Pages Function that proxies to
Cloud Run. Before treating the public domain as healthy, verify it again:

```bash
curl -fsS https://www.buildmybot.app/api/health
curl -s -o /dev/null -w '%{http_code}\n' https://www.buildmybot.app/pricing
```

`/api/health` must be answered by BuildMyBot/Cloud Run, not Railway.

## 2. Cloud Run deployment

The deployment workflow authenticates to Google Cloud through GitHub OIDC /
Workload Identity and deploys an immutable container to the existing Cloud Run
service.

Production identity used by the verified workflow:

```text
buildmybotsa@buildmybot-507112.iam.gserviceaccount.com
```

Do not create a parallel BuildMyBot backend merely to work around a failed
deployment. Fix the existing Cloud Run path.

### Domain mapping option

The application can also be served directly from Cloud Run behind a Google
Cloud Run domain mapping, with Cloudflare providing DNS only:

```bash
gcloud beta run domain-mappings create \
  --service buildmybot2 \
  --domain www.buildmybot.app \
  --region us-central1 \
  --project buildmybot-507112
```

When using Google-managed domain mapping, the Cloudflare record used for
validation must be DNS-only while Google validates the domain and provisions
the certificate.

## 3. Core server environment

Never commit real secret values. Production secrets belong in Google Secret
Manager / the approved deployment secret path.

| Variable | Requirement | Purpose |
|---|---|---|
| `SUPABASE_URL` | required | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | required | Server-side database access; never expose with a `VITE_` prefix |
| `SESSION_JWT_SECRET` | required | Session token signing |
| `ENCRYPTION_KEY` | required for tenant telephony | AES-256-GCM key material used to encrypt stored telephony subaccount credentials |
| `OPENROUTER_API_KEY_2` | primary AI team | Preferred OpenRouter key |
| `OPENROUTER_API_KEY` | fallback AI team | OpenRouter fallback |
| `RESEND_API_KEY` | email | Outbound AI-employee mail |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | inbound email | Authenticates inbound email delivery |
| `CRON_SECRET` | scheduled work | Authenticates cron/workforce triggers |
| `PORTFOLIO_INTAKE_SECRET` | portfolio capture | Authenticates portfolio lead intake |
| `BASE44_SUPERAGENT_API_KEY` | optional | Server-side Base44 worker credential |
| `STRIPE_SECRET_KEY` | billing | Server-side Stripe access |
| `STRIPE_WEBHOOK_SECRET` | billing | Stripe webhook verification |
| `SENTRY_DSN` | observability | Server error reporting |

The full annotated set remains in `.env.example`.

### Frontend build variables

| Variable | Requirement | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | required | Public Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | required | Public anon key; RLS applies |
| `VITE_API_URL` | normally empty | Keeps browser API traffic same-origin |
| `VITE_STRIPE_PUBLISHABLE_KEY` | when billing is live | Stripe publishable key |
| `BUILDMYBOT_API_ORIGIN` | optional | Cloud Run origin for the Pages Function and server-to-server workflows |

Redeploy the frontend after changing `VITE_*` values because they are baked
into the Vite bundle.

## 4. AI phone-agent production architecture

The authenticated customer console remains `/app/phone`.

Canonical production call path:

```text
Caller
  -> customer Twilio number
  -> tenant Twilio subaccount
  -> signed webhook
  -> BuildMyBot Cloud Run
  -> Twilio bidirectional Media Stream
  -> /api/voice/twilio-media
  -> Gemini Live
  -> shared bot / RAG knowledge
  -> optional tools, lead capture, appointment action, hot-lead alert, human handoff
```

The realtime engine is Gemini Live. The existing Gather/LLM/TTS path remains a
fallback for legacy numbers and for situations where realtime voice cannot be
started.

### Activation modes

The guided **Activate Your AI Phone Agent** flow supports three distinct modes:

1. **Get a New Number**
   - customer selects an available Twilio number;
   - BuildMyBot provisions it into that customer's Twilio subaccount;
   - the number is attached to the selected bot/knowledge workspace;
   - activation is only reported successful after Twilio and Supabase both
     confirm their writes.

2. **Use My Existing Number**
   - BuildMyBot provisions a destination number;
   - the customer's existing carrier remains authoritative;
   - the activation status is `awaiting_forwarding`;
   - the UI provides forwarding instructions;
   - do **not** claim the existing number is connected until the customer
     configures forwarding and a real inbound test succeeds.

3. **Port My Number**
   - BuildMyBot records the request and creates/reuses the tenant telephony
     account;
   - initial status is `pending_documents`;
   - the existing carrier service must remain active;
   - a Letter of Authorization/carrier documentation and Twilio approval are
     required before cutover;
   - do **not** mark a port active merely because the request was recorded.

### Shared chatbot + voice knowledge

By default, the activation endpoint links the phone number to an existing
tenant bot. The phone call therefore uses the same `bot_id` and the same RAG
knowledge used by the chatbot. A customer may choose `voice_only` mode to
create/reuse a separate voice knowledge workspace.

The linking rule is tenant-scoped. A user cannot attach a phone number to a bot
owned by another organization.

## 5. Twilio subaccount isolation

New phone-agent activations use one active Twilio subaccount per BuildMyBot
tenant. This isolates phone numbers and usage from other customers while the
parent BuildMyBot account retains administrative control.

Required parent credentials:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
```

Additional phone-agent configuration:

```text
ENCRYPTION_KEY
TWILIO_WEBHOOK_BASE_URL
GEMINI_API_KEY
```

`TWILIO_WEBHOOK_BASE_URL` should be the stable HTTPS origin Twilio can reach.
For the current architecture it may point directly to the Cloud Run service
until the public `buildmybot.app/api/*` route is independently verified.

### Credential handling

When Twilio creates a subaccount it returns that subaccount's auth token.
BuildMyBot immediately encrypts the token with AES-256-GCM and stores only the
ciphertext in `telephony_accounts.auth_token_encrypted`.

Rules:

- never return the encrypted token to the browser;
- never log the plaintext token;
- never store the plaintext token in Supabase;
- never use a customer subaccount token as a frontend environment variable;
- webhook validation resolves `AccountSid` to the matching encrypted token,
  decrypts it server-side, and validates `X-Twilio-Signature`;
- missing or unverifiable signatures are rejected with HTTP 403.

Legacy numbers remain on their current webhook path. New subaccount numbers use
the activation-specific webhook path, which allows rollout without changing
existing customer numbers.

## 6. Phone-agent database migration

Apply:

```text
supabase/migrations/20260901203000_phone_agent_activation.sql
```

The migration:

- creates `telephony_accounts`;
- creates `phone_agent_activations`;
- adds `provider_account_sid`, `setup_mode`, `source_number`,
  `activation_status`, and `activated_at` to `phone_numbers`;
- adds indexes used for tenant/account/status lookup;
- never creates a plaintext auth-token column.

Apply migrations through the approved Supabase workflow:

```bash
npx supabase login
npx supabase link --project-ref evkjlnbpntimbxklnhoz
npx supabase db push
```

Run migrations before deploying application code that writes the new columns.

## 7. Phone-agent deployment order

Use this order to avoid partial activation:

1. Apply the phone-agent migration.
2. Confirm Cloud Run has:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_JWT_SECRET`
   - `ENCRYPTION_KEY`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `GEMINI_API_KEY`
   - `TWILIO_WEBHOOK_BASE_URL`
3. Deploy the backend to Cloud Run.
4. Verify logged-out activation endpoints reject with 401.
5. Verify the Twilio webhook endpoints reject unsigned requests with 403.
6. Deploy the frontend.
7. With a test tenant:
   - search an area code;
   - provision one number;
   - confirm a tenant Twilio subaccount exists;
   - confirm `auth_token_encrypted` is ciphertext;
   - make a real inbound call;
   - confirm a `call_logs` row is created;
   - confirm Gemini Live audio works;
   - confirm the call can query the selected bot's business knowledge.
8. Test human handoff and appointment tooling only when their configuration is
   present. Never report a tool action successful unless the external service
   confirms it.

## 8. Health and acceptance checks

Minimum release checks:

```bash
npm run lint
npm run test:run
npm run build
```

Phone-specific acceptance:

```text
[ ] New-number activation creates exactly one tenant subaccount and one active number
[ ] Re-running number search reuses the tenant subaccount
[ ] Cross-tenant bot IDs are rejected
[ ] Stored subaccount auth token is encrypted
[ ] Unsigned/invalid Twilio webhook is HTTP 403
[ ] Valid subaccount webhook resolves the correct bot
[ ] Shared knowledge returns answers from the selected bot RAG
[ ] Forwarding mode remains awaiting_forwarding until the customer configures it
[ ] Port mode remains pending_documents until carrier/Twilio confirmation
[ ] Gemini Live path creates/updates call_logs
[ ] Existing legacy Twilio numbers continue using their existing webhook path
```

## 9. Rollback

Application rollback:

1. revert the phone-agent activation commit;
2. redeploy the prior Cloud Run image;
3. redeploy the prior frontend bundle if necessary.

Data/telephony rollback is deliberately conservative:

- do **not** automatically close customer Twilio subaccounts during code
  rollback;
- do **not** automatically release purchased phone numbers;
- do **not** delete port records that may correspond to a real carrier request;
- instead, disable new activation traffic, inspect the affected tenant, and
  reconcile Twilio/Supabase state explicitly.

The migration is additive and can remain in place while application code is
rolled back.

## 10. Operational ownership

Primary company address used by the AI workforce:

```text
president@buildmybot.app
```

AI employee and cron operations continue to use the same Cloud Run/Supabase
production stack. Phone-agent activation does not create a second backend or a
parallel data store.
