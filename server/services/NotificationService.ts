import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  notificationReceipts,
  notifications,
  users,
} from '../../shared/schema';
import { db } from '../db';

export interface CreateNotificationParams {
  title: string;
  body: string;
  isPopup?: boolean;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  publishAt?: Date;
  expiresAt?: Date;
  audienceType?: 'all' | 'plan' | 'role' | 'organization' | 'user';
  audienceFilter?: Record<string, any>;
  targetOrganizationId?: string;
  targetUserId?: string;
  createdBy?: string;
  actionUrl?: string;
  recipientEmail?: string; // Added for direct email notifications
}

export class NotificationService {
  /**
   * Create a new notification
   */
  async createNotification(params: CreateNotificationParams) {
    const notificationId = uuidv4();
    const now = new Date();

    const [notification] = await db
      .insert(notifications)
      .values({
        id: notificationId,
        title: params.title,
        body: params.body,
        isPopup: params.isPopup || false,
        priority: params.priority || 'normal',
        createdBy: params.createdBy,
        publishAt: params.publishAt || null,
        expiresAt: params.expiresAt || null,
        audienceType: params.audienceType || 'all',
        audienceFilter: params.audienceFilter || {},
        actionUrl: params.actionUrl,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // If targeting specific organization, create receipts for all members
    if (params.audienceType === 'organization' && params.targetOrganizationId) {
      const members = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.organizationId, params.targetOrganizationId));

      for (const member of members) {
        await db.insert(notificationReceipts).values({
          id: uuidv4(),
          notificationId,
          userId: member.id,
          deliveredAt: now,
          createdAt: now,
        });
        // Optionally send email to organization members
        if (member.email) {
          await this.sendEmailNotification(member.email, params.title, params.body, params.actionUrl);
        }
      }
    }

    // If targeting specific user
    if (params.audienceType === 'user' && params.targetUserId) {
      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, params.targetUserId));
      await db.insert(notificationReceipts).values({
        id: uuidv4(),
        notificationId,
        userId: params.targetUserId,
        deliveredAt: now,
        createdAt: now,
      });
      // Optionally send email to specific user
      if (user?.email) {
        await this.sendEmailNotification(user.email, params.title, params.body, params.actionUrl);
      }
    }

    // If a direct recipient email is provided, send an email notification
    if (params.recipientEmail) {
      await this.sendEmailNotification(params.recipientEmail, params.title, params.body, params.actionUrl);
    }

    return notification;
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(userId: string) {
    const now = new Date();

    const activeNotifications = await db
      .select()
      .from(notifications)
      .where(
        and(
          or(
            isNull(notifications.publishAt),
            (notifications as any).publishAt <= now,
          ),
          or(
            isNull(notifications.expiresAt),
            (notifications as any).expiresAt >= now,
          ),
        ),
      )
      .orderBy(desc(notifications.createdAt));

    // Get receipts for this user
    const receipts = await db
      .select()
      .from(notificationReceipts)
      .where(eq(notificationReceipts.userId, userId));

    const receiptMap = new Map(receipts.map((r) => [r.notificationId, r]));

    return activeNotifications
      .filter((n) => {
        // Check audience filters
        if (n.audienceType === 'all') return true;
        // For now, return all - user filtering happens at route level
        return true;
      })
      .map((n) => ({
        ...n,
        receipt: receiptMap.get(n.id) || null,
      }));
  }

  /**
   * Mark notification as viewed
   */
  async markViewed(notificationId: string, userId: string) {
    const now = new Date();

    let [receipt] = await db
      .select()
      .from(notificationReceipts)
      .where(
        and(
          eq(notificationReceipts.notificationId, notificationId),
          eq(notificationReceipts.userId, userId),
        ),
      );

    if (!receipt) {
      [receipt] = await db
        .insert(notificationReceipts)
        .values({
          id: uuidv4(),
          notificationId,
          userId,
          deliveredAt: now,
          viewedAt: now,
          createdAt: now,
        })
        .returning();
    } else if (!receipt.viewedAt) {
      [receipt] = await db
        .update(notificationReceipts)
        .set({ viewedAt: now })
        .where(eq(notificationReceipts.id, receipt.id))
        .returning();
    }

    return receipt;
  }

  /**
   * Mark notification as acknowledged
   */
  async markAcknowledged(notificationId: string, userId: string) {
    const now = new Date();

    let [receipt] = await db
      .select()
      .from(notificationReceipts)
      .where(
        and(
          eq(notificationReceipts.notificationId, notificationId),
          eq(notificationReceipts.userId, userId),
        ),
      );

    if (!receipt) {
      [receipt] = await db
        .insert(notificationReceipts)
        .values({
          id: uuidv4(),
          notificationId,
          userId,
          deliveredAt: now,
          viewedAt: now,
          acknowledgedAt: now,
          createdAt: now,
        })
        .returning();
    } else {
      [receipt] = await db
        .update(notificationReceipts)
        .set({
          viewedAt: receipt.viewedAt || now,
          acknowledgedAt: now,
        })
        .where(eq(notificationReceipts.id, receipt.id))
        .returning();
    }

    return receipt;
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string) {
    await db.delete(notifications).where(eq(notifications.id, notificationId));
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const receipts = await db
      .select()
      .from(notificationReceipts)
      .where(
        and(
          eq(notificationReceipts.userId, userId),
          isNull(notificationReceipts.viewedAt),
        ),
      );

    return receipts.length;
  }

  /**
   * Sends an email notification.
   * This is a placeholder for actual email sending logic.
   * @param to The recipient's email address.
   * @param subject The subject of the email.
   * @param body The body of the email (can be HTML).
   * @param actionUrl An optional URL for a call to action.
   */
  async sendEmailNotification(to: string, subject: string, body: string, actionUrl?: string) {
    // In a real application, this would integrate with an email service (e.g., SendGrid, Mailgun, AWS SES)
    console.log(`
--- SIMULATING EMAIL SEND ---
To: ${to}
Subject: ${subject}
Body: ${body}
${actionUrl ? `Action URL: ${actionUrl}` : ''}
-----------------------------
    `);
    // TODO: Integrate with actual email sending service
  }
}

export const notificationService = new NotificationService();
