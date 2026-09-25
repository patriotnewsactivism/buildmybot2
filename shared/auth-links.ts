/**
 * Browser paths for single-use auth emails.
 *
 * The mailers in api/lib/auth-tokens.ts and api/gateway-legacy.ts and the
 * React routes in App.tsx must import these constants. Hard-coding a
 * different path sends the recipient to the catch-all redirect.
 */

export const VERIFY_EMAIL_PATH = '/verify-email';
export const RESET_PASSWORD_PATH = '/reset-password';

/** Matches POST /api/auth/reset-password. Signup UI copy is separate. */
export const MIN_PASSWORD_LENGTH = 8;

export const INVALID_TOKEN_CODE = 'invalid_token';
export const INVALID_PASSWORD_CODE = 'invalid_password';

export type AuthEmailAction = 'email_verification' | 'password_reset';

export function authEmailPath(action: AuthEmailAction): string {
  return action === 'email_verification'
    ? VERIFY_EMAIL_PATH
    : RESET_PASSWORD_PATH;
}

/** Absolute link placed in verification and password-reset emails. */
export function buildAuthActionLink(
  baseUrl: string,
  action: AuthEmailAction,
  token: string,
): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}${authEmailPath(action)}?token=${encodeURIComponent(token)}`;
}

export function passwordMeetsPolicy(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

/**
 * Client-side check for the reset form. Returns a user-facing message, or
 * null when the pair can be submitted.
 */
export function validatePasswordConfirmation(
  password: string,
  confirm: string,
): string | null {
  if (!passwordMeetsPolicy(password)) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password !== confirm) {
    return 'Passwords do not match';
  }
  return null;
}

export function invalidTokenBody(message: string): {
  error: string;
  code: typeof INVALID_TOKEN_CODE;
} {
  return { error: message, code: INVALID_TOKEN_CODE };
}

export function invalidPasswordBody(): {
  error: string;
  code: typeof INVALID_PASSWORD_CODE;
} {
  return {
    error: `A valid token and a password of at least ${MIN_PASSWORD_LENGTH} characters are required`,
    code: INVALID_PASSWORD_CODE,
  };
}

export function isInvalidAuthTokenFailure(
  status: number,
  body: { error?: string; code?: string } | null | undefined,
): boolean {
  if (body?.code === INVALID_TOKEN_CODE) return true;
  const message = body?.error || '';
  return status === 400 && /invalid|expired|already used/i.test(message);
}
