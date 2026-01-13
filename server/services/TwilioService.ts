import twilio from 'twilio';
import { env } from '../env';

export interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  countryCode: string;
  capabilities: {
    voice: boolean;
    SMS: boolean;
    MMS: boolean;
  };
}

export class TwilioService {
  private client: twilio.Twilio;

  constructor() {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      console.warn('Twilio credentials not configured');
      // Initialize with dummy values to prevent crash on startup, methods will fail if called
      this.client = twilio('AC00000000000000000000000000000000', 'auth_token');
    } else {
      this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    }
  }

  async listAvailableNumbers(
    areaCode?: string,
    countryCode = 'US',
    limit = 10,
  ): Promise<AvailableNumber[]> {
    try {
      const options: any = { limit };
      if (areaCode) options.areaCode = parseInt(areaCode, 10);

      const local = await this.client
        .availablePhoneNumbers(countryCode)
        .local.list(options);

      const tollFree = await this.client
        .availablePhoneNumbers(countryCode)
        .tollFree.list(options);

      const allNumbers = [...local, ...tollFree];

      return allNumbers.map((num) => ({
        phoneNumber: num.phoneNumber,
        friendlyName: num.friendlyName,
        locality: num.locality,
        region: num.region,
        countryCode: num.isoCountry,
        capabilities: {
          voice: num.capabilities.voice,
          SMS: num.capabilities.SMS,
          MMS: num.capabilities.MMS,
        },
      }));
    } catch (error) {
      console.error('Error listing available numbers:', error);
      throw new Error('Failed to fetch available numbers from Twilio');
    }
  }

  async purchaseNumber(
    phoneNumber: string,
    friendlyName?: string,
  ): Promise<string> {
    try {
      const incomingPhoneNumber = await this.client.incomingPhoneNumbers.create(
        {
          phoneNumber,
          friendlyName: friendlyName || 'BuildMyBot Agent',
          // Default configuration to our webhook
          voiceUrl: `${env.APP_BASE_URL}/api/webhooks/voice/twilio`,
          smsUrl: `${env.APP_BASE_URL}/api/webhooks/sms/twilio`,
        },
      );
      return incomingPhoneNumber.sid;
    } catch (error) {
      console.error('Error purchasing number:', error);
      throw new Error('Failed to purchase phone number');
    }
  }

  async configureNumber(
    phoneNumberSid: string,
    voiceUrl: string,
    smsUrl?: string,
  ): Promise<void> {
    try {
      const updateConfig: any = { voiceUrl };
      if (smsUrl) updateConfig.smsUrl = smsUrl;

      await this.client.incomingPhoneNumbers(phoneNumberSid).update(updateConfig);
    } catch (error) {
      console.error('Error configuring number:', error);
      throw new Error('Failed to configure phone number');
    }
  }

  async releaseNumber(phoneNumberSid: string): Promise<void> {
    try {
      await this.client.incomingPhoneNumbers(phoneNumberSid).remove();
    } catch (error) {
      console.error('Error releasing number:', error);
      throw new Error('Failed to release phone number');
    }
  }
}

export const twilioService = new TwilioService();
