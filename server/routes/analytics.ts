import { type Request, type Response, Router } from 'express';
import { authenticate, loadOrganizationContext } from '../middleware';
import { AnalyticsService } from '../services';

const router = Router();
const analyticsService = new AnalyticsService();

// Apply authentication to all analytics routes
router.use(authenticate);
router.use(loadOrganizationContext);

// ========================================
// GET /api/analytics/metrics/:orgId
// Get conversion metrics for an organization
// ========================================
router.get('/metrics/:orgId', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { startDate, endDate } = req.query;
    const user = (req as any).user;
    const organization = (req as any).organization;

    // Check access
    if (
      user.role !== 'MasterAdmin' &&
      user.role !== 'Admin' &&
      user.role !== 'ADMIN'
    ) {
      if (organization?.id !== orgId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const metrics = await analyticsService.getConversionMetrics(
      orgId,
      start,
      end,
    );
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// ========================================
// GET /api/analytics/performance/:orgId
// Get bot performance metrics for an organization
// ========================================
router.get('/performance/:orgId', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { startDate, endDate } = req.query;
    const user = (req as any).user;
    const organization = (req as any).organization;

    // Check access
    if (
      user.role !== 'MasterAdmin' &&
      user.role !== 'Admin' &&
      user.role !== 'ADMIN'
    ) {
      if (organization?.id !== orgId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const performance = await analyticsService.getBotPerformance(
      orgId,
      start,
      end,
    );
    res.json(performance);
  } catch (error) {
    console.error('Error fetching performance:', error);
    res.status(500).json({ error: 'Failed to fetch performance data' });
  }
});

// ========================================
// GET /api/analytics/timeseries/:orgId
// Get time series data for an organization
// ========================================
router.get('/timeseries/:orgId', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const days = Number.parseInt(req.query.days as string) || 30;
    const user = (req as any).user;
    const organization = (req as any).organization;

    // Check access
    if (
      user.role !== 'MasterAdmin' &&
      user.role !== 'Admin' &&
      user.role !== 'ADMIN'
    ) {
      if (organization?.id !== orgId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const data = await analyticsService.getTimeSeriesData(orgId, days);
    res.json(data);
  } catch (error) {
    console.error('Error fetching time series data:', error);
    res.status(500).json({ error: 'Failed to fetch time series data' });
  }
});

// ========================================
// GET /api/analytics/events/:orgId
// Get analytics events for an organization
// ========================================
router.get('/events/:orgId', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { eventType, startDate, endDate, limit } = req.query;
    const user = (req as any).user;
    const organization = (req as any).organization;

    // Check access
    if (
      user.role !== 'MasterAdmin' &&
      user.role !== 'Admin' &&
      user.role !== 'ADMIN'
    ) {
      if (organization?.id !== orgId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const limitNum = limit ? Number.parseInt(limit as string) : 100;

    let events;
    if (eventType) {
      events = await analyticsService.getEventsByType(
        orgId,
        eventType as string,
        limitNum,
      );
    } else {
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      events = await analyticsService.getEventsByOrganization(
        orgId,
        start,
        end,
        limitNum,
      );
    }

    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// ========================================
// GET /api/analytics/bot/:botId
// Get analytics events for a specific bot
// ========================================
router.get('/bot/:botId', async (req: Request, res: Response) => {
  try {
    const { botId } = req.params;
    const limit = Number.parseInt(req.query.limit as string) || 100;

    const events = await analyticsService.getEventsByBot(botId, limit);
    res.json(events);
  } catch (error) {
    console.error('Error fetching bot events:', error);
    res.status(500).json({ error: 'Failed to fetch bot events' });
  }
});

// ========================================
// POST /api/analytics/track
// Track a custom analytics event
// ========================================
router.post('/track', async (req: Request, res: Response) => {
  try {
    const eventData = req.body;
    const user = (req as any).user;
    const organization = (req as any).organization;

    const event = await analyticsService.trackEvent({
      organizationId: organization?.id,
      userId: user.id,
      ...eventData,
    });

    res.status(201).json(event);
  } catch (error) {
    console.error('Error tracking event:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

// ========================================
// GET /api/analytics/insights/:orgId
// Get AI-powered insights for an organization
// ========================================
router.get('/insights/:orgId', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const user = (req as any).user;
    const organization = (req as any).organization;

    if (
      user.role !== 'MasterAdmin' &&
      user.role !== 'Admin' &&
      user.role !== 'ADMIN'
    ) {
      if (organization?.id !== orgId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const insights = await analyticsService.generateInsights(orgId);
    res.json(insights);
  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

// ========================================
// GET /api/analytics/sentiment/:orgId
// Get sentiment breakdown for an organization
// ========================================
router.get('/sentiment/:orgId', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { startDate, endDate } = req.query;
    const user = (req as any).user;
    const organization = (req as any).organization;

    if (
      user.role !== 'MasterAdmin' &&
      user.role !== 'Admin' &&
      user.role !== 'ADMIN'
    ) {
      if (organization?.id !== orgId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const sentiment = await analyticsService.getSentimentBreakdown(
      orgId,
      start,
      end,
    );
    res.json(sentiment);
  } catch (error) {
    console.error('Error fetching sentiment:', error);
    res.status(500).json({ error: 'Failed to fetch sentiment data' });
  }
});

// ========================================
// GET /api/analytics/peak-hours/:orgId
// Get peak activity hours for an organization
// ========================================
router.get('/peak-hours/:orgId', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const user = (req as any).user;
    const organization = (req as any).organization;

    if (
      user.role !== 'MasterAdmin' &&
      user.role !== 'Admin' &&
      user.role !== 'ADMIN'
    ) {
      if (organization?.id !== orgId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const peakHours = await analyticsService.analyzePeakHours(orgId);
    res.json(peakHours);
  } catch (error) {
    console.error('Error analyzing peak hours:', error);
    res.status(500).json({ error: 'Failed to analyze peak hours' });
  }
});

// ========================================
// GET /api/analytics/lead-quality/:orgId
// Get lead quality distribution for an organization
// ========================================
router.get('/lead-quality/:orgId', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const user = (req as any).user;
    const organization = (req as any).organization;

    if (
      user.role !== 'MasterAdmin' &&
      user.role !== 'Admin' &&
      user.role !== 'ADMIN'
    ) {
      if (organization?.id !== orgId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const distribution =
      await analyticsService.getLeadQualityDistribution(orgId);
    res.json(distribution);
  } catch (error) {
    console.error('Error fetching lead quality:', error);
    res.status(500).json({ error: 'Failed to fetch lead quality data' });
  }
});

// ========================================
// GET /api/analytics/growth/:orgId
// Get week-over-week growth metrics for an organization
// ========================================
router.get('/growth/:orgId', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const user = (req as any).user;
    const organization = (req as any).organization;

    if (
      user.role !== 'MasterAdmin' &&
      user.role !== 'Admin' &&
      user.role !== 'ADMIN'
    ) {
      if (organization?.id !== orgId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const growth = await analyticsService.getWeekOverWeekGrowth(orgId);
    res.json(growth);
  } catch (error) {
    console.error('Error fetching growth metrics:', error);
    res.status(500).json({ error: 'Failed to fetch growth metrics' });
  }
});

export default router;
