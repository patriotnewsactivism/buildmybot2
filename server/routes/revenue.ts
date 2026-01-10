import { eq } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import { partnerClients } from '../../shared/schema';
import { db } from '../db';
import { apiKeyService } from '../services/ApiKeyService';
import { billingService } from '../services/BillingService';
import { whitelabelService } from '../services/WhitelabelService';

const router = Router();

router.get('/plans', async (req: Request, res: Response) => {
  try {
    const plans = await billingService.getPlans();
    res.json(plans);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/plans/:planId', async (req: Request, res: Response) => {
  try {
    const plan = await billingService.getPlanById(req.params.planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(plan);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/plans', async (req: Request, res: Response) => {
  try {
    const plan = await billingService.createPlan(req.body);
    res.json(plan);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/plans/:planId', async (req: Request, res: Response) => {
  try {
    const plan = await billingService.updatePlan(req.params.planId, req.body);
    res.json(plan);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get(
  '/subscription/:organizationId',
  async (req: Request, res: Response) => {
    try {
      const subscription = await billingService.getOrganizationSubscription(
        req.params.organizationId,
      );
      res.json(subscription || null);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.post('/subscription', async (req: Request, res: Response) => {
  try {
    const subscription = await billingService.createSubscription(req.body);
    res.json(subscription);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put(
  '/subscription/:subscriptionId',
  async (req: Request, res: Response) => {
    try {
      const subscription = await billingService.updateSubscription(
        req.params.subscriptionId,
        req.body,
      );
      res.json(subscription);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  '/subscription/:subscriptionId/cancel',
  async (req: Request, res: Response) => {
    try {
      const subscription = await billingService.cancelSubscription(
        req.params.subscriptionId,
      );
      res.json(subscription);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  '/entitlements/:organizationId',
  async (req: Request, res: Response) => {
    try {
      const entitlements = await billingService.getEntitlements(
        req.params.organizationId,
      );
      res.json(entitlements);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  '/entitlements/:organizationId/check/:featureCode',
  async (req: Request, res: Response) => {
    try {
      const result = await billingService.checkEntitlement(
        req.params.organizationId,
        req.params.featureCode,
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get('/usage/:organizationId', async (req: Request, res: Response) => {
  try {
    const usage = await billingService.getUsageSummary(
      req.params.organizationId,
    );
    res.json(usage);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/commissions/:userId', async (req: Request, res: Response) => {
  try {
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
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/usage/:organizationId/add',
  async (req: Request, res: Response) => {
    try {
      const { resourceType, credits } = req.body;
      const pool = await billingService.createOrUpdateUsagePool(
        req.params.organizationId,
        resourceType,
        credits,
      );
      res.json(pool);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  '/usage/:organizationId/consume',
  async (req: Request, res: Response) => {
    try {
      const { resourceType, amount, description } = req.body;
      const result = await billingService.consumeCredits(
        req.params.organizationId,
        resourceType,
        amount,
        description,
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get('/voice-packages', async (req: Request, res: Response) => {
  try {
    const packages = await billingService.getVoiceMinutesPackages();
    res.json(packages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/credit-packages', async (req: Request, res: Response) => {
  try {
    const resourceType = req.query.resourceType as string | undefined;
    const packages = await billingService.getCreditPackages(resourceType);
    res.json(packages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/services', async (req: Request, res: Response) => {
  try {
    const serviceType = req.query.type as string | undefined;
    const services = await billingService.getServiceOfferings(serviceType);
    res.json(services);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get(
  '/services/orders/:organizationId',
  async (req: Request, res: Response) => {
    try {
      const orders = await billingService.getServiceOrders(
        req.params.organizationId,
      );
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.post('/services/order', async (req: Request, res: Response) => {
  try {
    const { organizationId, userId, serviceId, notes } = req.body;
    const order = await billingService.createServiceOrder(
      organizationId,
      userId,
      serviceId,
      notes,
    );
    res.json(order);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

router.get('/branding/:organizationId', async (req: Request, res: Response) => {
  try {
    const branding = await whitelabelService.getBranding(
      req.params.organizationId,
    );
    res.json(branding || null);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/branding/:organizationId', async (req: Request, res: Response) => {
  try {
    const branding = await whitelabelService.createOrUpdateBranding(
      req.params.organizationId,
      req.body,
    );
    res.json(branding);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/branding/:organizationId/domain',
  async (req: Request, res: Response) => {
    try {
      const { customDomain } = req.body;
      const branding = await whitelabelService.updateCustomDomain(
        req.params.organizationId,
        customDomain,
      );
      res.json(branding);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  '/branding/:organizationId/verify-domain',
  async (req: Request, res: Response) => {
    try {
      const branding = await whitelabelService.verifyDomain(
        req.params.organizationId,
      );
      res.json(branding);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get('/api-keys/:organizationId', async (req: Request, res: Response) => {
  try {
    const keys = await apiKeyService.getApiKeys(req.params.organizationId);
    res.json(keys);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/api-keys/:organizationId',
  async (req: Request, res: Response) => {
    try {
      const { name, scopes, createdBy, expiresInDays } = req.body;
      const key = await apiKeyService.createApiKey(
        req.params.organizationId,
        name,
        scopes || ['*'],
        createdBy,
        expiresInDays,
      );
      res.json(key);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.delete('/api-keys/:apiKeyId', async (req: Request, res: Response) => {
  try {
    await apiKeyService.deleteApiKey(req.params.apiKeyId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/api-keys/:apiKeyId/revoke',
  async (req: Request, res: Response) => {
    try {
      const key = await apiKeyService.revokeApiKey(req.params.apiKeyId);
      res.json(key);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  '/api-keys/:organizationId/logs',
  async (req: Request, res: Response) => {
    try {
      const logs = await apiKeyService.getRequestLogs(
        req.params.organizationId,
      );
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  '/api-keys/:organizationId/stats',
  async (req: Request, res: Response) => {
    try {
      const stats = await apiKeyService.getApiUsageStats(
        req.params.organizationId,
      );
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

export default router;
