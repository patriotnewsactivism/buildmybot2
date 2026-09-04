// =====================================================================
// P1: Integrations may only be stored as "connected" after a real call
// to the provider succeeds with the supplied credentials.
// =====================================================================

export interface VerificationResult {
  verified: boolean;
  status: number | null;
  detail: string;
  account?: string;
}

type Verifier = (config: Record<string, any>) => Promise<VerificationResult>;

async function probe(
  url: string,
  headers: Record<string, string>,
  label: string,
  extract?: (data: any) => string | undefined,
  bodyIsSuccess?: (data: any) => boolean,
): Promise<VerificationResult> {
  try {
    const resp = await fetch(url, { headers });
    const text = await resp.text().catch(() => '');
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
    if (!resp.ok) {
      return {
        verified: false,
        status: resp.status,
        detail:
          `${label} rejected the credentials (HTTP ${resp.status}) ${text.slice(0, 200)}`.trim(),
      };
    }
    if (bodyIsSuccess && !bodyIsSuccess(data)) {
      return {
        verified: false,
        status: resp.status,
        detail: `${label} returned HTTP 200 but reported failure: ${text.slice(0, 200)}`,
      };
    }
    return {
      verified: true,
      status: resp.status,
      detail: `${label} verified`,
      account: extract && data ? extract(data) : undefined,
    };
  } catch (err: any) {
    return {
      verified: false,
      status: null,
      detail: `${label} verification request failed: ${err?.message || err}`,
    };
  }
}

const VERIFIERS: Record<string, Verifier> = {
  hubspot: (c) =>
    probe(
      'https://api.hubapi.com/account-info/v3/details',
      { Authorization: `Bearer ${c.accessToken || c.apiKey}` },
      'HubSpot',
      (d) => String(d?.portalId ?? ''),
    ),
  salesforce: (c) =>
    probe(
      `${String(c.instanceUrl || '').replace(/\/$/, '')}/services/oauth2/userinfo`,
      { Authorization: `Bearer ${c.accessToken}` },
      'Salesforce',
      (d) => d?.email,
    ),
  zoho: (c) =>
    probe(
      `${String(c.apiDomain || 'https://www.zohoapis.com').replace(/\/$/, '')}/crm/v3/users?type=CurrentUser`,
      { Authorization: `Zoho-oauthtoken ${c.accessToken}` },
      'Zoho',
      (d) => d?.users?.[0]?.email,
    ),
  google_calendar: (c) =>
    probe(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1',
      { Authorization: `Bearer ${c.accessToken}` },
      'Google Calendar',
    ),
  calendly: (c) =>
    probe(
      'https://api.calendly.com/users/me',
      { Authorization: `Bearer ${c.accessToken || c.apiKey}` },
      'Calendly',
      (d) => d?.resource?.email,
    ),
  slack: (c) =>
    probe(
      'https://slack.com/api/auth.test',
      { Authorization: `Bearer ${c.accessToken || c.botToken}` },
      'Slack',
      (d) => d?.team,
      (d) => d?.ok === true,
    ),
  mailchimp: (c) =>
    probe(
      `https://${c.dc || 'us1'}.api.mailchimp.com/3.0/ping`,
      {
        Authorization: `Basic ${Buffer.from(`anystring:${c.apiKey}`).toString('base64')}`,
      },
      'Mailchimp',
    ),
  twilio: (c) =>
    probe(
      `https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}.json`,
      {
        Authorization: `Basic ${Buffer.from(`${c.accountSid}:${c.authToken}`).toString('base64')}`,
      },
      'Twilio',
      (d) => d?.friendly_name,
    ),
};

export function isVerifiableProvider(provider: string): boolean {
  return Boolean(VERIFIERS[provider]);
}

export async function verifyIntegration(
  provider: string,
  config: Record<string, any>,
): Promise<VerificationResult> {
  const verifier = VERIFIERS[provider];
  if (!verifier) {
    return {
      verified: false,
      status: null,
      detail: `No verification implemented for provider "${provider}" — refusing to mark it connected.`,
    };
  }
  const result = await verifier(config || {});
  return result;
}
