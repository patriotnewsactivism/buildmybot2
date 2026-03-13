interface OriginValidationInput {
  originHeader?: string;
  refererHeader?: string;
  websiteUrl?: string | null;
  additionalAllowedOrigins?: string[];
}

function normalizeHost(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function getHostFromReferer(referer: string): string | null {
  try {
    return new URL(referer).host.toLowerCase();
  } catch {
    return null;
  }
}

export function isWidgetOriginAllowed({
  originHeader,
  refererHeader,
  websiteUrl,
  additionalAllowedOrigins = [],
}: OriginValidationInput): boolean {
  if (!originHeader && !refererHeader) {
    return true;
  }

  const allowedHosts = new Set<string>();

  if (websiteUrl) {
    const websiteHost = normalizeHost(websiteUrl);
    if (websiteHost) {
      allowedHosts.add(websiteHost);
    }
  }

  for (const origin of additionalAllowedOrigins) {
    const host = normalizeHost(origin);
    if (host) {
      allowedHosts.add(host);
    }
  }

  if (allowedHosts.size === 0) {
    return false;
  }

  const originHost = originHeader ? normalizeHost(originHeader) : null;
  const refererHost = refererHeader ? getHostFromReferer(refererHeader) : null;

  if (originHost && allowedHosts.has(originHost)) {
    return true;
  }

  if (refererHost && allowedHosts.has(refererHost)) {
    return true;
  }

  return false;
}
