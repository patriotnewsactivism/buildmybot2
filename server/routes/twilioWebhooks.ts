import { eq, sql } from 'drizzle-orm';
import express from 'express';
import twilio from 'twilio';
import { users } from '../../shared/schema';
import { db } from '../db';
import { env } from '../env';

const router = express.Router();

// Handle incoming voice calls
router.post('/voice/twilio', async (req, res) => {
  try {
    const { To } = req.body;

    // Find the user who owns this phone number
    // Note: We're searching in the JSONB column phoneConfig
    const [user] = await db
      .select()
      .from(users)
      .where(sql`phone_config->>'twilioPhoneNumber' = ${To}`);

    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();

    if (!user) {
      console.warn(`Incoming call to unassigned number: ${To}`);
      response.say('This number is not currently assigned to an active agent.');
      res.type('text/xml');
      return res.send(response.toString());
    }

    const config = (user.phoneConfig as any) || {};

    // If delegation link is set, forward the call
    if (config.delegationLink?.startsWith('tel:')) {
      const forwardNumber = config.delegationLink.replace('tel:', '');
      response.dial(forwardNumber);
    } else {
      // Connect to Media Stream for AI Voice Agent
      // This connects the call to our WebSocket server
      const connect = response.connect();
      const stream = connect.stream({
        url: `wss://${req.headers.host}/api/ws/voice`,
        track: 'inbound_track', // we might change this based on bidirectional needs
      });
      // Pass metadata to the stream so we know which user/voice to load
      stream.parameter({
        name: 'userId',
        value: user.id,
      });
      stream.parameter({
        name: 'introMessage',
        value: config.introMessage || 'Hello, how can I help you?',
      });
      stream.parameter({
        name: 'voiceId',
        value: config.voiceId || 'a0e99841-438c-4a64-b679-ae501e7d6091',
      });

      // Fallback if stream fails
      response.say(
        'We are having trouble connecting to the AI agent. Please try again later.',
      );
    }

    res.type('text/xml');
    res.send(response.toString());
  } catch (error) {
    console.error('Error handling Twilio voice webhook:', error);
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();
    response.say('An error occurred. Please try again later.');
    res.type('text/xml');
    res.send(response.toString());
  }
});

// Handle incoming SMS
router.post('/sms/twilio', async (req, res) => {
  try {
    const { To, From, Body } = req.body;

    const [user] = await db
      .select()
      .from(users)
      .where(sql`phone_config->>'twilioPhoneNumber' = ${To}`);

    const MessagingResponse = twilio.twiml.MessagingResponse;
    const response = new MessagingResponse();

    if (!user) {
      response.message('This number is not assigned.');
    } else {
      // Here we would typically trigger the text bot logic
      // For now, simple auto-response or nothing
      // We could also forward to the user's lead CRM
      console.log(`Received SMS for user ${user.id} from ${From}: ${Body}`);

      // Optional: Check if we should forward or reply
      // response.message('Thanks for your message. An agent will be with you shortly.');
    }

    res.type('text/xml');
    res.send(response.toString());
  } catch (error) {
    console.error('Error handling Twilio SMS webhook:', error);
    res.status(500).send('Error');
  }
});

export { router as twilioWebhooksRouter };
