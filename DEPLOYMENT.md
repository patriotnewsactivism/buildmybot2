# BuildMyBot — Official Deployment & Operations

_Last updated: 2026-07-07. This file is authoritative; older PHASE*/VERCEL_DEPLOYMENT
docs are historical._

## 1. The official stack

| Layer | What we officially run | Where |
|---|---|---|
| **Frontend** | Vite + React SPA (this repo, built by `npm run build:client`) | Vercel project **buildmybot20** (team `don-matthews-projects`, `prj_fI5t1zSN8XyZ8v9YawKXsE7rDN7x`) — owns **buildmybot.app** and **www.buildmybot.app**, deploys `patriotnewsactivism/buildmybot2@main` |
| **Backend** | Vercel serverless functions in `api/` — `api/gateway.ts` serves every `/api/*` route, `api/auth/*.ts` serve login/signup/session/logout | Same Vercel project |
| **Database** | Supabase Postgres, accessed by the backend over the Supabase REST API with the service-role key | Supabase project `evkjlnbpntimbxklnhoz` |
| **Email (outbound)** | Resend HTTP API, or the SMTP_* block (already configured on production) | — |
| **Email (inbound)** | Your mail provider forwards to `POST /api/email/inbound` | — |

**No other backend exists in this repo.** An earlier local-dev Express
path (`server/`) was planned but never committed (see README "Deployment
topology") — there's no Dockerfile or railway.json here either. The Railway
account has no projects — nothing runs there. `package.json` still has a
handful of dead scripts referencing the never-committed `server/` dir
(`dev`, `server`, `start`, `check:server`, various `seed:*`); they'll fail
if invoked, and cleaning them up is a separate task.

> ⚠️ Several Vercel projects build this repo. **Production is `buildmybot20`**
> (team `don-matthews-projects`) — verified by domain attachment: it holds
> buildmybot.app + www.buildmybot.app. `buildmybot2` in
> `patriotnewsactivisms-projects` also auto-builds PRs (its bot comments on
> GitHub) but serves no production domain, and `buildmybot2` under
> don-matthews-projects is stale. Set env vars on **buildmybot20** only.

## 2. Environment variables

Set these in **Vercel → buildmybot2 → Settings → Environment Variables**
(Production + Preview). Frontend `VITE_*` values are baked in at build time,
so redeploy after changing them.

### Backend (serverless functions)

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | All DB access from `api/`. Never expose with a `VITE_` prefix. |
| `SESSION_JWT_SECRET` | ✅ | Signs session cookies (`openssl rand -hex 32`). Same value for all functions. |
| `SUPABASE_URL` | ✅ | `https://evkjlnbpntimbxklnhoz.supabase.co` |
| `OPENAI_API_KEY` | ✅ | Chat + AI employee reply drafting. **Rotate the leaked key first — see SECURITY.md.** |
| `RESEND_API_KEY` | ✅ for email | Outbound mail for the AI employees (or set `SMTP_HOST/PORT/USER/PASS` instead). |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | ✅ for email | Shared secret for `POST /api/email/inbound` (`openssl rand -hex 32`). |
| `PRESIDENT_EMAIL` | optional | Defaults to `president@buildmybot.app`. |
| `AI_EMPLOYEE_MODEL` | optional | Defaults to `gpt-4o-mini`. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | when billing goes live | Stripe. |
| `CRON_SECRET` | ✅ | Auths Vercel cron invocations + APEX `buildmybot_run_workforce`. |
| `DISCORD_WEBHOOK_URL` | recommended | Agent notifications (shift summaries, critical errors, lead follow-ups). |
| `SLACK_WEBHOOK_URL` | recommended | Same notifications, Slack channel. |
| `PORTFOLIO_INTAKE_SECRET` | ✅ for portfolio leads | Shared secret for `POST /api/leads/capture` portfolio intake (donmatthews.live). Set the same value on the intake producer and this Vercel project. |
| `PORTFOLIO_OWNER_EMAIL` | optional | `users` row that owns portfolio leads; defaults to `president@buildmybot.app`. |

See `Apex-Agent/APEX_INTEGRATION.md` for the APEX command-layer setup
(briefings, workforce triggers, telemetry reads).

### Frontend (build-time)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Same Supabase URL. |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Public anon key (RLS applies). |
| `VITE_API_URL` | leave empty | Same-origin `/api` is correct on Vercel. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | when billing goes live | Stripe publishable key. |

The full annotated list is in `.env.example`.

## 3. SQL migrations — runbook

Migrations live in `supabase/migrations/` and are ordered by timestamp:

1. `20260110234903_remote_schema.sql` — baseline (already applied to prod)
2. `20260118140000_fix_bots_schema.sql`
3. `20260118143000_knowledge_sources_processing.sql`
4. `20260118151000_knowledge_chunks_embeddings.sql`
5. `20260707240000_ai_employee_org.sql` — **NEW**: AI employee roster/emails/
   hierarchy, `agent_messages`, `email_messages`, `escalations` (+ seeds the
   six employees). Idempotent — safe to run repeatedly.

Apply with the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref evkjlnbpntimbxklnhoz
npx supabase db push          # applies anything not yet recorded remotely
```

or paste each un-applied file into the Supabase SQL Editor in order (they are
all idempotent `IF NOT EXISTS` style, so re-running is safe).

> The automation session that authored this file has Supabase access only to
> an unrelated project (`case-companion`), so migration #5 has been written
> and verified but **not executed against production** — run the commands
> above once.

## 4. AI employee organization

The human at the top: **president@buildmybot.app** (Matthew).

| AI Employee | Title | Mailbox | Reports to |
|---|---|---|---|
| Alex Morgan | Executive Admin | admin@buildmybot.app | president |
| Sam Rivera | Customer Support Lead | support@buildmybot.app | Alex (admin) |
| Vera Cross | VP of Sales | sales@buildmybot.app | president |
| Devon Reyes | VP of Agent Development | agents@buildmybot.app | president |
| Maya Chen | Marketing Director | marketing@buildmybot.app | president |
| Harper Lane | Head of People (HR) | careers@buildmybot.app | president |

Business rules encoded in the system prompts and gateway logic:

- **Sales-agent ladder** (matches `constants.ts` `RESELLER_TIERS`): new agents
  start at the bottom — **Bronze, 20% commission on their first 50 accounts**;
  Silver 50–149 @ 30%; Gold 150–250 @ 40%; Platinum 251+ @ 50%. Harper (HR)
  recruits and onboards using exactly this ladder.
- **Direct-to-president rule:** any sender who is a **Partner Access member
  ($499/mo, 50% split)** or has **251+ client accounts (Platinum)** bypasses
  the AI hierarchy. Their mail is forwarded to the president immediately with
  a courtesy acknowledgment to the sender, and an `escalations` row is opened.
- **Escalation:** every AI reply decision includes an escalate flag; anything
  legal/financial/security, refunds, custom enterprise terms, or "I want to
  talk to the president" produces an escalation email to `PRESIDENT_EMAIL`
  plus an open `escalations` row.
- **Inter-agent communication:** employees loop colleagues in via
  `agent_messages` (e.g. Harper → Devon on a new agent hire); every action is
  logged to `EmployeeLog`.

## 5. Wiring the mailboxes (one-time, ~30 min)

Outbound (so replies come *from* support@/sales@/…):

1. Create a [Resend](https://resend.com) account, add domain `buildmybot.app`,
   and add the DNS records it gives you (SPF + DKIM).
2. Put the API key in Vercel as `RESEND_API_KEY`.

Inbound (so mail *to* those addresses reaches the AI):

1. Easiest: **Cloudflare Email Routing** (free, works even though mailboxes
   don't exist): add routes for support@, sales@, admin@, marketing@,
   agents@, careers@ → an Email Worker that POSTs
   `{to, from, subject, text}` as JSON to
   `https://www.buildmybot.app/api/email/inbound` with header
   `x-webhook-secret: <INBOUND_EMAIL_WEBHOOK_SECRET>`.
   (Mailgun inbound routes or Postmark inbound both work identically — the
   endpoint accepts their field names too.)
2. Keep president@buildmybot.app as a real human mailbox (Google Workspace or
   a Cloudflare route to your personal inbox) — escalations land there.

Verify:

```bash
# outbound transport
curl -X POST https://www.buildmybot.app/api/email/test \
  -H 'Cookie: bmb_session=<your admin session>' \
  -H 'Content-Type: application/json' -d '{"to":"president@buildmybot.app"}'

# full inbound → AI reply loop (simulates a customer email)
curl -X POST https://www.buildmybot.app/api/email/inbound \
  -H "x-webhook-secret: $INBOUND_EMAIL_WEBHOOK_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"to":"support@buildmybot.app","from":"you@example.com","subject":"Test","text":"How do I add a knowledge base to my bot?"}'
```

Admin visibility (session-authenticated, admin/owner role):
`GET /api/email/roster`, `GET /api/email/messages`, `GET /api/email/escalations`,
`GET /api/email/agent-messages`, `PATCH /api/email/escalations/:id` (resolve).
