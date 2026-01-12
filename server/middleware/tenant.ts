import type { NextFunction, RequestHandler, Response } from 'express';
import type { AuthRequest } from './auth';

// ========================================
// TENANT ISOLATION MIDDLEWARE
// ========================================

export function tenantIsolation(): RequestHandler {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res
          .status(401)
          .json({ error: 'Authentication required for tenant isolation' });
      }

      const organization = req.organization;
      if (!organization) {
        // User doesn't belong to an organization yet
        // This is okay for initial setup
        return next();
      }

      // Add organization context to all queries
      // This will be used by service layer to filter data
      req.query.organizationId = organization.id;

      next();
    } catch (error) {
      console.error('Tenant isolation error:', error);
      res.status(500).json({ error: 'Tenant isolation failed' });
    }
  };
}

// ========================================
// VERIFY RESOURCE OWNERSHIP
// ========================================

export function verifyResourceOwnership(resourceType: string): RequestHandler {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // System admins can access all resources
      if (
        user.role === 'MasterAdmin' ||
        user.role === 'Admin' ||
        user.role === 'ADMIN'
      ) {
        return next();
      }

      // Check if resource belongs to user's organization
      const resourceId = req.params.id || req.params.botId || req.params.leadId;

      if (!resourceId) {
        return next();
      }

      // This check will be implemented in service layer
      // For now, just pass through
      next();
    } catch (error) {
      console.error('Resource ownership verification error:', error);
      res.status(500).json({ error: 'Resource ownership verification failed' });
    }
  };
}
