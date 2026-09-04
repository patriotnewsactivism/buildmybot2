// =====================================================================
// P1: Guarded outbound HTTP for customer-controlled URLs.
//
// Used by the webhook "Test" button and integration verification. Blocks
// non-HTTP(S) schemes, credentials in the URL, private/loopback/link-local
// targets (cloud metadata included) and cross-scheme redirects.
//
// NOTE: the P0 branch may add its own SSRF helper; if both land, collapse
// them into this module rather than keeping two implementations.
// =====================================================================

import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
]);

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
    if (lower.startsWith('fe80')) return true; // link-local
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
    return false;
  }
  return true;
}

export interface UrlCheck {
  ok: boolean;
  reason?: string;
  url?: URL;
}

export async function assertPublicUrl(raw: string): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: `Blocked scheme ${url.protocol}` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'Credentials in URL are not allowed' };
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.internal')) {
    return { ok: false, reason: `Blocked host ${host}` };
  }
  if (net.isIP(host)) {
    if (isPrivateAddress(host))
      return { ok: false, reason: `Blocked private address ${host}` };
    return { ok: true, url };
  }
  try {
    const records = await dns.lookup(host, { all: true });
    if (!records.length) return { ok: false, reason: 'DNS resolution failed' };
    for (const record of records) {
      if (isPrivateAddress(record.address)) {
        return {
          ok: false,
          reason: `Host resolves to private address ${record.address}`,
        };
      }
    }
  } catch {
    return { ok: false, reason: 'DNS resolution failed' };
  }
  return { ok: true, url };
}

export interface GuardedResponse {
  ok: boolean;
  status?: number;
  statusText?: string;
  durationMs: number;
  headers?: Record<string, string>;
  body?: string;
  error?: string;
}

/** Performs an SSRF-guarded fetch and always reports the REAL outcome. */
export async function guardedFetch(
  rawUrl: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    maxBodyChars?: number;
  } = {},
): Promise<GuardedResponse> {
  const started = Date.now();
  const check = await assertPublicUrl(rawUrl);
  if (!check.ok || !check.url) {
    return {
      ok: false,
      durationMs: Date.now() - started,
      error: check.reason || 'Blocked URL',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 10_000);
  try {
    const resp = await fetch(check.url.toString(), {
      method: init.method || 'POST',
      headers: init.headers,
      body: init.body,
      redirect: 'manual',
      signal: controller.signal,
    });
    const text = await resp.text().catch(() => '');
    const headers: Record<string, string> = {};
    resp.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      durationMs: Date.now() - started,
      headers,
      body: text.slice(0, init.maxBodyChars ?? 2000),
    };
  } catch (err: any) {
    return {
      ok: false,
      durationMs: Date.now() - started,
      error:
        err?.name === 'AbortError'
          ? 'Request timed out'
          : String(err?.message || err),
    };
  } finally {
    clearTimeout(timer);
  }
}
