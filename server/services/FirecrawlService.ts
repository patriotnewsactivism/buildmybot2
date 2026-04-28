/**
 * FirecrawlService — Integrates Firecrawl API v1 for high-quality web scraping
 * and crawling. Falls back to WebScraperService when FIRECRAWL_API_KEY is not set.
 *
 * Firecrawl advantages:
 *  - Handles JS-rendered pages (SPAs, React, etc.)
 *  - Cleaner markdown/text extraction
 *  - Better anti-bot handling
 *  - Async crawl with status polling
 *  - Site mapping without scraping
 */

import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { knowledgeChunks, knowledgeSources } from '../../shared/schema';
import { db } from '../db';
import { EmbeddingService } from './EmbeddingService';
import { chunkTextWithOverlap } from './KnowledgeChunker';

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v2';

interface FirecrawlScrapeResult {
  success: boolean;
  data?: {
    url: string;
    markdown?: string;
    html?: string;
    rawHtml?: string;
    links?: string[];
    metadata?: {
      title?: string;
      description?: string;
      ogTitle?: string;
      ogDescription?: string;
      [key: string]: any;
    };
  };
  error?: string;
}

interface FirecrawlCrawlStartResult {
  success: boolean;
  id?: string;
  url?: string;
  error?: string;
}

interface FirecrawlCrawlStatusResult {
  success: boolean;
  status: 'scraping' | 'completed' | 'failed' | 'cancelled';
  total: number;
  completed: number;
  creditsUsed: number;
  expiresAt?: string;
  data?: Array<{
    url: string;
    markdown?: string;
    html?: string;
    links?: string[];
    metadata?: {
      title?: string;
      description?: string;
      [key: string]: any;
    };
  }>;
  next?: string;
  error?: string;
}

interface FirecrawlMapResult {
  success: boolean;
  links?: string[];
  error?: string;
}

export class FirecrawlService {
  /**
   * Returns the Firecrawl API key from env, or null if not configured.
   */
  static getApiKey(): string | null {
    return process.env.FIRECRAWL_API_KEY || null;
  }

  /**
   * Whether Firecrawl is available (API key is configured).
   */
  static isAvailable(): boolean {
    return Boolean(FirecrawlService.getApiKey());
  }

  /**
   * Internal helper for Firecrawl API calls.
   */
  private static async firecrawlFetch<T>(
    endpoint: string,
    options: { method?: string; body?: Record<string, any> } = {},
  ): Promise<T> {
    const apiKey = FirecrawlService.getApiKey();
    if (!apiKey) {
      throw new Error('FIRECRAWL_API_KEY is not set');
    }

    const url = `${FIRECRAWL_BASE}${endpoint}`;
    const fetchOptions: RequestInit = {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };

    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `Firecrawl API error (${response.status}): ${errorBody}`,
      );
    }

    return response.json() as Promise<T>;
  }

  // ─── SCRAPE ──────────────────────────────────────────────────────

  /**
   * Scrape a single URL via Firecrawl. Returns clean markdown + metadata.
   */
  static async scrapeUrl(
    url: string,
    options: {
      formats?: ('markdown' | 'html' | 'rawHtml' | 'links')[];
      onlyMainContent?: boolean;
      waitFor?: number;
      timeout?: number;
    } = {},
  ): Promise<FirecrawlScrapeResult> {
    const body: Record<string, any> = {
      url,
      formats: options.formats || ['markdown', 'links'],
      onlyMainContent: options.onlyMainContent ?? true,
    };

    if (options.waitFor) body.waitFor = options.waitFor;
    if (options.timeout) body.timeout = options.timeout;

    return FirecrawlService.firecrawlFetch<FirecrawlScrapeResult>('/scrape', {
      method: 'POST',
      body,
    });
  }

  // ─── CRAWL ───────────────────────────────────────────────────────

  /**
   * Start an async crawl job. Returns a job ID for polling.
   */
  static async startCrawl(
    url: string,
    options: {
      limit?: number;
      maxDepth?: number;
      includePaths?: string[];
      excludePaths?: string[];
      ignoreSitemap?: boolean;
    } = {},
  ): Promise<FirecrawlCrawlStartResult> {
    const body: Record<string, any> = {
      url,
      limit: options.limit || 50,
      scrapeOptions: {
        formats: ['markdown', 'links'],
        onlyMainContent: true,
      },
    };

    if (options.maxDepth !== undefined) body.maxDepth = options.maxDepth;
    if (options.includePaths) body.includePaths = options.includePaths;
    if (options.excludePaths) body.excludePaths = options.excludePaths;
    if (options.ignoreSitemap) body.ignoreSitemap = options.ignoreSitemap;

    return FirecrawlService.firecrawlFetch<FirecrawlCrawlStartResult>(
      '/crawl',
      { method: 'POST', body },
    );
  }

  /**
   * Check crawl job status. When completed, includes all scraped page data.
   */
  static async getCrawlStatus(
    crawlId: string,
  ): Promise<FirecrawlCrawlStatusResult> {
    return FirecrawlService.firecrawlFetch<FirecrawlCrawlStatusResult>(
      `/crawl/${crawlId}`,
    );
  }

  /**
   * Cancel a running crawl job.
   */
  static async cancelCrawl(crawlId: string): Promise<{ success: boolean }> {
    return FirecrawlService.firecrawlFetch<{ success: boolean }>(
      `/crawl/${crawlId}`,
      { method: 'DELETE' },
    );
  }

  // ─── MAP ─────────────────────────────────────────────────────────

  /**
   * Discover all URLs on a website without scraping content.
   */
  static async mapUrl(
    url: string,
    options: { search?: string; limit?: number } = {},
  ): Promise<FirecrawlMapResult> {
    const body: Record<string, any> = { url };
    if (options.search) body.search = options.search;
    if (options.limit) body.limit = options.limit;

    return FirecrawlService.firecrawlFetch<FirecrawlMapResult>('/map', {
      method: 'POST',
      body,
    });
  }

  // ─── KNOWLEDGE BASE INTEGRATION ─────────────────────────────────

  /**
   * Scrape a single URL and ingest into the knowledge base.
   * Used as a drop-in replacement for WebScraperService.scrapeUrl in knowledge routes.
   */
  static async scrapeAndIngest(
    url: string,
    sourceId: string,
    botId: string,
    organizationId?: string,
  ): Promise<{ title: string; chunkCount: number }> {
    const result = await FirecrawlService.scrapeUrl(url);

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Firecrawl scrape failed');
    }

    const { data } = result;
    const title = data.metadata?.title || data.metadata?.ogTitle || 'Untitled';
    const content = data.markdown || '';

    if (!content.trim()) {
      throw new Error('Firecrawl returned empty content');
    }

    const chunks = chunkTextWithOverlap(content, {
      minTokens: 500,
      maxTokens: 1000,
      targetTokens: 800,
      overlapTokens: 100,
    });

    const chunkRows = chunks.map((chunk, index) => ({
      id: uuidv4(),
      sourceId,
      botId,
      content: chunk,
      contentHash: hashContent(chunk),
      metadata: {
        docId: sourceId,
        title,
        url: data.url,
        pageIndex: 1,
        pageNumber: 1,
        sourceType: 'url',
        organizationId,
        scrapedBy: 'firecrawl',
      },
      chunkIndex: index,
      tokenCount: Math.ceil(chunk.length / 4),
    }));

    if (chunkRows.length > 0) {
      await db.insert(knowledgeChunks).values(chunkRows);

      // Generate embeddings
      const embeddings = await EmbeddingService.embedTexts(
        chunkRows.map((r) => r.content),
      );
      if (embeddings && embeddings.length === chunkRows.length) {
        for (let i = 0; i < chunkRows.length; i++) {
          await db
            .update(knowledgeChunks)
            .set({ embedding: embeddings[i] })
            .where(eq(knowledgeChunks.id, chunkRows[i].id));
        }
      }
    }

    return { title, chunkCount: chunkRows.length };
  }

  /**
   * Crawl a website via Firecrawl and ingest all pages into the knowledge base.
   * Drop-in replacement for WebScraperService.crawlWebsite.
   */
  static async crawlAndIngest(
    startUrl: string,
    maxPages: number,
    sourceId: string,
    botId: string,
    organizationId?: string,
  ): Promise<{ pagesProcessed: number; totalChunks: number }> {
    // 1. Start the crawl job
    const crawlResult = await FirecrawlService.startCrawl(startUrl, {
      limit: maxPages,
      maxDepth: 3,
    });

    if (!crawlResult.success || !crawlResult.id) {
      throw new Error(crawlResult.error || 'Failed to start Firecrawl crawl');
    }

    const crawlId = crawlResult.id;
    console.log(
      `[Firecrawl] Crawl started: ${crawlId} for ${startUrl} (max ${maxPages} pages)`,
    );

    // 2. Poll for completion
    let status: FirecrawlCrawlStatusResult;
    let pollCount = 0;
    const maxPollAttempts = 60; // 5 minutes at 5s intervals
    const pollInterval = 5000;

    do {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      status = await FirecrawlService.getCrawlStatus(crawlId);
      pollCount++;

      // Update progress in DB
      await db
        .update(knowledgeSources)
        .set({
          pagesCrawled: status.completed || 0,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeSources.id, sourceId));

      console.log(
        `[Firecrawl] Poll ${pollCount}: ${status.status} — ${status.completed}/${status.total} pages`,
      );
    } while (
      status.status === 'scraping' &&
      pollCount < maxPollAttempts
    );

    if (status.status === 'failed') {
      throw new Error(status.error || 'Firecrawl crawl failed');
    }

    if (status.status === 'scraping') {
      // Timed out polling — cancel and use what we have
      console.warn(
        `[Firecrawl] Crawl timed out after ${pollCount} polls, cancelling...`,
      );
      await FirecrawlService.cancelCrawl(crawlId).catch(() => {});
    }

    // 3. Process all pages
    const pages = status.data || [];
    let totalChunks = 0;

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      const content = page.markdown || '';
      if (!content.trim()) continue;

      const title =
        page.metadata?.title || new URL(page.url).pathname || 'Untitled';

      const chunks = chunkTextWithOverlap(content, {
        minTokens: 500,
        maxTokens: 1000,
        targetTokens: 800,
        overlapTokens: 100,
      });

      const chunkRows = chunks.map((chunk, index) => ({
        id: uuidv4(),
        sourceId,
        botId,
        content: chunk,
        contentHash: hashContent(chunk),
        metadata: {
          docId: sourceId,
          title,
          url: page.url,
          pageIndex: pageIdx + 1,
          pageNumber: pageIdx + 1,
          sourceType: 'url',
          organizationId,
          scrapedBy: 'firecrawl',
        },
        chunkIndex: index,
        tokenCount: Math.ceil(chunk.length / 4),
      }));

      if (chunkRows.length > 0) {
        await db.insert(knowledgeChunks).values(chunkRows);
        totalChunks += chunkRows.length;

        // Generate embeddings in batches
        const embeddings = await EmbeddingService.embedTexts(
          chunkRows.map((r) => r.content),
        );
        if (embeddings && embeddings.length === chunkRows.length) {
          for (let i = 0; i < chunkRows.length; i++) {
            await db
              .update(knowledgeChunks)
              .set({ embedding: embeddings[i] })
              .where(eq(knowledgeChunks.id, chunkRows[i].id));
          }
        }
      }

      // Update progress
      await db
        .update(knowledgeSources)
        .set({
          pagesCrawled: pageIdx + 1,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeSources.id, sourceId));
    }

    // 4. Mark source as completed
    await db
      .update(knowledgeSources)
      .set({
        status: 'completed',
        pagesCrawled: pages.length,
        lastCrawledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(knowledgeSources.id, sourceId));

    console.log(
      `[Firecrawl] Crawl complete: ${pages.length} pages, ${totalChunks} chunks for ${startUrl}`,
    );

    return { pagesProcessed: pages.length, totalChunks };
  }

  /**
   * Scrape preview — quick scrape returning title, content, and description.
   * Used by the demo page / BotBuilder preview.
   */
  static async scrapePreview(
    url: string,
  ): Promise<{
    url: string;
    title: string;
    content: string;
    description?: string;
  }> {
    const result = await FirecrawlService.scrapeUrl(url, {
      formats: ['markdown'],
      onlyMainContent: true,
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Firecrawl scrape failed');
    }

    const { data } = result;
    return {
      url: data.url,
      title: data.metadata?.title || data.metadata?.ogTitle || 'Untitled',
      content: (data.markdown || '').substring(0, 50000),
      description:
        data.metadata?.description || data.metadata?.ogDescription || undefined,
    };
  }
}

// ─── HELPERS ───────────────────────────────────────────────────────

function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
