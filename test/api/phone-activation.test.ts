import { afterEach, describe, expect, it } from 'vitest';
import {
  activationSubpath,
  normalizePhoneNumber,
} from '../../api/phone/activation.js';
import { decryptSecret, encryptSecret } from '../../api/phone/crypto.js';

const originalEncryptionKey = process.env.ENCRYPTION_KEY;

afterEach(() => {
  if (originalEncryptionKey === undefined) {
    process.env.ENCRYPTION_KEY = undefined;
  } else {
    process.env.ENCRYPTION_KEY = originalEncryptionKey;
  }
});

describe('phone-agent activation helpers', () => {
  it('normalizes common US phone formats to E.164', () => {
    expect(normalizePhoneNumber('(662) 555-1212')).toBe('+16625551212');
    expect(normalizePhoneNumber('1-662-555-1212')).toBe('+16625551212');
    expect(normalizePhoneNumber('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizePhoneNumber('123')).toBe('');
  });

  it('parses activation routes without being confused by query strings', () => {
    expect(
      activationSubpath(
        '/api/phone/activation/available?countryCode=US&areaCode=662',
      ),
    ).toEqual(['available']);
    expect(activationSubpath('/api/phone/activation')).toEqual([]);
  });

  it('encrypts telephony credentials with authenticated encryption', () => {
    process.env.ENCRYPTION_KEY =
      'test-only-encryption-key-that-never-leaves-the-test';

    const ciphertext = encryptSecret('subaccount-auth-token');

    expect(ciphertext).not.toContain('subaccount-auth-token');
    expect(ciphertext.startsWith('v1:')).toBe(true);
    expect(decryptSecret(ciphertext)).toBe('subaccount-auth-token');
  });

  it('rejects encrypted telephony credentials when the key changes', () => {
    process.env.ENCRYPTION_KEY = 'first-test-key';
    const ciphertext = encryptSecret('sensitive-token');

    process.env.ENCRYPTION_KEY = 'different-test-key';
    expect(() => decryptSecret(ciphertext)).toThrow();
  });
});
