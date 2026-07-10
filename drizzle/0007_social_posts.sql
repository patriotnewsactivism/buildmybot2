-- Run this in the Supabase SQL Editor (same DB used by ai_team_log/leads/email_messages).
-- Backs Frankie Mercer's (Social Media Manager) drafting + publishing queue.
-- Every post/reply Frankie writes gets a row here, whether or not it actually
-- went out -- status='draft_awaiting_credentials' until real platform API
-- keys are configured (see AI_TEAM_NATIVE_SETUP.md), then 'published'/'failed'.

create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null, -- 'twitter' | 'linkedin'
  content text not null,
  post_type text not null default 'post', -- 'post' | 'reply'
  in_reply_to_id text,
  status text not null default 'draft_awaiting_credentials', -- draft_awaiting_credentials | published | failed
  external_post_id text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists social_posts_platform_idx on social_posts (platform);
create index if not exists social_posts_status_idx on social_posts (status);
create index if not exists social_posts_created_at_idx on social_posts (created_at desc);
