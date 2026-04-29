import { type SQL, and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PLANS, RESELLER_TIERS, WHITELABEL_FEE } from '../../constants';
import {
  analyticsEvents,
  bots,
  conversations,
  leads,
  marketingMaterials,
  partnerClients,
  partnerNotes,
  partnerPayouts,
  partnerTasks,
  salesAgentClients,
  salesAgentPartners,
  users,
} from '../../shared/schema';
import { db } from '../db';

const router = Router();

router.get('/clients', async (req: any, res) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [partner] = await db
      .select()
      .from(users)
      .where(eq(users.id, partnerId));
    const referredClients = partner?.resellerCode
      ? await db
          .select()
          .from(users)
          .where(eq(users.referredBy, partner.resellerCode))
      : [];

    const partnerLinks = await db
      .select()
      .from(partnerClients)
      .where(eq(partnerClients.partnerId, partnerId));

    const linkedClientIds = partnerLinks.map((link) => link.clientId);
    const linkedClients = linkedClientIds.length
      ? await db.select().from(users).where(inArray(users.id, linkedClientIds))
      : [];

    const clientsMap = new Map<string, (typeof linkedClients)[number]>();
    [...referredClients, ...linkedClients].forEach((client) => {
      clientsMap.set(client.id, client);
    });

    const clients = await Promise.all(
      Array.from(clientsMap.values()).map(async (client) => {
        const [botCount] = await db
          .select({ count: count() })
          .from(bots)
          .where(eq(bots.userId, client.id));
        const [leadCount] = await db
          .select({ count: count() })
          .from(leads)
          .where(eq(leads.userId, client.id));

        const planPrice = PLANS[client.plan as keyof typeof PLANS]?.price || 0;
        const link = partnerLinks.find((entry) => entry.clientId === client.id);

        return {
          ...client,
          mrrCents: planPrice * 100,
          botCount: botCount?.count || 0,
          leadCount: leadCount?.count || 0,
          lastActiveAt: client.lastLoginAt || client.createdAt,
          accessLevel: link?.accessLevel || 'view',
          canImpersonate: link?.canImpersonate || false,
        };
      }),
    );

    res.json(clients);
  } catch (error) {
    console.error('Partner clients error:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

router.get('/commissions', async (req, res) => {
  try {
    const actor = (req as any).actor || (req as any).user;
    const partnerId = actor?.id;
    if (!partnerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [partner] = await db
      .select()
      .from(users)
      .where(eq(users.id, partnerId));
    const referredClients = partner?.resellerCode
      ? await db
          .select()
          .from(users)
          .where(eq(users.referredBy, partner.resellerCode))
      : [];

    const currentTier =
      RESELLER_TIERS.find(
        (tier) =>
          referredClients.length >= tier.min &&
          referredClients.length <= tier.max,
      ) || RESELLER_TIERS[0];

    const whitelabelEnabled = Boolean(partner?.whitelabelEnabled);
    const partnerAccessStart = partner?.whitelabelEnabledAt
      ? new Date(partner.whitelabelEnabledAt)
      : null;
    const partnerAccessAppliesToAll =
      currentTier.commission >= WHITELABEL_FEE.commission ||
      (whitelabelEnabled && !partnerAccessStart);

    let legacyRevenue = 0;
    let partnerAccessRevenue = 0;
    let partnerAccessEligibleClients = 0;
    let partnerAccessLegacyClients = 0;

    for (const client of referredClients) {
      const price = PLANS[client.plan as keyof typeof PLANS]?.price || 0;
      const createdAt = client.createdAt ? new Date(client.createdAt) : null;
      const eligibleForPartnerRate =
        partnerAccessAppliesToAll ||
        (whitelabelEnabled &&
          partnerAccessStart &&
          createdAt &&
          createdAt.getTime() >= partnerAccessStart.getTime());

      if (eligibleForPartnerRate) {
        partnerAccessRevenue += price;
        partnerAccessEligibleClients += 1;
      } else {
        legacyRevenue += price;
        partnerAccessLegacyClients += 1;
      }
    }

    const totalRevenue = legacyRevenue + partnerAccessRevenue;
    const grossCommission =
      legacyRevenue * currentTier.commission +
      partnerAccessRevenue * WHITELABEL_FEE.commission;
    const commissionRate =
      totalRevenue > 0
        ? grossCommission / totalRevenue
        : whitelabelEnabled || partnerAccessAppliesToAll
          ? WHITELABEL_FEE.commission
          : currentTier.commission;

    const paidThrough = partner?.whitelabelPaidThrough
      ? new Date(partner.whitelabelPaidThrough)
      : null;
    const whitelabelFeeDue =
      whitelabelEnabled && (!paidThrough || paidThrough.getTime() < Date.now());
    const whitelabelFeeAmount = whitelabelFeeDue ? WHITELABEL_FEE.price : 0;
    const pendingPayout = Math.max(grossCommission - whitelabelFeeAmount, 0);

    const payouts = await db
      .select()
      .from(partnerPayouts)
      .where(eq(partnerPayouts.partnerId, partnerId))
      .orderBy(desc(partnerPayouts.createdAt));

    res.json({
      stats: {
        totalClients: referredClients.length,
        totalRevenue,
        commissionRate,
        grossCommission,
        pendingPayout,
        whitelabelFeeDue,
        whitelabelFeeAmount,
        partnerAccessActive: whitelabelEnabled,
        partnerAccessAppliesToAll,
        partnerAccessStart: partnerAccessStart
          ? partnerAccessStart.toISOString()
          : null,
        partnerAccessEligibleClients,
        partnerAccessLegacyClients,
      },
      tier: currentTier,
      payouts,
    });
  } catch (error) {
    console.error('Partner commissions error:', error);
    res.status(500).json({ error: 'Failed to fetch commission data' });
  }
});

router.get('/marketing-materials', async (_req, res) => {
  try {
    const materials = await db.select().from(marketingMaterials);
    res.json(materials);
  } catch (error) {
    console.error('Marketing materials error:', error);
    res.status(500).json({ error: 'Failed to load marketing materials' });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const actor = (req as any).actor || (req as any).user;
    const partnerId = actor?.id;
    if (!partnerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [partner] = await db
      .select()
      .from(users)
      .where(eq(users.id, partnerId));
    const referredClients = partner?.resellerCode
      ? await db
          .select()
          .from(users)
          .where(eq(users.referredBy, partner.resellerCode))
      : [];

    const signups = referredClients.length;
    const paid = referredClients.filter(
      (client) => client.plan !== 'FREE',
    ).length;
    const active = referredClients.filter(
      (client) => client.status === 'Active',
    ).length;
    const churned = referredClients.filter(
      (client) => client.status === 'Suspended',
    ).length;

    const referralClicks = await db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'referral_click'),
          eq(analyticsEvents.userId, partnerId),
        ),
      );

    res.json({
      funnel: {
        clicks: referralClicks.length,
        signups,
        paid,
      },
      retention: {
        active,
        churned,
      },
    });
  } catch (error) {
    console.error('Partner analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

router.get('/notes', async (req, res) => {
  try {
    const actor = (req as any).actor || (req as any).user;
    const partnerId = actor?.id;
    const { clientId } = req.query;
    if (!partnerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const noteConditions: SQL[] = [eq(partnerNotes.partnerId, partnerId)];
    if (clientId) {
      noteConditions.push(eq(partnerNotes.clientId, clientId as string));
    }
    const notes = await db
      .select()
      .from(partnerNotes)
      .where(and(...noteConditions))
      .orderBy(desc(partnerNotes.updatedAt));
    res.json(notes);
  } catch (error) {
    console.error('Partner notes error:', error);
    res.status(500).json({ error: 'Failed to load notes' });
  }
});

router.post('/notes', async (req, res) => {
  try {
    const actor = (req as any).actor || (req as any).user;
    const partnerId = actor?.id;
    const { clientId, note } = req.body;
    if (!partnerId || !note) {
      return res.status(400).json({ error: 'partnerId and note required' });
    }

    const [created] = await db
      .insert(partnerNotes)
      .values({
        id: uuidv4(),
        partnerId,
        clientId,
        note,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.json(created);
  } catch (error) {
    console.error('Partner note create error:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

router.get('/tasks', async (req, res) => {
  try {
    const actor = (req as any).actor || (req as any).user;
    const partnerId = actor?.id;
    const { clientId } = req.query;
    if (!partnerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const taskConditions: SQL[] = [eq(partnerTasks.partnerId, partnerId)];
    if (clientId) {
      taskConditions.push(eq(partnerTasks.clientId, clientId as string));
    }
    const tasks = await db
      .select()
      .from(partnerTasks)
      .where(and(...taskConditions))
      .orderBy(desc(partnerTasks.updatedAt));
    res.json(tasks);
  } catch (error) {
    console.error('Partner tasks error:', error);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

router.post('/tasks', async (req, res) => {
  try {
    const actor = (req as any).actor || (req as any).user;
    const partnerId = actor?.id;
    const { clientId, title, status, dueAt } = req.body;
    if (!partnerId || !title) {
      return res.status(400).json({ error: 'title required' });
    }

    const [created] = await db
      .insert(partnerTasks)
      .values({
        id: uuidv4(),
        partnerId,
        clientId,
        title,
        status: status || 'open',
        dueAt: dueAt ? new Date(dueAt) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.json(created);
  } catch (error) {
    console.error('Partner task create error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.put('/tasks/:id', async (req, res) => {
  try {
    const { status, title, dueAt } = req.body;
    const [updated] = await db
      .update(partnerTasks)
      .set({
        status,
        title,
        dueAt: dueAt ? new Date(dueAt) : null,
        updatedAt: new Date(),
      })
      .where(eq(partnerTasks.id, req.params.id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error('Partner task update error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

router.post('/communications/email', async (req, res) => {
  try {
    const actor = (req as any).actor || (req as any).user;
    const partnerId = actor?.id;
    const { clientId, subject, body } = req.body;
    if (!partnerId || !clientId || !subject || !body) {
      return res
        .status(400)
        .json({ error: 'clientId, subject, and body required' });
    }

    const [event] = await db
      .insert(analyticsEvents)
      .values({
        id: uuidv4(),
        organizationId: actor.organizationId,
        userId: partnerId,
        eventType: 'partner.email_sent',
        eventData: { clientId, subject, body },
        createdAt: new Date(),
      })
      .returning();

    res.json(event);
  } catch (error) {
    console.error('Partner email log error:', error);
    res.status(500).json({ error: 'Failed to log email' });
  }
});

// ========================================
// PARTNER → AGENT MANAGEMENT
// ========================================

/** List sales agents under this partner */
router.get('/agents', async (req: any, res) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const agentLinks = await db
      .select()
      .from(salesAgentPartners)
      .where(eq(salesAgentPartners.partnerId, partnerId));

    if (agentLinks.length === 0) {
      return res.json([]);
    }

    const agentIds = agentLinks.map((l) => l.agentId);
    const agents = await db
      .select()
      .from(users)
      .where(inArray(users.id, agentIds))
      .orderBy(desc(users.createdAt));

    // Get client counts per agent
    const clientCounts = await db
      .select({
        agentId: salesAgentClients.agentId,
        count: sql<number>`COUNT(*)`,
      })
      .from(salesAgentClients)
      .where(inArray(salesAgentClients.agentId, agentIds))
      .groupBy(salesAgentClients.agentId);

    const enriched = agents.map((agent) => ({
      ...agent,
      clientCount: Number(clientCounts.find((c) => c.agentId === agent.id)?.count || 0),
      overrideRate: agentLinks.find((l) => l.agentId === agent.id)?.commissionOverrideRate || 0,
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Partner agents error:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// ========================================
// PARTNER → CONVERSATIONS (across all agents' clients)
// ========================================

/** Partner can view all conversations from their agents' clients */
router.get('/conversations', async (req: any, res) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { limit = '50', offset = '0', sentiment } = req.query;

    // Get all agent IDs under this partner
    const agentLinks = await db
      .select({ agentId: salesAgentPartners.agentId })
      .from(salesAgentPartners)
      .where(eq(salesAgentPartners.partnerId, partnerId));

    // Get all client IDs from partner_clients + agent clients
    const directClients = await db
      .select({ clientId: partnerClients.clientId })
      .from(partnerClients)
      .where(eq(partnerClients.partnerId, partnerId));

    const agentIds = agentLinks.map((l) => l.agentId);
    const agentClients = agentIds.length > 0
      ? await db
          .select({ clientId: salesAgentClients.clientId })
          .from(salesAgentClients)
          .where(inArray(salesAgentClients.agentId, agentIds))
      : [];

    const allClientIds = [
      ...new Set([
        ...directClients.map((c) => c.clientId),
        ...agentClients.map((c) => c.clientId),
      ]),
    ];

    if (allClientIds.length === 0) {
      return res.json({ conversations: [], total: 0 });
    }

    const conditions: SQL[] = [inArray(conversations.userId, allClientIds)];
    if (sentiment && sentiment !== 'all') {
      conditions.push(eq(conversations.sentiment, sentiment as string));
    }

    const results = await db
      .select({
        id: conversations.id,
        botId: conversations.botId,
        botName: bots.name,
        messages: conversations.messages,
        sentiment: conversations.sentiment,
        timestamp: conversations.timestamp,
        sessionId: conversations.sessionId,
        organizationId: conversations.organizationId,
        clientName: users.name,
      })
      .from(conversations)
      .leftJoin(bots, eq(conversations.botId, bots.id))
      .leftJoin(users, eq(conversations.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(conversations.timestamp))
      .limit(Number(limit))
      .offset(Number(offset));

    const [{ count: total }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(conversations)
      .where(and(...conditions));

    res.json({ conversations: results, total: Number(total) });
  } catch (error) {
    console.error('Partner conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

export default router;
