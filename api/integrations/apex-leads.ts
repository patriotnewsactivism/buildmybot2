import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ApiRequest, ApiResponse } from '../lib/http-types.js';

/**
 * Server-to-server Apex → BuildMyBot lead handoff.
 *
 * Contract: docs/APEX_LEAD_INGEST.md
 * Auth: Authorization: Bearer compared in constant time to APEX_LEAD_INGEST_TOKEN.
 * An unset/blank token disables the route (503 ingest_disabled). It never
 * accepts an unauthenticated caller.
 *
 * Idempotency key on the CRM `leads` table: (organization, source='apex', external_id).
 * The optional payload `source` is the caller's original channel and is stored
 * on metadata.apex.source. The row's source column stays `apex`.
 */

export const APEX_LEADS_PATH = '/api/integrations/apex/leads';
const MAX_LEADS = 200;
const DEFAULT_GET_LIMIT = 50;
const SOURCE = 'apex';
const NIL_LEAD_ID = '00000000-0000-0000-0000-000000000000';
const MIGRATION = 'supabase/migrations/20260925200000_apex_lead_ingest.sql';

const LEAD_COLUMNS = [
  'id',
  'external_id',
  'name',
  'email',
  'phone',
  'company',
  'status',
  'source',
  'notes',
  'metadata',
  'user_id',
  'organization_id',
  'created_at',
  'updated_at',
].join(',');

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^\+?[1-9]\d{1,14}$/;
const SINCE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-Z]+)?$/;
const CONTROL_RE = /[\u0000-\u001F\u007F]/;

type JsonRecord = Record<string, unknown>;

type Tenant = {
  organizationId: string | null;
  userId: string;
};

type NormalizedLead = {
  externalId: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  website: string | null;
  source: string | null;
  notes: string | null;
  tags: string[];
};

type RejectedLead = {
  externalId?: string;
  reason: string;
};

type LeadRow = JsonRecord;

type StoreError = {
  ok: false;
  status: number;
  code: string;
  message: string;
  column?: string;
};

type StoreOk<T> = { ok: true; data: T };

export function tokenMatches(provided: string, expected: string): boolean {
  const left = createHash('sha256').update(provided).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

function ingestToken(): string | null {
  const raw = process.env.APEX_LEAD_INGEST_TOKEN;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function bearerToken(header: unknown): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== 'string') return '';
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value.trim());
  return match?.[1] ?? '';
}

function send(res: ApiResponse, status: number, body: unknown): ApiResponse {
  res.status(status).json(body);
  return res;
}

function quotePostgrest(value: string): string {
  if (/^[A-Za-z0-9_-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function eq(value: string): string {
  return `eq.${quotePostgrest(value)}`;
}

function ilikeExact(value: string): string {
  return `ilike.${quotePostgrest(value)}`;
}

function inList(values: string[]): string {
  return `in.(${values.map(quotePostgrest).join(',')})`;
}

function supabaseConfig(): { url: string; key: string } | null {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  ).trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

function columnFromMessage(message: string): string | undefined {
  const quoted = message.match(/'([A-Za-z0-9_]+)' column/);
  if (quoted?.[1]) return quoted[1];
  const pg = message.match(/column "([A-Za-z0-9_]+)"/i);
  if (pg?.[1]) return pg[1];
  const missing = message.match(/column ([A-Za-z0-9_.]+) does not exist/i);
  return missing?.[1]?.split('.').pop();
}

function isSchemaGap(error: StoreError): boolean {
  if (error.code === 'PGRST204' || error.code === '42703') return true;
  return /column/i.test(error.message) && /schema cache|does not exist/i.test(error.message);
}

function isEmailNotNull(error: StoreError): boolean {
  return error.code === '23502' && /email/i.test(error.message + (error.column || ''));
}

function schemaReason(column: string | undefined): string {
  const name = column ? `leads.${column}` : 'a required leads column';
  return `${name} is not available. Apply ${MIGRATION} after the production migration hold in docs/MIGRATION_BASELINE_RECONCILIATION.md is cleared for this migration.`;
}

function emailNotNullReason(): string {
  return `leads.email is still NOT NULL, so a phone-only lead cannot be stored. Apply ${MIGRATION} after the production migration hold in docs/MIGRATION_BASELINE_RECONCILIATION.md is cleared for this migration.`;
}

async function sbRequest<T>(
  table: string,
  method: 'GET' | 'POST' | 'PATCH',
  query: Record<string, string>,
  body?: unknown,
): Promise<StoreOk<T> | StoreError> {
  const config = supabaseConfig();
  if (!config) {
    return {
      ok: false,
      status: 503,
      code: 'supabase_unconfigured',
      message: 'supabase_unconfigured',
    };
  }
  const url = new URL(`${config.url}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    Accept: 'application/json',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers.Prefer = 'return=representation';
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error('[apex-leads] supabase request failed', {
      table,
      method,
      name: error instanceof Error ? error.name : 'Error',
    });
    return {
      ok: false,
      status: 503,
      code: 'supabase_unreachable',
      message: 'supabase_unreachable',
    };
  }
  const text = await response.text();
  if (!response.ok) {
    let parsed: JsonRecord = {};
    try {
      const value = text ? JSON.parse(text) : {};
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        parsed = value as JsonRecord;
      }
    } catch {
      parsed = { message: text.slice(0, 300) };
    }
    const message = String(parsed.message || parsed.error || text.slice(0, 300));
    const column =
      typeof parsed.column === 'string' ? parsed.column : columnFromMessage(message);
    console.error('[apex-leads] supabase error', {
      table,
      method,
      status: response.status,
      code: parsed.code || '',
      column: column || '',
    });
    return {
      ok: false,
      status: response.status,
      code: String(parsed.code || ''),
      message,
      column,
    };
  }
  if (!text) return { ok: true, data: [] as T };
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return {
      ok: false,
      status: 502,
      code: 'invalid_supabase_response',
      message: 'invalid_supabase_response',
    };
  }
}

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as JsonRecord;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function apexOf(row: LeadRow): JsonRecord {
  return asRecord(asRecord(row.metadata).apex);
}

function tagsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is string => typeof tag === 'string');
}

function companyOf(row: LeadRow): string | null {
  return textOrNull(row.company) ?? textOrNull(apexOf(row).company);
}

function externalIdOf(input: unknown): string | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const value = (input as JsonRecord).externalId;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalText(
  value: unknown,
  max: number,
  reason: string,
): { ok: true; value: string | null } | { ok: false; reason: string } {
  if (value == null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, reason };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false, reason };
  return { ok: true, value: trimmed };
}

export function validateLead(
  input: unknown,
): { ok: true; lead: NormalizedLead } | RejectedLead & { ok: false } {
  const externalId = externalIdOf(input);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, externalId, reason: 'invalid_lead' };
  }
  const raw = input as JsonRecord;
  if (typeof raw.externalId !== 'string' || !raw.externalId.trim()) {
    return { ok: false, reason: 'external_id_required' };
  }
  if (externalId && (externalId.length > 512 || CONTROL_RE.test(externalId))) {
    return { ok: false, externalId, reason: 'invalid_external_id' };
  }
  if (!externalId) return { ok: false, reason: 'external_id_required' };

  let name = '';
  if (raw.name != null) {
    if (typeof raw.name !== 'string') {
      return { ok: false, externalId, reason: 'invalid_name' };
    }
    name = raw.name.trim();
    if (name.length > 500) return { ok: false, externalId, reason: 'invalid_name' };
  }

  const emailField = optionalText(raw.email, 320, 'invalid_email');
  if (!emailField.ok) return { ok: false, externalId, reason: emailField.reason };
  const email = emailField.value ? emailField.value.toLowerCase() : null;
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, externalId, reason: 'invalid_email' };
  }

  const phoneField = optionalText(raw.phone, 32, 'invalid_phone');
  if (!phoneField.ok) return { ok: false, externalId, reason: phoneField.reason };
  let phone: string | null = null;
  if (phoneField.value) {
    const compact = phoneField.value.replace(/[^\d+]/g, '');
    const normalized = compact.startsWith('+')
      ? `+${compact.slice(1).replace(/\+/g, '')}`
      : compact.replace(/\+/g, '');
    if (!PHONE_RE.test(normalized)) {
      return { ok: false, externalId, reason: 'invalid_phone' };
    }
    phone = normalized;
  }

  if (!email && !phone) {
    return { ok: false, externalId, reason: 'contact_required' };
  }

  const company = optionalText(raw.company, 300, 'invalid_company');
  if (!company.ok) return { ok: false, externalId, reason: company.reason };
  const title = optionalText(raw.title, 300, 'invalid_title');
  if (!title.ok) return { ok: false, externalId, reason: title.reason };
  const website = optionalText(raw.website, 2048, 'invalid_website');
  if (!website.ok) return { ok: false, externalId, reason: website.reason };
  const source = optionalText(raw.source, 255, 'invalid_source');
  if (!source.ok) return { ok: false, externalId, reason: source.reason };
  const notes = optionalText(raw.notes, 8000, 'invalid_notes');
  if (!notes.ok) return { ok: false, externalId, reason: notes.reason };

  let tags: string[] = [];
  if (raw.tags != null) {
    if (!Array.isArray(raw.tags) || raw.tags.length > 50) {
      return { ok: false, externalId, reason: 'invalid_tags' };
    }
    for (const tag of raw.tags) {
      if (typeof tag !== 'string' || !tag.trim() || tag.trim().length > 64) {
        return { ok: false, externalId, reason: 'invalid_tags' };
      }
      tags.push(tag.trim());
    }
  }

  return {
    ok: true,
    lead: {
      externalId,
      name,
      email,
      phone,
      company: company.value,
      title: title.value,
      website: website.value,
      source: source.value,
      notes: notes.value,
      tags,
    },
  };
}

function sameLead(row: LeadRow, lead: NormalizedLead): boolean {
  const apex = apexOf(row);
  const rowEmail = textOrNull(row.email)?.toLowerCase() ?? null;
  return (
    (textOrNull(row.name) ?? '') === lead.name &&
    rowEmail === lead.email &&
    (textOrNull(row.phone) ?? null) === lead.phone &&
    companyOf(row) === lead.company &&
    (textOrNull(row.notes) ?? null) === lead.notes &&
    textOrNull(row.source) === SOURCE &&
    textOrNull(row.external_id) === lead.externalId &&
    textOrNull(apex.title) === lead.title &&
    textOrNull(apex.website) === lead.website &&
    textOrNull(apex.source) === lead.source &&
    JSON.stringify(tagsOf(apex.tags)) === JSON.stringify(lead.tags)
  );
}

function snapshot(lead: NormalizedLead): JsonRecord {
  return {
    company: lead.company,
    title: lead.title,
    website: lead.website,
    tags: lead.tags,
    source: lead.source,
  };
}

function writeBody(tenant: Tenant, lead: NormalizedLead, existing?: LeadRow): JsonRecord {
  const metadata = {
    ...asRecord(existing?.metadata),
    apex: snapshot(lead),
  };
  const body: JsonRecord = {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    notes: lead.notes,
    source: SOURCE,
    external_id: lead.externalId,
    metadata,
    updated_at: new Date().toISOString(),
  };
  if (!existing) {
    body.id = randomUUID();
    body.user_id = tenant.userId;
    body.organization_id = tenant.organizationId;
    body.status = 'New';
    body.score = 50;
    body.created_at = body.updated_at;
  }
  return body;
}

function tenantFilters(tenant: Tenant): Record<string, string> {
  if (tenant.organizationId) {
    return { organization_id: eq(tenant.organizationId) };
  }
  return {
    user_id: eq(tenant.userId),
    organization_id: 'is.null',
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

async function loadExisting(
  tenant: Tenant,
  externalIds: string[],
): Promise<StoreOk<LeadRow[]> | StoreError> {
  const rows: LeadRow[] = [];
  for (const group of chunks(externalIds, 50)) {
    const result = await sbRequest<LeadRow[]>('leads', 'GET', {
      select: LEAD_COLUMNS,
      source: eq(SOURCE),
      external_id: inList(group),
      ...tenantFilters(tenant),
    });
    if (!result.ok) return result;
    if (Array.isArray(result.data)) rows.push(...result.data);
  }
  return { ok: true, data: rows };
}

async function probeSchema(): Promise<StoreOk<unknown> | StoreError> {
  return sbRequest('leads', 'GET', {
    select: LEAD_COLUMNS,
    id: eq(NIL_LEAD_ID),
    limit: '1',
  });
}

function readBody(req: ApiRequest): JsonRecord | null {
  const body = req.body;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as JsonRecord;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as JsonRecord;
}

function queryParams(req: ApiRequest): URLSearchParams {
  const url = new URL(req.url || '/', 'http://localhost');
  const params = url.searchParams;
  const query = (req as ApiRequest & { query?: unknown }).query;
  if (query && typeof query === 'object' && !Array.isArray(query)) {
    for (const [key, value] of Object.entries(query as JsonRecord)) {
      if (!params.has(key) && typeof value === 'string') params.set(key, value);
    }
  }
  return params;
}

function optionalIdentifier(
  value: unknown,
): { ok: true; value?: string } | { ok: false } {
  if (value == null || value === '') return { ok: true };
  if (typeof value !== 'string' || !value.trim()) return { ok: false };
  return { ok: true, value: value.trim() };
}

async function resolveOrg(orgId: string): Promise<Tenant | null | StoreError> {
  if (!ID_RE.test(orgId)) return null;
  const orgs = await sbRequest<LeadRow[]>('organizations', 'GET', {
    select: 'id,owner_id',
    id: eq(orgId),
    limit: '1',
  });
  if (!orgs.ok) return orgs;
  const org = Array.isArray(orgs.data) ? orgs.data[0] : undefined;
  if (org) {
    const ownerId = textOrNull(org.owner_id);
    if (ownerId && ID_RE.test(ownerId)) {
      const owner = await sbRequest<LeadRow[]>('users', 'GET', {
        select: 'id,status,organization_id',
        id: eq(ownerId),
        limit: '1',
      });
      if (!owner.ok) return owner;
      const row = Array.isArray(owner.data) ? owner.data[0] : undefined;
      if (row && textOrNull(row.status) !== 'Suspended') {
        return { organizationId: orgId, userId: String(row.id) };
      }
    }
  }
  const members = await sbRequest<LeadRow[]>('users', 'GET', {
    select: 'id,role,status,organization_id',
    organization_id: eq(orgId),
    limit: '20',
  });
  if (!members.ok) return members;
  const active = (Array.isArray(members.data) ? members.data : []).filter(
    (user) => textOrNull(user.status) !== 'Suspended' && textOrNull(user.id),
  );
  if (!org && active.length === 0) return null;
  const preferred =
    active.find((user) => textOrNull(user.role)?.toUpperCase() === 'OWNER') ||
    active[0];
  if (!preferred) return null;
  return { organizationId: orgId, userId: String(preferred.id) };
}

async function resolveEmail(ownerEmail: string): Promise<Tenant | null | StoreError | 'ambiguous'> {
  const email = ownerEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  const users = await sbRequest<LeadRow[]>('users', 'GET', {
    select: 'id,email,organization_id,role,status',
    email: ilikeExact(email),
    limit: '2',
  });
  if (!users.ok) return users;
  const rows = (Array.isArray(users.data) ? users.data : []).filter(
    (user) => textOrNull(user.status) !== 'Suspended',
  );
  if (rows.length === 0) return null;
  if (rows.length > 1) return 'ambiguous';
  const user = rows[0];
  const userId = textOrNull(user.id);
  if (!userId) return null;
  return {
    organizationId: textOrNull(user.organization_id),
    userId,
  };
}

function isStoreError(value: unknown): value is StoreError {
  return Boolean(value && typeof value === 'object' && (value as StoreError).ok === false);
}

function tenantsMatch(orgTenant: Tenant, emailTenant: Tenant): boolean {
  if (orgTenant.organizationId && emailTenant.organizationId) {
    return orgTenant.organizationId === emailTenant.organizationId;
  }
  if (orgTenant.organizationId && !emailTenant.organizationId) {
    return emailTenant.userId === orgTenant.userId;
  }
  return orgTenant.userId === emailTenant.userId && !emailTenant.organizationId;
}

async function resolveTenant(
  orgId: string | undefined,
  ownerEmail: string | undefined,
): Promise<
  | { ok: true; tenant: Tenant }
  | { ok: false; status: number; body: JsonRecord }
> {
  if (!orgId && !ownerEmail) {
    return { ok: false, status: 400, body: { error: 'tenant_unresolved' } };
  }
  const orgTenant = orgId ? await resolveOrg(orgId) : null;
  if (isStoreError(orgTenant)) {
    return {
      ok: false,
      status: 503,
      body: { error: 'lead_store_unavailable', reason: orgTenant.code || 'supabase_error' },
    };
  }
  const emailTenant = ownerEmail ? await resolveEmail(ownerEmail) : null;
  if (isStoreError(emailTenant)) {
    return {
      ok: false,
      status: 503,
      body: { error: 'lead_store_unavailable', reason: emailTenant.code || 'supabase_error' },
    };
  }
  if (orgId && !orgTenant) {
    return { ok: false, status: 400, body: { error: 'tenant_unresolved' } };
  }
  if (ownerEmail && (!emailTenant || emailTenant === 'ambiguous')) {
    return {
      ok: false,
      status: 400,
      body: { error: emailTenant === 'ambiguous' ? 'tenant_ambiguous' : 'tenant_unresolved' },
    };
  }
  if (orgTenant && emailTenant && emailTenant !== 'ambiguous') {
    if (!tenantsMatch(orgTenant, emailTenant)) {
      return { ok: false, status: 400, body: { error: 'tenant_mismatch' } };
    }
    return {
      ok: true,
      tenant: {
        organizationId: orgTenant.organizationId,
        userId: emailTenant.userId || orgTenant.userId,
      },
    };
  }
  const tenant = orgTenant || (emailTenant && emailTenant !== 'ambiguous' ? emailTenant : null);
  if (!tenant) return { ok: false, status: 400, body: { error: 'tenant_unresolved' } };
  return { ok: true, tenant };
}

function schemaResponse(error: StoreError): { status: number; body: JsonRecord } | null {
  if (isSchemaGap(error)) {
    return {
      status: 503,
      body: { error: 'schema_not_ready', reason: schemaReason(error.column) },
    };
  }
  if (isEmailNotNull(error)) {
    return {
      status: 503,
      body: { error: 'schema_not_ready', reason: emailNotNullReason() },
    };
  }
  return null;
}

function storeUnavailable(error: StoreError): { status: number; body: JsonRecord } {
  return {
    status: 503,
    body: {
      error: 'lead_store_unavailable',
      reason: error.code || 'supabase_error',
    },
  };
}

type WriteSuccess = {
  action: 'accepted' | 'updated' | 'duplicates';
  row: LeadRow;
};

async function applyWrite(
  tenant: Tenant,
  lead: NormalizedLead,
  existing: LeadRow | undefined,
): Promise<WriteSuccess | RejectedLead | StoreError> {
  if (existing && sameLead(existing, lead)) {
    return { action: 'duplicates', row: existing };
  }
  const filters: Record<string, string> = {
    id: eq(String(existing?.id || '')),
    source: eq(SOURCE),
    external_id: eq(lead.externalId),
    ...tenantFilters(tenant),
  };
  if (existing?.id) {
    const patch = writeBody(tenant, lead, existing);
    const updated = await sbRequest<LeadRow[]>('leads', 'PATCH', filters, patch);
    if (!updated.ok) return updated;
    const row = rowsOf(updated.data)[0];
    if (!row) return { externalId: lead.externalId, reason: 'store_failed' };
    return { action: 'updated', row };
  }
  const inserted = await sbRequest<LeadRow[]>(
    'leads',
    'POST',
    {},
    writeBody(tenant, lead),
  );
  if (inserted.ok) {
    const row = rowsOf(inserted.data)[0];
    if (!row) return { externalId: lead.externalId, reason: 'store_failed' };
    return { action: 'accepted', row };
  }
  if (inserted.code !== '23505') return inserted;
  const again = await loadExisting(tenant, [lead.externalId]);
  if (!again.ok) return again;
  const raced = again.data.find((item) => textOrNull(item.external_id) === lead.externalId);
  if (!raced) return { externalId: lead.externalId, reason: 'store_failed' };
  if (sameLead(raced, lead)) return { action: 'duplicates', row: raced };
  const patch = writeBody(tenant, lead, raced);
  const patched = await sbRequest<LeadRow[]>(
    'leads',
    'PATCH',
    {
      id: eq(String(raced.id)),
      source: eq(SOURCE),
      external_id: eq(lead.externalId),
      ...tenantFilters(tenant),
    },
    patch,
  );
  if (!patched.ok) return patched;
  const row = rowsOf(patched.data)[0];
  if (!row) return { externalId: lead.externalId, reason: 'store_failed' };
  return { action: 'updated', row };
}

function rowsOf(data: unknown): LeadRow[] {
  if (Array.isArray(data)) return data as LeadRow[];
  if (data && typeof data === 'object') return [data as LeadRow];
  return [];
}

function toPublicLead(row: LeadRow): JsonRecord {
  const externalId = textOrNull(row.external_id);
  const createdAt = textOrNull(row.created_at) ?? '';
  const lead: JsonRecord = {
    id: String(row.id ?? ''),
    name: textOrNull(row.name) ?? '',
    email: textOrNull(row.email) ?? '',
    phone: textOrNull(row.phone) ?? '',
    company: companyOf(row) ?? '',
    status: textOrNull(row.status) ?? 'New',
    source: textOrNull(row.source) ?? '',
    createdAt,
    updatedAt: textOrNull(row.updated_at) ?? createdAt,
  };
  if (externalId) lead.externalId = externalId;
  return lead;
}

async function handleGet(req: ApiRequest, res: ApiResponse): Promise<ApiResponse> {
  const params = queryParams(req);
  const orgId = optionalIdentifier(params.get('orgId'));
  const ownerEmail = optionalIdentifier(params.get('ownerEmail'));
  if (!orgId.ok || !ownerEmail.ok) {
    return send(res, 400, { error: 'tenant_unresolved' });
  }
  const sinceRaw = params.get('since');
  if (sinceRaw != null && sinceRaw !== '') {
    if (!SINCE_RE.test(sinceRaw) || Number.isNaN(Date.parse(sinceRaw)) || sinceRaw.length > 40) {
      return send(res, 400, { error: 'invalid_since' });
    }
  }
  const limitRaw = params.get('limit');
  let limit = DEFAULT_GET_LIMIT;
  if (limitRaw != null && limitRaw !== '') {
    if (!/^\d+$/.test(limitRaw)) return send(res, 400, { error: 'invalid_limit' });
    limit = Number(limitRaw);
    if (limit < 1 || limit > MAX_LEADS) return send(res, 400, { error: 'invalid_limit' });
  }
  const resolved = await resolveTenant(orgId.value, ownerEmail.value);
  if (!resolved.ok) return send(res, resolved.status, resolved.body);
  const probe = await probeSchema();
  if (!probe.ok) {
    const schema = schemaResponse(probe);
    if (schema) return send(res, schema.status, schema.body);
    return send(res, storeUnavailable(probe).status, storeUnavailable(probe).body);
  }
  const query: Record<string, string> = {
    select: LEAD_COLUMNS,
    order: 'created_at.desc',
    limit: String(limit),
    ...tenantFilters(resolved.tenant),
  };
  if (sinceRaw) {
    const quoted = `"${sinceRaw}"`;
    query.or = `(created_at.gte.${quoted},updated_at.gte.${quoted})`;
  }
  const rows = await sbRequest<LeadRow[]>('leads', 'GET', query);
  if (!rows.ok) {
    const schema = schemaResponse(rows);
    if (schema) return send(res, schema.status, schema.body);
    return send(res, storeUnavailable(rows).status, storeUnavailable(rows).body);
  }
  const leads = (Array.isArray(rows.data) ? rows.data : [])
    .slice()
    .sort((left, right) => {
      const created =
        Date.parse(String(right.created_at || '')) - Date.parse(String(left.created_at || ''));
      if (created !== 0) return created;
      return Date.parse(String(right.updated_at || '')) - Date.parse(String(left.updated_at || ''));
    })
    .map(toPublicLead);
  return send(res, 200, { leads });
}

async function handlePost(req: ApiRequest, res: ApiResponse): Promise<ApiResponse> {
  const body = readBody(req);
  if (!body) return send(res, 400, { error: 'invalid_body' });
  if (body.dryRun !== undefined && typeof body.dryRun !== 'boolean') {
    return send(res, 400, { error: 'invalid_dry_run' });
  }
  const dryRun = body.dryRun !== false;
  if (!Array.isArray(body.leads)) return send(res, 400, { error: 'leads_required' });
  if (body.leads.length > MAX_LEADS) {
    return send(res, 413, { error: 'too_many_leads' });
  }
  const orgId = optionalIdentifier(body.orgId);
  const ownerEmail = optionalIdentifier(body.ownerEmail);
  if (!orgId.ok || !ownerEmail.ok) {
    return send(res, 400, { error: 'tenant_unresolved' });
  }
  const resolved = await resolveTenant(orgId.value, ownerEmail.value);
  if (!resolved.ok) return send(res, resolved.status, resolved.body);

  const rejected: RejectedLead[] = [];
  const valid: NormalizedLead[] = [];
  for (const input of body.leads) {
    const result = validateLead(input);
    if (!result.ok) {
      rejected.push(
        result.externalId
          ? { externalId: result.externalId, reason: result.reason }
          : { reason: result.reason },
      );
      continue;
    }
    valid.push(result.lead);
  }
  if (valid.length === 0) {
    return send(res, 200, {
      dryRun,
      accepted: 0,
      updated: 0,
      duplicates: 0,
      rejected,
    });
  }

  const probe = await probeSchema();
  if (!probe.ok) {
    const schema = schemaResponse(probe);
    if (schema) return send(res, schema.status, schema.body);
    return send(res, storeUnavailable(probe).status, storeUnavailable(probe).body);
  }

  const existing = await loadExisting(
    resolved.tenant,
    valid.map((lead) => lead.externalId),
  );
  if (!existing.ok) {
    const schema = schemaResponse(existing);
    if (schema) return send(res, schema.status, schema.body);
    return send(res, storeUnavailable(existing).status, storeUnavailable(existing).body);
  }

  const byExternalId = new Map<string, LeadRow>();
  for (const row of existing.data) {
    const key = textOrNull(row.external_id);
    if (key && !byExternalId.has(key)) byExternalId.set(key, row);
  }

  let accepted = 0;
  let updated = 0;
  let duplicates = 0;
  for (const lead of valid) {
    const current = byExternalId.get(lead.externalId);
    if (dryRun) {
      if (!current) {
        accepted += 1;
        byExternalId.set(lead.externalId, writeBody(resolved.tenant, lead));
      } else if (sameLead(current, lead)) {
        duplicates += 1;
      } else {
        updated += 1;
        byExternalId.set(lead.externalId, {
          ...current,
          ...writeBody(resolved.tenant, lead, current),
        });
      }
      continue;
    }
    const outcome = await applyWrite(resolved.tenant, lead, current);
    if (!('action' in outcome)) {
      if (isStoreError(outcome)) {
        const schema = schemaResponse(outcome);
        if (schema) return send(res, schema.status, schema.body);
        rejected.push({ externalId: lead.externalId, reason: 'store_failed' });
        continue;
      }
      rejected.push(outcome);
      continue;
    }
    if (outcome.action === 'accepted') accepted += 1;
    else if (outcome.action === 'updated') updated += 1;
    else duplicates += 1;
    byExternalId.set(lead.externalId, outcome.row);
  }

  return send(res, 200, { dryRun, accepted, updated, duplicates, rejected });
}

export default async function handler(
  req: ApiRequest,
  res: ApiResponse,
): Promise<ApiResponse> {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const expected = ingestToken();
  if (!expected) return send(res, 503, { error: 'ingest_disabled' });
  const provided = bearerToken(req.headers.authorization ?? req.headers.Authorization);
  if (!tokenMatches(provided, expected)) {
    return send(res, 401, { error: 'unauthorized' });
  }
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return send(res, 405, { error: 'method_not_allowed' });
}
