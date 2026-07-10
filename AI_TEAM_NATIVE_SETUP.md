# AI Team — Native Vercel/Supabase Automation Setup

This replicates the Base44 AI Team automation directly inside buildmybot2's own
stack — no Base44 credit ceiling, just usage-based LLM billing (cents/day with
a free-tier model like Groq).

## What's here
- `api/ai-team/lib.ts` — shared engine: LLM calls (swappable provider), context
  gathering (Supabase `ai_team_log` + leads/email_messages/Stripe), shift logging,
  Slack notification.
- `api/cron/*.ts` — one thin route per role (13 total), each calling
  `runRoleShift(roleId, roleName, systemPrompt)`.
- `vercel.json` — added a rewrite exception so `/api/cron/*` isn't swallowed by
  the existing `/api/gateway` catch-all, plus 13 new `crons` entries (UTC times,
  converted from the America/Chicago schedule used in Base44).
- `drizzle/0006_ai_team_log.sql` — the log table, run once in Supabase SQL Editor.

## Setup checklist (do these before deploying)

1. **Run the SQL migration** in Supabase SQL Editor: `drizzle/0006_ai_team_log.sql`.

2. **Add environment variables in Vercel** (Project Settings → Environment Variables):
   - `CRON_SECRET` — any random string; Vercel automatically sends it as
     `Authorization: Bearer <value>` to your cron routes, and the routes check it.
   - `GROQ_API_KEY` — free tier, recommended default (fast Llama 3.3 70B). Get one
     at console.groq.com — no credit card needed for the free tier.
     (Or set `AI_TEAM_LLM_PROVIDER=gemini` + `GEMINI_API_KEY`, or leave unset to
     fall back to your existing `OPENAI_API_KEY`.)
   - `SLACK_WEBHOOK_URL` — optional, for daily digest + per-shift pings in Slack.
     Create one at api.slack.com/apps → Incoming Webhooks (2 minutes, no OAuth).
   - `BUILDMYBOT_STRIPE_SECRET_KEY` — buildmybot2's LIVE Stripe secret key, so
     Brianna's billing shift reports real subscription data instead of a
     placeholder. (Already have this from production — same key used for
     `stripe-webhook.ts`.)
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — already set in prod, reused as-is.

3. **Check your Vercel plan's cron limits.** Hobby plan caps at 2 cron jobs and
   daily-only granularity. This adds 13 more crons at specific times — you'll
   need Vercel Pro (or consolidate several roles into fewer cron entries that
   loop through multiple roles in one call) if still on Hobby.

4. **Deploy**: `vercel deploy --prod`.

## Why this design
- Uses your existing OpenAI-compatible-endpoint trick to swap LLM providers
  with zero code changes — start free (Groq/Gemini), upgrade to OpenAI per-role
  later if quality needs it.
- Same "read context → reason → log" pattern as the Base44 version, so nothing
  about the actual automation logic changed — just where it runs.
- Brianna and Eli are still honest placeholders until Stripe/system-health data
  is wired in (Brianna's Stripe piece is now built above; Eli's system-health
  source is still an open TODO — no monitoring API exists yet to pull from).
