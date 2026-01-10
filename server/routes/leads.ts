import { type SQL, and, desc, eq } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { bots, leads } from '../../shared/schema';
import { db } from '../db';
import {
  applyImpersonation,
  authenticate,
  loadOrganizationContext,
  strictLimiter,
  tenantIsolation,
} from '../middleware';

const router = Router();

const apiAuthStack = [
  authenticate,
  applyImpersonation,
  loadOrganizationContext,
  tenantIsolation(),
];

router.post('/capture', strictLimiter, async (req: Request, res: Response) => {
  try {
    const {
      botId,
      name,
      email,
      phone,
      source = 'chatbot',
      conversationContext,
    } = req.body;

    if (!botId) {
      return res.status(400).json({ error: 'botId is required' });
    }

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const [bot] = await db
      .select()
      .from(bots)
      .where(eq(bots.id, botId))
      .limit(1);

    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    const leadId = uuidv4();
    const [newLead] = await db
      .insert(leads)
      .values({
        id: leadId,
        name: name || 'Anonymous',
        email,
        phone: phone || null,
        score: calculateLeadScore({ name, email, phone, conversationContext }),
        status: 'New',
        sourceBotId: botId,
        userId: bot.userId,
        organizationId: bot.organizationId,
        createdAt: new Date(),
      })
      .returning();

    res.json(newLead);
  } catch (error) {
    console.error('Error capturing lead:', error);
    res.status(500).json({ error: 'Failed to capture lead' });
  }
});

router.get('/', ...apiAuthStack, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { status, botId, startDate, endDate } = req.query;
    const organizationId = user.organizationId;

    const conditions: SQL[] = [];

    if (organizationId) {
      conditions.push(eq(leads.organizationId, organizationId));
    } else {
      conditions.push(eq(leads.userId, user.id));
    }

    if (status && typeof status === 'string') {
      conditions.push(eq(leads.status, status));
    }

    if (botId && typeof botId === 'string') {
      conditions.push(eq(leads.sourceBotId, botId));
    }

    let query = db.select().from(leads);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const result = await query.orderBy(desc(leads.createdAt));
    res.json(result);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

router.get('/:id', ...apiAuthStack, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, req.params.id));

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (user.organizationId && lead.organizationId !== user.organizationId) {
      return res
        .status(403)
        .json({ error: 'Not authorized to view this lead' });
    }

    if (!user.organizationId && lead.userId !== user.id) {
      return res
        .status(403)
        .json({ error: 'Not authorized to view this lead' });
    }

    res.json(lead);
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

router.put('/:id', ...apiAuthStack, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { status, name, email, phone, score } = req.body;

    const [existingLead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, req.params.id));

    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (
      user.organizationId &&
      existingLead.organizationId !== user.organizationId
    ) {
      return res
        .status(403)
        .json({ error: 'Not authorized to update this lead' });
    }

    if (!user.organizationId && existingLead.userId !== user.id) {
      return res
        .status(403)
        .json({ error: 'Not authorized to update this lead' });
    }

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (score !== undefined) updateData.score = score;

    const [updatedLead] = await db
      .update(leads)
      .set(updateData)
      .where(eq(leads.id, req.params.id))
      .returning();

    res.json(updatedLead);
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

router.delete('/:id', ...apiAuthStack, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [existingLead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, req.params.id));

    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (
      user.organizationId &&
      existingLead.organizationId !== user.organizationId
    ) {
      return res
        .status(403)
        .json({ error: 'Not authorized to delete this lead' });
    }

    if (!user.organizationId && existingLead.userId !== user.id) {
      return res
        .status(403)
        .json({ error: 'Not authorized to delete this lead' });
    }

    await db.delete(leads).where(eq(leads.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

function calculateLeadScore(data: {
  name?: string;
  email?: string;
  phone?: string;
  conversationContext?: any;
}): number {
  let score = 50;

  if (data.name && data.name !== 'Anonymous') {
    score += 15;
  }

  if (data.email) {
    score += 20;
    if (
      data.email.includes('@gmail.com') ||
      data.email.includes('@yahoo.com') ||
      data.email.includes('@hotmail.com')
    ) {
      score -= 5;
    }
  }

  if (data.phone) {
    score += 15;
  }

  if (data.conversationContext) {
    const context =
      typeof data.conversationContext === 'string'
        ? data.conversationContext
        : JSON.stringify(data.conversationContext);

    const buyingSignals = [
      'pricing',
      'cost',
      'quote',
      'demo',
      'trial',
      'buy',
      'purchase',
      'interested',
    ];
    const lowerContext = context.toLowerCase();

    buyingSignals.forEach((signal) => {
      if (lowerContext.includes(signal)) {
        score += 5;
      }
    });
  }

  return Math.min(Math.max(score, 0), 100);
}

export default router;
