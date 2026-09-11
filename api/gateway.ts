import base44AgentHandler from './base44-agent.js';
import legacyHandler from './gateway-legacy.js';
import type { ApiRequest, ApiResponse } from './lib/http-types.js';
import { handlePhoneActivation } from './phone/activation.js';
import corporatePhoneHandler from './phone/corporate.js';
import phoneRecordingHandler from './phone/recording.js';
import tenantTelnyxWebhook from './phone/tenant-telnyx.js';
import { handleTenantTwilioWebhook } from './phone/tenant-twilio.js';
import smsHandler from './sms/handler.js';
import smsRegistration from './sms/register.js';
import voiceTeamHandler from './voice/team.js';

export * from './gateway-legacy.js';

function pathname(req: ApiRequest): string {
  return (req.url || '').split('?')[0] || '';
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const path = pathname(req);
  if (path === '/api/phone/recording') {
    return phoneRecordingHandler(req, res);
  }
  if (
    path === '/api/voice/team/bots' ||
    path === '/api/voice/team' ||
    path === '/api/voice/team/preview'
  )
    return voiceTeamHandler(req, res);
  if (
    path === '/api/corporate-phone' ||
    path.startsWith('/api/corporate-phone/')
  )
    return corporatePhoneHandler(req, res);
  if (path === '/api/base44-agent' || path.startsWith('/api/base44-agent/')) {
    return base44AgentHandler(req, res);
  }
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
