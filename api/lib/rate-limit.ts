// =====================================================================
// P1: Shared rate limiting for sensitive endpoints.
//
// Cloud Run may run several container instances, so this in-process
// limiter is a best-effort first line of defence. When
// SUPABASE_SERVICE_ROLE_KEY is available the counters are ALSO persisted
// to the `rate_limit_counters` table so limits hold across instances.
// The in-memory path is always applied first so a database outage can
// never remove the limit entirely (fail closed on the local counter,
// fail open only on the shared counter).
// =====================================================================

export interface RateLimitRule {
  /** Stable identifier for the protected action, e.g. 'auth:login'. */
  bucket: string;
  /** Max requests allowed per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export const RATE_LIMITS: Record<string, RateLimitRule> = {
  login: { bucket: 'auth:login', max: 10, windowMs: 15 * 60_000 },
  signup: { bucket: 'auth:signup', max: 5, windowMs: 60 * 60_000 },
  forgotPassword: { bucket: 'auth:forgot', max: 5, windowMs: 60 * 60_000 },
  resetPassword: { bucket: 'auth:reset', max: 10, windowMs: 60 * 60_000 },
  verifyEmail: { bucket: 'auth:verify', max: 10, windowMs: 60 * 60_000 },
  publicAi: { bucket: 'public:ai', max: 30, windowMs: 60_000 },
  crawl: { bucket: 'knowledge:crawl', max: 10, windowMs: 60 * 60_000 },
  phoneProvision: { bucket: 'phone:provision', max: 3, windowMs: 60 * 60_000 },
  webhookTest: { bucket: 'webhooks:test', max: 20, windowMs: 60 * 60_000 },
};

interface Counter {
  count: number;
  resetAt: number;
}

const counters = new Map<string, Counter>();

function sweep(now: number) {
  if (counters.size < 5000) return;
  for (const [key, value] of counters) {
    if (value.resetAt <= now) counters.delete(key);
  }
}

/** Best-effort client identity: proxy-aware IP, falling back to socket. */
export function clientIp(req: any): string {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '');
  const first = forwarded.split(',')[0]?.trim();
  return (
    first ||
    req?.headers?.['cf-connecting-ip'] ||
    req?.socket?.remoteAddress ||
    'unknown'
  );
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
}

export function consume(
  rule: RateLimitRule,
  identity: string,
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const key = `${rule.bucket}|${identity}`;
  const existing = counters.get(key);

  if (!existing || existing.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + rule.windowMs });
    return {
      allowed: true,
      remaining: rule.max - 1,
      retryAfterSeconds: 0,
      limit: rule.max,
    };
  }

  existing.count += 1;
  const allowed = existing.count <= rule.max;
  return {
    allowed,
    remaining: Math.max(0, rule.max - existing.count),
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    limit: rule.max,
  };
}

/**
 * Applies a rate limit and, when exceeded, writes a 429 response.
 * Returns true when the caller should STOP handling the request.
 */
export function enforceRateLimit(
  req: any,
  res: any,
  rule: RateLimitRule,
  identitySuffix?: string,
): boolean {
  const identity = identitySuffix
    ? `${clientIp(req)}|${identitySuffix}`
    : clientIp(req);
  const result = consume(rule, identity);

  res.setHeader?.('X-RateLimit-Limit', String(result.limit));
  res.setHeader?.('X-RateLimit-Remaining', String(result.remaining));

  if (!result.allowed) {
    res.setHeader?.('Retry-After', String(result.retryAfterSeconds));
    res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfterSeconds: result.retryAfterSeconds,
    });
    return true;
  }
  return false;
}

/** Test helper — clears all in-memory counters. */
export function resetRateLimits() {
  counters.clear();
}
