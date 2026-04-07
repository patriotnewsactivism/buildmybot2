import { eq } from 'drizzle-orm';
import { Router } from 'express';
import OpenAI from 'openai';
import twilio from 'twilio';
import { v4 as uuidv4 } from 'uuid';
import {
  bots,
  knowledgeChunks,
  leads,
  voiceAgents,
  voiceCallMessages,
  voiceCalls,
} from '../../shared/schema';
import { db } from '../db';
import { env } from '../env';
import { authenticate } from '../middleware';
import { cartesiaService } from '../services/voice/CartesiaService';
import { twilioService } from '../services/voice/TwilioService';

const router = Router();
const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/**
 * Webhook: Incoming call from Twilio
 * This is called when someone calls a provisioned phone number
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

    // Generate greeting audio with Cartesia
    const audioUrl = await cartesiaService.generateSpeechFile(
      voiceAgent.greeting,
      voiceAgent.voiceId,
      callId,
    );

    // Create TwiML response with Cartesia audio
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.play(`${env.APP_BASE_URL}${audioUrl}`);

    // Gather speech input
    twiml.gather({
      input: ['speech'],
      action: `/api/voice/process?callId=${callId}`,
      method: 'POST',
      speechTimeout: 'auto',
      speechModel: 'phone_call',
      language: voiceAgent.language || 'en-US',
    });

    // Fallback if no input
    twiml.say('I did not hear anything. Please call back.');
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
 * Process speech input and generate AI response
 */
router.post('/process', async (req, res) => {
  try {
    const { SpeechResult, CallSid } = req.body;
    const callId = req.query.callId as string;

    if (!SpeechResult) {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('I did not catch that. Could you please repeat?');
      twiml.gather({
        input: ['speech'],
        action: `/api/voice/process?callId=${callId}`,
        method: 'POST',
        speechTimeout: 'auto',
        speechModel: 'phone_call',
      });
      twiml.say('I still did not hear anything. Goodbye.');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    // Get voice call details
    const [voiceCall] = await db
      .select()
      .from(voiceCalls)
      .where(eq(voiceCalls.id, callId))
      .limit(1);

    if (!voiceCall) {
      throw new Error('Voice call not found');
    }

    // Get voice agent config
    const [voiceAgent] = await db
      .select()
      .from(voiceAgents)
      .where(eq(voiceAgents.id, voiceCall.voiceAgentId))
      .limit(1);

    // Get bot configuration
    const [bot] = await db
      .select()
      .from(bots)
      .where(eq(bots.id, voiceAgent.botId))
      .limit(1);

    // Save user message
    await db.insert(voiceCallMessages).values({
      id: uuidv4(),
      voiceCallId: callId,
      role: 'user',
      content: SpeechResult,
      timestamp: new Date(),
    });

    // Check for transfer triggers
    if (voiceAgent.transferEnabled && voiceAgent.transferTriggers) {
      const triggers = voiceAgent.transferTriggers as string[];
      const shouldTransfer = triggers.some((trigger) =>
        SpeechResult.toLowerCase().includes(trigger.toLowerCase()),
      );

      if (shouldTransfer && voiceAgent.transferNumber) {
        await twilioService.transferToHuman(CallSid, voiceAgent.transferNumber);
        await db
          .update(voiceCalls)
          .set({
            transferredToHuman: true,
            transferredAt: new Date(),
          })
          .where(eq(voiceCalls.id, callId));
        return;
      }
    }

    // Get conversation history
    const messages = await db
      .select()
      .from(voiceCallMessages)
      .where(eq(voiceCallMessages.voiceCallId, callId))
      .orderBy(voiceCallMessages.timestamp);

    // Search knowledge base for relevant context
    let contextText = '';
    if (bot.knowledgeBase && Array.isArray(bot.knowledgeBase)) {
      const knowledgeIds = bot.knowledgeBase as string[];
      if (knowledgeIds.length > 0) {
        const relevantChunks = await db
          .select()
          .from(knowledgeChunks)
          .where(eq(knowledgeChunks.sourceId, knowledgeIds[0]))
          .limit(3);

        contextText = relevantChunks.map((chunk) => chunk.content).join('\n\n');
      }
    }

    // Generate AI response using OpenAI
    const contextSection = contextText
      ? `\n\nContext from knowledge base:\n${contextText}`
      : '';
    const systemPrompt = `${bot.systemPrompt}${contextSection}

You are a professional voice assistant. Keep responses concise and conversational (2-3 sentences max).
${voiceAgent.leadCaptureEnabled ? 'If the caller seems interested, ask for their name, email, and phone number.' : ''}`;

    const completion = await openai.chat.completions.create({
      model: bot.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user', content: SpeechResult },
      ],
      temperature: bot.temperature || 0.7,
      max_tokens: 150, // Keep responses concise for voice
    });

    const aiResponse =
      completion.choices[0].message.content ||
      'I apologize, I did not understand that.';

    // Save AI response
    await db.insert(voiceCallMessages).values({
      id: uuidv4(),
      voiceCallId: callId,
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date(),
    });

    // Check for lead capture in response
    if (voiceAgent.leadCaptureEnabled) {
      await attemptLeadCapture(SpeechResult, voiceCall, voiceAgent);
    }

    // Generate speech with Cartesia
    const audioUrl = await cartesiaService.generateSpeechFile(
      aiResponse,
      voiceAgent.voiceId,
      callId,
    );

    // Create TwiML response
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.play(`${env.APP_BASE_URL}${audioUrl}`);

    // Check if we should end the call
    if (
      aiResponse.toLowerCase().includes(voiceAgent.endCallPhrase.toLowerCase())
    ) {
      twiml.say('Thank you for calling. Goodbye!');
      twiml.hangup();
    } else {
      // Continue conversation
      twiml.gather({
        input: ['speech'],
        action: `/api/voice/process?callId=${callId}`,
        method: 'POST',
        speechTimeout: 'auto',
        speechModel: 'phone_call',
        language: voiceAgent.language || 'en-US',
      });
    }

    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error('Voice processing error:', error);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Sorry, I encountered an error. Please try again.');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
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
 * Helper: Attempt to capture lead information from conversation
 */
async function attemptLeadCapture(
  speechResult: string,
  voiceCall: any,
  voiceAgent: any,
) {
  // Simple pattern matching for email and phone
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
  const phoneRegex = /(\d{3}[-.]?\d{3}[-.]?\d{4})/;

  const email = speechResult.match(emailRegex)?.[1];
  const phone = speechResult.match(phoneRegex)?.[1];

  // If we captured email or phone, create a lead
  if (email || phone) {
    const leadId = uuidv4();
    await db.insert(leads).values({
      id: leadId,
      name: 'Voice Call Lead', // Can be extracted with NLP
      email: email || 'unknown@voice.call',
      phone: phone || voiceCall.fromNumber,
      sourceBotId: voiceAgent.botId,
      organizationId: voiceAgent.organizationId,
      status: 'New',
      score: 50,
      createdAt: new Date(),
    });

    await db
      .update(voiceCalls)
      .set({
        leadCaptured: true,
        leadId,
      })
      .where(eq(voiceCalls.id, voiceCall.id));
  }
}

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
        voiceId: 'professional-female-us',
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
        enabled: config.enabled || false,
        voiceId: config.voiceId || 'professional-female-us',
        greeting: config.greeting || 'Hello! How can I help you today?',
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
        enabled: config.enabled,
        voiceId: config.voiceId,
        greeting: config.greeting,
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
    const { areaCode } = req.body;

    // Don't allow provisioning for new/unsaved bots
    if (botId === 'new' || !botId) {
      return res
        .status(400)
        .json({ error: 'Bot must be saved before provisioning phone number' });
    }

    // Get voice agent
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

      // Update voice agent with phone number
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
