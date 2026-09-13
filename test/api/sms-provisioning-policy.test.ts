import { describe, expect, it } from 'vitest';
import {
  areaCodeFromNumber,
  classifyTenantNumber,
  isExistingOrderMarker,
  shouldAdvanceProvisioning,
} from '../../api/sms/provisioning-policy';
import { KIND_LABELS } from '../../shared/sms';

describe('SMS provisioning policy', () => {
  it('advances only recoverable carrier states', () => {
    expect(shouldAdvanceProvisioning('new')).toBe(true);
    expect(shouldAdvanceProvisioning('pending')).toBe(true);
    expect(shouldAdvanceProvisioning('waiting_funding')).toBe(true);
    expect(shouldAdvanceProvisioning('working')).toBe(false);
    expect(shouldAdvanceProvisioning('unknown')).toBe(false);
    expect(shouldAdvanceProvisioning('ready')).toBe(false);
    expect(shouldAdvanceProvisioning('not_registered')).toBe(false);
  });

  it('lets Telnyx voice numbers be reused for SMS and leaves Twilio numbers on voice', () => {
    expect(
      classifyTenantNumber({
        phone_number: '+15551234567',
        provider: 'telnyx',
        status: 'active',
        friendly_name: 'Front desk',
      }),
    ).toMatchObject({
      phoneNumber: '+15551234567',
      reusableForSms: true,
    });
    expect(
      classifyTenantNumber({
        phone_number: '+15557654321',
        provider: 'twilio',
        status: 'active',
      }),
    ).toMatchObject({
      reusableForSms: false,
    });
    expect(
      classifyTenantNumber({
        number: 'not-a-number',
        provider: 'telnyx',
      }),
    ).toBeNull();
  });

  it('derives an area code and recognizes reused-number order markers', () => {
    expect(areaCodeFromNumber('+12255550100')).toBe('225');
    expect(isExistingOrderMarker('existing:abc')).toBe(true);
    expect(isExistingOrderMarker('ord_123')).toBe(false);
  });
});

describe('SMS program labels', () => {
  it('names every program kind the form can create', () => {
    expect(Object.keys(KIND_LABELS).sort()).toEqual(
      [
        'after_hours',
        'birthday',
        'campaign',
        'contest',
        'keyword',
        'sequence',
        'welcome',
      ].sort(),
    );
  });
});
