/**
 * Central authorization model.
 *
 * P0 FIX: the codebase historically treated the string 'OWNER' as if it meant
 * "platform owner" and granted it platform-wide access
 * (`['admin','ADMIN','owner','OWNER'].includes(user.role)`). But
 * api/auth/signup.ts assigns 'OWNER' to EVERY normal signup, so every
 * customer who ever registered had admin access to the whole platform:
 * every tenant's users, revenue, audit logs, error logs and AI-employee
 * controls.
 *
 * The model is now explicit:
 *   - OWNER      → customer/organization owner. Full rights INSIDE their own
 *                  tenant, zero platform-wide rights.
 *   - ADMIN /
 *     MasterAdmin/
 *     SUPER_ADMIN → BuildMyBot staff. Platform-wide access.
 *
 * Role strings in the DB are inconsistently cased ('admin', 'ADMIN',
 * 'MasterAdmin', 'SALES_AGENT', 'reseller'), so comparisons normalize by
 * uppercasing and stripping non-alphanumerics.
 */

export interface RoleBearer {
  id?: string;
  role?: string | null;
}

function normalizeRole(role: string | null | undefined): string {
  return String(role || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Roles that grant BuildMyBot staff (platform-wide) access. */
const PLATFORM_ADMIN_ROLES = new Set([
  'ADMIN',
  'MASTERADMIN',
  'SUPERADMIN',
  'PLATFORMADMIN',
  'STAFF',
]);

/** Roles that own a customer tenant. NOT platform admins. */
const TENANT_OWNER_ROLES = new Set(['OWNER', 'ORGOWNER', 'ACCOUNTOWNER']);

/** True only for real BuildMyBot staff. 'OWNER' is never platform admin. */
export function isPlatformAdmin(user: RoleBearer | null | undefined): boolean {
  if (!user) return false;
  return PLATFORM_ADMIN_ROLES.has(normalizeRole(user.role));
}

/** True for a customer/organization owner (their own tenant only). */
export function isTenantOwner(user: RoleBearer | null | undefined): boolean {
  if (!user) return false;
  const r = normalizeRole(user.role);
  return TENANT_OWNER_ROLES.has(r) || PLATFORM_ADMIN_ROLES.has(r);
}

/**
 * Guard for platform-admin-only routes. Returns true when the request has
 * already been answered with 403 (caller should return immediately).
 */
export function denyIfNotPlatformAdmin(
  user: RoleBearer | null | undefined,
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
): boolean {
  if (isPlatformAdmin(user)) return false;
  res.status(403).json({ error: 'Platform admin access required' });
  return true;
}
