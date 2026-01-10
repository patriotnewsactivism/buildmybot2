import { and, eq, isNull } from 'drizzle-orm';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { impersonationSessions, users } from '../../shared/schema';
import { db } from '../db';

export const applyImpersonation: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.headers['x-impersonation-token'];
    if (!token) {
      return next();
    }

    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [session] = await db
      .select()
      .from(impersonationSessions)
      .where(eq(impersonationSessions.id, token as string));

    if (!session || session.revokedAt) {
      return res.status(401).json({ error: 'Impersonation session expired' });
    }

    if (session.expiresAt.getTime() < Date.now()) {
      return res.status(401).json({ error: 'Impersonation session expired' });
    }

    if (session.actorUserId !== user.id) {
      return res
        .status(403)
        .json({ error: 'Impersonation session not authorized' });
    }

    const [targetUser] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, session.targetUserId), isNull(users.deletedAt)));

    if (!targetUser) {
      return res.status(404).json({ error: 'Impersonation target not found' });
    }

    (req as any).actor = user;
    (req as any).user = targetUser;
    (req as any).impersonation = {
      sessionId: session.id,
      targetUserId: session.targetUserId,
      actorUserId: session.actorUserId,
    };

    next();
  } catch (error) {
    console.error('Impersonation error:', error);
    res.status(500).json({ error: 'Failed to apply impersonation session' });
  }
};
