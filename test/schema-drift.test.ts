/**
 * Lightweight schema-drift gate.
 *
 * Fails when signup (or the auth-token writer) references a users /
 * auth_tokens column that no timestamped migration introduces and that the
 * production-shaped Drizzle users table does not already list. Also rejects
 * new migration files that lack a 14-digit version prefix — the untimestamped
 * p1_auth_tokens_and_verification.sql file is why email_verified never reached
 * production.
 *
 * This test does not connect to a database.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SIGNUP_USER_INSERT_COLUMNS } from '../api/auth/signup-insert.js';

const repoRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(repoRoot, 'supabase/migrations');

/** Pre-existing files that are not 14-digit Supabase versions. Do not add new names. */
const LEGACY_MIGRATION_FILES = new Set([
  'ai_employees.sql',
  '20260904_p2_growth.sql',
  '20260904_stripe_webhook_idempotency.sql',
]);

const AUTH_MIGRATION = '20260925120000_auth_tokens_and_email_verification.sql';
const VERSIONED_MIGRATION = /^\d{14}_[a-z0-9_]+\.sql$/;

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function migrationFiles(): string[] {
  return readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'));
}

function addedColumns(sql: string, table: string): Set<string> {
  const columns = new Set<string>();
  const alter = new RegExp(
    `alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(?:public\\.)?${table}\\s+add\\s+column\\s+if\\s+not\\s+exists\\s+([a-z_][a-z0-9_]*)`,
    'gi',
  );
  for (const match of sql.matchAll(alter)) {
    columns.add(match[1].toLowerCase());
  }
  return columns;
}

function createdTableColumns(sql: string, table: string): Set<string> {
  const columns = new Set<string>();
  const create = new RegExp(
    `create\\s+table\\s+if\\s+not\\s+exists\\s+(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
    'i',
  );
  const body = sql.match(create)?.[1];
  if (!body) return columns;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim().replace(/,$/, '');
    if (!line || line.startsWith('--')) continue;
    if (/^(constraint|primary|unique|check|foreign)\b/i.test(line)) continue;
    const name = line.match(/^([a-z_][a-z0-9_]*)\s+/i)?.[1];
    if (name) columns.add(name.toLowerCase());
  }
  return columns;
}

function usersColumnsFromDrizzle(schemaSource: string): Set<string> {
  const block = schemaSource.match(
    /export const users = pgTable\(\s*'users',\s*\{([\s\S]*?)\n\}\);/,
  );
  if (!block)
    throw new Error('public.users table not found in shared/schema.ts');
  const columns = new Set<string>();
  for (const match of block[1].matchAll(/\w+\(\s*'([a-z0-9_]+)'/g)) {
    columns.add(match[1]);
  }
  return columns;
}

describe('migration filenames stay in Supabase version order', () => {
  it('allows only timestamped migrations plus the known legacy filenames', () => {
    const unexpected = migrationFiles().filter(
      (name) =>
        !VERSIONED_MIGRATION.test(name) && !LEGACY_MIGRATION_FILES.has(name),
    );
    expect(unexpected).toEqual([]);
  });

  it('does not keep the untimestamped auth-token draft', () => {
    expect(migrationFiles()).not.toContain(
      'p1_auth_tokens_and_verification.sql',
    );
    expect(migrationFiles()).toContain(AUTH_MIGRATION);
  });
});

describe('signup and verification columns are present in timestamped migrations', () => {
  const versionedSql = migrationFiles()
    .filter((name) => VERSIONED_MIGRATION.test(name))
    .map((name) => readFileSync(path.join(migrationsDir, name), 'utf8'))
    .join('\n');
  const authSql = read(`supabase/migrations/${AUTH_MIGRATION}`);
  const drizzleUsers = usersColumnsFromDrizzle(read('shared/schema.ts'));
  const usersFromMigrations = addedColumns(versionedSql, 'users');

  it('covers every signup insert column from Drizzle or a versioned migration', () => {
    const missing = SIGNUP_USER_INSERT_COLUMNS.filter(
      (column) => !drizzleUsers.has(column) && !usersFromMigrations.has(column),
    );
    expect(missing).toEqual([]);
  });

  it('defines email verification columns on users in the timestamped auth migration', () => {
    expect(addedColumns(authSql, 'users')).toEqual(
      new Set(['email_verified', 'email_verified_at']),
    );
    expect(authSql).toMatch(
      /ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false/i,
    );
    expect(authSql).toMatch(
      /ADD COLUMN IF NOT EXISTS email_verified_at timestamptz/i,
    );
  });

  it('defines auth_tokens columns the token writer inserts', () => {
    const columns = createdTableColumns(authSql, 'auth_tokens');
    for (const column of [
      'id',
      'user_id',
      'type',
      'token_hash',
      'expires_at',
      'used_at',
      'created_at',
    ]) {
      expect(columns.has(column)).toBe(true);
    }
    const tokenSource = read('api/lib/auth-tokens.ts');
    expect(tokenSource).toContain('token_hash: hashToken(raw)');
    expect(tokenSource).toContain('type,');
    const gateway = read('api/gateway-legacy.ts');
    expect(gateway).toContain(
      '{ email_verified: true, email_verified_at: new Date().toISOString() }',
    );
    expect(gateway).toContain('email_verified: true');
    expect(gateway).toContain('email_verified_at: new Date().toISOString()');
  });

  it('is additive, idempotent, and asks PostgREST to reload', () => {
    expect(authSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.auth_tokens/i);
    expect(authSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS auth_tokens_token_hash_idx/i,
    );
    expect(authSql).not.toMatch(/\bdrop\s+(table|column)\b/i);
    expect(authSql).not.toMatch(/created_at\s*<\s*now\(\)/i);

    const marker = authSql.indexOf(
      "IF marker LIKE 'auth-verification grandfather applied%'",
    );
    const update = authSql.indexOf('UPDATE public.users');
    expect(marker).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(marker);
    expect(authSql).toContain(
      'auth-verification grandfather applied; later unverified signups stay unverified until they confirm',
    );

    expect(authSql.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(
      true,
    );
    expect(authSql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(authSql).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.auth_tokens TO service_role/i,
    );
  });
});
