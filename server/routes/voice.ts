import { eq } from 'drizzle-orm';
import { Router } from 'express';
import twilio from 'twilio';
import { v4 as uuidv4 } from 'uuid';
import {
  bots,
  leads,
  voiceAgents,
  voiceCallMessages,
  voiceCalls,
} from '../../shared/schema';
import { db } from '../db';
import { env } from '../env';
import { authenticate } from '../middleware';
import { retellService } from '../services/voice/RetellService';
import { twilioService } from '../services/voice/TwilioService';

const router = Router();

/**
 * Webhook: Incoming call from Twilio → Retell AI
 * Registers the call with Retell and connects the media stream.
 */
router.post('/webhook', async (req, res) => {
  try {
    const { CallSid, From, To, CallStatus } = req.body;

    // Find voice agent by phone number
    const [voiceAgent] = await db
      .select()
      .from(voiceAgents)
      .where(eq(voiceAgents.phoneNumber, To))
      .limit(1);

    if (!voiceAgent || !voiceAgent.enabled) {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('This number is not currently in service.');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    // Determine Retell agent to use
    const retellAgentId = voiceAgent.providerAgentId || env.RETELL_DEFAULT_VOICE_ID;
    if (!retellAgentId) {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('This line is not yet configured. Please try again later.');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    // Create call record
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

    // Build dynamic variables from config
    const dynamicVars: Record<string, string> = {};
    if (voiceAgent.greeting) dynamicVars.greeting = voiceAgent.greeting;
    if (voiceAgent.systemPrompt) dynamicVars.system_prompt = voiceAgent.systemPrompt;
    if (voiceAgent.transferNumber) dynamicVars.transfer_number = voiceAgent.transferNumber;

    // Register call with Retell
    const retellCall = await retellService.registerTwilioCall(
      retellAgentId,
      From,
      To,
      {
        voiceAgentId: voiceAgent.id,
        callId,
        organizationId: voiceAgent.organizationId,
      },
      Object.keys(dynamicVars).length > 0 ? dynamicVars : undefined,
    );

    console.log(`Retell call registered: ${retellCall.call_id} for voiceAgent ${voiceAgent.id}`);

    // Create TwiML response connecting Twilio → Retell WebSocket
    const twiml = new twilio.twiml.VoiceResponse();
    const connect = twiml.connect();
    connect.stream({ url: retellCall.websocket_url });

    // Fallback
    twiml.say('We are having trouble connecting to the AI agent. Please try again later.');
    twiml.hangup();

    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error('Voice webhook error:', error);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Sorry, an error occurred. Please try again later.');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

/**
 * Retell Webhook: Post-call data (transcript, analysis, recording)
 * Configure this URL in the Retell dashboard under webhook settings.
 */
router.post('/retell-webhook', async (req, res) => {
  try {
    const { event, call } = req.body;

    // Optionally verify webhook signature
    const signature = req.headers['x-retell-signature'] as string;
    if (env.RETELL_WEBHOOK_SECRET && signature) {
      const isValid = retellService.verifyWebhookSignature(
        JSON.stringify(req.body),
        signature,
      );
      if (!isValid) {
        console.error('Invalid Retell webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    console.log(`Retell webhook: ${event} for call ${call?.call_id}`);

    switch (event) {
      case 'call_started': {
        // Call has been connected
        break;
      }

      case 'call_ended': {
        // Call finished — save transcript and update records
        if (call?.metadata?.callId) {
          const callId = call.metadata.callId;
          const durationMs = call.duration_ms || 0;
          const durationSeconds = Math.ceil(durationMs / 1000);

          // Update call record
          await db
            .update(voiceCalls)
            .set({
              status: 'completed',
              endedAt: new Date(),
              durationSeconds,
              transcript: call.transcript || null,
              sentiment: call.call_analysis?.user_sentiment || 'neutral',
              recordingUrl: call.recording_url || null,
            })
            .where(eq(voiceCalls.id, callId));

          // Save individual messages from transcript
          if (call.transcript_object && Array.isArray(call.transcript_object)) {
            for (const msg of call.transcript_object) {
              await db.insert(voiceCallMessages).values({
                id: uuidv4(),
                voiceCallId: callId,
                role: msg.role === 'agent' ? 'assistant' : 'user',
                content: msg.content,
                timestamp: new Date(),
              });
            }
          }

          // Update voice agent minutes used
          const [voiceCall] = await db
            .select()
            .from(voiceCalls)
            .where(eq(voiceCalls.id, callId))
            .limit(1);

          if (voiceCall) {
            const minutesUsed = Math.ceil(durationSeconds / 60);
            const [voiceAgent] = await db
              .select()
              .from(voiceAgents)
              .where(eq(voiceAgents.id, voiceCall.voiceAgentId))
              .limit(1);

            if (voiceAgent) {
              await db
                .update(voiceAgents)
                .set({
                  minutesUsed: (voiceAgent.minutesUsed || 0) + minutesUsed,
                })
                .where(eq(voiceAgents.id, voiceAgent.id));
            }
          }
        }
        break;
      }

      case 'call_analyzed': {
        // Post-call analysis ready
        if (call?.metadata?.callId && call.call_analysis) {
          await db
            .update(voiceCalls)
            .set({
              sentiment: call.call_analysis.user_sentiment || 'neutral',
            })
            .where(eq(voiceCalls.id, call.metadata.callId));
        }
        break;
      }

      default:
        console.log(`Unhandled Retell webhook event: ${event}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Retell webhook error:', error);
    res.sendStatus(500);
  }
});

/**
 * API: Create a web call (browser voice session via Retell)
 * Frontend calls this, gets an access_token, then uses Retell Web SDK.
 */
router.post('/web-call', authenticate, async (req, res) => {
  try {
    const { agentId, botId, metadata } = req.body;

    // Determine Retell agent to use
    let retellAgentId = agentId;

    if (!retellAgentId && botId) {
      const [voiceAgent] = await db
        .select()
        .from(voiceAgents)
        .where(eq(voiceAgents.botId, botId))
        .limit(1);

      retellAgentId = voiceAgent?.providerAgentId;
    }

    if (!retellAgentId) {
      retellAgentId = env.RETELL_DEFAULT_VOICE_ID;
    }

    if (!retellAgentId) {
      return res.status(400).json({ error: 'No Retell agent configured' });
    }

    const webCall = await retellService.createWebCall({
      agent_id: retellAgentId,
      metadata: metadata || {},
    });

    res.json({
      callId: webCall.call_id,
      accessToken: webCall.access_token,
      agentId: webCall.agent_id,
    });
  } catch (error) {
    console.error('Error creating web call:', error);
    res.status(500).json({ error: 'Failed to create web call' });
  }
});

/**
 * Status callback from Twilio (call ended)
 */
router.post('/status', async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body;

    const [voiceCall] = await db
      .select()
      .from(voiceCalls)
      .where(eq(voiceCalls.twilioCallSid, CallSid))
      .limit(1);

    if (voiceCall) {
      await db
        .update(voiceCalls)
        .set({
          status: CallStatus,
          endedAt: new Date(),
          durationSeconds: Number.parseInt(CallDuration || '0', 10),
        })
        .where(eq(voiceCalls.id, voiceCall.id));

      // Update voice agent minutes used
      const minutesUsed = Math.ceil(
        Number.parseInt(CallDuration || '0', 10) / 60,
      );
      const [voiceAgent] = await db
        .select()
        .from(voiceAgents)
        .where(eq(voiceAgents.id, voiceCall.voiceAgentId))
        .limit(1);

      if (voiceAgent) {
        await db
          .update(voiceAgents)
          .set({
            minutesUsed: (voiceAgent.minutesUsed || 0) + minutesUsed,
          })
          .where(eq(voiceAgents.id, voiceAgent.id));
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Status callback error:', error);
    res.sendStatus(500);
  }
});

/**
 * Public API: Voice preview — returns Retell voices info
 */
router.post('/preview', async (_req, res) => {
  try {
    // For now return a preview using Retell's demo web call
    // In production, this could create a short demo web call
    res.json({
      message: 'Voice preview available via web call',
      voices: retellService.getAvailableVoices(),
    });
  } catch (error) {
    console.error('Voice preview error:', error);
    res.status(500).json({ error: 'Voice preview unavailable' });
  }
});

/**
 * API: List available Retell voices
 */
router.get('/voices', async (_req, res) => {
  try {
    const voices = retellService.getAvailableVoices();
    res.json({ voices });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch voices' });
  }
});

/**
 * API: List Retell agents
 */
router.get('/retell-agents', authenticate, async (_req, res) => {
  try {
    const agents = await retellService.listAgents();
    res.json({ agents });
  } catch (error) {
    console.error('Error listing Retell agents:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

/**
 * Management API: Get voice agent configuration for a bot
 */
router.get('/agents/:botId', authenticate, async (req, res) => {
  try {
    const { botId } = req.params;

    // Return empty config for new bots
    if (botId === 'new') {
      return res.json({
        enabled: false,
        provider: 'retell',
        voiceId: 'retell-Marissa',
        greeting: 'Hello! How can I help you today?',
        transferEnabled: false,
        transferNumber: '',
        transferTriggers: ['speak to human', 'talk to agent', 'representative'],
        leadCaptureEnabled: true,
        plan: 'VOICE_BASIC',
        minutesUsed: 0,
        minutesLimit: 150,
        language: 'en-US',
        endCallPhrase: 'goodbye',
      });
    }

    const [voiceAgent] = await db
      .select()
      .from(voiceAgents)
      .where(eq(voiceAgents.botId, botId))
      .limit(1);

    if (!voiceAgent) {
      return res.status(404).json({ error: 'Voice agent not found' });
    }

    res.json(voiceAgent);
  } catch (error) {
    console.error('Error fetching voice agent:', error);
    res.status(500).json({ error: 'Failed to fetch voice agent' });
  }
});

/**
 * Management API: Create voice agent configuration
 */
router.post('/agents/:botId', authenticate, async (req, res) => {
  try {
    const { botId } = req.params;
    const config = req.body;

    // Get bot to verify organization
    const [bot] = await db
      .select()
      .from(bots)
      .where(eq(bots.id, botId))
      .limit(1);

    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    const voiceAgentId = uuidv4();
    const [voiceAgent] = await db
      .insert(voiceAgents)
      .values({
        id: voiceAgentId,
        botId,
        organizationId: bot.organizationId,
        provider: 'retell',
        providerAgentId: config.providerAgentId || null,
        enabled: config.enabled || false,
        voiceId: config.voiceId || 'retell-Marissa',
        voiceName: config.voiceName || 'Marissa',
        greeting: config.greeting || 'Hello! How can I help you today?',
        systemPrompt: config.systemPrompt || 'You are a helpful AI receptionist.',
        transferEnabled: config.transferEnabled || false,
        transferNumber: config.transferNumber || null,
        transferTriggers: config.transferTriggers || [],
        leadCaptureEnabled: config.leadCaptureEnabled !== false,
        plan: config.plan || 'VOICE_BASIC',
        minutesLimit: config.minutesLimit || 150,
        language: config.language || 'en-US',
        endCallPhrase: config.endCallPhrase || 'goodbye',
      })
      .returning();

    res.json(voiceAgent);
  } catch (error) {
    console.error('Error creating voice agent:', error);
    res.status(500).json({ error: 'Failed to create voice agent' });
  }
});

/**
 * Management API: Update voice agent configuration
 */
router.put('/agents/:botId', authenticate, async (req, res) => {
  try {
    const { botId } = req.params;
    const config = req.body;

    const [voiceAgent] = await db
      .update(voiceAgents)
      .set({
        provider: 'retell',
        providerAgentId: config.providerAgentId,
        enabled: config.enabled,
        voiceId: config.voiceId,
        voiceName: config.voiceName,
        greeting: config.greeting,
        systemPrompt: config.systemPrompt,
        transferEnabled: config.transferEnabled,
        transferNumber: config.transferNumber,
        transferTriggers: config.transferTriggers,
        leadCaptureEnabled: config.leadCaptureEnabled,
        plan: config.plan,
        minutesLimit: config.minutesLimit,
        language: config.language,
        endCallPhrase: config.endCallPhrase,
        updatedAt: new Date(),
      })
      .where(eq(voiceAgents.botId, botId))
      .returning();

    if (!voiceAgent) {
      return res.status(404).json({ error: 'Voice agent not found' });
    }

    res.json(voiceAgent);
  } catch (error) {
    console.error('Error updating voice agent:', error);
    res.status(500).json({ error: 'Failed to update voice agent' });
  }
});

/**
 * Management API: Provision phone number for voice agent
 */
router.post('/agents/:botId/provision', authenticate, async (req, res) => {
  try {
    const { botId } = req.params;
    const { areaCode } = req.body || {};

    if (botId === 'new' || !botId) {
      return res
        .status(400)
        .json({ error: 'Bot must be saved before provisioning phone number' });
    }

    const [voiceAgent] = await db
      .select()
      .from(voiceAgents)
      .where(eq(voiceAgents.botId, botId))
      .limit(1);

    if (!voiceAgent) {
      return res.status(404).json({
        error: 'Voice agent not found. Please save voice configuration first.',
      });
    }

    // Provision phone number via Twilio
    try {
      const phoneNumber = await twilioService.provisionPhoneNumber(
        voiceAgent.id,
        areaCode,
      );

      await db
        .update(voiceAgents)
        .set({ phoneNumber, updatedAt: new Date() })
        .where(eq(voiceAgents.id, voiceAgent.id));

      res.json({ phoneNumber });
    } catch (twilioError: any) {
      console.error('Twilio provisioning error:', twilioError);
      return res.status(500).json({
        error: 'Failed to provision phone number',
        details: twilioError.message || 'Twilio service error',
      });
    }
  } catch (error) {
    console.error('Error provisioning phone number:', error);
    res.status(500).json({ error: 'Failed to provision phone number' });
  }
});

export default router;
