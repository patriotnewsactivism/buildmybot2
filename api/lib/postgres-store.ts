import postgres from 'postgres';

type Row = Record<string, unknown>;
type Filters = Record<string, string>;

let client: ReturnType<typeof postgres> | null = null;

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  if (!client) {
    client = postgres(url, {
      max: Number(process.env.DB_POOL_MAX || 10),
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
      ssl: 'require',
    });
  }
  return client;
}

function ident(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function selectSql(select: string): string {
  if (!select || select === '*') return '*';
  return select
    .split(',')
    .map((part) => ident(part.trim()))
    .join(', ');
}

function parseLiteral(value: string): unknown {
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function buildWhere(filters: Filters, params: unknown[]): string {
  const clauses: string[] = [];
  for (const [rawKey, rawValue] of Object.entries(filters)) {
    if (['select', 'order', 'limit', 'offset'].includes(rawKey)) continue;
    const column = ident(rawKey);
    const value = String(rawValue);

    if (value === 'is.null') {
      clauses.push(`${column} IS NULL`);
      continue;
    }
    if (value === 'not.is.null') {
      clauses.push(`${column} IS NOT NULL`);
      continue;
    }

    const inMatch = value.match(/^in\.\((.*)\)$/);
    if (inMatch) {
      const values = (inMatch[1] || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map(parseLiteral);
      if (!values.length) {
        clauses.push('FALSE');
      } else {
        const placeholders = values.map((entry) => {
          params.push(entry);
          return `$${params.length}`;
        });
        clauses.push(`${column} IN (${placeholders.join(', ')})`);
      }
      continue;
    }

    const match = value.match(/^(eq|neq|gt|gte|lt|lte|like|ilike)\.(.*)$/s);
    if (!match) throw new Error(`Unsupported database filter: ${rawKey}=${value}`);
    const [, op, encoded] = match;
    const operators: Record<string, string> = {
      eq: '=',
      neq: '<>',
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
      like: 'LIKE',
      ilike: 'ILIKE',
    };
    params.push(parseLiteral(encoded ?? ''));
    clauses.push(`${column} ${operators[op!]} $${params.length}`);
  }
  return clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
}

function orderLimitSql(filters: Filters, params: unknown[]): string {
  let out = '';
  const order = filters.order;
  if (order) {
    const [column, direction = 'asc'] = order.split('.');
    const dir = direction.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    out += ` ORDER BY ${ident(column!)} ${dir}`;
  }
  if (filters.limit) {
    params.push(Math.max(0, Number(filters.limit) || 0));
    out += ` LIMIT $${params.length}`;
  }
  if (filters.offset) {
    params.push(Math.max(0, Number(filters.offset) || 0));
    out += ` OFFSET $${params.length}`;
  }
  return out;
}

export async function pgSelect<T extends Row = Row>(
  table: string,
  select = '*',
  filters: Filters = {},
): Promise<T[]> {
  const params: unknown[] = [];
  const query =
    `SELECT ${selectSql(select)} FROM ${ident(table)}` +
    buildWhere(filters, params) +
    orderLimitSql(filters, params);
  return (await db().unsafe(query, params)) as unknown as T[];
}

export async function pgInsert<T extends Row = Row>(
  table: string,
  data: Row | Row[],
): Promise<T[]> {
  const rows = Array.isArray(data) ? data : [data];
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]!);
  if (!keys.length) throw new Error('Cannot insert an empty object');
  for (const row of rows) {
    if (Object.keys(row).join('|') !== keys.join('|')) {
      throw new Error('Bulk insert rows must have identical keys');
    }
  }
  const params: unknown[] = [];
  const groups = rows.map((row) => {
    const placeholders = keys.map((key) => {
      params.push(row[key]);
      return `$${params.length}`;
    });
    return `(${placeholders.join(', ')})`;
  });
  const query =
    `INSERT INTO ${ident(table)} (${keys.map(ident).join(', ')}) VALUES ${groups.join(', ')} RETURNING *`;
  return (await db().unsafe(query, params)) as unknown as T[];
}

export async function pgUpdate<T extends Row = Row>(
  table: string,
  data: Row,
  filters: Filters,
): Promise<T[]> {
  const keys = Object.keys(data);
  if (!keys.length) return pgSelect<T>(table, '*', filters);
  const params: unknown[] = [];
  const assignments = keys.map((key) => {
    params.push(data[key]);
    return `${ident(key)} = $${params.length}`;
  });
  const query =
    `UPDATE ${ident(table)} SET ${assignments.join(', ')}` +
    buildWhere(filters, params) +
    ' RETURNING *';
  return (await db().unsafe(query, params)) as unknown as T[];
}

export async function pgDelete(
  table: string,
  filters: Filters,
): Promise<number> {
  const params: unknown[] = [];
  const query =
    `DELETE FROM ${ident(table)}` +
    buildWhere(filters, params) +
    ' RETURNING 1';
  const rows = await db().unsafe(query, params);
  return rows.length;
}

export async function pgCount(
  table: string,
  filters: Filters = {},
): Promise<number> {
  const params: unknown[] = [];
  const query =
    `SELECT count(*)::int AS count FROM ${ident(table)}` +
    buildWhere(filters, params);
  const rows = await db().unsafe(query, params) as unknown as Array<{ count: number }>;
  return Number(rows[0]?.count || 0);
}

export async function pgRpc<T = unknown>(
  functionName: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const values = Object.values(args);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
  const query = `SELECT ${ident(functionName)}(${placeholders}) AS value`;
  const rows = await db().unsafe(query, values) as unknown as Array<{ value: T }>;
  return rows[0]?.value as T;
}

function filterRecord(params: URLSearchParams): Filters {
  const filters: Filters = {};
  for (const [key, value] of params.entries()) filters[key] = value;
  return filters;
}

export async function neonRestFetch(
  rawPath: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    const normalized = rawPath
      .replace(/^https?:\/\/[^/]+\/rest\/v1\//, '')
      .replace(/^\/rest\/v1\//, '')
      .replace(/^\//, '');
    const url = new URL(normalized, 'http://neon.local/');
    const path = url.pathname.replace(/^\//, '');
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body
      ? JSON.parse(typeof init.body === 'string' ? init.body : String(init.body))
      : undefined;

    if (path.startsWith('rpc/')) {
      if (method !== 'POST') return new Response('Method not allowed', { status: 405 });
      const value = await pgRpc(path.slice(4), body || {});
      return Response.json(value);
    }

    const table = path;
    const filters = filterRecord(url.searchParams);
    if (method === 'GET' || method === 'HEAD') {
      const rows = await pgSelect(table, filters.select || '*', filters);
      if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
      return Response.json(rows);
    }
    if (method === 'POST') {
      const rows = await pgInsert(table, body as Row | Row[]);
      return Response.json(rows, { status: 201 });
    }
    if (method === 'PATCH') {
      const rows = await pgUpdate(table, body as Row, filters);
      return Response.json(rows);
    }
    if (method === 'DELETE') {
      await pgDelete(table, filters);
      return new Response(null, { status: 204 });
    }
    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[postgres-store] database operation failed:', message);
    return Response.json({ error: 'Database operation failed' }, { status: 503 });
  }
}
