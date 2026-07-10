-- Run this in the Supabase SQL Editor (same DB as leads/ai_team_log).
-- Staging table for the Lead Researcher role's cold-outbound finds. Kept
-- separate from `leads` (which is real inbound signups captured by
-- BuildMyBot's own marketing-site bot, with FKs to bots/organizations/users
-- that a researched cold lead has no real value for).

create table if not exists researched_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  website text not null,
  industry text,
  city text,
  why_good_fit text,
  suggested_angle text,
  source_query text,
  status text not null default 'new',
  surfaced_to_sales_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists researched_leads_website_idx on researched_leads (website);
create index if not exists researched_leads_status_idx on researched_leads (status);
