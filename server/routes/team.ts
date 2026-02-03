import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { organizationMembers, users } from '../../shared/schema';
import { db } from '../db';
import {
  authenticate,
  loadOrganizationContext,
  tenantIsolation,
} from '../middleware';

const router = Router();

router.use(authenticate, loadOrganizationContext, tenantIsolation());

// List team members
router.get('/', async (req: any, res) => {
  try {
    const orgId = req.organization.id;
    const members = await db
      .select({
        id: organizationMembers.id,
        role: organizationMembers.role,
        joinedAt: organizationMembers.joinedAt,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(eq(organizationMembers.organizationId, orgId));

    res.json(members);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Invite member (Simplified: just adds them if they exist, normally would send email)
router.post('/invite', async (req: any, res) => {
  try {
    const { email, role } = req.body;
    const orgId = req.organization.id;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      return res
        .status(404)
        .json({ error: 'User not found. They must sign up first.' });
    }

    // Check if already member
    const [existing] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, user.id),
        ),
      );

    if (existing) {
      return res.status(400).json({ error: 'User is already a member' });
    }

    await db.insert(organizationMembers).values({
      id: uuidv4(),
      organizationId: orgId,
      userId: user.id,
      role: role || 'member',
      permissions: [],
      invitedBy: req.user.id,
      joinedAt: new Date(),
    });

    res.json({ success: true, message: 'Member added' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Remove member
router.delete('/:memberId', async (req: any, res) => {
  try {
    const orgId = req.organization.id;
    // Prevent removing self if owner?
    // Ideally check permissions here.

    await db
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.id, req.params.memberId),
          eq(organizationMembers.organizationId, orgId),
        ),
      );

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
