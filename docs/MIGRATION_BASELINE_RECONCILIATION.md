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

## Stop conditions

Stop and do not migrate if any of the following is true:

- the live migration-history relation is missing or inconsistent;
- a repository migration would create a relation that already exists but is not byte-for-byte/semantically reconciled;
- a dry-run proposes destructive statements that have not been specifically reviewed;
- the active project ref is anything other than the intended production project;
- RLS, grants, SECURITY DEFINER ownership, or service-role boundaries would be weakened;
- a migration depends on credentials, provider state, or external resources that have not been verified.

The goal is to establish a trustworthy baseline once, not to force the database to resemble Git by replaying history blindly.
