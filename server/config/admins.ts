/**
 * Centralized Admin User Configuration
 *
 * This file provides a single source of truth for admin user configuration.
 * Admin emails and roles are loaded from environment variables with fallback defaults.
 *
 * Environment Variables:
 * - MASTER_ADMIN_EMAIL: Email for master admin user(s)
 * - ADMIN_EMAIL: Email for regular admin user(s)
 * - RESELLER_EMAIL: Email for reseller/partner user(s)
 * - CLIENT_EMAIL: Email for client user(s)
 */

import { env } from '../env';

export interface AdminConfig {
  email: string;
  role: 'MasterAdmin' | 'ADMIN' | 'RESELLER' | 'CLIENT';
  description: string;
  plan: string;
}

/**
 * Parse a comma-separated email string into individual entries.
 * e.g. "a@x.com, b@x.com" → ["a@x.com", "b@x.com"]
 */
function parseEmails(raw: string): string[] {
  return raw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * Build AdminConfig entries for a role, supporting comma-separated emails.
 */
function buildAdminEntries(
  envEmails: string | undefined,
  fallback: string,
  role: AdminConfig['role'],
  description: string,
  plan: string,
): AdminConfig[] {
  const emails = parseEmails(envEmails || fallback);
  return emails.map((email) => ({ email, role, description, plan }));
}

/**
 * Admin users configuration
 * Loaded from environment variables with fallback defaults.
 * Each env var supports comma-separated emails for multiple users per role.
 */
export const ADMIN_USERS: AdminConfig[] = [
  ...buildAdminEntries(
    env.MASTER_ADMIN_EMAIL,
    'mreardon@wtpnews.org',
    'MasterAdmin',
    'Master Admin',
    env.MASTER_ADMIN_PLAN || 'ENTERPRISE',
  ),
  ...buildAdminEntries(
    env.ADMIN_EMAIL,
    'jadj19@gmail.com',
    'ADMIN',
    'Admin',
    env.ADMIN_PLAN || 'ENTERPRISE',
  ),
  ...buildAdminEntries(
    env.RESELLER_EMAIL,
    'patriotnewsactivism@gmail.com',
    'RESELLER',
    'Reseller/Partner',
    env.RESELLER_PLAN || 'PROFESSIONAL',
  ),
  ...buildAdminEntries(
    env.CLIENT_EMAIL,
    'news@wtpnews.org',
    'CLIENT',
    'Client',
    env.CLIENT_PLAN || 'FREE',
  ),
];

/**
 * Extract master admin emails for easy checking
 */
export const MASTER_ADMIN_EMAILS = ADMIN_USERS.filter(
  (u) => u.role === 'MasterAdmin',
).map((u) => u.email);

/**
 * Extract all admin emails (master + regular admins)
 */
export const ALL_ADMIN_EMAILS = ADMIN_USERS.filter(
  (u) => u.role === 'MasterAdmin' || u.role === 'ADMIN',
).map((u) => u.email);

/**
 * Extract all privileged user emails (admins + resellers)
 */
export const ALL_PRIVILEGED_EMAILS = ADMIN_USERS.filter(
  (u) => u.role !== 'CLIENT',
).map((u) => u.email);

/**
 * Get admin config by email
 */
export function getAdminByEmail(email: string): AdminConfig | undefined {
  return ADMIN_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

/**
 * Check if email is a master admin
 */
export function isMasterAdmin(email: string): boolean {
  return MASTER_ADMIN_EMAILS.some(
    (adminEmail) => adminEmail.toLowerCase() === email.toLowerCase(),
  );
}

/**
 * Check if email is any type of admin
 */
export function isAdmin(email: string): boolean {
  return ALL_ADMIN_EMAILS.some(
    (adminEmail) => adminEmail.toLowerCase() === email.toLowerCase(),
  );
}

/**
 * Check if email has privileged access (admin or reseller)
 */
export function isPrivileged(email: string): boolean {
  return ALL_PRIVILEGED_EMAILS.some(
    (privilegedEmail) => privilegedEmail.toLowerCase() === email.toLowerCase(),
  );
}
