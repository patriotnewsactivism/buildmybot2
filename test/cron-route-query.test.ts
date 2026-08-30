/**
 * Regression tests added 2026-08-30 after every /api/cron/* call on the
 * Cloud Run backend returned a bare HTTP 500 — silently killing all four
 * AI-team jobs (all-shifts, pulse, lead-followups, sales-outreach) even
 * though the backend itself was healthy and the Supabase schema was ready.
 *
 * Root cause: server.ts forwarded the Express `:job` route param into the
 * Vercel-style handler with `req.query = { ...req.query, job }`. Express 5
 * redefined `req.query` as a getter-only accessor on the request prototype,
 * so that assignment throws
 *   TypeError: Cannot set property query of #<IncomingMessage> which has only a getter
 * under ESM strict mode. The rejection escaped before the handler's own auth
 * check ran, so the failure looked like a server fault rather than a routing
 * bug.
 *
 * The fix shadows the prototype getter with an own property via
 * Object.defineProperty. These tests pin both halves: that the old form is
 * genuinely fatal under the installed Express, and that server.ts no longer
 * uses it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { describe, expect, it } from 'vitest';

const SERVER_TS = readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');

/** Drive one request through a throwaway app and report status + body. */
async function call(
  app: express.Express,
  url: string,
): Promise<{ status: number; body: string }> {
  const server = app.listen(0);
  try {
    const address = server.address();
    if (typeof address === 'string' || address === null) {
      throw new Error('expected a TCP address');
    }
    const response = await fetch(`http://127.0.0.1:${address.port}${url}`, {
      method: 'POST',
    });
    return { status: response.status, body: await response.text() };
  } finally {
    server.close();
  }
}

describe('cron route :job forwarding', () => {
  it('assigning req.query is fatal on this Express version', async () => {
    const app = express();
    app.all('/api/cron/:job', async (req, res) => {
      // The exact pre-fix line. Kept so this test starts failing the day
      // Express makes req.query writable again and the workaround is moot.
      (req as unknown as { query: unknown }).query = {
        ...req.query,
        job: req.params.job,
      };
      res.json({ ok: true });
    });

    const { status } = await call(app, '/api/cron/all-shifts');
    expect(status).toBe(500);
  });

  it('defineProperty forwards :job and preserves the query string', async () => {
    const app = express();
    app.all('/api/cron/:job', async (req, res) => {
      Object.defineProperty(req, 'query', {
        value: { ...req.query, job: req.params.job },
        writable: true,
        configurable: true,
        enumerable: true,
      });
      res.json(req.query);
    });

    const { status, body } = await call(
      app,
      '/api/cron/all-shifts?role=marcus&preview=1',
    );
    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual({
      job: 'all-shifts',
      role: 'marcus',
      preview: '1',
    });
  });

  it('server.ts does not reintroduce the assignment', () => {
    // Comment lines are stripped first: the fix is documented in server.ts
    // with a prose copy of the offending `req.query = {...}` line, and that
    // explanation must not be mistaken for the code it warns about.
    const code = SERVER_TS.split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    expect(code).not.toMatch(/\.query\s*=\s*\{/);
    expect(code).toContain("Object.defineProperty(req, 'query'");
  });
});
