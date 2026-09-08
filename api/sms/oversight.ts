/**
 * Cross-tenant SMS oversight for platform admins.
 *
 * Every other SMS query in this codebase goes through `scoped()` in
 * api/sms/store.ts, which pins `tenant_key` to the caller's own tenant. That
 * is correct for customers and useless for staff: nobody could see which
 * tenants were stuck in 10DLC registration, whose carrier campaign was
 * rejected, or whose sends had silently stopped at a spend limit. This module
 * is the deliberate exception, and the only one -- it is reachable solely
 * through `GET /api/admin/sms`, behind `isPlatformAdmin`.
 *
 * The derivation is a pure function so the rules are testable without a
 * database, mirroring `computeActivation` in api/growth/milestones.ts.
 *
 * Read-only on purpose. Advancing a tenant's provisioning means real,
 * charged, non-idempotent calls to Telnyx (buying a number, filing a brand);
 * `advanceProvisioning` already refuses to retry an uncertain outcome for
 * exactly that reason. Surfacing those tenants is useful; a one-click
 * "retry" button next to them would not be.
 */

/** `sms_jobs.status` values the runtime and the Telnyx webhook actually write. */
export const SMS_JOB_STATUSES = [
  'queued',
  'leased',
  'sending',
  'accepted',
  'delivered',
  'delivery_failed',
  'cancelled',
  'unknown',
] as const;

export type SmsJobStatus = (typeof SMS_JOB_STATUSES)[number];

export interface SmsAccountRow {
  tenant_key: string;
  user_id: string | null;
  organization_id: string | null;
  business_name: string | null;
  plan_key: string | null;
  paid_until: string | null;
  sender: string | null;
  campaign_id: string | null;
  campaign_usecase: string | null;
  ready: boolean | null;
  included_segments: number | null;
  used_segments: number | null;
  overage_micros: number | null;
  overage_used_micros: number | null;
  spend_limit_micros: number | null;
  updated_at: string | null;
}

export interface SmsProvisioningRow {
  tenant_key: string;
  status: string | null;
  step: string | null;
  last_error: string | null;
  sender: string | null;
  provider_brand_id: string | null;
  provider_campaign_id: string | null;
  updated_at: string | null;
}

export interface SmsOwnerRow {
  id: string;
  email: string | null;
  name: string | null;
}

export interface SmsJobRow {
  tenant_key: string;
  status: string | null;
}

export interface SmsOversightSources {
  accounts: SmsAccountRow[];
  provisioning: SmsProvisioningRow[];
  owners: SmsOwnerRow[];
  jobs: SmsJobRow[];
  /** True when the bounded job query hit its row cap -- counts are a floor. */
  jobsTruncated: boolean;
  /** Mirrors SMS_LAUNCH_ENABLED; with it off, registration and sending 503. */
  launchEnabled: boolean;
  now?: Date;
}

/**
 * `blocked` means staff or the customer must act before this tenant can send
 * again. `waiting` means the carrier or the customer is mid-flight and time
 * alone may resolve it. Nothing else earns a place at the top of the queue.
 */
export type SmsAttentionLevel = 'blocked' | 'waiting' | 'ok';

const LEVEL_RANK: Record<SmsAttentionLevel, number> = {
  blocked: 0,
  waiting: 1,
  ok: 2,
};

export interface SmsOversightTenant {
  tenantKey: string;
  businessName: string;
  ownerEmail: string | null;
  organizationId: string | null;
  plan: string | null;
  paid: boolean;
  paidUntil: string | null;
  ready: boolean;
  sender: string | null;
  campaignId: string | null;
  campaignUsecase: string | null;
  registrationStatus: string;
  registrationStep: string | null;
  registrationError: string | null;
  includedSegments: number;
  usedSegments: number;
  overageUsd: number;
  spendLimitUsd: number;
  /** True when the next chargeable segment would exceed the spend limit. */
  budgetExhausted: boolean;
  jobs: Record<SmsJobStatus, number>;
  attention: SmsAttentionLevel;
  reason: string | null;
  updatedAt: string | null;
}

export interface SmsOversightState {
  tenants: SmsOversightTenant[];
  totals: {
    tenants: number;
    ready: number;
    blocked: number;
    waiting: number;
    unregistered: number;
    overageUsd: number;
    jobs: Record<SmsJobStatus, number>;
  };
  launchEnabled: boolean;
  jobsTruncated: boolean;
}

function emptyJobCounts(): Record<SmsJobStatus, number> {
  return Object.fromEntries(SMS_JOB_STATUSES.map((s) => [s, 0])) as Record<
    SmsJobStatus,
    number
  >;
}

function isKnownStatus(value: string): value is SmsJobStatus {
  return (SMS_JOB_STATUSES as readonly string[]).includes(value);
}

/** Supabase can hand back null/undefined for any of these numeric columns. */
function num(value: number | null | undefined): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function usd(microsValue: number | null | undefined): number {
  return Math.round((num(microsValue) / 1_000_000) * 100) / 100;
}

/**
 * Pure derivation of the oversight table. Ordering is the product: blocked
 * tenants first, then waiting, then healthy, alphabetically within each band,
 * so the first screenful is always the work.
 */
export function computeSmsOversight(
  sources: SmsOversightSources,
): SmsOversightState {
  const now = sources.now ?? new Date();
  const provisioningByTenant = new Map(
    (sources.provisioning || []).map((p) => [p.tenant_key, p]),
  );
  const ownersById = new Map((sources.owners || []).map((o) => [o.id, o]));

  const jobsByTenant = new Map<string, Record<SmsJobStatus, number>>();
  const jobTotals = emptyJobCounts();
  for (const job of sources.jobs || []) {
    const status = String(job.status || '');
    if (!isKnownStatus(status)) continue;
    let counts = jobsByTenant.get(job.tenant_key);
    if (!counts) {
      counts = emptyJobCounts();
      jobsByTenant.set(job.tenant_key, counts);
    }
    counts[status] += 1;
    jobTotals[status] += 1;
  }

  const tenants: SmsOversightTenant[] = (sources.accounts || []).map(
    (account) => {
      const provisioning = provisioningByTenant.get(account.tenant_key) || null;
      const owner = account.user_id
        ? ownersById.get(account.user_id) || null
        : null;
      const registrationStatus = provisioning?.status || 'not_registered';
      const registered =
        Boolean(provisioning) && registrationStatus !== 'not_registered';
      const ready = account.ready === true;
      const paid = Boolean(
        account.paid_until && new Date(account.paid_until) > now,
      );

      const includedSegments = num(account.included_segments);
      const usedSegments = num(account.used_segments);
      // Mirrors sms_prepare_job: a chargeable segment is refused when
      // overage_used_micros + cost > spend_limit_micros. Below the plan
      // allowance the cost is zero, so only overage can exhaust the budget.
      const budgetExhausted =
        usedSegments >= includedSegments &&
        num(account.overage_used_micros) + num(account.overage_micros) >
          num(account.spend_limit_micros);

      let attention: SmsAttentionLevel = 'ok';
      let reason: string | null = null;
      if (registrationStatus === 'unknown') {
        attention = 'blocked';
        reason =
          'Provider result uncertain — reconcile with Telnyx before any retry';
      } else if (registrationStatus === 'waiting_funding') {
        attention = 'blocked';
        reason = 'Telnyx balance too low to buy this tenant a number';
      } else if ((registered || ready) && !paid) {
        attention = 'blocked';
        reason =
          'SMS subscription lapsed — provisioning and sending are paused';
      } else if (ready && budgetExhausted) {
        attention = 'blocked';
        reason = 'Spend limit reached — the next overage segment is refused';
      } else if (ready) {
        attention = 'ok';
        reason = null;
      } else if (registered) {
        attention = 'waiting';
        reason =
          provisioning?.last_error ||
          `Awaiting carrier approval at the ${provisioning?.step || 'brand'} step`;
      } else {
        attention = 'waiting';
        reason = paid
          ? 'Paid but has not submitted 10DLC registration'
          : 'No paid SMS plan yet — has not started 10DLC registration';
      }

      return {
        tenantKey: account.tenant_key,
        businessName:
          account.business_name?.trim() ||
          owner?.name?.trim() ||
          owner?.email ||
          account.tenant_key,
        ownerEmail: owner?.email || null,
        organizationId: account.organization_id,
        plan: account.plan_key,
        paid,
        paidUntil: account.paid_until,
        ready,
        sender: account.sender || provisioning?.sender || null,
        campaignId: account.campaign_id,
        campaignUsecase: account.campaign_usecase,
        registrationStatus,
        registrationStep: provisioning?.step || null,
        registrationError: provisioning?.last_error || null,
        includedSegments,
        usedSegments,
        overageUsd: usd(account.overage_used_micros),
        spendLimitUsd: usd(account.spend_limit_micros),
        budgetExhausted,
        jobs: jobsByTenant.get(account.tenant_key) || emptyJobCounts(),
        attention,
        reason,
        updatedAt: provisioning?.updated_at || account.updated_at,
      };
    },
  );

  tenants.sort(
    (a, b) =>
      LEVEL_RANK[a.attention] - LEVEL_RANK[b.attention] ||
      a.businessName.localeCompare(b.businessName),
  );

  return {
    tenants,
    totals: {
      tenants: tenants.length,
      ready: tenants.filter((t) => t.ready).length,
      blocked: tenants.filter((t) => t.attention === 'blocked').length,
      waiting: tenants.filter((t) => t.attention === 'waiting').length,
      unregistered: tenants.filter(
        (t) => t.registrationStatus === 'not_registered',
      ).length,
      overageUsd:
        Math.round(tenants.reduce((sum, t) => sum + t.overageUsd, 0) * 100) /
        100,
      jobs: jobTotals,
    },
    launchEnabled: sources.launchEnabled,
    jobsTruncated: sources.jobsTruncated,
  };
}
