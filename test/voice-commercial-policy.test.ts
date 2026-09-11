import { describe, expect, it } from 'vitest';
import {
  MAXIMUM_INCENTIVE_MONTHS,
  MINIMUM_PRICE_MULTIPLIER,
  RetentionPolicyViolation,
  authorizeNextRetentionOffer,
  createRetentionState,
  markLatestRetentionOfferOutcome,
  resolveCommercialPlan,
} from '../shared/voice-commercial-policy.js';

describe('voice commercial retention policy', () => {
  it('uses the canonical platform and voice pricing catalog', () => {
    expect(resolveCommercialPlan('ENTERPRISE')).toMatchObject({
      name: 'Enterprise',
      listedMonthlyPrice: 499,
      family: 'platform',
    });
    expect(resolveCommercialPlan('Voice Professional')).toMatchObject({
      name: 'Voice Professional',
      listedMonthlyPrice: 279,
      family: 'voice',
    });
  });

  it('rejects exceptional incentives from every role except manager', () => {
    const state = createRetentionState();
    expect(() =>
      authorizeNextRetentionOffer({
        department: 'sales',
        state,
        planId: 'ENTERPRISE',
        objection: 'price',
        months: 2,
        reason: 'Price is the remaining blocker',
        valueDefended: true,
        conditionalCommitment: true,
      }),
    ).toThrow(RetentionPolicyViolation);
  });

  it('progresses deliberately and never goes below 33% of canonical list price', () => {
    const state = createRetentionState();
    const base = {
      department: 'manager' as const,
      state,
      planId: 'ENTERPRISE',
      objection: 'price' as const,
      months: 2,
      reason: 'Qualified prospect confirmed price is the remaining blocker',
      valueDefended: true,
      conditionalCommitment: true,
    };

    expect(authorizeNextRetentionOffer(base).temporaryMonthlyPrice).toBe(
      424.15,
    );
    expect(authorizeNextRetentionOffer(base).temporaryMonthlyPrice).toBe(349.3);
    expect(authorizeNextRetentionOffer(base).temporaryMonthlyPrice).toBe(249.5);
    const maximum = authorizeNextRetentionOffer(base);
    expect(maximum.temporaryMonthlyPrice).toBe(164.67);
    expect(maximum.temporaryMonthlyPrice).toBeGreaterThanOrEqual(
      Math.round(499 * MINIMUM_PRICE_MULTIPLIER * 100) / 100,
    );
    expect(() => authorizeNextRetentionOffer(base)).toThrow(
      'Maximum authorized introductory incentive has already been reached',
    );
  });

  it('requires value defense and a conditional commitment before strong concessions', () => {
    const state = createRetentionState();
    const request = {
      department: 'manager' as const,
      state,
      planId: 'PROFESSIONAL',
      objection: 'competitor' as const,
      months: 1,
      reason: 'Competitor price comparison',
      valueDefended: true,
      conditionalCommitment: false,
    };

    authorizeNextRetentionOffer(request);
    authorizeNextRetentionOffer(request);
    expect(() => authorizeNextRetentionOffer(request)).toThrow(
      'Confirm that price is the remaining blocker',
    );
  });

  it('caps introductory pricing at two billing months', () => {
    const state = createRetentionState();
    expect(MAXIMUM_INCENTIVE_MONTHS).toBe(2);
    expect(() =>
      authorizeNextRetentionOffer({
        department: 'manager',
        state,
        planId: 'VOICE_STANDARD',
        objection: 'timing',
        months: 3,
        reason: 'Budget timing',
        valueDefended: true,
        conditionalCommitment: true,
      }),
    ).toThrow('1 or 2 billing months');
  });

  it('returns customer-safe offer data without leaking stage, multiplier, or remaining authority', () => {
    const state = createRetentionState();
    const offer = authorizeNextRetentionOffer({
      department: 'manager',
      state,
      planId: 'VOICE_BASIC',
      objection: 'price',
      months: 2,
      reason: 'Price is the remaining blocker',
      valueDefended: true,
      conditionalCommitment: true,
    });

    expect(offer).toEqual({
      planName: 'Voice Basic',
      temporaryMonthlyPrice: 67.15,
      temporaryMonths: 2,
      standardMonthlyPrice: 79,
      disclosure:
        'Voice Basic can be offered at $67.15/month for 2 billing months. After that introductory period, the standard price is $79.00/month.',
    });
    expect('offerStage' in offer).toBe(false);
    expect('multiplier' in offer).toBe(false);
  });

  it('records whether the latest offer was accepted without altering the public authority boundary', () => {
    const state = createRetentionState();
    authorizeNextRetentionOffer({
      department: 'manager',
      state,
      planId: 'STARTER',
      objection: 'price',
      months: 1,
      reason: 'Qualified prospect',
      valueDefended: true,
      conditionalCommitment: false,
    });
    const audit = markLatestRetentionOfferOutcome(
      state,
      true,
      'Customer agreed to enroll.',
    );
    expect(audit.accepted).toBe(true);
    expect(audit.outcomeNote).toBe('Customer agreed to enroll.');
  });
});
