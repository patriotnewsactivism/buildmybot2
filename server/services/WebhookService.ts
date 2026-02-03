import crypto from 'node:crypto';
import axios from 'axios';
import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { webhookLogs, webhooks } from '../../shared/schema';
import { db } from '../db';
import logger from '../utils/logger';

export type WebhookEventType =
  | 'lead.captured'
  | 'conversation.started'
  | 'conversation.ended'
  | 'sentiment.negative'
  | 'bot.created';

export class WebhookService {
  async registerWebhook(data: {
    organizationId: string;
    url: string;
    eventTypes: WebhookEventType[];
    description?: string;
    secret?: string;
  }) {
    const id = uuidv4();
    const secret = data.secret || crypto.randomBytes(32).toString('hex');

    const [webhook] = await db
      .insert(webhooks)
      .values({
        id,
        organizationId: data.organizationId,
        url: data.url,
        eventTypes: data.eventTypes,
        secret,
        description: data.description,
        isActive: true,
      })
      .returning();

    return webhook;
  }

  async listWebhooks(organizationId: string) {
    return db
      .select()
      .from(webhooks)
      .where(eq(webhooks.organizationId, organizationId));
  }

  async deleteWebhook(id: string, organizationId: string) {
    return db
      .delete(webhooks)
      .where(
        and(eq(webhooks.id, id), eq(webhooks.organizationId, organizationId)),
      );
  }

  async triggerWebhook(
    organizationId: string,
    eventType: WebhookEventType,
    payload: any,
  ) {
    const activeWebhooks = await db
      .select()
      .from(webhooks)
      .where(
        and(
          eq(webhooks.organizationId, organizationId),
          eq(webhooks.isActive, true),
        ),
      );

    const relevantWebhooks = activeWebhooks.filter((w) =>
      (w.eventTypes as string[]).includes(eventType),
    );

    const tasks = relevantWebhooks.map((webhook) =>
      this.deliverWebhook(webhook, eventType, payload),
    );
    return Promise.allSettled(tasks);
  }

  private async deliverWebhook(
    webhook: any,
    eventType: WebhookEventType,
    payload: any,
  ) {
    const startTime = Date.now();
    const logId = uuidv4();

    const enrichedPayload = {
      id: logId,
      timestamp: new Date().toISOString(),
      event: eventType,
      organizationId: webhook.organizationId,
      data: payload,
    };

    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let error: string | null = null;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'BuildMyBot-Webhook/1.0',
        'X-BuildMyBot-Event': eventType,
        'X-BuildMyBot-Delivery': logId,
      };

      if (webhook.secret) {
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(JSON.stringify(enrichedPayload))
          .digest('hex');
        headers['X-BuildMyBot-Signature'] = signature;
      }

      const response = await axios.post(webhook.url, enrichedPayload, {
        headers,
        timeout: 10000,
      });

      responseStatus = response.status;
      responseBody =
        typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data);
    } catch (err: any) {
      error = err.message;
      if (err.response) {
        responseStatus = err.response.status;
        responseBody =
          typeof err.response.data === 'string'
            ? err.response.data
            : JSON.stringify(err.response.data);
      }
      logger.error(`Webhook delivery failed to ${webhook.url}: ${error}`);
    } finally {
      const durationMs = Date.now() - startTime;

      await db.insert(webhookLogs).values({
        id: logId,
        webhookId: webhook.id,
        eventType,
        payload: enrichedPayload,
        responseStatus,
        responseBody: responseBody?.substring(0, 1000), // Truncate long bodies
        durationMs,
        error,
      });
    }
  }
}

export const webhookService = new WebhookService();
