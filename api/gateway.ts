import type { ApiRequest, ApiResponse } from './lib/http-types.js';
import legacyHandler from './gateway-legacy.js';
import { handlePhoneActivation } from './phone/activation.js';
import corporatePhoneHandler from './phone/corporate.js';
import tenantTelnyxWebhook from './phone/tenant-telnyx.js';
import { handleTenantTwilioWebhook } from './phone/tenant-twilio.js';
import smsHandler from './sms/handler.js';
import smsRegistration from './sms/register.js';

export * from './gateway-legacy.js';

function pathname(req: ApiRequest): string {
  return (req.url || '').split('?')[0] || '';
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const path = pathname(req);
  if (
    path === '/api/corporate-phone' ||
    path.startsWith('/api/corporate-phone/')
  )
    return corporatePhoneHandler(req, res);
  if (path === '/api/sms/register') return smsRegistration(req, res);
  if (path === '/api/sms' || path.startsWith('/api/sms/'))
    return smsHandler(req, res);

  if (path.startsWith('/api/phone/activation/twilio/')) {
    return handleTenantTwilioWebhook(req, res);
  }

  if (path === '/api/phone/activation/telnyx/webhook') {
    return tenantTelnyxWebhook(req, res);
  }

  if (
    path === '/api/phone/activation' ||
    path.startsWith('/api/phone/activation/')
  ) {
    return handlePhoneActivation(req, res);
  }

  return legacyHandler(req, res);
}
