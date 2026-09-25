-- Email verification columns and single-use auth tokens.
--
-- Production status: PENDING on Supabase project blyebndyrojmreensbxe.
-- Do not apply this file with `supabase db push` while
-- docs/MIGRATION_BASELINE_RECONCILIATION.md is in force. After that
-- baseline is reconciled, apply this file alone (see that doc), then
-- confirm PostgREST reloaded its schema cache. The NOTIFY at the end
-- is delivered when the migration transaction commits.
--
-- Re-run safety:
-- * CREATE TABLE, CREATE INDEX, and ADD COLUMN all use IF NOT EXISTS.
-- * Existing accounts are marked email_verified = true only on the first
--   successful introduction of the column. A column comment records that
--   the grandfather ran. A later re-run sees the comment and does not
--   flip later unverified signups to verified.
-- * If some rows are already verified and the comment is missing (a
--   non-production database applied the old untimestamped file), the
--   backfill is skipped so unverified accounts stay unverified.
-- * auth_tokens is service-role only. anon/authenticated receive no grants.
--
-- public.users.id is text in this database (see
-- 20260710200100_trial_and_billing_fields.sql). auth_tokens.user_id is
-- text for the same reason. This file was never applied to production;
-- the previous untimestamped draft is replaced by this version.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.auth_tokens (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('password_reset', 'email_verification')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_tokens_token_hash_idx
  ON public.auth_tokens (token_hash);
CREATE INDEX IF NOT EXISTS auth_tokens_user_type_idx
  ON public.auth_tokens (user_id, type);
CREATE INDEX IF NOT EXISTS auth_tokens_expires_idx
  ON public.auth_tokens (expires_at);

ALTER TABLE public.auth_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.auth_tokens TO service_role;

COMMENT ON TABLE public.auth_tokens IS
  'Single-use hashed password-reset and email-verification tokens. Raw tokens are never stored. Service-role access only.';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- One-time grandfather. Must stay behind the marker check so re-runs do
-- not treat every not-yet-verified signup as a pre-existing account.
DO $grandfather$
DECLARE
  marker text;
  any_verified boolean;
BEGIN
  SELECT pg_catalog.col_description('public.users'::regclass, a.attnum)
    INTO marker
  FROM pg_catalog.pg_attribute AS a
  WHERE a.attrelid = 'public.users'::regclass
    AND a.attname = 'email_verified'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF marker LIKE 'auth-verification grandfather applied%' THEN
    RAISE NOTICE 'email_verified grandfather already recorded; leaving rows unchanged';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE email_verified IS TRUE
  ) INTO any_verified;

  IF COALESCE(any_verified, false) THEN
    RAISE NOTICE 'email_verified is already true for at least one user; not rewriting unverified rows';
  ELSE
    -- First introduction of the column: every account that already exists
    -- predates verification and must keep working. Inserts that commit
    -- after this transaction are not part of this UPDATE.
    UPDATE public.users
      SET email_verified = true
      WHERE email_verified IS NOT TRUE;
  END IF;

  COMMENT ON COLUMN public.users.email_verified IS
    'auth-verification grandfather applied; later unverified signups stay unverified until they confirm';
END
$grandfather$;

-- Integration verification columns ship with this same auth-hardening
-- change. Skip cleanly when the table is not present yet.
DO $integrations$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'integrations'
  ) THEN
    ALTER TABLE public.integrations
      ADD COLUMN IF NOT EXISTS verified_at timestamptz;
    ALTER TABLE public.integrations
      ADD COLUMN IF NOT EXISTS verification_detail jsonb;
  END IF;
END
$integrations$;

RESET lock_timeout;

NOTIFY pgrst, 'reload schema';
