-- Already applied directly via the Supabase Management API (2026-07-10) --
-- this file is documentation/mirror only, matching prior migrations.
-- One row per day: Don's daily briefing/direction for the whole AI team,
-- picked up by every role's getRoleContext() on their next shift.
create table if not exists manager_briefings (
  id uuid primary key default gen_random_uuid(),
  briefing_date date not null default current_date,
  content text not null,
  delivered_via text,
  created_at timestamptz not null default now()
);
create index if not exists manager_briefings_date_idx on manager_briefings (briefing_date desc);
