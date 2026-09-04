/**
 * P2 — first-value event tracking + activation state.
 *
 * Two distinct things live here and they are deliberately separate:
 *
 *  1. MILESTONES  — "first time value happened" (first chat, first lead,
 *     first answered call, first appointment). Recorded exactly once per
 *     tenant, at the moment it happens, so time-to-first-value is a real
 *     measurement and not something we back-compute from mutable tables.
 *
 *  2. ACTIVATION STEPS — "is the account set up" (trained, widget installed,
 *     chat tested, calendar connected, transfer configured, test call made).
 *     These are derived on read from live data, because a customer can undo
 *     them (disconnect a calendar, delete a bot) and the checklist must tell
 *     the truth rather than stay ticked forever.
 *
 * Every write here is best-effort: instrumentation must never break the
 * request that produced the value.
 */
import crypto from 'node:crypto';
import { supabaseFetch, trackAnalyticsEvent } from '../ai-team/lib.js';

export const MILESTONES = [
  'first_chat',
  'first_lead',
  'first_answered_call',
  'first_appointment',
] as const;

export type Milestone = (typeof MILESTONES)[number];

export interface MilestoneInput {
  milestone: Milestone;
  userId: string;
  organizationId?: string | null;
  botId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Record a first-value milestone. Idempotent: the unique index on
 * (user_id, milestone) makes the second and later calls no-ops, so callers
 * can fire this on *every* chat/lead/call without checking first.
 *
 * Returns true only when this call is the one that created the milestone —
 * that's the signal worth reacting to (congrats email, activation nudge).
 */
export async function recordMilestone(input: MilestoneInput): Promise<boolean> {
  if (!input.userId) return false;
  if (!MILESTONES.includes(input.milestone)) return false;

  try {
    const res = await fetch(
      `${process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL}/rest/v1/activation_milestones`,
      {
        method: 'POST',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          user_id: input.userId,
          organization_id: input.organizationId ?? null,
          milestone: input.milestone,
          bot_id: input.botId ?? null,
          metadata: input.metadata ?? {},
        }),
      },
    );

    // 409 = the milestone already exists. That is the expected outcome for
    // every event after the first and is NOT an error.
    if (res.status === 409) return false;
    if (!res.ok) {
      console.error(
        `[milestones] insert failed (${input.milestone}):`,
        res.status,
      );
      return false;
    }

    await trackAnalyticsEvent({
      eventType: `milestone_${input.milestone}`,
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      botId: input.botId ?? null,
      eventData: input.metadata ?? {},
    });
    return true;
  } catch (err) {
    console.error('[milestones] record failed:', err);
    return false;
  }
}

export async function listMilestones(
  userId: string,
): Promise<Record<string, string>> {
  const rows = await supabaseFetch(
    'activation_milestones',
    `select=milestone,achieved_at&user_id=eq.${encodeURIComponent(userId)}`,
  ).catch(() => null);
  const out: Record<string, string> = {};
  for (const row of rows || []) out[row.milestone] = row.achieved_at;
  return out;
}

// ── Activation checklist ────────────────────────────────────────────

export interface ActivationStep {
  key: string;
  label: string;
  description: string;
  done: boolean;
  /** Where the UI should send the user to finish this step. */
  href: string;
}

export interface ActivationState {
  steps: ActivationStep[];
  completed: number;
  total: number;
  percent: number;
  activated: boolean;
  milestones: Record<string, string>;
}

interface ActivationSources {
  bots: Array<Record<string, any>>;
  knowledgeSourceCount: number;
  integrations: Array<Record<string, any>>;
  phoneNumbers: Array<Record<string, any>>;
  milestones: Record<string, string>;
}

const CALENDAR_PROVIDERS = ['google_calendar', 'calendly', 'cal_com', 'outlook_calendar'];

/**
 * Pure function so the rules are testable without a database.
 */
export function computeActivation(sources: ActivationSources): ActivationState {
  const bots = sources.bots || [];
  const hasBot = bots.length > 0;

  const trained = sources.knowledgeSourceCount > 0;

  // "Installed" means the widget actually ran somewhere: either the bot was
  // published/embedded, or a conversation arrived from a non-preview session.
  const widgetInstalled = bots.some(
    (b) => b.is_public === true || b.status === 'active' || b.embed_installed_at,
  );

  const calendarConnected = (sources.integrations || []).some(
    (i) =>
      CALENDAR_PROVIDERS.includes(String(i.provider || i.type || '').toLowerCase()) &&
      (i.status === 'connected' || i.connected === true),
  );

  const transferConfigured = bots.some(
    (b) => !!(b.transfer_number || b.escalation_number || b.transfer_enabled),
  );

  const steps: ActivationStep[] = [
    {
      key: 'train_bot',
      label: 'Train your bot',
      description: 'Add a website, document or FAQ so the bot knows your business.',
      done: hasBot && trained,
      href: '/app/bots',
    },
    {
      key: 'install_widget',
      label: 'Install the widget',
      description: 'Drop the embed snippet on your site so visitors can chat.',
      done: widgetInstalled,
      href: '/app/bots',
    },
    {
      key: 'test_chat',
      label: 'Test a chat',
      description: 'Send a real message and check the answer.',
      done: !!sources.milestones.first_chat,
      href: '/app/conversations',
    },
    {
      key: 'connect_calendar',
      label: 'Connect your calendar',
      description: 'Let the bot book appointments straight into your calendar.',
      done: calendarConnected,
      href: '/app/settings',
    },
    {
      key: 'configure_transfer',
      label: 'Configure call transfer',
      description: 'Set the number a caller is transferred to when they ask for a human.',
      done: transferConfigured,
      href: '/app/phone',
    },
    {
      key: 'test_call',
      label: 'Make a test call',
      description: 'Call your AI receptionist and hear it answer.',
      done:
        !!sources.milestones.first_answered_call ||
        (sources.phoneNumbers || []).some((p) => p.last_call_at),
      href: '/app/phone',
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  return {
    steps,
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
    activated: completed === steps.length,
    milestones: sources.milestones,
  };
}
