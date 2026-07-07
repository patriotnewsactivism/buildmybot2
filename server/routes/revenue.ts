import { eq } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import { partnerClients } from '../../shared/schema';
import { db } from '../db';
import { authorize } from '../middleware';
import { apiKeyService } from '../services/ApiKeyService';
import { billingService } from '../services/BillingService';
import { whitelabelService } from '../services/WhitelabelService';

const router = Router();

// Platform-level plan definitions may only be changed by admins.
const ADMIN_ROLES = ['ADMIN', 'Admin', 'MasterAdmin'];
const adminOnly = authorize(ADMIN_ROLES);

// Routes below take :organizationId straight from the URL. Without this
// check any authenticated user could read/mutate another org's billing,
// branding, and API keys just by changing the id.
const requireOrgAccess = (
  req: Request & { user?: { role?: string | null; organizationId?: string | null; id?: string } },
  res: Response,
  next: () => void,
) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  if (ADMIN_ROLES.includes(user.role ?? '')) return next();
  if (user.organizationId && user.organizationId === req.params.organizationId) {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden' });
};

router.get('/plans', async (req: Request, res: Response) => {
  try {
    const plans = await billingService.getPlans();
    res.json(plans);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/plans/:planId', async (req: Request, res: Response) => {
  try {
    const plan = await billingService.getPlanById(req.params.planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(plan);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/plans', adminOnly, async (req: Request, res: Response) => {
  try {
    const plan = await billingService.createPlan(req.body);
    res.json(plan);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/plans/:planId', adminOnly, async (req: Request, res: Response) => {
  try {
    const plan = await billingService.updatePlan(req.params.planId, req.body);
    res.json(plan);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get(
  '/subscription/:organizationId',
  requireOrgAccess,
  async (req: Request, res: Response) => {
    try {
      const subscription = await billingService.getOrganizationSubscription(
        req.params.organizationId,
      );
      res.json(subscription || null);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post('/subscription', adminOnly, async (req: Request, res: Response) => {
  try {
    if (!req.body?.organizationId || !req.body?.planId) {
      return res
        .status(400)
        .json({ error: 'organizationId and planId are required' });
    }
    const subscription = await billingService.createSubscription(req.body);
    res.json(subscription);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put(
  '/subscription/:subscriptionId',
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const subscription = await billingService.updateSubscription(
        req.params.subscriptionId,
        req.body,
      );
      res.json(subscription);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post(
  '/subscription/:subscriptionId/cancel',
  adminOnly,
  async (req: Request, res: Response) => {
    try {
      const subscription = await billingService.cancelSubscription(
        req.params.subscriptionId,
      );
      res.json(subscription);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get(
  '/entitlements/:organizationId',
  requireOrgAccess,
  async (req: Request, res: Response) => {
    try {
      const entitlements = await billingService.getEntitlements(
        req.params.organizationId,
      );
      res.json(entitlements);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get(
  '/entitlements/:organizationId/check/:featureCode',
  requireOrgAccess,
  async (req: Request, res: Response) => {
    try {
      const result = await billingService.checkEntitlement(
        req.params.organizationId,
        req.params.featureCode,
      );
      res.json(result);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get('/usage/:organizationId', requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const usage = await billingService.getUsageSummary(
      req.params.organizationId,
    );
    res.json(usage);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/commissions/:userId', async (req: Request, res: Response) => {
  try {
    const requester = (
      req as Request & { user?: { id?: string; role?: string | null } }
    ).user;
    if (
      !requester ||
      (requester.id !== req.params.userId &&
        !ADMIN_ROLES.includes(requester.role ?? ''))
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const commissions = await db
      .select()
      .from(partnerClients)
      .where(eq(partnerClients.partnerId, req.params.userId));
    const processedCommissions = commissions.map((c) => ({
      ...c,
      calculatedRate:
        c.commissionType === 'partner' ? 0.5 : c.commissionRate || 0.2,
    }));
    res.json(processedCommissions);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/usage/:organizationId/add',
  requireOrgAccess,
  async (req: Request, res: Response) => {
    try {
      const { resourceType, credits } = req.body;
      if (!resourceType || typeof credits !== 'number') {
        return res
          .status(400)
          .json({ error: 'resourceType and numeric credits are required' });
      }
      const pool = await billingService.createOrUpdateUsagePool(
        req.params.organizationId,
        resourceType,
        credits,
      );
      res.json(pool);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post(
  '/usage/:organizationId/consume',
  requireOrgAccess,
  async (req: Request, res: Response) => {
    try {
      const { resourceType, amount, description } = req.body;
      if (!resourceType || typeof amount !== 'number' || amount <= 0) {
        return res
          .status(400)
          .json({ error: 'resourceType and a positive numeric amount are required' });
      }
      const result = await billingService.consumeCredits(
        req.params.organizationId,
        resourceType,
        amount,
        description,
      );
      res.json(result);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get('/voice-packages', async (req: Request, res: Response) => {
  try {
    const packages = await billingService.getVoiceMinutesPackages();
    res.json(packages);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/credit-packages', async (req: Request, res: Response) => {
  try {
    const resourceType = req.query.resourceType as string | undefined;
    const packages = await billingService.getCreditPackages(resourceType);
    res.json(packages);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/services', async (req: Request, res: Response) => {
  try {
    const serviceType = req.query.type as string | undefined;
    const services = await billingService.getServiceOfferings(serviceType);
    res.json(services);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get(
  '/services/orders/:organizationId',
  requireOrgAccess,
  async (req: Request, res: Response) => {
    try {
      const orders = await billingService.getServiceOrders(
        req.params.organizationId,
      );
      res.json(orders);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post('/services/order', async (req: Request, res: Response) => {
  try {
    const { organizationId, userId, serviceId, notes } = req.body;
    if (!organizationId || !serviceId) {
      return res
        .status(400)
        .json({ error: 'organizationId and serviceId are required' });
    }
    const requester = (
      req as Request & { user?: { organizationId?: string | null; role?: string | null } }
    ).user;
    if (
      !requester ||
      (requester.organizationId !== organizationId &&
        !ADMIN_ROLES.includes(requester.role ?? ''))
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const order = await billingService.createServiceOrder(
      organizationId,
      userId,
      serviceId,
      notes,
    );
    res.json(order);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/services/order/:orderId', async (req: Request, res: Response) => {
  try {
    const { status, deliveryNotes } = req.body;
    const order = await billingService.updateServiceOrder(
      req.params.orderId,
      status,
      deliveryNotes,
    );
    res.json(order);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/branding/:organizationId', requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const branding = await whitelabelService.getBranding(
      req.params.organizationId,
    );
    res.json(branding || null);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/branding/:organizationId', requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const branding = await whitelabelService.createOrUpdateBranding(
      req.params.organizationId,
      req.body,
    );
    res.json(branding);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/branding/:organizationId/domain',
  requireOrgAccess,
  async (req: Request, res: Response) => {
    try {
      const { customDomain } = req.body;
      const branding = await whitelabelService.updateCustomDomain(
        req.params.organizationId,
        customDomain,
      );
      res.json(branding);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post(
  '/branding/:organizationId/verify-domain',
  requireOrgAccess,
  async (req: Request, res: Response) => {
    try {
      const branding = await whitelabelService.verifyDomain(
        req.params.organizationId,
      );
      res.json(branding);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get('/api-keys/:organizationId', requireOrgAccess, async (req: Request, res: Response) => {
  try {
    const keys = await apiKeyService.getApiKeys(req.params.organizationId);
    res.json(keys);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/api-keys/:organizationId',
  requireOrgAccess,
  async (req: Request, res: Response) => {
    try {
      const { name, scopes, createdBy, expiresInDays } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }
      const key = await apiKeyService.createApiKey(
        req.params.organizationId,
        name,
        scopes || ['*'],
        createdBy,
        expiresInDays,
      );
      res.json(key);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.delete('/api-keys/:apiKeyId', async (req: Request, res: Response) => {
  try {
    await apiKeyService.deleteApiKey(req.params.apiKeyId);
    res.json({ success: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/api-keys/:apiKeyId/revoke',
  async (req: Request, res: Response) => {
    try {
      const key = await apiKeyService.revokeApiKey(req.params.apiKeyId);
      res.json(key);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get(
  '/api-keys/:organizationId/logs',
  requireOrgAccess,
  async (req: Request, res: Response) => {
    try {
      const logs = await apiKeyService.getRequestLogs(
        req.params.organizationId,
      );
      res.json(logs);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get(
  '/api-keys/:organizationId/stats',
  requireOrgAccess,
  async (req: Request, res: Response) => {
    try {
      const stats = await apiKeyService.getApiUsageStats(
        req.params.organizationId,
      );
      res.json(stats);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
