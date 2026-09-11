/**
 * Cross-tenant SMS oversight derivation (api/sms/oversight.ts).
 *
 * The rules here decide what a platform admin sees at the top of the SMS
 * page, so each one is pinned by both a positive and a negative case --
 * a triage list that flags everything is exactly as useless as one that
 * flags nothing.
 */
import { describe, expect, it } from 'vitest';
import {
  type SmsAccountRow,
  type SmsOversightSources,
  computeSmsOversight,
} from '../../api/sms/oversight.js';

const FUTURE = '2099-01-01T00:00:00Z';
const PAST = '2020-01-01T00:00:00Z';

function account(over: Partial<SmsAccountRow> = {}): SmsAccountRow {
  return {
    tenant_key: 'org:t1',
    user_id: 'u1',
    organization_id: 'o1',
    business_name: 'Acme Plumbing',
    plan_key: 'SMS_STARTER',
    paid_until: FUTURE,
    sender: '+15125550100',
    campaign_id: 'camp_1',
    campaign_usecase: 'MIXED',
    ready: true,
    included_segments: 1000,
    used_segments: 10,
    overage_micros: 29000,
    overage_used_micros: 0,
    spend_limit_micros: 0,
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

function sources(over: Partial<SmsOversightSources> = {}): SmsOversightSources {
  return {
    accounts: [],
    provisioning: [],
    owners: [],
    jobs: [],
    jobsTruncated: false,
    launchEnabled: true,
    now: new Date('2026-09-08T00:00:00Z'),
    ...over,
  };
}

const provisioning = (over: Record<string, unknown> = {}) => ({
  tenant_key: 'org:t1',
  status: 'pending',
  step: 'campaign',
  last_error: null,
  sender: null,
  provider_brand_id: 'brand_1',
  provider_campaign_id: null,
  updated_at: '2026-09-02T00:00:00Z',
  ...over,
});

describe('computeSmsOversight — attention triage', () => {
  it('flags an uncertain provider outcome above everything else', () => {
    const state = computeSmsOversight(
      sources({
        accounts: [account({ ready: false })],
        provisioning: [provisioning({ status: 'unknown' })],
      }),
    );
    expect(state.tenants[0].attention).toBe('blocked');
    expect(state.tenants[0].reason).toMatch(/reconcile with Telnyx/i);
  });

  it('flags a tenant the provider cannot buy a number for', () => {
    const state = computeSmsOversight(
      sources({
        accounts: [account({ ready: false })],
        provisioning: [provisioning({ status: 'waiting_funding' })],
      }),
    );
    expect(state.tenants[0].attention).toBe('blocked');
    expect(state.tenants[0].reason).toMatch(/balance too low/i);
  });

  it('flags an approved sender whose subscription lapsed', () => {
    const state = computeSmsOversight(
      sources({
        accounts: [account({ paid_until: PAST })],
        provisioning: [provisioning({ status: 'ready', step: 'complete' })],
      }),
    );
    expect(state.tenants[0].attention).toBe('blocked');
    expect(state.tenants[0].reason).toMatch(/lapsed/i);
    expect(state.tenants[0].paid).toBe(false);
  });

  it('leaves a healthy live sender alone', () => {
    const state = computeSmsOversight(
      sources({
        accounts: [account()],
        provisioning: [provisioning({ status: 'ready', step: 'complete' })],
      }),
    );
    expect(state.tenants[0].attention).toBe('ok');
    expect(state.tenants[0].reason).toBeNull();
  });

  it('separates "never started" from "waiting on the carrier"', () => {
    const state = computeSmsOversight(
      sources({
        accounts: [
          account({ tenant_key: 'org:a', ready: false, paid_until: null }),
        ],
        provisioning: [],
      }),
    );
    expect(state.tenants[0].attention).toBe('waiting');
    expect(state.tenants[0].registrationStatus).toBe('not_registered');
    expect(state.tenants[0].reason).toMatch(/has not started/i);

    const carrier = computeSmsOversight(
      sources({
        accounts: [account({ ready: false })],
        provisioning: [
          provisioning({ last_error: 'Waiting for brand verification' }),
        ],
      }),
    );
    expect(carrier.tenants[0].attention).toBe('waiting');
    // The carrier's own words, not a generic "pending" -- that message is the
    // whole reason support opens this page.
    expect(carrier.tenants[0].reason).toBe('Waiting for brand verification');
  });
});

describe('computeSmsOversight — spend limit', () => {
  // Mirrors sms_prepare_job: cost is zero below the plan allowance, so a
  // tenant inside their included segments is never budget-blocked. This
  // matters because spend_limit_micros DEFAULTS TO 0 -- a naive
  // "overage_used >= spend_limit" check would flag literally every tenant.
  it('does not flag a tenant inside their plan allowance with no overage budget', () => {
    const state = computeSmsOversight(
      sources({
        accounts: [
          account({
            used_segments: 999,
            included_segments: 1000,
            spend_limit_micros: 0,
          }),
        ],
      }),
    );
    expect(state.tenants[0].budgetExhausted).toBe(false);
    expect(state.tenants[0].attention).toBe('ok');
  });

  it('flags a tenant whose next chargeable segment would be refused', () => {
    const state = computeSmsOversight(
      sources({
        accounts: [
          account({
            used_segments: 1000,
            included_segments: 1000,
            spend_limit_micros: 0,
          }),
        ],
      }),
    );
    expect(state.tenants[0].budgetExhausted).toBe(true);
    expect(state.tenants[0].attention).toBe('blocked');
    expect(state.tenants[0].reason).toMatch(/spend limit/i);
  });

  it('leaves a tenant with budget for exactly one more segment alone', () => {
    const state = computeSmsOversight(
      sources({
        accounts: [
          account({
            used_segments: 1200,
            included_segments: 1000,
            overage_micros: 29000,
            overage_used_micros: 5_800_000,
            spend_limit_micros: 5_829_000,
          }),
        ],
      }),
    );
    expect(state.tenants[0].budgetExhausted).toBe(false);
    expect(state.tenants[0].overageUsd).toBe(5.8);
    expect(state.tenants[0].spendLimitUsd).toBe(5.83);
  });
});

describe('computeSmsOversight — ordering and totals', () => {
  it('sorts blocked above waiting above healthy, alphabetically within a band', () => {
    const state = computeSmsOversight(
      sources({
        accounts: [
          account({ tenant_key: 'org:ok-z', business_name: 'Zulu Cafe' }),
          account({ tenant_key: 'org:ok-a', business_name: 'Alpha Cafe' }),
          account({
            tenant_key: 'org:wait',
            business_name: 'Mid Motors',
            ready: false,
          }),
          account({
            tenant_key: 'org:blocked',
            business_name: 'Nova Dental',
            ready: false,
          }),
        ],
        provisioning: [
          provisioning({ tenant_key: 'org:wait' }),
          provisioning({ tenant_key: 'org:blocked', status: 'unknown' }),
        ],
      }),
    );
    expect(state.tenants.map((t) => t.businessName)).toEqual([
      'Nova Dental',
      'Mid Motors',
      'Alpha Cafe',
      'Zulu Cafe',
    ]);
    expect(state.totals).toMatchObject({
      tenants: 4,
      ready: 2,
      blocked: 1,
      waiting: 1,
      unregistered: 2,
    });
  });

  it('buckets message counts per tenant and ignores unrecognised statuses', () => {
    const state = computeSmsOversight(
      sources({
        accounts: [
          account({ tenant_key: 'org:a', business_name: 'A' }),
          account({ tenant_key: 'org:b', business_name: 'B' }),
        ],
        jobs: [
          { tenant_key: 'org:a', status: 'delivered' },
          { tenant_key: 'org:a', status: 'delivered' },
          { tenant_key: 'org:a', status: 'delivery_failed' },
          { tenant_key: 'org:b', status: 'queued' },
          { tenant_key: 'org:b', status: 'not_a_real_status' },
          { tenant_key: 'org:ghost', status: 'delivered' },
        ],
      }),
    );
    const a = state.tenants.find((t) => t.tenantKey === 'org:a');
    const b = state.tenants.find((t) => t.tenantKey === 'org:b');
    expect(a?.jobs.delivered).toBe(2);
    expect(a?.jobs.delivery_failed).toBe(1);
    expect(b?.jobs.queued).toBe(1);
    // A job row for a tenant with no sms_accounts row still counts platform
    // wide; a bogus status counts nowhere.
    expect(state.totals.jobs.delivered).toBe(3);
    expect(Object.values(state.totals.jobs).reduce((x, y) => x + y, 0)).toBe(5);
  });

  it('falls back through owner name and email when a business name is blank', () => {
    const state = computeSmsOversight(
      sources({
        accounts: [
          account({ tenant_key: 'user:u1', business_name: '  ' }),
          account({
            tenant_key: 'user:u2',
            user_id: 'u2',
            business_name: null,
          }),
          account({ tenant_key: 'user:u3', user_id: 'u3', business_name: '' }),
        ],
        owners: [
          { id: 'u1', email: 'one@example.com', name: 'One Ltd' },
          { id: 'u2', email: 'two@example.com', name: null },
        ],
      }),
    );
    const byKey = Object.fromEntries(
      state.tenants.map((t) => [t.tenantKey, t.businessName]),
    );
    expect(byKey['user:u1']).toBe('One Ltd');
    expect(byKey['user:u2']).toBe('two@example.com');
    // No owner row at all: never render an empty cell.
    expect(byKey['user:u3']).toBe('user:u3');
  });

  it('passes the launch flag and truncation warning straight through', () => {
    const state = computeSmsOversight(
      sources({ launchEnabled: false, jobsTruncated: true }),
    );
    expect(state.launchEnabled).toBe(false);
    expect(state.jobsTruncated).toBe(true);
    expect(state.tenants).toEqual([]);
    expect(state.totals.tenants).toBe(0);
  });
});
