import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INVALID_TOKEN_CODE,
  MIN_PASSWORD_LENGTH,
  RESET_PASSWORD_PATH,
  VERIFY_EMAIL_PATH,
  buildAuthActionLink,
  invalidPasswordBody,
  isInvalidAuthTokenFailure,
  passwordMeetsPolicy,
  validatePasswordConfirmation,
} from '../shared/auth-links';

const repoRoot = path.resolve(__dirname, '..');

function source(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('auth email links', () => {
  it('builds verification and reset URLs on the client routes', () => {
    const token = 'abc/def+token=1';
    expect(
      buildAuthActionLink(
        'https://www.buildmybot.app/',
        'email_verification',
        token,
      ),
    ).toBe(
      `https://www.buildmybot.app${VERIFY_EMAIL_PATH}?token=${encodeURIComponent(token)}`,
    );
    expect(
      buildAuthActionLink(
        'https://www.buildmybot.app',
        'password_reset',
        token,
      ),
    ).toBe(
      `https://www.buildmybot.app${RESET_PASSWORD_PATH}?token=${encodeURIComponent(token)}`,
    );
  });

  it('keeps mailers and App routes on the shared paths', () => {
    const app = source('App.tsx');
    const mailer = source('api/lib/auth-tokens.ts');
    const gateway = source('api/gateway-legacy.ts');

    expect(app).toContain('VERIFY_EMAIL_PATH');
    expect(app).toContain('RESET_PASSWORD_PATH');
    expect(app).toContain('<VerifyEmailPage />');
    expect(app).toContain('<ResetPasswordPage />');
    expect(mailer).toContain('buildAuthActionLink');
    expect(mailer).toContain("'email_verification'");
    expect(gateway).toContain(`${RESET_PASSWORD_PATH}?token=`);
    expect(gateway).toContain(`password.length < ${MIN_PASSWORD_LENGTH}`);
    expect(mailer).not.toContain('/verify-email?token');
  });

  it('uses the reset endpoint password length', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(passwordMeetsPolicy('short')).toBe(false);
    expect(passwordMeetsPolicy('1234567')).toBe(false);
    expect(passwordMeetsPolicy('12345678')).toBe(true);
    expect(validatePasswordConfirmation('1234567', '1234567')).toMatch(
      /at least 8/,
    );
    expect(validatePasswordConfirmation('12345678', '12345679')).toBe(
      'Passwords do not match',
    );
    expect(validatePasswordConfirmation('12345678', '12345678')).toBeNull();
    expect(invalidPasswordBody().error).toMatch(/at least 8 characters/);
  });

  it('recognizes invalid or expired token responses', () => {
    expect(
      isInvalidAuthTokenFailure(400, {
        code: INVALID_TOKEN_CODE,
        error: 'nope',
      }),
    ).toBe(true);
    expect(
      isInvalidAuthTokenFailure(400, {
        error: 'This reset link is invalid, expired or already used',
      }),
    ).toBe(true);
    expect(
      isInvalidAuthTokenFailure(400, {
        error:
          'A valid token and a password of at least 8 characters are required',
      }),
    ).toBe(false);
    expect(isInvalidAuthTokenFailure(500, { error: 'invalid' })).toBe(false);
  });
});
