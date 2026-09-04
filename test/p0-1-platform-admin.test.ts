/**
 * P0-1 regression tests — Owner → Platform Admin privilege escalation.
 *
 * Root defect (found 2026-09-03): ~14 call sites across handleAdmin,
 * handleConversations, handleAudit, handleAiEmployees, handleEmail,
 * handleBotErrors, handleUsers, and handleVoice used an inline
 * `['admin','ADMIN','owner','OWNER'].includes(user.role)` (or bare
 * `user.role !== 'admin'`) check. Including 'owner'/'OWNER' meant every
 * ordinary paying customer — whose role is legitimately OWNER, the correct
 * role for a customer account owner — was treated as a PLATFORM
 * administrator with full cross-tenant access. Separately, public signup
 * (api/auth/signup.ts) and the frontend (App.tsx) granted real ADMIN/
 * MasterAdmin status based on a hard-coded email allowlist.
 *
 * These tests lock in the fix: isPlatformAdmin() is the only function
 * allowed to grant platform-admin access, it must never treat OWNER as
 * admin under any casing, and public signup must never grant admin status
 * from an email address.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPlatformAdmin } from '../api/gateway-legacy.js';

const repoRoot = path.resolve(__dirname, '..');

/** Strips // and /* *\/ comments so regression checks only match real code, not the
 * explanatory comments (which intentionally quote the old vulnerable pattern). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function user(role: string | null | undefined) {
  return { id: 'u1', email: 'x@example.com', role: role as string, organizationId: 'org1' };
}

describe('P0-1: isPlatformAdmin never treats OWNER as platform admin', () => {
  it.each(['OWNER', 'owner', 'Owner'])('rejects role=%s', (role) => {
    expect(isPlatformAdmin(user(role))).toBe(false);
  });

  it.each(['ADMIN', 'admin', 'Admin', 'MasterAdmin', 'MASTER_ADMIN', 'masteradmin'])(
    'accepts real platform-admin role=%s',
    (role) => {
      expect(isPlatformAdmin(user(role))).toBe(true);
    },
  );

  it.each(['RESELLER', 'CLIENT', 'SALES_AGENT', 'PARTNER', 'AFFILIATE', 'garbage', ''])(
    'rejects any other role=%s',
    (role) => {
      expect(isPlatformAdmin(user(role))).toBe(false);
    },
  );

  it('rejects missing/null user or role', () => {
    expect(isPlatformAdmin(null)).toBe(false);
    expect(isPlatformAdmin(undefined)).toBe(false);
    expect(isPlatformAdmin(user(null))).toBe(false);
    expect(isPlatformAdmin(user(undefined))).toBe(false);
  });

  it('gateway-legacy.ts no longer contains the unsafe inline owner-as-admin pattern', () => {
    const src = stripComments(readFileSync(path.join(repoRoot, 'api/gateway-legacy.ts'), 'utf8'));
    expect(src).not.toMatch(/\['admin',\s*'ADMIN',\s*'owner',\s*'OWNER'\]\s*\.includes/);
    // No remaining bare lowercase-only admin check either (case-sensitivity bug
    // that would deny real ADMIN/MasterAdmin rows their own override).
    expect(src).not.toMatch(/user\.role\s*!==\s*'admin'/);
  });
});

describe('P0-1: public signup never grants platform-admin from an email address', () => {
  const src = stripComments(readFileSync(path.join(repoRoot, 'api/auth/signup.ts'), 'utf8'));

  it('has no MASTER_ADMINS email allowlist', () => {
    expect(src).not.toMatch(/const MASTER_ADMINS/);
    expect(src).not.toMatch(/MASTER_ADMINS\.includes/);
  });

  it('always assigns role OWNER and plan FREE, unconditionally', () => {
    expect(src).toMatch(/role:\s*'OWNER'/);
    expect(src).toMatch(/plan:\s*'FREE'/);
    // Guard against a future re-introduction of a conditional role/plan.
    expect(src).not.toMatch(/role:\s*isAdmin/);
    expect(src).not.toMatch(/plan:\s*isAdmin/);
  });
});

describe('P0-1: frontend no longer self-grants MasterAdmin from an email address', () => {
  const src = stripComments(readFileSync(path.join(repoRoot, 'App.tsx'), 'utf8'));

  it('has no MASTER_ADMINS email allowlist', () => {
    expect(src).not.toMatch(/const MASTER_ADMINS/);
  });

  it('maps the mapped-user role straight from the server-verified authUser.role', () => {
    expect(src).toMatch(/const effectiveRole = \(authUser\.role as UserRole\) \|\| UserRole\.OWNER;/);
  });
});
