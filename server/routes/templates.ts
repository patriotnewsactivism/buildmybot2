import { type SQL, and, desc, eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { botTemplates, bots } from '../../shared/schema';
import { db } from '../db';
import { env } from '../env';

const router = Router();

// Cache templates for 2 minutes - public data that rarely changes
router.get(
  '/',
  (req, res, next) => {
    res.set('Cache-Control', 'public, max-age=120');
    next();
  },
  async (req, res) => {
    try {
      const { category, industry, search, featured } = req.query;
      const conditions: SQL[] = [];

      if (category) {
        conditions.push(eq(botTemplates.category, category as string));
      }

      if (industry) {
        conditions.push(eq(botTemplates.industry, industry as string));
      }

      if (search) {
        const term = `%${search}%`;
        conditions.push(
          sql`${botTemplates.name} ILIKE ${term} OR ${botTemplates.description} ILIKE ${term}`,
        );
      }

      if (featured) {
        conditions.push(eq(botTemplates.isPublic, true));
      }

      let baseQuery = db.select().from(botTemplates);

      if (conditions.length) {
        baseQuery = baseQuery.where(and(...conditions)) as typeof baseQuery;
      }

      const templates = featured
        ? await baseQuery.orderBy(desc(botTemplates.rating))
        : await baseQuery;
      res.json(templates);
    } catch (error) {
      console.error('Template list error:', error);
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  },
);

router.post('/:id/install', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const [template] = await db
      .select()
      .from(botTemplates)
      .where(eq(botTemplates.id, id));

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const [newBot] = await db
      .insert(bots)
      .values({
        id: uuidv4(),
        name: `${template.name} (Copy)`,
        type: template.category || 'custom',
        systemPrompt: template.systemPrompt || '',
        model: env.DEFAULT_AI_MODEL || 'gpt-4o-mini',
        temperature: 0.7,
        knowledgeBase: [],
        active: true,
        themeColor: '#1e3a8a',
        maxMessages: 200,
        randomizeIdentity: false,
        embedType: 'hover',
        userId: user.id,
        organizationId: user.organizationId,
        createdAt: new Date(),
      })
      .returning();

    await db
      .update(botTemplates)
      .set({ installCount: (template.installCount || 0) + 1 })
      .where(eq(botTemplates.id, template.id));

    res.json(newBot);
  } catch (error: any) {
    console.error('Template install error:', error);
    res
      .status(500)
      .json({ error: `Failed to install template: ${error.message}` });
  }
});

export default router;
