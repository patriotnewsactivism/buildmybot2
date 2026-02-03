import { and, eq } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { bots, knowledgeChunks, knowledgeSources } from '../../shared/schema';
import { db } from '../db';
import { authenticate, loadOrganizationContext } from '../middleware';
import {
  INDUSTRY_KNOWLEDGE_BASES,
  formatKnowledgeBaseAsText,
} from '../seeds/industryKnowledgeBases';
import { DocumentProcessorService } from '../services/DocumentProcessorService';
import { KnowledgeService } from '../services/KnowledgeService';
import { WebScraperService } from '../services/WebScraperService';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

async function canAccessBot(botId: string, req: Request): Promise<boolean> {
  const user = (req as any).user;
  const userId = user?.id;
  const organizationId = user?.organizationId || (req as any).organization?.id;

  if (!userId) return false;

  const bot = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (bot.length === 0) return false;

  return (
    bot[0].userId === userId ||
    (organizationId && bot[0].organizationId === organizationId)
  );
}

router.post(
  '/scrape/:botId',
  authenticate,
  loadOrganizationContext,
  async (req: Request, res: Response) => {
    try {
      const { botId } = req.params;
      const { url, crawlDepth = 20 } = req.body;
      const user = (req as any).user;
      const organizationId =
        user?.organizationId || (req as any).organization?.id;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL is required' });
      }

      if (!(await canAccessBot(botId, req))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      try {
        new URL(url);
      } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
      }

      const sourceId = uuidv4();
      const maxPages = Math.min(Math.max(1, Number(crawlDepth) || 20), 50);

      await db.insert(knowledgeSources).values({
        id: sourceId,
        botId,
        organizationId,
        sourceType: 'url',
        sourceName: new URL(url).hostname,
        sourceUrl: url,
        status: 'processing',
        pagesCrawled: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      WebScraperService.crawlWebsite(
        url,
        maxPages,
        sourceId,
        botId,
        organizationId,
      ).catch(async (error) => {
        console.error('Crawl error:', error);
        await db
          .update(knowledgeSources)
          .set({
            status: 'failed',
            errorMessage: error.message,
            updatedAt: new Date(),
          })
          .where(eq(knowledgeSources.id, sourceId));
      });

      res.json({
        sourceId,
        status: 'processing',
        message: `Crawling ${url} (up to ${maxPages} pages)`,
      });
    } catch (error: any) {
      console.error('Scrape error:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  '/upload/:botId',
  authenticate,
  loadOrganizationContext,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const { botId } = req.params;
      const file = req.file;
      const user = (req as any).user;
      const organizationId =
        user?.organizationId || (req as any).organization?.id;

      if (!file) {
        return res.status(400).json({ error: 'File is required' });
      }

      if (!(await canAccessBot(botId, req))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const sourceId = uuidv4();

      await db.insert(knowledgeSources).values({
        id: sourceId,
        botId,
        organizationId,
        sourceType: 'document',
        sourceName: file.originalname,
        status: 'processing',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      DocumentProcessorService.processDocument(
        file.buffer,
        file.originalname,
        file.mimetype,
        sourceId,
        botId,
        { userId: user?.id, organizationId },
      ).catch(async (error) => {
        console.error('Document processing error:', error);
        await db
          .update(knowledgeSources)
          .set({
            status: 'failed',
            errorMessage: error.message,
            updatedAt: new Date(),
          })
          .where(eq(knowledgeSources.id, sourceId));
      });

      res.json({
        sourceId,
        status: 'processing',
        message: `Processing ${file.originalname}`,
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  '/sources/:botId',
  authenticate,
  loadOrganizationContext,
  async (req: Request, res: Response) => {
    try {
      const { botId } = req.params;

      if (!(await canAccessBot(botId, req))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const sources = await KnowledgeService.getKnowledgeSources(botId);
      const stats = await KnowledgeService.getStats(botId);

      res.json({ sources, stats });
    } catch (error: any) {
      console.error('Get sources error:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

router.delete(
  '/sources/:sourceId',
  authenticate,
  loadOrganizationContext,
  async (req: Request, res: Response) => {
    try {
      const { sourceId } = req.params;

      const source = await db
        .select()
        .from(knowledgeSources)
        .where(eq(knowledgeSources.id, sourceId))
        .limit(1);

      if (source.length === 0) {
        return res.status(404).json({ error: 'Source not found' });
      }

      if (!(await canAccessBot(source[0].botId!, req))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await KnowledgeService.deleteSource(sourceId, source[0].botId!);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete source error:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  '/search/:botId',
  authenticate,
  loadOrganizationContext,
  async (req: Request, res: Response) => {
    try {
      const { botId } = req.params;
      const { q } = req.query;

      if (!q || typeof q !== 'string') {
        return res
          .status(400)
          .json({ error: 'Query parameter "q" is required' });
      }

      if (!(await canAccessBot(botId, req))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const results = await KnowledgeService.searchKnowledge(botId, q, 10);

      res.json({ results });
    } catch (error: any) {
      console.error('Search error:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  '/refresh/:sourceId',
  authenticate,
  loadOrganizationContext,
  async (req: Request, res: Response) => {
    try {
      const { sourceId } = req.params;

      const source = await db
        .select()
        .from(knowledgeSources)
        .where(eq(knowledgeSources.id, sourceId))
        .limit(1);

      if (source.length === 0) {
        return res.status(404).json({ error: 'Source not found' });
      }

      if (!(await canAccessBot(source[0].botId!, req))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const s = source[0];

      await db
        .update(knowledgeSources)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(eq(knowledgeSources.id, sourceId));

      if (s.sourceType === 'url' && s.sourceUrl) {
        WebScraperService.crawlWebsite(
          s.sourceUrl,
          s.pagesCrawled || 20,
          sourceId,
          s.botId!,
        ).catch(console.error);
      }

      res.json({
        sourceId,
        status: 'processing',
        message: 'Refresh started',
      });
    } catch (error: any) {
      console.error('Refresh error:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

router.get('/prebuilt', authenticate, async (req: Request, res: Response) => {
  try {
    const knowledgeBases = INDUSTRY_KNOWLEDGE_BASES.map((kb) => ({
      id: kb.id,
      name: kb.name,
      industry: kb.industry,
      description: kb.description,
      faqCount: kb.faqs.length,
    }));
    res.json({ knowledgeBases });
  } catch (error: any) {
    console.error('Error fetching prebuilt knowledge bases:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/prebuilt/:botId/install',
  authenticate,
  loadOrganizationContext,
  async (req: Request, res: Response) => {
    try {
      const { botId } = req.params;
      const { knowledgeBaseId } = req.body;
      const organizationId = (req as any).organizationId;

      if (!(await canAccessBot(botId, req))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const kb = INDUSTRY_KNOWLEDGE_BASES.find((k) => k.id === knowledgeBaseId);
      if (!kb) {
        return res.status(404).json({ error: 'Knowledge base not found' });
      }

      const sourceId = uuidv4();
      const content = formatKnowledgeBaseAsText(kb);

      await db.insert(knowledgeSources).values({
        id: sourceId,
        botId,
        organizationId,
        sourceType: 'prebuilt',
        sourceName: kb.name,
        status: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const chunks = DocumentProcessorService.chunkDocument(content, 500);
      for (let i = 0; i < chunks.length; i++) {
        await db.insert(knowledgeChunks).values({
          id: uuidv4(),
          sourceId,
          botId,
          content: chunks[i],
          chunkIndex: i,
          tokenCount: Math.ceil(chunks[i].length / 4),
          metadata: { title: kb.name, industry: kb.industry },
        });
      }

      res.json({
        success: true,
        sourceId,
        name: kb.name,
        chunksCreated: chunks.length,
      });
    } catch (error: any) {
      console.error('Error installing prebuilt knowledge base:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  '/preview/:sourceId',
  authenticate,
  loadOrganizationContext,
  async (req: Request, res: Response) => {
    try {
      const { sourceId } = req.params;

      const source = await db
        .select()
        .from(knowledgeSources)
        .where(eq(knowledgeSources.id, sourceId))
        .limit(1);

      if (source.length === 0) {
        return res.status(404).json({ error: 'Source not found' });
      }

      if (!(await canAccessBot(source[0].botId!, req))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const chunks = await db
        .select({ content: knowledgeChunks.content })
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.sourceId, sourceId))
        .orderBy(knowledgeChunks.chunkIndex);

      const content = chunks
        .map((c) => c.content)
        .join('\n\n--- Chunk Boundary ---\n\n');

      res.json({ content });
    } catch (error: any) {
      console.error('Preview error:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Get processing status for a knowledge source
router.get(
  '/status/:sourceId',
  authenticate,
  loadOrganizationContext,
  async (req: Request, res: Response) => {
    try {
      const { sourceId } = req.params;

      const [source] = await db
        .select()
        .from(knowledgeSources)
        .where(eq(knowledgeSources.id, sourceId));

      if (!source) {
        return res.status(404).json({ error: 'Source not found' });
      }

      // Check access
      if (!(await canAccessBot(source.botId!, req))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get chunk count
      const [chunkCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.sourceId, sourceId));

      // Get embeddings count
      const [embeddingsCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.sourceId, sourceId),
            sql`embedding IS NOT NULL`,
          ),
        );

      res.json({
        sourceId: source.id,
        status: source.status,
        sourceType: source.sourceType,
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
        processingState: source.processingState || {},
        retryCount: source.retryCount || 0,
        lastError: source.lastError,
        lastProcessedAt: source.lastProcessedAt,
        pagesCrawled: source.pagesCrawled || 0,
        pageCount: source.pageCount,
        chunkCount: Number(chunkCount?.count || 0),
        embeddingsCount: Number(embeddingsCount?.count || 0),
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
      });
    } catch (error: any) {
      console.error('Status check error:', error);
      res.status(500).json({ error: 'Failed to check status' });
    }
  },
);

// Retry failed knowledge source processing
router.post(
  '/retry/:sourceId',
  authenticate,
  loadOrganizationContext,
  async (req: Request, res: Response) => {
    try {
      const { sourceId } = req.params;

      const [source] = await db
        .select()
        .from(knowledgeSources)
        .where(eq(knowledgeSources.id, sourceId));

      if (!source) {
        return res.status(404).json({ error: 'Source not found' });
      }

      // Check access
      if (!(await canAccessBot(source.botId!, req))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Only retry failed sources
      if (source.status !== 'failed') {
        return res.status(400).json({
          error: 'Can only retry failed sources',
          currentStatus: source.status,
        });
      }

      // Reset source status and increment retry count
      await db
        .update(knowledgeSources)
        .set({
          status: 'processing',
          retryCount: (source.retryCount || 0) + 1,
          lastError: null,
          processingState: {
            extract: 'pending',
            ocr: 'pending',
            chunk: 'pending',
            embed: 'pending',
            index: 'pending',
          },
          updatedAt: new Date(),
        })
        .where(eq(knowledgeSources.id, sourceId));

      // Trigger re-processing based on source type
      if (source.sourceType === 'url' && source.sourceUrl) {
        // Re-crawl the URL
        WebScraperService.crawlWebsite(
          source.sourceUrl,
          20,
          sourceId,
          source.botId!,
          source.organizationId,
        ).catch((err) =>
          console.error(`Retry crawl failed for ${source.sourceUrl}:`, err),
        );
      } else if (source.sourceType === 'document') {
        // For documents, user needs to re-upload
        return res.status(400).json({
          error: 'Document sources must be re-uploaded',
        });
      }

      res.json({
        success: true,
        sourceId,
        retryCount: (source.retryCount || 0) + 1,
        message: 'Source queued for re-processing',
      });
    } catch (error: any) {
      console.error('Retry error:', error);
      res.status(500).json({ error: 'Failed to retry processing' });
    }
  },
);

// Admin: Detect missing embeddings across all bots or specific bot
router.get(
  '/admin/missing-embeddings',
  authenticate,
  loadOrganizationContext,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;

      // Only admins can see system-wide stats
      const isAdmin = user?.role === 'ADMIN' || user?.role === 'MasterAdmin';

      const { botId } = req.query;

      if (botId && typeof botId === 'string') {
        // Check access
        if (!(await canAccessBot(botId, req))) {
          return res.status(403).json({ error: 'Access denied' });
        }
      } else if (!isAdmin) {
        return res
          .status(403)
          .json({ error: 'Admin access required for system-wide stats' });
      }

      const results = await KnowledgeService.detectMissingEmbeddings(
        botId as string | undefined,
      );

      res.json({
        success: true,
        results,
      });
    } catch (error: any) {
      console.error('Missing embeddings detection error:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Admin: Backfill missing embeddings for a bot
router.post(
  '/admin/backfill-embeddings/:botId',
  authenticate,
  loadOrganizationContext,
  async (req: Request, res: Response) => {
    try {
      const { botId } = req.params;
      const { batchSize = 50 } = req.body;

      // Check access
      if (!(await canAccessBot(botId, req))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const result = await KnowledgeService.backfillEmbeddings(
        botId,
        Number(batchSize),
      );

      res.json({
        success: result.success,
        processed: result.processed,
        failed: result.failed,
        errors: result.errors,
        message: result.success
          ? `Successfully backfilled ${result.processed} embeddings`
          : `Backfill completed with ${result.failed} failures`,
      });
    } catch (error: any) {
      console.error('Embedding backfill error:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Admin: Get cache statistics
router.get(
  '/admin/cache-stats',
  authenticate,
  loadOrganizationContext,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isAdmin = user?.role === 'ADMIN' || user?.role === 'MasterAdmin';

      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const stats = KnowledgeService.getCacheStats();

      res.json({
        success: true,
        cache: stats,
      });
    } catch (error: any) {
      console.error('Cache stats error:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Admin: Clear search cache
router.post(
  '/admin/clear-cache',
  authenticate,
  loadOrganizationContext,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isAdmin = user?.role === 'ADMIN' || user?.role === 'MasterAdmin';

      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      KnowledgeService.clearCache();

      res.json({
        success: true,
        message: 'Search cache cleared',
      });
    } catch (error: any) {
      console.error('Cache clear error:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

export default router;
