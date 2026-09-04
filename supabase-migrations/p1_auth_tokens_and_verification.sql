-- =====================================================================
-- P1 hardening: single-use expiring auth tokens + email verification
-- =====================================================================

create table if not exists auth_tokens (
  id uuid primary key,
  user_id uuid not null,
  type text not null check (type in ('password_reset', 'email_verification')),
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists auth_tokens_token_hash_idx
  on auth_tokens (token_hash);
create index if not exists auth_tokens_user_type_idx
  on auth_tokens (user_id, type);
create index if not exists auth_tokens_expires_idx
  on auth_tokens (expires_at);

-- Email verification state on the user record.
alter table users add column if not exists email_verified boolean not null default false;
alter table users add column if not exists email_verified_at timestamptz;

-- Existing active accounts are grandfathered in so this rollout does not
-- lock out current customers; only accounts created from now on start
-- unverified.
update users set email_verified = true
  where email_verified = false and created_at < now();

-- Integrations must record how/when a connection was actually verified.
alter table integrations add column if not exists verified_at timestamptz;
alter table integrations add column if not exists verification_detail jsonb;
