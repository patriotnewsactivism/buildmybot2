import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  attachFrontend,
  isStaticAssetPath,
} from '../api/lib/frontend-static.js';

describe('isStaticAssetPath', () => {
  it('flags script, style, and other asset extensions', () => {
    expect(isStaticAssetPath('/nope.js')).toBe(true);
    expect(isStaticAssetPath('/assets/app.css')).toBe(true);
    expect(isStaticAssetPath('/logo.svg')).toBe(true);
    expect(isStaticAssetPath('/missing.html')).toBe(true);
  });

  it('leaves extensionless app routes on the SPA', () => {
    expect(isStaticAssetPath('/')).toBe(false);
    expect(isStaticAssetPath('/dashboard/bots')).toBe(false);
    expect(isStaticAssetPath('/chat/bot-123')).toBe(false);
  });
});

describe('attachFrontend', () => {
  const distDir = mkdtempSync(path.join(tmpdir(), 'bmb-frontend-'));
  const embedSource = '/* embed.js marker */\n';
  let baseUrl = '';
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    writeFileSync(path.join(distDir, 'embed.js'), embedSource);
    writeFileSync(
      path.join(distDir, 'index.html'),
      '<!doctype html><div id="root"></div>',
    );
    writeFileSync(path.join(distDir, 'app.css'), 'body{color:red}');

    const app = express();
    attachFrontend(app, distDir);
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    rmSync(distDir, { recursive: true, force: true });
  });

  it('serves /widget.js as the embed.js file', async () => {
    const response = await fetch(`${baseUrl}/widget.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/javascript/i);
    expect(response.headers.get('content-type')).not.toMatch(/html/i);
    expect(await response.text()).toBe(embedSource);
    expect(response.headers.get('cache-control')).toContain('max-age=3600');
  });

  it('answers HEAD /widget.js with javascript, not the SPA', async () => {
    const response = await fetch(`${baseUrl}/widget.js`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/javascript/i);
  });

  it('still serves /embed.js', async () => {
    const response = await fetch(`${baseUrl}/embed.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/javascript/i);
    expect(await response.text()).toBe(embedSource);
  });

  it('returns 404 for unknown javascript instead of index.html', async () => {
    const response = await fetch(`${baseUrl}/nope.js`);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toMatch(/text\/plain/i);
    expect(await response.text()).not.toContain('id="root"');
  });

  it('answers HEAD /nope.js with 404 and no html content type', async () => {
    const response = await fetch(`${baseUrl}/nope.js`, { method: 'HEAD' });
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type') || '').not.toMatch(/html/i);
  });

  it('returns 404 for other missing static extensions', async () => {
    const css = await fetch(`${baseUrl}/missing.css`);
    expect(css.status).toBe(404);
    const png = await fetch(`${baseUrl}/missing.png`);
    expect(png.status).toBe(404);
  });

  it('still serves real static files and extensionless app routes', async () => {
    const css = await fetch(`${baseUrl}/app.css`);
    expect(css.status).toBe(200);
    expect(await css.text()).toContain('color:red');

    const appRoute = await fetch(`${baseUrl}/dashboard/bots`);
    expect(appRoute.status).toBe(200);
    expect(appRoute.headers.get('content-type')).toMatch(/html/i);
    expect(await appRoute.text()).toContain('id="root"');
  });
});
