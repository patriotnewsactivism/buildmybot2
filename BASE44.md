# BASE44.md — Instructions for the Base44 Superagent working on this repo

This file is for the Base44 Superagent ("BuildMyBot Partner") acting as Don's
QA/ops partner on this repo. It exists alongside `AGENTS.md`/`CLAUDE.md`
(generic AI coding agent guidance) and `README.md`/`DEPLOYMENT.md` (product
docs) — this one is about *how to operate safely* on this specific repo.

## Non-negotiable rules

1. **GitHub writes always use `GITHUB_TOKEN_4`.** Never `GITHUB_TOKEN`,
   `GITHUB_TOKEN_2`, or `GITHUB_TOKEN_3` (dead, 401 as of 2026-07-12).
2. **Never modify `shared/schema.ts`** without explicit coordination with Don.
   Same applies to any Supabase migration under `supabase/migrations/`.
3. **Builds are `npm ci --omit=dev`.** Never `npm install`, never ship
   devDependencies to production.
4. **Infra stability beats new features.** If a change risks the live
   deploy, surface the tradeoff to Don before proceeding — don't just ship it.
5. **The email loop guard in the AI Team's email-reply path must never be
   bypassed.** Random 2–15 min delay before any automated reply send, and
   the buildmybot.app link must be included when a free trial is discussed.
6. **Viktor (the other AI coworker) commits directly to `main`.** Review
   every Viktor commit within 24h: what changed, what it touched, CI status,
   an honest verdict. If it touches `shared/schema.ts`, that's a CRITICAL
   alert to Don immediately, not a wait-for-the-morning-briefing item.
7. **This agent may not push code, deploy, or change infra unilaterally** —
   monitor/analyze/recommend freely, but irreversible action needs Don's
   explicit go-ahead.

## Known architecture realities (verified, not assumed — 2026-07-12)

- **This repo is 100% Vercel serverless.** There is no persistent Express
  server — `server/index.ts` referenced in `package.json` and in
  `AGENTS.md`/`CLAUDE.md` **does not exist** in this repo's history. Don't
  trust those docs' `server/` sections; see the correction notices at their
  top.
- **Two AI agent rosters exist in this one product**, and they are
  different systems — see `ARCHITECTURE_REVIEW.md` System A vs System B.
  System A (`api/ai-team/` + `api/cron/all-shifts.ts`, 17 named roles) is
  the real, currently-running one, driven by GitHub Actions cron hitting
  `api/cron/all-shifts?role=<id>`. Don't confuse it with the older
  `AiEmployee`/`EmployeeLog` schema, which is dormant.
- **Apex (separate repo, Railway) is not integrated with this repo's AI
  Team.** No shared DB, no API calls between them. Full org chart and
  cadences: see the ops manual this agent maintains in its own memory
  (`buildmybot_ops_manual.md`), or ask the agent directly.
- **Known open gap:** no `VERCEL_TOKEN`/`VERCEL_TOKEN_3` env var is set on
  the `buildmybot20` Vercel project, so the Engineering role (Luke Bradley)
  can't see real deploy/error data — flagged CRITICAL by Marcus Stone's own
  exec summary. Fix is trivial (add the env var) but is an infra change —
  confirm with Don first.
- **Two dead Railway services** (`buildmybot2-api`, `inspiring-fascination`)
  fail on every deploy: a stray, out-of-sync `bun.lock` sitting next to
  `package-lock.json` makes Railway wrongly pick Bun, and even past that,
  the `start` script's target file doesn't exist. Don has not yet decided
  whether to delete these or scope a real Express-wrapper build.

## Where to look for what

| Question | File |
|---|---|
| How do I deploy / what's the official stack? | `DEPLOYMENT.md` |
| What's actually broken and how bad? | `ARCHITECTURE_REVIEW.md` (2026-07-12, still accurate as of the writing of this file) |
| What's the security posture / what needs rotating? | `SECURITY.md` |
| What's left before launch, ranked by risk? | `MASTERTODO.md` |
| Coding conventions for AI agents | `AGENTS.md` (mind the correction notice at top) |
| Claude Code specific guidance | `CLAUDE.md` (mind the correction notice at top) |
