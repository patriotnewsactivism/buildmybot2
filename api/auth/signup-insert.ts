// Signup row shape for public.users.
//
// email_verified is written only when that column is in the PostgREST
// schema cache. Production (blyebndyrojmreensbxe) does not have the column
// until supabase/migrations/20260925120000_auth_tokens_and_email_verification.sql
// is applied after baseline reconciliation. The column default is false,
// which matches this payload, so a retry that omits the field still creates
// an unverified account once the column exists.

export const SIGNUP_USER_INSERT_COLUMNS = [
  'id',
  'email',
  'name',
  'password_hash',
  'role',
  'plan',
  'status',
  'company_name',
  'referred_by',
  'preferences',
  'email_verified',
  'referral_credits',
  'reseller_client_count',
  'whitelabel_enabled',
  'created_at',
] as const;

export interface SignupUserInsertInput {
  id: string;
  email: string;
  passwordHash: string;
  name?: string | null;
  companyName?: string | null;
  referredBy?: string | null;
  createdAt?: string;
}

export function buildSignupUserInsert(
  input: SignupUserInsertInput,
): Record<string, unknown> {
  const email = input.email.toLowerCase();
  return {
    id: input.id,
    email,
    name: input.name || email.split('@')[0],
    password_hash: input.passwordHash,
    role: 'OWNER',
    plan: 'FREE',
    status: 'Active',
    company_name: input.companyName || null,
    referred_by: input.referredBy || null,
    preferences: {},
    email_verified: false,
    referral_credits: 0,
    reseller_client_count: 0,
    whitelabel_enabled: false,
    created_at: input.createdAt ?? new Date().toISOString(),
  };
}

export function omitColumn(
  row: Record<string, unknown>,
  column: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key !== column) next[key] = value;
  }
  return next;
}

/**
 * PostgREST PGRST204: the named column is not in the schema cache
 * (the column was never added, or the cache has not reloaded).
 * Returns the missing column name, or null for every other failure.
 */
export function postgrestMissingColumn(
  status: number,
  body: string,
): string | null {
  if (status !== 400) return null;
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as {
      code?: unknown;
      message?: unknown;
    };
    if (parsed.code !== 'PGRST204') return null;
    const message = typeof parsed.message === 'string' ? parsed.message : '';
    const quoted = message.match(/Could not find the '([^']+)' column/i);
    return quoted?.[1] ?? null;
  } catch {
    return null;
  }
}
