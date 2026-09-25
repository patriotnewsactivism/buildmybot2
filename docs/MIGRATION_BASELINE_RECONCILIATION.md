# Production Supabase Migration Baseline Reconciliation

Status: **REQUIRED BEFORE ANY PRODUCTION `supabase db push`**

Production project ref: `blyebndyrojmreensbxe`

## Why this is held

During the 2026-09-05 production audit, the live project already contained BuildMyBot application relations, but the Supabase CLI migration-history relation was not present/usable. That means the repository's migration files cannot safely be treated as a list of unapplied changes. A blind `supabase db push` could attempt to recreate or alter objects that already exist.

The application release may proceed without applying migrations. Database migration execution stays held until the live schema and repository history are reconciled.

## Required reconciliation procedure

1. **Freeze automatic migration writes.** Keep `.github/workflows/supabase-migrations.yml` audit-only. Do not add `db push`, `migration up`, destructive reset, or schema recreation commands to production automation.
2. **Inventory the live schema.** Capture tables, columns, indexes, constraints, policies, functions, triggers, extensions, grants, and RLS state from `blyebndyrojmreensbxe`.
3. **Inventory repository migrations.** Review every migration under `supabase/migrations/` in version order and identify the exact live objects each migration is expected to create or alter.
4. **Reconcile object-by-object.** Classify each migration as:
   - already represented exactly in production;
   - partially represented and requiring a reviewed corrective migration;
   - genuinely pending;
   - obsolete/superseded and not safe to replay.
5. **Create a baseline record only after reconciliation.** For migrations proven to be already represented in production, initialize/repair Supabase migration history using the supported Supabase CLI migration-repair mechanism. Do not mark a migration applied merely because its filename is old.
6. **Dry-run after the baseline exists.** Only after migration history and live schema agree, run a linked dry-run and inspect every planned statement. A dry-run that proposes recreation of existing application objects is a failed baseline and must not be applied.
7. **Apply only reviewed deltas.** Re-enable production migration execution only when the dry-run contains the intended additive/corrective changes and no unexplained drift.
8. **Verify after application.** Re-run migration history, schema/RLS/security audits, application tests, and the public health check.

## September 5 release-specific migrations

The repository contains the SMS/automation release migrations, including SMS accounts, programs, contacts, jobs, appointment reminders, Text-to-Win contest records, billing periods, and related service-role functions. Their presence in Git does **not** prove they are absent from or safe to replay against the live database.

Do not apply these migrations until the baseline procedure above establishes whether each relation/function is already present in production.

## Pending reviewed delta: email verification (2026-09-25)

File: `supabase/migrations/20260925120000_auth_tokens_and_email_verification.sql`

Status: **genuinely pending** on production `blyebndyrojmreensbxe`. It replaces the untimestamped `p1_auth_tokens_and_verification.sql` draft, which was never applied. The live symptom was signup HTTP 500: PostgREST `PGRST204` because `users.email_verified` is not in the schema cache.

This file is not part of the historical baseline. Do not mark it applied during migration-history repair. Do not include it in a blind `supabase db push` or a full replay. Application signup is written to succeed while the column is absent; verification tokens start working once this file has been applied.

After steps 1–6 above, and only when a linked dry-run's remaining delta is this additive file (or history has been repaired and this file is the reviewed change), Matthew applies it manually:

1. Confirm the target project ref is `blyebndyrojmreensbxe` and no other project.
2. Apply **only this file's SQL** in one transaction (Supabase SQL editor as a single script, or `psql` with the file). Do not run the rest of `supabase/migrations/`.
3. The script ends with `NOTIFY pgrst, 'reload schema';`, which is delivered on commit. If the client suppresses notifications, run that `NOTIFY` once in the SQL editor after the script commits.
4. Confirm `public.users.email_verified`, `public.users.email_verified_at`, and `public.auth_tokens` exist, and that `auth_tokens` has RLS enabled with privileges limited to `service_role`.
5. Re-running the same file must be a no-op for data: existing verified and unverified rows stay as they are because the grandfather is guarded by the `email_verified` column comment. Confirm a newly created unverified user is not flipped to `email_verified = true` by a second run.
6. Smoke-test signup against production: `201`, the new row has `email_verified = false`, and a verification token can be issued. Existing customers grandfathered by the first run stay `email_verified = true`.
7. Record the version in Supabase migration history only after the SQL has actually committed (`supabase migration repair --status applied 20260925120000`), and only once the CLI history table itself is trustworthy. Do not repair this version as applied before the statements have run.

Until that apply, do not treat a green application deploy as proof that email verification persistence is live.

## Stop conditions

Stop and do not migrate if any of the following is true:

- the live migration-history relation is missing or inconsistent;
- a repository migration would create a relation that already exists but is not byte-for-byte/semantically reconciled;
- a dry-run proposes destructive statements that have not been specifically reviewed;
- the active project ref is anything other than the intended production project;
- RLS, grants, SECURITY DEFINER ownership, or service-role boundaries would be weakened;
- a migration depends on credentials, provider state, or external resources that have not been verified.

The goal is to establish a trustworthy baseline once, not to force the database to resemble Git by replaying history blindly.
