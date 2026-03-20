import crypto from 'node:crypto';
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  bots,
  callLogs,
  phoneNumbers,
  users,
  voiceAgents,
} from '../../shared/schema';
import { db } from '../db';
import { env } from '../env';
import { authenticate } from '../middleware';
import { VoiceAgentController } from '../voice/voiceAgentController';
import { VoiceAgentManager } from '../voice/voiceAgentManager';
import {
  voiceAgentConfigSchema,
  voiceProviderConfigSchema,
} from '../voice/types';

// Provider configuration from environment variables
const providerConfigs = [
  {
    provider: 'vapi' as const,
    apiKey: env.VAPI_API_KEY || '',
    defaultVoiceId: env.VAPI_DEFAULT_VOICE_ID || '',
    webhookUrl: `${env.APP_BASE_URL}/api/voice/webhooks/vapi`,
  },
  {
    provider: 'retell' as const,
    apiKey: env.RETELL_API_KEY || '',
    defaultVoiceId: env.VAPI_DEFAULT_VOICE_ID || '',
    webhookUrl: `${env.APP_BASE_URL}/api/voice/webhooks/retell`,
  },
  {
    provider: 'custom' as const,
    apiKey: env.CARTESIA_API_KEY || '',
    defaultVoiceId: env.VAPI_DEFAULT_VOICE_ID || '',
    webhookUrl: `${env.APP_BASE_URL}/api/voice/webhooks/custom`,
  },
].filter((cfg) => voiceProviderConfigSchema.safeParse(cfg).success);

const manager = new VoiceAgentManager(providerConfigs);
const controller = new VoiceAgentController(manager);
const router = Router();

const createAgentSchema = voiceAgentConfigSchema.extend({
  provider: z.enum(['vapi', 'retell', 'custom']).default('vapi'),
});

const updateAgentSchema = createAgentSchema.partial().extend({
  id: z.string(),
});

const errorResponse = (
  res,
  code: number,
  error: string,
  details?: any,
) => res.status(code).json({ error, code: 'VOICE_ERROR', details });

// Create voice agent for a bot
router.post(
  '/agents',
  authenticate,
  async (req, res) => {
    const parsed = createAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      return errorResponse(res, 400, 'Invalid payload', parsed.error.format());
    }

    const config = parsed.data;

    // Ownership check
    const [bot] = await db
      .select()
      .from(bots)
      .where(eq(bots.id, config.botId));
    if (!bot || bot.userId !== req.user?.id) {
      return errorResponse(res, 403, 'Bot not found or unauthorized');
    }

    try {
      const providerAgentId = await manager.createAgent(config.provider, config);
      const [inserted] = await db
        .insert(voiceAgents)
        .values({
          id: crypto.randomUUID(),
          botId: config.botId,
          organizationId: bot.organizationId,
          provider: config.provider,
          providerAgentId,
          voiceId: config.voiceId,
          voiceName: undefined,
          systemPrompt: config.systemPrompt,
          greeting: config.greeting,
          language: config.language,
          businessHours: config.businessHours,
          afterHoursMessage: config.afterHoursMessage,
          transferNumber: config.transferNumber,
          calendarBookingUrl: config.calendarBookingUrl,
          maxCallDuration: config.maxCallDuration,
          recordCalls: config.recordCalls,
          escalationRules: config.escalationRules,
          endCallPhrases: config.endCallPhrases,
          enabled: true,
          isActive: true,
        })
        .returning();

      res.json({ agent: inserted });
    } catch (err) {
      return errorResponse(
        res,
        500,
        'Failed to create voice agent',
        err instanceof Error ? err.message : err,
      );
    }
  },
);

// Get voice agent config by botId
router.get(
  '/agents/:botId',
  authenticate,
  async (req, res) => {
    const { botId } = req.params;
    const [agent] = await db
      .select()
      .from(voiceAgents)
      .where(eq(voiceAgents.botId, botId))
      .limit(1);

    if (!agent) {
      return errorResponse(res, 404, 'Voice agent not found');
    }
    if (req.user?.id !== (await ownerForBot(botId))) {
      return errorResponse(res, 403, 'Unauthorized');
    }
    res.json(agent);
  },
);

// Update voice agent config
router.put(
  '/agents/:id',
  authenticate,
  async (req, res) => {
    const parsed = updateAgentSchema.safeParse({ ...req.body, id: req.params.id });
    if (!parsed.success) {
      return errorResponse(res, 400, 'Invalid payload', parsed.error.format());
    }
    const { id, provider, ...config } = parsed.data;

    const [agent] = await db
      .select()
      .from(voiceAgents)
      .where(eq(voiceAgents.id, id))
      .limit(1);
    if (!agent) return errorResponse(res, 404, 'Voice agent not found');
    if (req.user?.id !== (await ownerForBot(agent.botId))) {
      return errorResponse(res, 403, 'Unauthorized');
    }

    try {
      if (provider && agent.providerAgentId) {
        await manager.updateAgent(provider, agent.providerAgentId, config);
      }
      const [updated] = await db
        .update(voiceAgents)
        .set({
          ...config,
          updatedAt: new Date(),
        })
        .where(eq(voiceAgents.id, id))
        .returning();
      res.json(updated);
    } catch (err) {
      return errorResponse(
        res,
        500,
        'Failed to update voice agent',
        err instanceof Error ? err.message : err,
      );
    }
  },
);

// Delete voice agent
router.delete(
  '/agents/:id',
  authenticate,
  async (req, res) => {
    const { id } = req.params;
    const [agent] = await db
      .select()
      .from(voiceAgents)
      .where(eq(voiceAgents.id, id))
      .limit(1);
    if (!agent) return errorResponse(res, 404, 'Voice agent not found');
    if (req.user?.id !== (await ownerForBot(agent.botId))) {
      return errorResponse(res, 403, 'Unauthorized');
    }
    try {
      if (agent.providerAgentId) {
        await manager.deleteAgent(agent.provider as any, agent.providerAgentId);
      }
      await db.delete(voiceAgents).where(eq(voiceAgents.id, id));
      res.json({ success: true });
    } catch (err) {
      return errorResponse(
        res,
        500,
        'Failed to delete voice agent',
        err instanceof Error ? err.message : err,
      );
    }
  },
);

// Provision phone number
router.post(
  '/phone-numbers',
  authenticate,
  async (req, res) => {
    const schema = z.object({
      provider: z.enum(['vapi', 'retell', 'custom']).default('vapi'),
      areaCode: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return errorResponse(res, 400, 'Invalid payload', parsed.error.format());
    }
    const { provider, areaCode = '415' } = parsed.data;
    try {
      const number = await manager.provisionPhoneNumber(provider, areaCode);
      const [record] = await db
        .insert(phoneNumbers)
        .values({
          voiceAgentId: null,
          userId: req.user!.id,
          provider,
          providerNumberId: number.providerNumberId,
          phoneNumber: number.number,
          friendlyName: number.friendlyName,
          capabilities: number.capabilities,
          monthlyCost: number.monthlyCost,
          status: 'active',
        })
        .returning();
      res.json(record);
    } catch (err) {
      return errorResponse(
        res,
        500,
        'Failed to provision phone number',
        err instanceof Error ? err.message : err,
      );
    }
  },
);

// Assign number to agent
router.post(
  '/phone-numbers/:id/assign',
  authenticate,
  async (req, res) => {
    const schema = z.object({ agentId: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return errorResponse(res, 400, 'Invalid payload', parsed.error.format());
    }
    const numberId = Number(req.params.id);
    const { agentId } = parsed.data;

    const [number] = await db
      .select()
      .from(phoneNumbers)
      .where(eq(phoneNumbers.id, numberId))
      .limit(1);
    if (!number) return errorResponse(res, 404, 'Phone number not found');

    const [agent] = await db
      .select()
      .from(voiceAgents)
      .where(eq(voiceAgents.id, agentId))
      .limit(1);
    if (!agent) return errorResponse(res, 404, 'Voice agent not found');
    if (req.user?.id !== (await ownerForBot(agent.botId))) {
      return errorResponse(res, 403, 'Unauthorized');
    }

    try {
      await manager.assignPhoneNumber(agent.provider as any, agent.providerAgentId!, number.phoneNumber);
      const [updatedNumber] = await db
        .update(phoneNumbers)
        .set({ voiceAgentId: agentId })
        .where(eq(phoneNumbers.id, numberId))
        .returning();
      await db
        .update(voiceAgents)
        .set({ phoneNumber: number.phoneNumber })
        .where(eq(voiceAgents.id, agentId));

      res.json(updatedNumber);
    } catch (err) {
      return errorResponse(
        res,
        500,
        'Failed to assign phone number',
        err instanceof Error ? err.message : err,
      );
    }
  },
);

// List call history
router.get(
  '/calls',
  authenticate,
  async (req, res) => {
    const schema = z.object({
      agentId: z.string().optional(),
      page: z.coerce.number().default(1),
      pageSize: z.coerce.number().default(20),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return errorResponse(res, 400, 'Invalid query', parsed.error.format());
    }
    const { agentId, page, pageSize } = parsed.data;

    let query = db.select().from(callLogs);
    if (agentId) {
      query = query.where(eq(callLogs.voiceAgentId, agentId));
    }
    const results = await query.limit(pageSize).offset((page - 1) * pageSize);

    res.json({ data: results });
  },
);

// Get call detail
router.get(
  '/calls/:id',
  authenticate,
  async (req, res) => {
    const id = Number(req.params.id);
    const [call] = await db
      .select()
      .from(callLogs)
      .where(eq(callLogs.id, id))
      .limit(1);
    if (!call) return errorResponse(res, 404, 'Call not found');
    res.json(call);
  },
);

// Provider webhooks
router.post('/webhooks/vapi', async (req, res) => {
  const result = await controller.handleProviderWebhook('vapi', req.body);
  res.json(result);
});

router.post('/webhooks/retell', async (req, res) => {
  const result = await controller.handleProviderWebhook('retell', req.body);
  res.json(result);
});

async function ownerForBot(botId: string) {
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (!bot) return null;
  const [user] = await db.select().from(users).where(eq(users.id, bot.userId));
  return user?.id ?? null;
}

export default router;
