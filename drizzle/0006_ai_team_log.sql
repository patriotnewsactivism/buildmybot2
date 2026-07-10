-- Run this in the Supabase SQL Editor (same DB used by leads/email_messages).
-- Mirrors the Base44 AITeamLog entity so the native Vercel/Supabase AI Team
-- automation (api/cron/*.ts) has its own persistent "learning" log.

create table if not exists ai_team_log (
  id uuid primary key default gen_random_uuid(),
  role_id text not null,
  role_name text not null,
  shift_date date not null,
  summary text,
  flags text default '',
  tasks_completed integer default 0,
  escalated_to text default '',
  created_at timestamptz not null default now()
);

create index if not exists ai_team_log_role_id_idx on ai_team_log (role_id);
create index if not exists ai_team_log_shift_date_idx on ai_team_log (shift_date);
