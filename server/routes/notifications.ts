import { and, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  notificationReceipts,
  notifications,
  users,
} from '../../shared/schema';
import { db } from '../db';
import {
  applyImpersonation,
  authenticate,
  authorize,
  loadOrganizationContext,
  tenantIsolation,
} from '../middleware';

const router = Router();

const adminAuthStack = [
  authenticate,
  applyImpersonation,
  loadOrganizationContext,
  authorize(['Admin', 'MasterAdmin', 'ADMIN']),
];
const userAuthStack = [
  authenticate,
  applyImpersonation,
  loadOrganizationContext,
  tenantIsolation(),
];

// ========================================
// ADMIN ENDPOINTS
// ========================================

router.post(
  '/admin/notifications',
  ...adminAuthStack,
  async (req: any, res) => {
    try {
      const {
        title,
        body,
        isPopup,
        priority,
        publishAt,
        expiresAt,
        audienceType,
        audienceFilter,
      } = req.body;

      if (!title || !body) {
        return res.status(400).json({ error: 'Title and body are required' });
      }

      const notificationId = uuidv4();
      const now = new Date();

      const [notification] = await db
        .insert(notifications)
        .values({
          id: notificationId,
          title,
          body,
          isPopup: isPopup || false,
          priority: priority || 'normal',
          createdBy: req.user.id,
          publishAt: publishAt ? new Date(publishAt) : null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          audienceType: audienceType || 'all',
          audienceFilter: audienceFilter || {},
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      res.status(201).json(notification);
    } catch (error) {
      console.error('Create notification error:', error);
      res.status(500).json({ error: 'Failed to create notification' });
    }
  },
);

router.get('/admin/notifications', ...adminAuthStack, async (req: any, res) => {
  try {
    const { limit = '50', offset = '0' } = req.query;

    const allNotifications = await db
      .select()
      .from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    const notificationsWithStats = await Promise.all(
      allNotifications.map(async (notification) => {
        const [totalReceipts] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(notificationReceipts)
          .where(eq(notificationReceipts.notificationId, notification.id));

        const [viewedCount] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(notificationReceipts)
          .where(
            and(
              eq(notificationReceipts.notificationId, notification.id),
              sql`${notificationReceipts.viewedAt} IS NOT NULL`,
            ),
          );

        const [acknowledgedCount] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(notificationReceipts)
          .where(
            and(
              eq(notificationReceipts.notificationId, notification.id),
              sql`${notificationReceipts.acknowledgedAt} IS NOT NULL`,
            ),
          );

        return {
          ...notification,
          stats: {
            totalReceipts: totalReceipts?.count || 0,
            viewedCount: viewedCount?.count || 0,
            acknowledgedCount: acknowledgedCount?.count || 0,
          },
        };
      }),
    );

    res.json(notificationsWithStats);
  } catch (error) {
    console.error('List notifications error:', error);
    res.status(500).json({ error: 'Failed to list notifications' });
  }
});

router.get(
  '/admin/notifications/:id',
  ...adminAuthStack,
  async (req: any, res) => {
    try {
      const { id } = req.params;

      const [notification] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, id));

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      const [totalReceipts] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(notificationReceipts)
        .where(eq(notificationReceipts.notificationId, id));

      const [viewedCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(notificationReceipts)
        .where(
          and(
            eq(notificationReceipts.notificationId, id),
            sql`${notificationReceipts.viewedAt} IS NOT NULL`,
          ),
        );

      const [acknowledgedCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(notificationReceipts)
        .where(
          and(
            eq(notificationReceipts.notificationId, id),
            sql`${notificationReceipts.acknowledgedAt} IS NOT NULL`,
          ),
        );

      const [deliveredCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(notificationReceipts)
        .where(
          and(
            eq(notificationReceipts.notificationId, id),
            sql`${notificationReceipts.deliveredAt} IS NOT NULL`,
          ),
        );

      res.json({
        ...notification,
        stats: {
          totalReceipts: totalReceipts?.count || 0,
          deliveredCount: deliveredCount?.count || 0,
          viewedCount: viewedCount?.count || 0,
          acknowledgedCount: acknowledgedCount?.count || 0,
        },
      });
    } catch (error) {
      console.error('Get notification error:', error);
      res.status(500).json({ error: 'Failed to get notification' });
    }
  },
);

router.delete(
  '/admin/notifications/:id',
  ...adminAuthStack,
  async (req: any, res) => {
    try {
      const { id } = req.params;

      const [notification] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, id));

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      await db.delete(notifications).where(eq(notifications.id, id));

      res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
      console.error('Delete notification error:', error);
      res.status(500).json({ error: 'Failed to delete notification' });
    }
  },
);

// ========================================
// USER ENDPOINTS
// ========================================

router.get('/notifications', ...userAuthStack, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const userPlan = req.user.plan;
    const userRole = req.user.role;
    const now = new Date();

    const activeNotifications = await db
      .select()
      .from(notifications)
      .where(
        and(
          or(
            isNull(notifications.publishAt),
            lte(notifications.publishAt, now),
          ),
          or(
            isNull(notifications.expiresAt),
            gte(notifications.expiresAt, now),
          ),
        ),
      )
      .orderBy(desc(notifications.createdAt));

    const filteredNotifications = activeNotifications.filter((notification) => {
      if (notification.audienceType === 'all') {
        return true;
      }

      const filter = notification.audienceFilter as any;

      if (notification.audienceType === 'plan' && filter?.plans) {
        return filter.plans.includes(userPlan);
      }

      if (notification.audienceType === 'role' && filter?.roles) {
        return filter.roles.includes(userRole);
      }

      return true;
    });

    const notificationsWithReceipts = await Promise.all(
      filteredNotifications.map(async (notification) => {
        let [receipt] = await db
          .select()
          .from(notificationReceipts)
          .where(
            and(
              eq(notificationReceipts.notificationId, notification.id),
              eq(notificationReceipts.userId, userId),
            ),
          );

        if (!receipt) {
          [receipt] = await db
            .insert(notificationReceipts)
            .values({
              id: uuidv4(),
              notificationId: notification.id,
              userId,
              deliveredAt: now,
              createdAt: now,
            })
            .returning();
        }

        return {
          ...notification,
          receipt: {
            viewedAt: receipt.viewedAt,
            acknowledgedAt: receipt.acknowledgedAt,
          },
        };
      }),
    );

    const unreadNotifications = notificationsWithReceipts.filter(
      (n) => !n.receipt.viewedAt,
    );
    const recentNotifications = notificationsWithReceipts.slice(0, 20);

    res.json({
      unread: unreadNotifications,
      recent: recentNotifications,
      unreadCount: unreadNotifications.length,
    });
  } catch (error) {
    console.error('Get user notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

router.post(
  '/notifications/:id/view',
  ...userAuthStack,
  async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const now = new Date();

      const [notification] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, id));

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      let [receipt] = await db
        .select()
        .from(notificationReceipts)
        .where(
          and(
            eq(notificationReceipts.notificationId, id),
            eq(notificationReceipts.userId, userId),
          ),
        );

      if (!receipt) {
        [receipt] = await db
          .insert(notificationReceipts)
          .values({
            id: uuidv4(),
            notificationId: id,
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

      res.json({ success: true, receipt });
    } catch (error) {
      console.error('Mark notification viewed error:', error);
      res.status(500).json({ error: 'Failed to mark notification as viewed' });
    }
  },
);

router.post(
  '/notifications/:id/acknowledge',
  ...userAuthStack,
  async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const now = new Date();

      const [notification] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, id));

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      let [receipt] = await db
        .select()
        .from(notificationReceipts)
        .where(
          and(
            eq(notificationReceipts.notificationId, id),
            eq(notificationReceipts.userId, userId),
          ),
        );

      if (!receipt) {
        [receipt] = await db
          .insert(notificationReceipts)
          .values({
            id: uuidv4(),
            notificationId: id,
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

      res.json({ success: true, receipt });
    } catch (error) {
      console.error('Acknowledge notification error:', error);
      res.status(500).json({ error: 'Failed to acknowledge notification' });
    }
  },
);

export default router;
