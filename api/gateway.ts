import type { VercelRequest, VercelResponse } from '@vercel/node';
import legacyHandler from './gateway-legacy.js';
import { handlePhoneActivation } from './phone/activation.js';
import { handleTenantTwilioWebhook } from './phone/tenant-twilio.js';

export * from './gateway-legacy.js';

function pathname(req: VercelRequest): string {
  return (req.url || '').split('?')[0] || '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = pathname(req);

  if (path.startsWith('/api/phone/activation/twilio/')) {
    return handleTenantTwilioWebhook(req, res);
  }

  if (
    path === '/api/phone/activation' ||
    path.startsWith('/api/phone/activation/')
  ) {
    return handlePhoneActivation(req, res);
  }

  return legacyHandler(req, res);
}
