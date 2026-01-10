import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { impersonationSessions, partnerClients } from '../../shared/schema';
import { db } from '../db';

const router = Router();

router.post('/start', async (req, res) => {
  try {
    const actor = (req as any).user;
    const {
      targetUserId,
      reason,
      durationMinutes = 30,
    } = req.body as {
      targetUserId: string;
      reason: string;
      durationMinutes?: number;
    };

    if (!actor) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!targetUserId || !reason) {
      return res
        .status(400)
        .json({ error: 'targetUserId and reason required' });
    }

    const isAdmin = ['ADMIN', 'Admin', 'MasterAdmin'].includes(actor.role);
    if (!isAdmin) {
      const [relation] = await db
        .select()
        .from(partnerClients)
        .where(
          and(
            eq(partnerClients.partnerId, actor.id),
            eq(partnerClients.clientId, targetUserId),
          ),
        );

      if (
        !relation ||
        (!relation.canImpersonate &&
          relation.accessLevel !== 'full' &&
          relation.accessLevel !== 'manage')
      ) {
        return res.status(403).json({ error: 'Impersonation not permitted' });
      }
    }

    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    const sessionId = uuidv4();

    await db.insert(impersonationSessions).values({
      id: sessionId,
      actorUserId: actor.id,
      targetUserId,
      reason,
      expiresAt,
      createdAt: new Date(),
    });

    res.json({ token: sessionId, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error('Impersonation start error:', error);
    res.status(500).json({ error: 'Failed to start impersonation' });
  }
});

router.post('/end', async (req, res) => {
  try {
    const actor = (req as any).user;
    const { token } = req.body as { token: string };
    if (!actor || !token) {
      return res.status(400).json({ error: 'token required' });
    }

    await db
      .update(impersonationSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(impersonationSessions.id, token),
          eq(impersonationSessions.actorUserId, actor.id),
        ),
      );

    res.json({ success: true });
  } catch (error) {
    console.error('Impersonation end error:', error);
    res.status(500).json({ error: 'Failed to end impersonation' });
  }
});

router.get('/active', async (req, res) => {
  try {
    const actor = (req as any).user;
    if (!actor) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const sessions = await db
      .select()
      .from(impersonationSessions)
      .where(eq(impersonationSessions.actorUserId, actor.id));

    res.json(
      sessions.filter(
        (session) =>
          !session.revokedAt && session.expiresAt.getTime() > Date.now(),
      ),
    );
  } catch (error) {
    console.error('Impersonation active error:', error);
    res.status(500).json({ error: 'Failed to load impersonation sessions' });
  }
});

export default router;
