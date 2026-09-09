import { telnyxRequest } from '../lib/telephony-provider.js';
import { db, filter } from '../sms/store.js';
import { CORPORATE, corporateOrigin } from './corporate-config.js';
export const corporateStatus = {
  number: CORPORATE.number,
  displayNumber: CORPORATE.displayNumber,
  voiceConfigured: false,
  voiceEngineVerified: false,
  smsConfigured: false,
  smsReady: false,
  outboundPolicy: 'owner_approval_per_call',
  checkedAt: null as string | null,
};
// Explicit opt-in on corporate Railway only. No purchases or registrations.
export async function connectCorporatePhone() {
  if (process.env.CORPORATE_PHONE_CONNECT !== 'true') return;
  try {
    const [number] = await db<Array<{ id: number; voice_agent_id: string }>>(
      `phone_numbers?${filter({ phone_number: `eq.${CORPORATE.number}`, user_id: `eq.${CORPORATE.ownerId}`, provider: 'eq.telnyx', status: 'eq.active', select: 'id,voice_agent_id' })}`,
    );
    if (!number || number.voice_agent_id !== CORPORATE.agentId)
      throw new Error('Corporate assignment does not match');
    const connection = process.env.TELNYX_CONNECTION_ID;
    const profile = process.env.TELNYX_MESSAGING_PROFILE_ID;
    if (!connection || !process.env.TELNYX_PUBLIC_KEY)
      throw new Error('Telnyx connection/signing key missing');
    const inventory = await telnyxRequest<{
      data: Array<{ id: string; phone_number: string; connection_id: string }>;
    }>(
      `/phone_numbers?${filter({ 'filter[phone_number]': CORPORATE.number })}`,
    );
    const owned = inventory.data.filter(
      (n) => n.phone_number === CORPORATE.number,
    );
    if (owned.length !== 1)
      throw new Error('Corporate number not uniquely owned in Telnyx');
    if (owned[0].connection_id && owned[0].connection_id !== connection)
      throw new Error(
        'Corporate number has another connection; review required',
      );
    const voiceUrl = `${corporateOrigin()}/api/phone/activation/telnyx/webhook`;
    const app = await telnyxRequest<{ data: { webhook_event_url: string } }>(
      `/call_control_applications/${encodeURIComponent(connection)}`,
    );
    if (app.data.webhook_event_url !== voiceUrl)
      await telnyxRequest(
        `/call_control_applications/${encodeURIComponent(connection)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            webhook_event_url: voiceUrl,
            webhook_api_version: '2',
          }),
        },
      );
    if (!owned[0].connection_id)
      await telnyxRequest(`/phone_numbers/${owned[0].id}`, {
        method: 'PATCH',
        body: JSON.stringify({ connection_id: connection }),
      });
    await db(
      `phone_numbers?${filter({ id: `eq.${number.id}`, user_id: `eq.${CORPORATE.ownerId}` })}`,
      'PATCH',
      { provider_number_id: owned[0].id },
    );
    corporateStatus.voiceConfigured = Boolean(process.env.GEMINI_API_KEY);
    if (process.env.CORPORATE_VOICE_PROBE === 'true') {
      const { probeCorporateVoice } = await import(
        './corporate-voice-probe.js'
      );
      corporateStatus.voiceEngineVerified = await probeCorporateVoice();
    }
    if (profile) {
      const smsUrl = `${corporateOrigin()}/api/sms/webhooks`;
      const messaging = await telnyxRequest<{ data: { webhook_url: string } }>(
        `/messaging_profiles/${encodeURIComponent(profile)}`,
      );
      if (messaging.data.webhook_url !== smsUrl)
        await telnyxRequest(
          `/messaging_profiles/${encodeURIComponent(profile)}`,
          { method: 'PATCH', body: JSON.stringify({ webhook_url: smsUrl }) },
        );
      await telnyxRequest(
        `/messaging_phone_numbers/${encodeURIComponent(CORPORATE.number)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ messaging_profile_id: profile }),
        },
      );
      await db(
        'sms_accounts?on_conflict=tenant_key',
        'POST',
        {
          tenant_key: CORPORATE.tenant,
          user_id: CORPORATE.ownerId,
          business_name: 'BuildMyBot Sales',
          timezone: 'America/Chicago',
          sender: CORPORATE.number,
          messaging_profile_id: profile,
          ready: false,
          ai_enabled: false,
        },
        'resolution=ignore-duplicates,return=minimal',
      );
      corporateStatus.smsConfigured = true;
      try {
        const assignment = await telnyxRequest<{
          campaignId?: string;
          assignmentStatus?: string;
        }>(
          `/10dlc/phone_number_campaigns/${encodeURIComponent(CORPORATE.number)}`,
        );
        console.info(
          '[corporate-phone] SMS carrier assignment',
          JSON.stringify(assignment),
        );
        corporateStatus.smsReady =
          process.env.CORPORATE_SMS_ENABLED === 'true' &&
          assignment.assignmentStatus === 'ASSIGNED' &&
          Boolean(assignment.campaignId);
      } catch {
        console.info(
          '[corporate-phone] SMS awaits approved number/campaign assignment',
        );
      }
    }
    corporateStatus.checkedAt = new Date().toISOString();
    console.info(
      '[corporate-phone] Connection status',
      JSON.stringify(corporateStatus),
    );
  } catch (error) {
    console.error(
      '[corporate-phone] Setup incomplete:',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
