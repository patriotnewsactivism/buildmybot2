import { type SQL, and, count, desc, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PLANS, RESELLER_TIERS, WHITELABEL_FEE } from '../../constants';
import {
  analyticsEvents,
  bots,
  leads,
  marketingMaterials,
  partnerClients,
  partnerNotes,
  partnerPayouts,
  partnerTasks,
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

    const totalRevenue = referredClients.reduce((sum, client) => {
      const price = PLANS[client.plan as keyof typeof PLANS]?.price || 0;
      return sum + price;
    }, 0);

    const currentTier =
      RESELLER_TIERS.find(
        (tier) =>
          referredClients.length >= tier.min &&
          referredClients.length <= tier.max,
      ) || RESELLER_TIERS[0];

    const whitelabelEnabled = Boolean(partner?.whitelabelEnabled);
    const paidThrough = partner?.whitelabelPaidThrough
      ? new Date(partner.whitelabelPaidThrough)
      : null;
    const whitelabelFeeDue =
      whitelabelEnabled && (!paidThrough || paidThrough.getTime() < Date.now());

    const commissionRate = whitelabelEnabled
      ? WHITELABEL_FEE.commission
      : currentTier.commission;
    const grossCommission = totalRevenue * commissionRate;
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

export default router;
