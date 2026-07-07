import { Router } from 'express';
import {
  authenticate,
  loadOrganizationContext,
  tenantIsolation,
} from '../middleware';
import { searchService } from '../services/SearchService';

const router = Router();

// All routes require authentication and organization context
router.use(authenticate, loadOrganizationContext, tenantIsolation());

router.get('/', async (req: any, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query "q" is required' });
    }

    const orgId = req.organization.id;
    const results = await searchService.unifiedSearch(orgId, q);

    res.json(results);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
