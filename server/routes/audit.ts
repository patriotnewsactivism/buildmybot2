import { type Response, Router } from 'express';
import {
  authenticate,
  authorize,
  loadOrganizationContext,
  type AuthRequest,
} from '../middleware';
import { AuditService } from '../services';

const router = Router();
const auditService = new AuditService();

// Apply authentication to all audit routes
router.use(authenticate);
router.use(loadOrganizationContext);

// ========================================
// GET /api/audit/organization/:orgId
// Get audit logs for an organization
// ========================================
router.get(
  '/organization/:orgId',
  authorize(['MasterAdmin', 'Admin', 'ADMIN', 'Partner']),
  async (req: AuthRequest, res: Response) => {
    try {
      const { orgId } = req.params;
      const limit = Number.parseInt(req.query.limit as string) || 100;
      const user = req.user;
      const organization = req.organization;

      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Check if user has access to this organization
      if (
        user.role !== 'MasterAdmin' &&
        user.role !== 'Admin' &&
        user.role !== 'ADMIN'
      ) {
        if (organization?.id !== orgId) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const logs = await auditService.getLogsByOrganization(orgId, limit);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  },
);

// ========================================
// GET /api/audit/user/:userId
// Get audit logs for a specific user
// ========================================
router.get(
  '/user/:userId',
  authorize(['MasterAdmin', 'Admin', 'ADMIN']),
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const limit = Number.parseInt(req.query.limit as string) || 100;

      const logs = await auditService.getLogsByUser(userId, limit);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching user audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  },
);

// ========================================
// GET /api/audit/resource/:resourceType/:resourceId
// Get audit logs for a specific resource
// ========================================
router.get(
  '/resource/:resourceType/:resourceId',
  async (req: AuthRequest, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;
      const limit = Number.parseInt(req.query.limit as string) || 50;

      const logs = await auditService.getLogsByResource(
        resourceType,
        resourceId,
        limit,
      );
      res.json(logs);
    } catch (error) {
      console.error('Error fetching resource audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  },
);

export default router;
