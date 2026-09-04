/**
 * SSRF protection for customer-controlled outbound URLs.
 *
 * Every place where a customer can make the server fetch a URL they chose
 * (knowledge-base website scraping, webhook delivery/tests, booking
 * callbacks) must run the URL through assertSafeOutboundUrl() / safeFetch()
 * first. Without it, a tenant could point us at
 * http://169.254.169.254/computeMetadata/v1/ (Cloud Run metadata → service
 * account tokens), at http://127.0.0.1:*, or at any RFC1918 host inside the
 * VPC, and read the response back out of the product.
 */

import { promises as dns } from 'node:dns';
import net from 'node:net';

export class SsrfBlockedError extends Error {
  readonly code = 'SSRF_BLOCKED';
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

/** True for any address we must never let a customer reach. */
export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
    const [a, b] = p;
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 192 && b === 0) return true; // IETF protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast + reserved + broadcast
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80')) return true; // link-local
    if (/^f[cd]/.test(lower)) return true; // unique local fc00::/7
    if (lower.startsWith('ff')) return true; // multicast
    // IPv4-mapped / IPv4-compatible: ::ffff:127.0.0.1
    const mapped = lower.match(/:((?:\d{1,3}\.){3}\d{1,3})$/);
    if (mapped) return isBlockedIp(mapped[1]);
    return false;
  }
  return true; // not an IP literal we understand → refuse
}

/**
 * Validates a customer-supplied URL: http(s) only, no credentials, no
 * blocked hostname, and every DNS-resolved address must be public.
 * Throws SsrfBlockedError when unsafe. Returns the parsed URL.
 */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    throw new SsrfBlockedError('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(
      `Blocked URL scheme "${parsed.protocol}" — only http and https are allowed`,
    );
  }
  if (parsed.username || parsed.password) {
    throw new SsrfBlockedError('URLs with embedded credentials are not allowed');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.internal')) {
    throw new SsrfBlockedError(`Blocked host "${hostname}"`);
  }

  // Literal IP: check directly (no DNS lookup needed or wanted).
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new SsrfBlockedError(
        `Blocked private/loopback/link-local address "${hostname}"`,
      );
    }
    return parsed;
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SsrfBlockedError(`Could not resolve host "${hostname}"`);
  }
  if (!addresses.length) {
    throw new SsrfBlockedError(`Could not resolve host "${hostname}"`);
  }
  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new SsrfBlockedError(
        `Host "${hostname}" resolves to blocked address ${address}`,
      );
    }
  }
  return parsed;
}

export interface SafeFetchOptions extends RequestInit {
  /** Max redirect hops; each hop is re-validated. Default 3. */
  maxRedirects?: number;
  timeoutMs?: number;
}

/**
 * fetch() that validates the target (and every redirect hop) against the
 * SSRF rules above. Redirects are followed manually because a 302 to
 * http://169.254.169.254 would otherwise bypass the initial check.
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const { maxRedirects = 3, timeoutMs = 15000, ...init } = options;
  let current = String(url);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafeOutboundUrl(current);
    const resp = await fetch(current, {
      ...init,
      redirect: 'manual',
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location');
      if (!location) return resp;
      current = new URL(location, current).toString();
      continue;
    }
    return resp;
  }
  throw new SsrfBlockedError('Too many redirects');
}
