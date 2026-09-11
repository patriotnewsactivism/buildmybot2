import { describe, expect, it } from 'vitest';
import {
  IncentivePolicyViolation,
  authorizeGrantIncentive,
  defaultWorkspaceIncentiveConfig,
  parseWorkspaceIncentiveConfig,
} from '../shared/incentive-playbook.js';

describe('workspace incentive playbook', () => {
  const config = defaultWorkspaceIncentiveConfig();

  it('ships tier/offer codes with workspace max % and free-month ceiling', () => {
    expect(config.maxPercentOff).toBe(25);
    expect(config.freeMonthCeiling).toBe(1);
    expect(config.offers.map((o) => o.code)).toEqual(
      expect.arrayContaining([
        'VALUE_10',
        'VALUE_15',
        'SAVE_20',
        'FREE_MONTH_1',
        'COMBO_10_PLUS_MONTH',
      ]),
    );
  });

  it('A) refuses unless objection tag AND value-pitch attempt are set', () => {
    expect(() =>
      authorizeGrantIncentive({
        department: 'manager',
        objectionTag: null,
        valuePitchAttempted: true,
        offerCode: 'VALUE_10',
        reason: 'Price objection after value pitch',
        config,
      }),
    ).toThrow(/objection tag is required/i);

    expect(() =>
      authorizeGrantIncentive({
        department: 'manager',
        objectionTag: 'price',
        valuePitchAttempted: false,
        offerCode: 'VALUE_10',
        reason: 'Price objection',
        config,
      }),
    ).toThrow(/value-pitch attempt is required/i);
  });

  it('refuses non-manager departments (fail closed)', () => {
    expect(() =>
      authorizeGrantIncentive({
        department: 'support',
        objectionTag: 'price',
        valuePitchAttempted: true,
        offerCode: 'VALUE_10',
        reason: 'Should not work',
        config,
      }),
    ).toThrow(IncentivePolicyViolation);
  });

  it('enforces workspace and offer caps', () => {
    expect(() =>
      authorizeGrantIncentive({
        department: 'manager',
        objectionTag: 'competitor',
        valuePitchAttempted: true,
        offerCode: 'VALUE_10',
        percentOff: 30,
        reason: 'Trying to exceed cap',
        config,
      }),
    ).toThrow(/exceeds the authorized workspace\/offer cap/i);

    expect(() =>
      authorizeGrantIncentive({
        department: 'manager',
        objectionTag: 'price',
        valuePitchAttempted: true,
        offerCode: 'FREE_MONTH_1',
        freeMonths: 2,
        reason: 'Trying to exceed free-month ceiling',
        config,
      }),
    ).toThrow(/exceed the authorized workspace\/offer ceiling/i);
  });

  it('returns offer code and customer-safe terms under cap', () => {
    const grant = authorizeGrantIncentive({
      department: 'manager',
      objectionTag: 'price',
      valuePitchAttempted: true,
      offerCode: 'save_20',
      reason: 'Caller confirmed price is the remaining blocker after value pitch',
      config,
    });
    expect(grant.offerCode).toBe('SAVE_20');
    expect(grant.percentOff).toBe(20);
    expect(grant.freeMonths).toBe(0);
    expect(grant.terms).toContain('SAVE_20');
    expect(grant.smsBody).toContain('SAVE_20');
  });

  it('rejects unknown offer codes and disabled playbooks', () => {
    expect(() =>
      authorizeGrantIncentive({
        department: 'manager',
        objectionTag: 'price',
        valuePitchAttempted: true,
        offerCode: 'OPEN_ENDED_50',
        reason: 'Invented discount',
        config,
      }),
    ).toThrow(/not in the workspace incentive playbook/i);

    expect(() =>
      authorizeGrantIncentive({
        department: 'manager',
        objectionTag: 'price',
        valuePitchAttempted: true,
        offerCode: 'VALUE_10',
        reason: 'Disabled workspace',
        config: { ...config, enabled: false },
      }),
    ).toThrow(/disabled for this workspace/i);
  });

  it('parses workspace settings playbook overrides', () => {
    const parsed = parseWorkspaceIncentiveConfig({
      enabled: true,
      maxPercentOff: 15,
      freeMonthCeiling: 1,
      offers: [
        {
          code: 'CUSTOM_12',
          label: 'Custom 12% off',
          maxPercentOff: 12,
          freeMonths: 0,
        },
      ],
    });
    expect(parsed.offers[0].code).toBe('CUSTOM_12');
    expect(parseWorkspaceIncentiveConfig(null).offers.length).toBeGreaterThan(0);
  });
});
