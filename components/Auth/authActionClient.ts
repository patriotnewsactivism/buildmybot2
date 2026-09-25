import { buildApiUrl, safeParseJson } from '../../services/apiConfig';
import { isInvalidAuthTokenFailure } from '../../shared/auth-links';

export type AuthActionOutcome =
  | { status: 'success'; message: string }
  | { status: 'invalid'; message: string }
  | { status: 'error'; message: string };

interface AuthActionBody {
  error?: string;
  message?: string;
  success?: boolean;
  code?: string;
}

const verificationFlights = new Map<string, Promise<AuthActionOutcome>>();

/** Test hook. Production callers never need to drop an in-flight verification. */
export function resetAuthActionClientForTests(): void {
  verificationFlights.clear();
}

async function postAuthAction(
  path: string,
  body: Record<string, string>,
): Promise<AuthActionOutcome> {
  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch {
    return {
      status: 'error',
      message: 'Unable to reach the server. Please try again.',
    };
  }

  const data = await safeParseJson<AuthActionBody>(response);
  if (response.ok && data?.success) {
    return {
      status: 'success',
      message: data.message || 'Done',
    };
  }

  const message =
    data?.error ||
    (response.ok
      ? 'Unexpected response from server'
      : `Request failed (${response.status})`);

  if (isInvalidAuthTokenFailure(response.status, data)) {
    return { status: 'invalid', message };
  }
  return { status: 'error', message };
}

/**
 * Verifies an email token once per page load. React Strict Mode remounts
 * effects in development; a second POST would burn the single-use token
 * and then report it as already used.
 */
export function verifyEmailToken(token: string): Promise<AuthActionOutcome> {
  const existing = verificationFlights.get(token);
  if (existing) return existing;

  const flight = postAuthAction('/auth/verify-email', { token }).then(
    (outcome) => {
      if (outcome.status === 'error') verificationFlights.delete(token);
      return outcome;
    },
  );
  verificationFlights.set(token, flight);
  return flight;
}

export function resetPasswordWithToken(
  token: string,
  password: string,
): Promise<AuthActionOutcome> {
  return postAuthAction('/auth/reset-password', { token, password });
}
