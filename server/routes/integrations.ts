import { and, eq } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import { integrations } from '../../shared/schema';
import { db } from '../db';
import {
  applyImpersonation,
  authenticate,
  loadOrganizationContext,
  tenantIsolation,
} from '../middleware';
import { integrationService } from '../services/IntegrationService';

const router = Router();

const apiAuthStack = [
  authenticate,
  applyImpersonation,
  loadOrganizationContext,
  tenantIsolation(),
];

router.get(
  '/providers',
  ...apiAuthStack,
  async (req: Request, res: Response) => {
    try {
      const providers = integrationService.getProviders();
      res.json(providers);
    } catch (error) {
      console.error('Error fetching providers:', error);
      res.status(500).json({ error: 'Failed to fetch providers' });
    }
  },
);

router.get('/', ...apiAuthStack, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user.organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const activeIntegrations = await db
      .select({
        id: integrations.id,
        provider: integrations.provider,
        isActive: integrations.isActive,
        createdAt: integrations.createdAt,
        updatedAt: integrations.updatedAt,
      })
      .from(integrations)
      .where(
        and(
          eq(integrations.organizationId, user.organizationId),
          eq(integrations.isActive, true),
        ),
      );

    res.json(activeIntegrations);
  } catch (error) {
    console.error('Error fetching integrations:', error);
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

router.post(
  '/connect',
  ...apiAuthStack,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { providerId, config } = req.body;

      if (!user.organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      if (!providerId || !config) {
        return res
          .status(400)
          .json({ error: 'Provider ID and config are required' });
      }

      const result = await integrationService.connect(
        user.organizationId,
        providerId,
        config,
      );

      res.json(result[0]);
    } catch (error: any) {
      console.error('Error connecting integration:', error);
      res
        .status(400)
        .json({ error: error.message || 'Failed to connect integration' });
    }
  },
);

router.post(
  '/disconnect',
  ...apiAuthStack,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { providerId } = req.body;

      if (!user.organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      if (!providerId) {
        return res.status(400).json({ error: 'Provider ID is required' });
      }

      await integrationService.disconnect(user.organizationId, providerId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error disconnecting integration:', error);
      res.status(500).json({ error: 'Failed to disconnect integration' });
    }
  },
);

export default router;
