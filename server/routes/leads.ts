import { type SQL, and, desc, eq } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { bots, leads } from '../../shared/schema';
import { db } from '../db';
import { env } from '../env';
import {
  applyImpersonation,
  authenticate,
  loadOrganizationContext,
  strictLimiter,
  tenantIsolation,
} from '../middleware';
import { integrationService } from '../services/IntegrationService';
import { leadAlertService } from '../services/LeadAlertService';
import { openAIService } from '../services/OpenAIService';

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

    // Calculate score using AI
    const score = await openAIService.scoreLead({
      name,
      email,
      phone,
      conversationContext,
    });

    const leadId = uuidv4();
    const [newLead] = await db
      .insert(leads)
      .values({
        id: leadId,
        name: name || 'Anonymous',
        email,
        phone: phone || null,
        score,
        status: 'New',
        sourceBotId: botId,
        userId: bot.userId,
        organizationId: bot.organizationId,
        createdAt: new Date(),
      })
      .returning();

    // Trigger CRM sync asynchronously
    integrationService.syncLead(newLead).catch(console.error);

    // Send lead alert for hot leads (score >= 70) or all leads based on settings
    // For now, send alerts for all leads; in future, make this configurable per bot
    leadAlertService
      .sendLeadAlert({
        leadId: newLead.id,
        leadName: newLead.name || 'Anonymous',
        leadEmail: newLead.email,
        leadPhone: newLead.phone,
        leadScore: score,
        botId,
        botName: bot.name || 'Unknown Bot',
        organizationId: bot.organizationId,
        conversationContext,
      })
      .catch((err) => console.error('Failed to send lead alert:', err));

    // For very hot leads (score >= 85), also send SMS if configured
    if (score >= 85) {
      leadAlertService
        .sendSmsAlert({
          leadId: newLead.id,
          leadName: newLead.name || 'Anonymous',
          leadEmail: newLead.email,
          leadPhone: newLead.phone,
          leadScore: score,
          botId,
          botName: bot.name || 'Unknown Bot',
          organizationId: bot.organizationId,
          conversationContext,
        })
        .catch((err) => console.error('Failed to send SMS alert:', err));
    }

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

/**
 * POST /api/leads/:id/email — Send an email to a lead from the CRM
 */
router.post(
  '/:id/email',
  authenticate,
  strictLimiter,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { subject, body } = req.body;
      if (!subject || !body) {
        return res.status(400).json({ error: 'Missing subject or body' });
      }

      const [lead] = await db
        .select()
        .from(leads)
        .where(eq(leads.id, req.params.id));
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      if (!lead.email) {
        return res.status(400).json({ error: 'Lead has no email address' });
      }

      if (!env.SMTP_HOST) {
        return res
          .status(503)
          .json({ error: 'Email sending is not configured (SMTP_HOST missing)' });
      }

      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT) || 587,
        secure: env.SMTP_SECURE === 'true',
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });

      await transporter.sendMail({
        from: env.SMTP_FROM || env.SMTP_USER || 'noreply@buildmybot.app',
        to: lead.email,
        subject,
        text: body,
      });

      // Update lead status to Contacted
      await db
        .update(leads)
        .set({ status: 'Contacted' })
        .where(eq(leads.id, req.params.id));

      res.json({ success: true });
    } catch (error) {
      console.error('Error sending email to lead:', error);
      res.status(500).json({ error: 'Failed to send email' });
    }
  },
);

export default router;
