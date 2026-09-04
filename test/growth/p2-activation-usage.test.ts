/**
 * P2 sprint 1 — activation checklist + usage alerts / hard caps.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeActivation } from '../../api/growth/milestones.js';
import {
  currentPeriod,
  maybeSendUsageAlert,
  resolveUsageDecision,
} from '../../api/growth/usage-alerts.js';

const emptySources = {
  bots: [] as any[],
  knowledgeSourceCount: 0,
  integrations: [] as any[],
  phoneNumbers: [] as any[],
  milestones: {} as Record<string, string>,
};

describe('computeActivation', () => {
  it('reports 0/6 for a brand new account', () => {
    const state = computeActivation(emptySources);
    expect(state.completed).toBe(0);
    expect(state.total).toBe(6);
    expect(state.percent).toBe(0);
    expect(state.activated).toBe(false);
  });

  it('does not tick "train bot" for a bot with no knowledge sources', () => {
    const state = computeActivation({
      ...emptySources,
      bots: [{ id: 'b1' }],
    });
    expect(state.steps.find((s) => s.key === 'train_bot')?.done).toBe(false);
  });

  it('ticks "train bot" once a knowledge source exists', () => {
    const state = computeActivation({
      ...emptySources,
      bots: [{ id: 'b1' }],
      knowledgeSourceCount: 2,
    });
    expect(state.steps.find((s) => s.key === 'train_bot')?.done).toBe(true);
  });

  it('ticks widget install only when the bot is public/active', () => {
    expect(
      computeActivation({ ...emptySources, bots: [{ id: 'b1' }] }).steps.find(
        (s) => s.key === 'install_widget',
      )?.done,
    ).toBe(false);
    expect(
      computeActivation({
        ...emptySources,
        bots: [{ id: 'b1', is_public: true }],
      }).steps.find((s) => s.key === 'install_widget')?.done,
    ).toBe(true);
  });

  it('ticks test chat from the first_chat milestone, not from bot existence', () => {
    const state = computeActivation({
      ...emptySources,
      bots: [{ id: 'b1' }],
      milestones: { first_chat: '2026-09-04T00:00:00Z' },
    });
    expect(state.steps.find((s) => s.key === 'test_chat')?.done).toBe(true);
  });

  it('only counts a calendar integration that is actually connected', () => {
    expect(
      computeActivation({
        ...emptySources,
        integrations: [{ provider: 'google_calendar', status: 'pending' }],
      }).steps.find((s) => s.key === 'connect_calendar')?.done,
    ).toBe(false);
    expect(
      computeActivation({
        ...emptySources,
        integrations: [{ provider: 'google_calendar', status: 'connected' }],
      }).steps.find((s) => s.key === 'connect_calendar')?.done,
    ).toBe(true);
    // A connected non-calendar integration must not satisfy the step.
    expect(
      computeActivation({
        ...emptySources,
        integrations: [{ provider: 'slack', status: 'connected' }],
      }).steps.find((s) => s.key === 'connect_calendar')?.done,
    ).toBe(false);
  });

  it('reaches 100% and activated when every step is satisfied', () => {
    const state = computeActivation({
      bots: [{ id: 'b1', is_public: true, transfer_number: '+15550000000' }],
      knowledgeSourceCount: 1,
      integrations: [{ provider: 'calendly', status: 'connected' }],
      phoneNumbers: [{ id: 'p1', last_call_at: '2026-09-01T00:00:00Z' }],
      milestones: {
        first_chat: '2026-09-01T00:00:00Z',
        first_answered_call: '2026-09-02T00:00:00Z',
      },
    });
    expect(state.completed).toBe(6);
    expect(state.percent).toBe(100);
    expect(state.activated).toBe(true);
  });
});

describe('resolveUsageDecision', () => {
  it('allows normal usage below 70% with no threshold', () => {
    const d = resolveUsageDecision(10, 100);
    expect(d.allowed).toBe(true);
    expect(d.threshold).toBeNull();
    expect(d.percent).toBe(10);
  });

  it('reports the highest crossed threshold', () => {
    expect(resolveUsageDecision(70, 100).threshold).toBe(70);
    expect(resolveUsageDecision(89, 100).threshold).toBe(70);
    expect(resolveUsageDecision(90, 100).threshold).toBe(90);
    expect(resolveUsageDecision(100, 100).threshold).toBe(100);
  });

  it('hard-caps at the limit by default', () => {
    const d = resolveUsageDecision(100, 100);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('quota_exceeded');
  });

  it('allows overage when the tenant opted in, and reports the overage', () => {
    const d = resolveUsageDecision(130, 100, 'allow_overage');
    expect(d.allowed).toBe(true);
    expect(d.overage).toBe(30);
    expect(d.reason).toBeUndefined();
  });

  it('treats a zero limit as "not included in plan" and blocks', () => {
    expect(resolveUsageDecision(0, 0).allowed).toBe(false);
  });

  it('never blocks unlimited plans', () => {
    expect(resolveUsageDecision(1e6, Number.POSITIVE_INFINITY).allowed).toBe(
      true,
    );
    expect(resolveUsageDecision(1e6, -1).allowed).toBe(true);
  });
});

describe('maybeSendUsageAlert', () => {
  let claimed: any[];
  let sent: any[];
  let deps: any;

  beforeEach(() => {
    claimed = [];
    sent = [];
    deps = {
      claimAlert: vi.fn(async (row: any) => {
        // Emulate the unique index on (user, resource, period, threshold).
        const key = `${row.user_id}|${row.resource}|${row.period}|${row.threshold}`;
        if (claimed.includes(key)) return false;
        claimed.push(key);
        return true;
      }),
      sendEmail: vi.fn(async (opts: any) => {
        sent.push(opts);
      }),
      ownerEmail: vi.fn(async () => 'owner@example.com'),
    };
  });

  it('sends nothing below 70%', async () => {
    const r = await maybeSendUsageAlert(
      { userId: 'u1', resource: 'conversations', current: 5, limit: 100 },
      deps,
    );
    expect(r.sent).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('sends once per threshold per period', async () => {
    const args = {
      userId: 'u1',
      resource: 'conversations',
      current: 92,
      limit: 100,
    };
    const first = await maybeSendUsageAlert(args, deps);
    const second = await maybeSendUsageAlert(args, deps);
    expect(first.sent).toBe(true);
    expect(first.threshold).toBe(90);
    expect(second.sent).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('owner@example.com');
    expect(sent[0].subject).toContain('90%');
  });

  it('still sends the 100% alert after a 90% alert', async () => {
    await maybeSendUsageAlert(
      { userId: 'u1', resource: 'conversations', current: 92, limit: 100 },
      deps,
    );
    const r = await maybeSendUsageAlert(
      { userId: 'u1', resource: 'conversations', current: 100, limit: 100 },
      deps,
    );
    expect(r.sent).toBe(true);
    expect(r.threshold).toBe(100);
    expect(sent).toHaveLength(2);
  });

  it('never throws when the mailer fails', async () => {
    deps.sendEmail = vi.fn(async () => {
      throw new Error('resend down');
    });
    await expect(
      maybeSendUsageAlert(
        { userId: 'u1', resource: 'leads', current: 100, limit: 100 },
        deps,
      ),
    ).resolves.toEqual({ sent: false, threshold: null });
  });

  it('formats the period as YYYY-MM in UTC', () => {
    expect(currentPeriod(new Date('2026-09-04T02:00:00Z'))).toBe('2026-09');
    expect(currentPeriod(new Date('2026-01-31T23:59:59Z'))).toBe('2026-01');
  });
});
