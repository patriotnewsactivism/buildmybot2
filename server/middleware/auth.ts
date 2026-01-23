import { and, eq, isNull } from 'drizzle-orm';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { organizationMembers, organizations, users } from '../../shared/schema';
import { db } from '../db';

// ========================================
// EXTENDED REQUEST INTERFACE
// ========================================

type DbUser = typeof users.$inferSelect;
type DbOrganization = typeof organizations.$inferSelect;
type AuthUser = DbUser & { claims?: { sub?: string } };

export interface AuthRequest extends Request {
  user?: AuthUser;
  actor?: DbUser;
  impersonation?: {
    sessionId: string;
    targetUserId: string;
    actorUserId: string;
  };
  organization?: DbOrganization;
  permissions?: string[];
  session?: { userId?: string };
}

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================

export const authenticate: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Get user from session or headers
    const rawHeaderUserId = req.headers['x-user-id'];
    const headerUserId = Array.isArray(rawHeaderUserId)
      ? rawHeaderUserId[0]
      : rawHeaderUserId;
    const sessionUserId = req.user?.claims?.sub;
    const cookieSessionUserId = req.session?.userId;
    const userId = sessionUserId || cookieSessionUserId || headerUserId;

    if (!userId) {
      console.warn('Auth failed: No userId found in session or headers');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Try to find user by ID first, then by email if ID lookup fails
    let [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId as string), isNull(users.deletedAt)));

    // If not found by ID, try lookup by email (frontend may send email as userId)
    if (!user) {
      [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, userId as string), isNull(users.deletedAt)));
    }

    if (!user) {
      console.warn(`Auth failed: User not found for ID/Email: ${userId}`);
      return res
        .status(401)
        .json({ error: 'Invalid user or user has been deleted' });
    }

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    req.user = user;
    req.actor = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// ========================================
// AUTHORIZATION MIDDLEWARE
// ========================================

export function authorize(allowedRoles: string[]): RequestHandler {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const actor = req.actor || req.user;
    if (!actor) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has one of the allowed roles
    if (
      allowedRoles.includes(actor.role) ||
      (req.user && allowedRoles.includes(req.user.role))
    ) {
      return next();
    }

    res.status(403).json({ error: 'Insufficient permissions' });
  };
}

// ========================================
// ORGANIZATION CONTEXT MIDDLEWARE
// ========================================

export const loadOrganizationContext: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Load user's primary organization
    if (user.organizationId) {
      const [org] = await db
        .select()
        .from(organizations)
        .where(
          and(
            eq(organizations.id, user.organizationId),
            isNull(organizations.deletedAt),
          ),
        );

      if (org) {
        req.organization = org;
      }
    }

    // Load organization membership and permissions
    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, user.id));

    if (membership) {
      req.permissions = (membership.permissions as string[]) || [];
    }

    next();
  } catch (error) {
    console.error('Organization context error:', error);
    res.status(500).json({ error: 'Failed to load organization context' });
  }
};

// ========================================
// PERMISSION CHECK MIDDLEWARE
// ========================================

export function requirePermission(permission: string): RequestHandler {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const actor = req.actor || req.user;
    if (!actor) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // System admins bypass permission checks
    if (
      actor.role === 'MasterAdmin' ||
      actor.role === 'Admin' ||
      actor.role === 'ADMIN'
    ) {
      return next();
    }

    // Check if user has the required permission
    const permissions = req.permissions;
    if (permissions?.includes(permission)) {
      return next();
    }

    res.status(403).json({ error: `Permission denied: ${permission}` });
  };
}
