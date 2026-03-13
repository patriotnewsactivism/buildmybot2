import { describe, expect, it } from 'vitest';
import { isWidgetOriginAllowed } from '../../server/utils/originValidation';

describe('isWidgetOriginAllowed', () => {
  it('should allow requests when origin metadata is unavailable', () => {
    expect(
      isWidgetOriginAllowed({
        websiteUrl: 'https://example.com',
      }),
    ).toBe(true);
  });

  it('should allow matching origin host', () => {
    expect(
      isWidgetOriginAllowed({
        originHeader: 'https://example.com',
        websiteUrl: 'https://example.com',
      }),
    ).toBe(true);
  });

  it('should allow matching referer host when origin is missing', () => {
    expect(
      isWidgetOriginAllowed({
        refererHeader: 'https://example.com/pricing',
        websiteUrl: 'https://example.com',
      }),
    ).toBe(true);
  });

  it('should reject mismatched origin host', () => {
    expect(
      isWidgetOriginAllowed({
        originHeader: 'https://malicious.example',
        websiteUrl: 'https://example.com',
      }),
    ).toBe(false);
  });

  it('should allow an explicitly configured additional allowed origin', () => {
    expect(
      isWidgetOriginAllowed({
        originHeader: 'https://staging.example.com',
        websiteUrl: 'https://example.com',
        additionalAllowedOrigins: ['https://staging.example.com'],
      }),
    ).toBe(true);
  });

  it('should reject when no valid allowed host exists', () => {
    expect(
      isWidgetOriginAllowed({
        originHeader: 'https://example.com',
        websiteUrl: 'not-a-url',
      }),
    ).toBe(false);
  });
});
