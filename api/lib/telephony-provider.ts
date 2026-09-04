/**
 * Provider-agnostic telephony interface.
 *
 * BuildMyBot2 originally called the Twilio SDK directly from 8+ files
 * (api/phone/activation.ts, api/phone/tenant-twilio.ts, api/twilio/*.ts,
 * api/voice/twilio-*.ts). This module gives every NEW caller a single,
 * narrow surface -- createTenantAccount / purchaseNumber / startMediaStream /
 * sendSms -- implemented against Telnyx's REST API. A future provider swap
 * (back to Twilio, or to SignalWire/Plivo) should only require a new
 * implementation of this interface, not another repo-wide grep-and-replace.
 *
 * IMPORTANT -- migration status (see PR description for full detail):
 * This module backs the NUMBER PURCHASING / ACCOUNT PROVISIONING path
 * (api/phone/activation.ts) and the NEW SMS marketing routes (api/sms/*).
 * It does NOT yet back live inbound-call webhook handling or the
 * WebSocket media-streaming pipeline -- api/twilio/*.ts, api/phone/tenant-twilio.ts,
 * and api/voice/twilio-*.ts are UNCHANGED and still call the Twilio SDK
 * directly for those flows. That is deliberate, documented, remaining work
 * (see PR description) -- rewriting a live bidirectional audio pipeline
 * without any way to test it against a real call is not something to rush.
 */

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

function telnyxApiKey(): string {
  const key = process.env.TELNYX_API_KEY;
  if (!key) {
    throw new Error('TELNYX_API_KEY is not configured');
  }
  return key;
}

export function telnyxConfigured(): boolean {
  return Boolean(process.env.TELNYX_API_KEY);
}

async function telnyxRequest<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${TELNYX_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${telnyxApiKey()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // leave parsed as null; we'll surface the raw text below on error
  }
  if (!response.ok) {
    const detail = parsed?.errors
      ? JSON.stringify(parsed.errors)
      : text || response.statusText;
    throw new Error(`Telnyx API error ${response.status} on ${path}: ${detail}`);
  }
  return (parsed ?? {}) as T;
}

export interface TenantTelephonyAccount {
  /**
   * Telnyx does not have a Twilio-style "create a real sub-account with its
   * own credentials" primitive available on every account tier -- that
   * exists as "Managed Accounts" (developers.telnyx.com/docs/managed-accounts)
   * but requires account-level enablement Don has not yet confirmed.
   *
   * Pragmatic fallback used here: a single shared Telnyx account, with
   * per-tenant isolation done at the BuildMyBot2 DB layer (telephony_accounts
   * row per tenant, same as before) rather than a real separate Telnyx
   * account per tenant. providerAccountId is a synthetic per-tenant
   * identifier (not a real Telnyx account ID) so existing DB columns/joins
   * keep working unchanged.
   *
   * If Don confirms Managed Accounts is enabled on the Telnyx account, this
   * function is the only place that needs to change to create a real
   * managed sub-account per tenant instead.
   */
  providerAccountId: string;
  isRealSubAccount: boolean;
}

export async function createTenantAccount(
  tenantLabel: string,
): Promise<TenantTelephonyAccount> {
  if (!telnyxConfigured()) {
    throw new Error('Telnyx is not configured (TELNYX_API_KEY missing)');
  }
  // Synthetic, stable-enough identifier. Prefixed so it's unmistakably NOT
  // a Telnyx-issued ID if it ever leaks into a support ticket or log line.
  const providerAccountId = `bmb2-tenant-${tenantLabel}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 80);
  return { providerAccountId, isRealSubAccount: false };
}

export interface PurchasedNumber {
  providerNumberId: string;
  phoneNumber: string;
  friendlyName: string | null;
}

/**
 * Search Telnyx's number inventory, then order the first available match.
 * Telnyx numbers are ordered via a Number Order, not a direct "buy this
 * number" call like Twilio's incomingPhoneNumbers.create().
 */
export interface AvailableNumber {
  phoneNumber: string;
  locality?: string;
  region?: string;
}

export async function searchAvailableNumbers(options: {
  areaCode?: string;
  countryCode?: string;
  limit?: number;
}): Promise<AvailableNumber[]> {
  const filters: Record<string, string> = {
    'filter[phone_number][country_code]': options.countryCode || 'US',
    'filter[limit]': String(options.limit || 12),
  };
  if (options.areaCode) {
    filters['filter[national_destination_code]'] = options.areaCode;
  } else {
    filters['filter[best_effort]'] = 'true';
  }
  const query = new URLSearchParams(filters).toString();
  const search = await telnyxRequest<{
    data: Array<{ phone_number: string; region_information?: Array<{ region_type: string; region_name: string }> }>;
  }>(`/available_phone_numbers?${query}`);
  return (search.data || []).map((entry) => {
    const locality = entry.region_information?.find((r) => r.region_type === 'rate_center')?.region_name;
    const region = entry.region_information?.find((r) => r.region_type === 'state')?.region_name;
    return { phoneNumber: entry.phone_number, locality, region };
  });
}

export async function purchaseNumber(options: {
  areaCode?: string;
  friendlyName?: string;
  connectionId?: string; // Telnyx "Call Control Application" / voice connection to attach
}): Promise<PurchasedNumber> {
  const filters: Record<string, string> = {
    'filter[phone_number][country_code]': 'US',
    'filter[limit]': '5',
  };
  if (options.areaCode) {
    filters['filter[national_destination_code]'] = options.areaCode;
  } else {
    filters['filter[best_effort]'] = 'true';
  }
  const query = new URLSearchParams(filters).toString();
  const search = await telnyxRequest<{ data: Array<{ phone_number: string }> }>(
    `/available_phone_numbers?${query}`,
  );
  const candidate = search.data?.[0]?.phone_number;
  if (!candidate) {
    throw new Error(
      options.areaCode
        ? `No Telnyx numbers available for area code ${options.areaCode}`
        : 'No Telnyx numbers available',
    );
  }

  const order = await telnyxRequest<{
    data: { id: string; phone_numbers: Array<{ id: string; phone_number: string }> };
  }>('/number_orders', {
    method: 'POST',
    body: JSON.stringify({
      phone_numbers: [{ phone_number: candidate }],
      connection_id: options.connectionId || process.env.TELNYX_CONNECTION_ID || undefined,
    }),
  });

  const purchasedNumber = order.data?.phone_numbers?.[0];
  if (!purchasedNumber) {
    throw new Error('Telnyx number order did not return a purchased number');
  }

  return {
    providerNumberId: purchasedNumber.id,
    phoneNumber: purchasedNumber.phone_number,
    friendlyName: options.friendlyName || null,
  };
}

export async function releaseNumber(providerNumberId: string): Promise<void> {
  await telnyxRequest(`/phone_numbers/${providerNumberId}`, { method: 'DELETE' });
}

/**
 * Ask Telnyx to start bidirectional media streaming for an in-progress call
 * to our own WebSocket endpoint. This is the Call Control equivalent of
 * TwiML's <Stream> verb. NOTE: this function is provided for the FUTURE
 * voice-webhook rewrite (see module doc) -- it is not yet called from any
 * inbound-call handler, since that rewrite is out of scope for this PR.
 */
export async function startMediaStream(options: {
  callControlId: string;
  streamUrl: string;
  bidirectional?: boolean;
}): Promise<void> {
  await telnyxRequest(`/calls/${options.callControlId}/actions/streaming_start`, {
    method: 'POST',
    body: JSON.stringify({
      stream_url: options.streamUrl,
      stream_track: 'both_tracks',
      ...(options.bidirectional
        ? { stream_bidirectional_mode: 'rtp', stream_bidirectional_target_legs: 'both' }
        : {}),
    }),
  });
}

export interface SendSmsResult {
  id: string;
  status: string;
}

export async function sendSms(options: {
  to: string;
  from?: string;
  text: string;
  messagingProfileId?: string;
}): Promise<SendSmsResult> {
  const messagingProfileId =
    options.messagingProfileId || process.env.TELNYX_MESSAGING_PROFILE_ID;
  if (!options.from && !messagingProfileId) {
    throw new Error(
      'sendSms requires either a from number or TELNYX_MESSAGING_PROFILE_ID (for number-pool sending)',
    );
  }
  const result = await telnyxRequest<{ data: { id: string; to: Array<{ status: string }> } }>(
    '/messages',
    {
      method: 'POST',
      body: JSON.stringify({
        to: options.to,
        from: options.from || undefined,
        messaging_profile_id: options.from ? undefined : messagingProfileId,
        text: options.text,
      }),
    },
  );
  return {
    id: result.data?.id,
    status: result.data?.to?.[0]?.status || 'unknown',
  };
}
