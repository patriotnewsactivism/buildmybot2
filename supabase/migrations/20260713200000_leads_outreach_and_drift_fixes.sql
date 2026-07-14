-- ═══════════════════════════════════════════════════════════════════════
-- Migration: Leads Outreach Tracking + Schema Drift Fixes
-- Date: 2026-07-13
-- ═══════════════════════════════════════════════════════════════════════
--
-- Phase 0: Fix schema-code drift (columns that code references but don't
--   exist in the live database yet).
-- Phase 1: Add outreach/contact tracking to the leads table so agents
--   can document their entire outreach process.
--
-- IMPORTANT: This migration is idempotent — every ALTER TABLE uses
-- IF NOT EXISTS so it's safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Phase 0: Drift Fixes ────────────────────────────────────────────

-- leads.source — free-text source field for lead attribution (code already
-- references this in timeline, analytics, and lead capture). source_bot_id
-- tracks the bot; source tracks the channel/campaign.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source varchar(255);

-- leads.replied_at — timestamp when the lead replied to outreach. Used by
-- the lead-followup cron worker to avoid double-mailing.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS replied_at timestamptz;

-- leads.follow_up_sent_at — timestamp of last automated follow-up. Used by
-- the lead-followup cron worker to find leads needing a nudge.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_sent_at timestamptz;

-- leads.last_ai_action_at — when the AI team last acted on this lead.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_ai_action_at timestamptz;

-- leads.ai_notes — freeform notes written by AI agents during outreach.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_notes text;

-- users.trial_started_at / trial_ends_at — the trial system in gateway.ts
-- reads and writes these but they were never created.
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- ─── Phase 1: Outreach Tracking Columns ──────────────────────────────

-- When was this lead last contacted (by any method)?
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;

-- How was the lead contacted? (email, call, sms, etc.)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_method varchar(50);

-- How many times has this lead been contacted?
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_count integer DEFAULT 0;

-- Full outreach log — every touchpoint documented by agents.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes text;

-- When should we follow up next?
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_followup_at timestamptz;

-- URL to the call transcript (from Twilio recording/transcription).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_transcript_url text;

-- Thread ID linking to the email conversation (for threading replies).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_thread_id text;

-- ─── Indexes for outreach queries ────────────────────────────────────

-- The lead-followup worker queries: replied_at IS NULL AND follow_up_sent_at IS NULL AND created_at < cutoff
CREATE INDEX IF NOT EXISTS idx_leads_followup_due
  ON leads (created_at)
  WHERE replied_at IS NULL AND follow_up_sent_at IS NULL;

-- The sales agent queries leads by next_followup_at
CREATE INDEX IF NOT EXISTS idx_leads_next_followup
  ON leads (next_followup_at)
  WHERE next_followup_at IS NOT NULL;

-- Quick lookup by contact_method for reporting
CREATE INDEX IF NOT EXISTS idx_leads_contact_method
  ON leads (contact_method)
  WHERE contact_method IS NOT NULL;
