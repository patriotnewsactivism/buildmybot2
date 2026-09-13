export interface EligibleVoiceNumber {
  phoneNumber: string;
  provider: string;
  friendlyName: string | null;
  reusableForSms: boolean;
  reason: string;
}

export function shouldAdvanceProvisioning(status: string | null | undefined): boolean {
  return status === 'new' || status === 'pending' || status === 'waiting_funding';
}

export function classifyTenantNumber(row: {
  phone_number?: string | null;
  number?: string | null;
  provider?: string | null;
  friendly_name?: string | null;
  status?: string | null;
}): EligibleVoiceNumber | null {
  const phoneNumber = row.phone_number || row.number || '';
  if (!/^\+1\d{10}$/.test(phoneNumber)) return null;
  if (row.status && row.status !== 'active') return null;
  const provider = String(row.provider || 'unknown').toLowerCase();
  if (provider === 'telnyx') {
    return {
      phoneNumber,
      provider,
      friendlyName: row.friendly_name || null,
      reusableForSms: true,
      reason: 'This Telnyx voice number can also send and receive texts after carrier registration.',
    };
  }
  return {
    phoneNumber,
    provider,
    friendlyName: row.friendly_name || null,
    reusableForSms: false,
    reason: 'Existing Twilio numbers stay on voice. SMS uses a Telnyx number without porting.',
  };
}

export function areaCodeFromNumber(phoneNumber: string): string | null {
  const match = /^\+1(\d{3})\d{7}$/.exec(phoneNumber);
  return match?.[1] || null;
}

export function isExistingOrderMarker(orderId: string | null | undefined): boolean {
  return Boolean(orderId && orderId.startsWith('existing:'));
}
