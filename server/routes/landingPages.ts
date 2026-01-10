import { type SQL, and, desc, eq } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { landingPages } from '../../shared/schema';
import { db } from '../db';
import {
  applyImpersonation,
  authenticate,
  loadOrganizationContext,
  tenantIsolation,
} from '../middleware';

const router = Router();

const apiAuthStack = [
  authenticate,
  applyImpersonation,
  loadOrganizationContext,
  tenantIsolation(),
];

router.get('/', ...apiAuthStack, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const conditions: SQL[] = [];

    if (user.organizationId) {
      conditions.push(eq(landingPages.organizationId, user.organizationId));
    } else {
      conditions.push(eq(landingPages.userId, user.id));
    }

    let query = db.select().from(landingPages);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const result = await query.orderBy(desc(landingPages.createdAt));
    res.json(result);
  } catch (error) {
    console.error('Error fetching landing pages:', error);
    res.status(500).json({ error: 'Failed to fetch landing pages' });
  }
});

router.get('/:id', ...apiAuthStack, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [page] = await db
      .select()
      .from(landingPages)
      .where(eq(landingPages.id, req.params.id));

    if (!page) {
      return res.status(404).json({ error: 'Landing page not found' });
    }

    if (user.organizationId && page.organizationId !== user.organizationId) {
      return res
        .status(403)
        .json({ error: 'Not authorized to view this landing page' });
    }

    if (!user.organizationId && page.userId !== user.id) {
      return res
        .status(403)
        .json({ error: 'Not authorized to view this landing page' });
    }

    res.json(page);
  } catch (error) {
    console.error('Error fetching landing page:', error);
    res.status(500).json({ error: 'Failed to fetch landing page' });
  }
});

router.post('/', ...apiAuthStack, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      name,
      slug,
      headline,
      subheadline,
      heroImageUrl,
      ctaText,
      ctaColor,
      formFields,
      thankYouMessage,
      seoTitle,
      seoDescription,
      botId,
      isPublished,
    } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' });
    }

    const pageId = uuidv4();
    const now = new Date();

    const [newPage] = await db
      .insert(landingPages)
      .values({
        id: pageId,
        name,
        slug,
        headline: headline || null,
        subheadline: subheadline || null,
        heroImageUrl: heroImageUrl || null,
        ctaText: ctaText || 'Get Started',
        ctaColor: ctaColor || '#F97316',
        formFields: formFields || [],
        thankYouMessage: thankYouMessage || null,
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        botId: botId || null,
        isPublished: isPublished || false,
        viewCount: 0,
        conversionCount: 0,
        userId: user.id,
        organizationId: user.organizationId || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.status(201).json(newPage);
  } catch (error) {
    console.error('Error creating landing page:', error);
    res.status(500).json({ error: 'Failed to create landing page' });
  }
});

router.put('/:id', ...apiAuthStack, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [existingPage] = await db
      .select()
      .from(landingPages)
      .where(eq(landingPages.id, req.params.id));

    if (!existingPage) {
      return res.status(404).json({ error: 'Landing page not found' });
    }

    if (
      user.organizationId &&
      existingPage.organizationId !== user.organizationId
    ) {
      return res
        .status(403)
        .json({ error: 'Not authorized to update this landing page' });
    }

    if (!user.organizationId && existingPage.userId !== user.id) {
      return res
        .status(403)
        .json({ error: 'Not authorized to update this landing page' });
    }

    const {
      name,
      slug,
      headline,
      subheadline,
      heroImageUrl,
      ctaText,
      ctaColor,
      formFields,
      thankYouMessage,
      seoTitle,
      seoDescription,
      botId,
      isPublished,
      viewCount,
      conversionCount,
    } = req.body;

    const updateData: any = { updatedAt: new Date() };

    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (headline !== undefined) updateData.headline = headline;
    if (subheadline !== undefined) updateData.subheadline = subheadline;
    if (heroImageUrl !== undefined) updateData.heroImageUrl = heroImageUrl;
    if (ctaText !== undefined) updateData.ctaText = ctaText;
    if (ctaColor !== undefined) updateData.ctaColor = ctaColor;
    if (formFields !== undefined) updateData.formFields = formFields;
    if (thankYouMessage !== undefined)
      updateData.thankYouMessage = thankYouMessage;
    if (seoTitle !== undefined) updateData.seoTitle = seoTitle;
    if (seoDescription !== undefined)
      updateData.seoDescription = seoDescription;
    if (botId !== undefined) updateData.botId = botId || null;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    if (viewCount !== undefined) updateData.viewCount = viewCount;
    if (conversionCount !== undefined)
      updateData.conversionCount = conversionCount;

    const [updatedPage] = await db
      .update(landingPages)
      .set(updateData)
      .where(eq(landingPages.id, req.params.id))
      .returning();

    res.json(updatedPage);
  } catch (error) {
    console.error('Error updating landing page:', error);
    res.status(500).json({ error: 'Failed to update landing page' });
  }
});

router.patch(
  '/:id/publish',
  ...apiAuthStack,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const [existingPage] = await db
        .select()
        .from(landingPages)
        .where(eq(landingPages.id, req.params.id));

      if (!existingPage) {
        return res.status(404).json({ error: 'Landing page not found' });
      }

      if (
        user.organizationId &&
        existingPage.organizationId !== user.organizationId
      ) {
        return res
          .status(403)
          .json({ error: 'Not authorized to update this landing page' });
      }

      if (!user.organizationId && existingPage.userId !== user.id) {
        return res
          .status(403)
          .json({ error: 'Not authorized to update this landing page' });
      }

      const [updatedPage] = await db
        .update(landingPages)
        .set({
          isPublished: !existingPage.isPublished,
          updatedAt: new Date(),
        })
        .where(eq(landingPages.id, req.params.id))
        .returning();

      res.json(updatedPage);
    } catch (error) {
      console.error('Error toggling landing page publish status:', error);
      res.status(500).json({ error: 'Failed to toggle publish status' });
    }
  },
);

router.delete('/:id', ...apiAuthStack, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [existingPage] = await db
      .select()
      .from(landingPages)
      .where(eq(landingPages.id, req.params.id));

    if (!existingPage) {
      return res.status(404).json({ error: 'Landing page not found' });
    }

    if (
      user.organizationId &&
      existingPage.organizationId !== user.organizationId
    ) {
      return res
        .status(403)
        .json({ error: 'Not authorized to delete this landing page' });
    }

    if (!user.organizationId && existingPage.userId !== user.id) {
      return res
        .status(403)
        .json({ error: 'Not authorized to delete this landing page' });
    }

    await db.delete(landingPages).where(eq(landingPages.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting landing page:', error);
    res.status(500).json({ error: 'Failed to delete landing page' });
  }
});

export default router;
