/**
 * Sales Agent Routes
 *
 * Tier 2 in the hierarchy: Partner → Sales Agent → Client
 * Sales agents manage their assigned clients and can view
 * those clients' conversations, leads, and bot performance.
 */

import { type SQL, and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { Router } from 'express';
import {
  bots,
  conversations,
  leads,
  salesAgentClients,
  salesAgentPartners,
  users,
} from '../../shared/schema';
import { db } from '../db';

const router = Router();

// ─── Agent's assigned clients ───
router.get('/clients', async (req: any, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const clientLinks = await db
      .select()
      .from(salesAgentClients)
      .where(eq(salesAgentClients.agentId, agentId));

    if (clientLinks.length === 0) {
      return res.json([]);
    }

    const clientIds = clientLinks.map((l) => l.clientId);
    const clients = await db
      .select()
      .from(users)
      .where(inArray(users.id, clientIds))
      .orderBy(desc(users.createdAt));

    // Enrich with bot count + lead count per client
    const enriched = await Promise.all(
      clients.map(async (client) => {
        const [[botCount], [leadCount]] = await Promise.all([
          db
            .select({ count: sql<number>`COUNT(*)` })
            .from(bots)
            .where(eq(bots.userId, client.id)),
          db
            .select({ count: sql<number>`COUNT(*)` })
            .from(leads)
            .where(eq(leads.userId, client.id)),
        ]);
        const link = clientLinks.find((l) => l.clientId === client.id);
        return {
          ...client,
          botCount: Number(botCount?.count || 0),
          leadCount: Number(leadCount?.count || 0),
          commissionRate: link?.commissionRate || 0,
        };
      }),
    );

    res.json(enriched);
  } catch (error) {
    console.error('Agent clients error:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// ─── Agent overview/dashboard metrics ───
router.get('/overview', async (req: any, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const clientLinks = await db
      .select()
      .from(salesAgentClients)
      .where(eq(salesAgentClients.agentId, agentId));

    const clientIds = clientLinks.map((l) => l.clientId);

    const [totalClientsResult] = [{ count: clientIds.length }];

    let totalBots = 0;
    let totalLeads = 0;
    let totalConversations = 0;

    if (clientIds.length > 0) {
      const [[bc], [lc], [cc]] = await Promise.all([
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(bots)
          .where(inArray(bots.userId, clientIds)),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(leads)
          .where(inArray(leads.userId, clientIds)),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(conversations)
          .where(inArray(conversations.userId, clientIds)),
      ]);
      totalBots = Number(bc?.count || 0);
      totalLeads = Number(lc?.count || 0);
      totalConversations = Number(cc?.count || 0);
    }

    // Get partner info
    const [partnerLink] = await db
      .select()
      .from(salesAgentPartners)
      .where(eq(salesAgentPartners.agentId, agentId))
      .limit(1);

    let partnerName: string | null = null;
    if (partnerLink) {
      const [partner] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, partnerLink.partnerId));
      partnerName = partner?.name || null;
    }

    res.json({
      totalClients: clientIds.length,
      totalBots,
      totalLeads,
      totalConversations,
      partner: partnerName
        ? { name: partnerName, overrideRate: partnerLink?.commissionOverrideRate || 0 }
        : null,
    });
  } catch (error) {
    console.error('Agent overview error:', error);
    res.status(500).json({ error: 'Failed to load agent overview' });
  }
});

// ─── Agent can view conversations for their clients ───
router.get('/conversations', async (req: any, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { limit = '50', offset = '0', sentiment, clientId } = req.query;

    const clientLinks = await db
      .select()
      .from(salesAgentClients)
      .where(eq(salesAgentClients.agentId, agentId));

    const clientIds = clientLinks.map((l) => l.clientId);
    if (clientIds.length === 0) {
      return res.json({ conversations: [], total: 0 });
    }

    const conditions: SQL[] = [];

    // If specific client requested, verify access
    if (clientId) {
      if (!clientIds.includes(clientId as string)) {
        return res.status(403).json({ error: 'Not authorized for this client' });
      }
      conditions.push(eq(conversations.userId, clientId as string));
    } else {
      conditions.push(inArray(conversations.userId, clientIds));
    }

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
    console.error('Agent conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

export default router;
