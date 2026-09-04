/**
 * P2 — usage alerts (70/90/100%) and overage / hard-cap policy.
 *
 * Design notes:
 *  - Thresholds fire once per (tenant, resource, billing month, threshold).
 *    A unique index in the DB does the deduping, so concurrent requests
 *    can't double-send.
 *  - The cap decision is a pure function (`resolveUsageDecision`) so the
 *    behaviour is testable and identical everywhere it's enforced. Before
 *    this, `checkQuota` returned `allowed` and *nobody called it* for
 *    conversations — the advertised monthly conversation limit was not
 *    enforced at all.
 *  - Default policy is HARD_CAP: we block rather than silently bill.
 *    `users.overage_policy = 'allow_overage'` opts a tenant into billed
 *    overage instead.
 */
import crypto from 'node:crypto';

export const USAGE_THRESHOLDS = [70, 90, 100] as const;

export type OveragePolicy = 'hard_cap' | 'allow_overage';

export interface UsageDecision {
  allowed: boolean;
  /** 0-100+, capped at 999 for display sanity. */
  percent: number;
  /** Highest threshold crossed, or null. */
  threshold: number | null;
  overage: number;
  reason?: 'quota_exceeded';
}

export function resolveUsageDecision(
  current: number,
  limit: number,
  policy: OveragePolicy = 'hard_cap',
): UsageDecision {
  // limit <= 0 means "not sold on this plan" for phone minutes, but for
  // unlimited plans the constants use Infinity / -1. Treat both explicitly
  // rather than dividing by zero.
  if (limit === Number.POSITIVE_INFINITY || limit === -1) {
    return { allowed: true, percent: 0, threshold: null, overage: 0 };
  }
  if (limit <= 0) {
    return {
      allowed: false,
      percent: 100,
      threshold: 100,
      overage: current,
      reason: 'quota_exceeded',
    };
  }

  const percent = Math.min(999, Math.round((current / limit) * 100));
  const crossed = USAGE_THRESHOLDS.filter((t) => percent >= t);
  const threshold = crossed.length ? crossed[crossed.length - 1] : null;
  const overage = Math.max(0, current - limit);
  const atCap = current >= limit;

  return {
    allowed: !atCap || policy === 'allow_overage',
    percent,
    threshold,
    overage,
    ...(atCap && policy === 'hard_cap'
      ? { reason: 'quota_exceeded' as const }
      : {}),
  };
}

export function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface AlertDeps {
  /** Returns true if this alert row was newly claimed (i.e. not already sent). */
  claimAlert: (row: {
    id: string;
    user_id: string;
    resource: string;
    threshold: number;
    period: string;
    current: number;
    limit_value: number;
  }) => Promise<boolean>;
  sendEmail: (opts: {
    to: string;
    subject: string;
    text: string;
  }) => Promise<unknown>;
  ownerEmail: () => Promise<string | null>;
}

const COPY: Record<number, { subject: string; body: (r: string, c: number, l: number) => string }> = {
  70: {
    subject: "You've used 70% of your BuildMyBot {resource}",
    body: (r, c, l) =>
      `Heads up — you've used ${c} of ${l} ${r} this month (70%).\n\nNothing is blocked. If you expect to keep this pace, upgrading now avoids an interruption later: https://buildmybot.app/app/billing`,
  },
  90: {
    subject: "You're at 90% of your BuildMyBot {resource}",
    body: (r, c, l) =>
      `You've used ${c} of ${l} ${r} this month (90%).\n\nAt 100% new ${r} will stop unless you upgrade or enable overage: https://buildmybot.app/app/billing`,
  },
  100: {
    subject: "You've reached your BuildMyBot {resource} limit",
    body: (r, c, l) =>
      `You've used all ${l} ${r} included in your plan this month.\n\nNew ${r} are paused until your limit resets or you upgrade: https://buildmybot.app/app/billing\n\nIf you'd rather keep running and pay for overage, turn on overage billing in Billing settings.`,
  },
};

/**
 * Fire the alert for the highest crossed threshold, once per period.
 * Best-effort — never throws into the caller's request path.
 */
export async function maybeSendUsageAlert(
  params: {
    userId: string;
    resource: string;
    current: number;
    limit: number;
    policy?: OveragePolicy;
    now?: Date;
  },
  deps: AlertDeps,
): Promise<{ sent: boolean; threshold: number | null }> {
  try {
    const decision = resolveUsageDecision(
      params.current,
      params.limit,
      params.policy,
    );
    if (decision.threshold === null) return { sent: false, threshold: null };

    const period = currentPeriod(params.now);
    const claimed = await deps.claimAlert({
      id: crypto.randomUUID(),
      user_id: params.userId,
      resource: params.resource,
      threshold: decision.threshold,
      period,
      current: params.current,
      limit_value: params.limit,
    });
    if (!claimed) return { sent: false, threshold: decision.threshold };

    const email = await deps.ownerEmail();
    if (!email) return { sent: false, threshold: decision.threshold };

    const copy = COPY[decision.threshold];
    const label = params.resource.replace(/_/g, ' ');
    await deps.sendEmail({
      to: email,
      subject: copy.subject.replace('{resource}', label),
      text: copy.body(label, params.current, params.limit),
    });
    return { sent: true, threshold: decision.threshold };
  } catch (err) {
    console.error('[usage-alerts] failed:', err);
    return { sent: false, threshold: null };
  }
}
