import crypto from 'node:crypto';

export type MeasurementClass =
  | 'MEASURED'
  | 'ESTIMATED'
  | 'INFERRED'
  | 'UNKNOWN';

export interface PortfolioOutcomeEvent {
  schemaVersion?: 1;
  idempotencyKey: string;
  source: string;
  organizationId: string;
  tenantId: string;
  occurredAt?: string;
  traceId?: string;
  intent?: string;
  activity: {
    eventType: string;
    responsibleAgentId?: string;
    responsibleWorkflow?: string;
    agentRunId?: string;
    workflowRunId?: string;
    humanIntervention?: boolean;
  };
  entity?: {
    type: string;
    externalId: string;
    name?: string;
    attributes?: Record<string, unknown>;
  };
  outcome?: {
    outcomeType: string;
    metricName: string;
    baseline?: number | string | boolean | null;
    target?: number | string | boolean | null;
    measuredResult?: number | string | boolean | null;
    unit?: string;
    classification: MeasurementClass;
    confidence?: number;
    attributedRevenue?: number;
    influencedRevenue?: number;
    directCost?: number;
    estimatedLaborSavedHours?: number;
    qualityScore?: number;
    status?: string;
    evidence?: Record<string, unknown>;
  };
  revenueEvents?: Array<{
    idempotencyKey?: string;
    amount: number;
    currency?: string;
    kind: 'sourced' | 'influenced' | 'recognized' | 'refund';
    classification: MeasurementClass;
    customerExternalId?: string;
    opportunityExternalId?: string;
    evidence?: Record<string, unknown>;
  }>;
  costEvents?: Array<{
    idempotencyKey?: string;
    amount: number;
    currency?: string;
    category:
      | 'ai_provider'
      | 'telephony'
      | 'sms'
      | 'infra'
      | 'human_labor'
      | 'other';
    provider?: string;
    classification: MeasurementClass;
    evidence?: Record<string, unknown>;
  }>;
  experiment?: {
    experimentId: string;
    cohort: string;
    metricName: string;
    value: number;
    classification: MeasurementClass;
    confidence?: number;
  };
  metadata?: Record<string, unknown>;
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APEX_OUTCOME_LEDGER_URL =
  process.env.APEX_OUTCOME_LEDGER_URL?.trim() || '';
const APEX_OUTCOME_INGEST_TOKEN =
  process.env.APEX_OUTCOME_INGEST_TOKEN?.trim() || '';

function ingestUrl(): string | null {
  if (!APEX_OUTCOME_LEDGER_URL) return null;
  if (/\/outcome-ledger\/events\/?$/.test(APEX_OUTCOME_LEDGER_URL)) {
    return APEX_OUTCOME_LEDGER_URL.replace(/\/$/, '');
  }
  return `${APEX_OUTCOME_LEDGER_URL.replace(/\/$/, '')}/api/learning/outcome-ledger/events`;
}

function serviceHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function validateEvent(event: PortfolioOutcomeEvent): void {
  if (!event.idempotencyKey || event.idempotencyKey.length < 8) {
    throw new Error('Outcome event requires a durable idempotencyKey');
  }
  if (!event.organizationId || !event.tenantId) {
    throw new Error('Outcome event requires organizationId and tenantId');
  }
  if (!event.activity?.eventType) {
    throw new Error('Outcome event requires activity.eventType');
  }
  const numericClaims = [
    event.outcome?.attributedRevenue,
    event.outcome?.influencedRevenue,
    event.outcome?.directCost,
    event.outcome?.estimatedLaborSavedHours,
  ].filter((value) => value !== undefined);
  if (numericClaims.some((value) => !Number.isFinite(value))) {
    throw new Error('Outcome numeric claims must be finite numbers');
  }
  if (
    event.outcome?.directCost !== undefined &&
    event.outcome.directCost < 0
  ) {
    throw new Error('Outcome directCost cannot be negative');
  }
}

function sanitizeForIngest(
  event: PortfolioOutcomeEvent,
): PortfolioOutcomeEvent {
  const sanitized = { ...event } as PortfolioOutcomeEvent &
    Record<string, unknown>;
  for (const key of [
    'occurredAt',
    'traceId',
    'intent',
    'entity',
    'outcome',
    'experiment',
    'metadata',
    'revenueEvents',
    'costEvents',
  ]) {
    if (sanitized[key] === null) delete sanitized[key];
  }
  return sanitized;
}

/**
 * Queue an explicit business event in BuildMyBot's local transaction boundary.
 * This does not contact APEX. The publisher drains the durable outbox later.
 */
export async function recordOutcomeEvent(
  event: PortfolioOutcomeEvent,
): Promise<boolean> {
  validateEvent(event);
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn(
      '[outcome-ledger] Supabase service credentials unavailable; event was not queued',
    );
    return false;
  }
  const payload = { schemaVersion: 1, ...event };
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/outcome_event_outbox?on_conflict=event_key`,
    {
      method: 'POST',
      headers: serviceHeaders({
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      }),
      body: JSON.stringify({
        event_key: event.idempotencyKey,
        payload,
        occurred_at: event.occurredAt || new Date().toISOString(),
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Outcome outbox insert failed: ${response.status} ${detail}`.trim(),
    );
  }
  return true;
}

interface OutboxRow {
  id: string;
  event_key: string;
  payload: PortfolioOutcomeEvent;
  attempts: number;
  next_attempt_at: string;
}

async function pendingRows(limit: number): Promise<OutboxRow[]> {
  const now = new Date().toISOString();
  const query = new URLSearchParams({
    select: 'id,event_key,payload,attempts,next_attempt_at',
    published_at: 'is.null',
    next_attempt_at: `lte.${now}`,
    order: 'created_at.asc',
    limit: String(limit),
  });
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/outcome_event_outbox?${query}`,
    { headers: serviceHeaders() },
  );
  if (!response.ok) {
    throw new Error(`Outcome outbox read failed: ${response.status}`);
  }
  return response.json();
}

async function patchRow(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/outcome_event_outbox?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: serviceHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        ...patch,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Outcome outbox update failed: ${response.status}`);
  }
}

export interface OutcomeFlushResult {
  enabled: boolean;
  attempted: number;
  published: number;
  failed: number;
  reason?: string;
}

/**
 * Publish pending rows independently so one malformed event cannot poison an
 * otherwise healthy batch. APEX's global idempotency key makes duplicate HTTP
 * delivery safe across multiple BuildMyBot server instances.
 */
export async function flushOutcomeOutbox(
  limit = 25,
): Promise<OutcomeFlushResult> {
  const url = ingestUrl();
  if (!url || !APEX_OUTCOME_INGEST_TOKEN) {
    return {
      enabled: false,
      attempted: 0,
      published: 0,
      failed: 0,
      reason: 'APEX outcome publisher is not configured',
    };
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return {
      enabled: false,
      attempted: 0,
      published: 0,
      failed: 0,
      reason: 'Supabase service credentials are not configured',
    };
  }

  const queue = await pendingRows(Math.min(100, Math.max(1, limit)));
  let published = 0;
  let failed = 0;
  for (const row of queue) {
    try {
      const payload = sanitizeForIngest(row.payload);
      validateEvent(payload);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${APEX_OUTCOME_INGEST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
          `APEX ${response.status}: ${detail.slice(0, 400)}`,
        );
      }
      await patchRow(row.id, {
        published_at: new Date().toISOString(),
        last_error: null,
      });
      published += 1;
    } catch (error) {
      failed += 1;
      const attempts = Number(row.attempts || 0) + 1;
      const backoffSeconds = Math.min(
        3600,
        15 * 2 ** Math.min(attempts, 8),
      );
      await patchRow(row.id, {
        attempts,
        next_attempt_at: new Date(
          Date.now() + backoffSeconds * 1000,
        ).toISOString(),
        last_error: (
          error instanceof Error ? error.message : String(error)
        ).slice(0, 1000),
      }).catch((patchError) =>
        console.error(
          '[outcome-ledger] could not persist retry state',
          patchError,
        ),
      );
    }
  }
  return { enabled: true, attempted: queue.length, published, failed };
}

/** Stable helper for verified external financial events. */
export function stripeOutcomeKey(
  stripeEventId: string,
  suffix: string,
): string {
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9_.:-]/g, '-').slice(0, 80);
  return `buildmybot:stripe:${stripeEventId}:${safeSuffix}`;
}

/** For callers that need a stable key but have no provider id. */
export function deterministicOutcomeKey(
  namespace: string,
  value: string,
): string {
  const digest = crypto
    .createHash('sha256')
    .update(value)
    .digest('hex')
    .slice(0, 24);
  return `buildmybot:${namespace}:${digest}`;
}
