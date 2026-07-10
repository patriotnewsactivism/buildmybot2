-- Already applied directly via the Supabase Management API (2026-07-10) --
-- this file is documentation/mirror only, matching the pattern of prior
-- migrations in this folder.
alter table researched_leads add column if not exists researched_by text default 'Sarah Collins';
