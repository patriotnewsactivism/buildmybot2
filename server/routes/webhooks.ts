import { desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { webhookLogs } from '../../shared/schema';
import { db } from '../db';
import {
  authenticate,
  loadOrganizationContext,
  tenantIsolation,
} from '../middleware';
import { webhookService } from '../services/WebhookService';

const router = Router();

// All routes require authentication and organization context
router.use(authenticate, loadOrganizationContext, tenantIsolation());

// List all webhooks for the organization
router.get('/', async (req: any, res) => {
  try {
    const orgId = req.organization.id;
    const webhooks = await webhookService.listWebhooks(orgId);
    res.json(webhooks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Register a new webhook
router.post('/', async (req: any, res) => {
  try {
    const { url, eventTypes, description } = req.body;
    if (!url || !eventTypes || !Array.isArray(eventTypes)) {
      return res
        .status(400)
        .json({ error: 'Missing required fields: url, eventTypes (array)' });
    }

    const orgId = req.organization.id;
    const webhook = await webhookService.registerWebhook({
      organizationId: orgId,
      url,
      eventTypes,
      description,
    });

    res.status(201).json(webhook);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a webhook
router.delete('/:id', async (req: any, res) => {
  try {
    const orgId = req.organization.id;
    await webhookService.deleteWebhook(req.params.id, orgId);
    res.status(204).end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get logs for a specific webhook
router.get('/:id/logs', async (req: any, res) => {
  try {
    // Note: We should verify ownership of the webhook here
    const logs = await db
      .select()
      .from(webhookLogs)
      .where(eq(webhookLogs.webhookId, req.params.id))
      .orderBy(desc(webhookLogs.createdAt))
      .limit(50);

    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Test a webhook
router.post('/:id/test', async (req: any, res) => {
  try {
    const orgId = req.organization.id;
    const webhooks = await webhookService.listWebhooks(orgId);
    const webhook = webhooks.find((w) => w.id === req.params.id);

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const testPayload = {
      test: true,
      message: 'This is a test delivery from BuildMyBot',
      triggeredAt: new Date().toISOString(),
    };

    // We use the same deliverWebhook logic via a public wrapper or duplicate
    // For now, let's just trigger it with a fake event
    await webhookService.triggerWebhook(
      orgId,
      'bot.created' as any,
      testPayload,
    );

    res.json({ success: true, message: 'Test delivery initiated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
