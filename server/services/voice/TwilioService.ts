import twilio from 'twilio';
import { db } from '../../db';
import { voiceAgents, voiceCalls } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.warn('Twilio credentials not configured');
}

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

export class TwilioService {
  /**
   * Provisions a new phone number for a voice agent
   * Automatically assigns when voice agent is enabled
   */
  async provisionPhoneNumber(voiceAgentId: string, areaCode?: string): Promise<string> {
    if (!client) {
      throw new Error('Twilio client not initialized');
    }

    try {
      // Search for available phone numbers in the specified area code or default to US
      const availableNumbers = await client.availablePhoneNumbers('US')
        .local
        .list({
          areaCode: areaCode || undefined,
          voiceEnabled: true,
          limit: 1,
        });

      if (availableNumbers.length === 0) {
        throw new Error('No available phone numbers found');
      }

      const selectedNumber = availableNumbers[0].phoneNumber;

      // Purchase the phone number
      const purchasedNumber = await client.incomingPhoneNumbers.create({
        phoneNumber: selectedNumber,
        voiceUrl: `${process.env.APP_BASE_URL}/api/voice/webhook`,
        voiceMethod: 'POST',
        statusCallback: `${process.env.APP_BASE_URL}/api/voice/status`,
        statusCallbackMethod: 'POST',
      });

      // Update voice agent with phone number
      await db.update(voiceAgents)
        .set({
          phoneNumber: purchasedNumber.phoneNumber,
          twilioSid: purchasedNumber.sid,
          updatedAt: new Date(),
        })
        .where(eq(voiceAgents.id, voiceAgentId));

      return purchasedNumber.phoneNumber;
    } catch (error) {
      console.error('Error provisioning phone number:', error);
      throw error;
    }
  }

  /**
   * Releases a phone number when voice agent is disabled
   */
  async releasePhoneNumber(twilioSid: string): Promise<void> {
    if (!client) {
      throw new Error('Twilio client not initialized');
    }

    try {
      await client.incomingPhoneNumbers(twilioSid).remove();
    } catch (error) {
      console.error('Error releasing phone number:', error);
      throw error;
    }
  }

  /**
   * Creates a TwiML response for voice calls
   */
  generateTwiML(message: string, voiceId?: string): string {
    const twiml = new twilio.twiml.VoiceResponse();
    
    // We'll use Cartesia for TTS, so we play the generated audio URL
    // For now, use Twilio's built-in TTS as fallback
    twiml.say({
      voice: voiceId || 'Polly.Joanna',
    }, message);

    twiml.gather({
      input: ['speech'],
      action: `${process.env.APP_BASE_URL}/api/voice/process`,
      method: 'POST',
      speechTimeout: 'auto',
      speechModel: 'phone_call',
    });

    return twiml.toString();
  }

  /**
   * Initiates an outbound call (for callbacks/transfers)
   */
  async makeOutboundCall(
    to: string,
    from: string,
    twimlUrl: string,
  ): Promise<string> {
    if (!client) {
      throw new Error('Twilio client not initialized');
    }

    try {
      const call = await client.calls.create({
        to,
        from,
        url: twimlUrl,
        method: 'POST',
      });

      return call.sid;
    } catch (error) {
      console.error('Error making outbound call:', error);
      throw error;
    }
  }

  /**
   * Transfers call to human agent
   */
  async transferToHuman(
    callSid: string,
    transferNumber: string,
  ): Promise<void> {
    if (!client) {
      throw new Error('Twilio client not initialized');
    }

    try {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('Transferring you to a human agent. Please hold.');
      twiml.dial(transferNumber);

      await client.calls(callSid).update({
        twiml: twiml.toString(),
      });
    } catch (error) {
      console.error('Error transferring call:', error);
      throw error;
    }
  }

  /**
   * Records call for quality assurance
   */
  async enableRecording(callSid: string): Promise<void> {
    if (!client) {
      throw new Error('Twilio client not initialized');
    }

    try {
      await client.calls(callSid).recordings.create();
    } catch (error) {
      console.error('Error enabling recording:', error);
      throw error;
    }
  }

  /**
   * Gets call details from Twilio
   */
  async getCallDetails(callSid: string) {
    if (!client) {
      throw new Error('Twilio client not initialized');
    }

    try {
      const call = await client.calls(callSid).fetch();
      return {
        sid: call.sid,
        from: call.from,
        to: call.to,
        status: call.status,
        startTime: call.startTime,
        endTime: call.endTime,
        duration: call.duration,
        price: call.price,
      };
    } catch (error) {
      console.error('Error fetching call details:', error);
      throw error;
    }
  }
}

export const twilioService = new TwilioService();
