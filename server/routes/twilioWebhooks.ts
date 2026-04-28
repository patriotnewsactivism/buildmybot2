import { eq, sql } from 'drizzle-orm';
import express from 'express';
import twilio from 'twilio';
import { users, voiceAgents, voiceCalls } from '../../shared/schema';
import { db } from '../db';
import { env } from '../env';
import { retellService } from '../services/voice/RetellService';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Handle incoming voice calls — Retell AI integration
router.post('/voice/twilio', async (req, res) => {
  try {
    const { To, From, CallSid } = req.body;
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();

    // ── 1. Find voice agent by phone number ──────────────────────────────────
    const [voiceAgent] = await db
      .select()
      .from(voiceAgents)
      .where(eq(voiceAgents.phoneNumber, To))
      .limit(1);

    // Fall back to legacy user-level phone config
    const [user] = !voiceAgent
      ? await db
          .select()
          .from(users)
          .where(sql`phone_config->>'twilioPhoneNumber' = ${To}`)
      : [null];

    if (!voiceAgent && !user) {
      console.warn(`Incoming call to unassigned number: ${To}`);
      response.say('This number is not currently assigned to an active agent.');
      res.type('text/xml');
      return res.send(response.toString());
    }

    // ── 2. Determine which Retell agent to use ───────────────────────────────
    const retellAgentId =
      voiceAgent?.providerAgentId || env.RETELL_DEFAULT_VOICE_ID;

    if (!retellAgentId) {
      console.error('No Retell agent ID configured for incoming call to', To);
      response.say(
        'This line is not yet configured. Please try again later.',
      );
      res.type('text/xml');
      return res.send(response.toString());
    }

    // ── 3. Build dynamic variables from voice agent config ───────────────────
    const dynamicVars: Record<string, string> = {};
    if (voiceAgent?.greeting) dynamicVars.greeting = voiceAgent.greeting;
    if (voiceAgent?.systemPrompt)
      dynamicVars.system_prompt = voiceAgent.systemPrompt;
    if (voiceAgent?.transferNumber)
      dynamicVars.transfer_number = voiceAgent.transferNumber;

    // ── 4. Register the call with Retell AI ──────────────────────────────────
    const retellCall = await retellService.registerTwilioCall(
      retellAgentId,
      From,
      To,
      {
        voiceAgentId: voiceAgent?.id || 'legacy',
        userId: user?.id || voiceAgent?.organizationId || 'unknown',
        twilioCallSid: CallSid,
      },
      Object.keys(dynamicVars).length > 0 ? dynamicVars : undefined,
    );

    console.log(
      `Retell call registered: ${retellCall.call_id} → agent ${retellAgentId}`,
    );

    // ── 5. Create call record in our DB ──────────────────────────────────────
    if (voiceAgent) {
      const callId = uuidv4();
      await db.insert(voiceCalls).values({
        id: callId,
        voiceAgentId: voiceAgent.id,
        organizationId: voiceAgent.organizationId,
        botId: voiceAgent.botId,
        twilioCallSid: CallSid,
        fromNumber: From,
        toNumber: To,
        direction: 'inbound',
        status: 'in-progress',
        startedAt: new Date(),
      });
    }

    // ── 6. Connect Twilio stream → Retell WebSocket ──────────────────────────
    const connect = response.connect();
    connect.stream({ url: retellCall.websocket_url });

    // Fallback if the stream connection fails
    response.say(
      'We are having trouble connecting to the AI agent. Please try again later.',
    );

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

// Handle incoming SMS (unchanged)
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
      console.log(`Received SMS for user ${user.id} from ${From}: ${Body}`);
    }

    res.type('text/xml');
    res.send(response.toString());
  } catch (error) {
    console.error('Error handling Twilio SMS webhook:', error);
    res.status(500).send('Error');
  }
});

export { router as twilioWebhooksRouter };
