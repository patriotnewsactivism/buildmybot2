import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { knowledgeChunks, knowledgeSources } from '../../shared/schema';
import { db } from '../db';

export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  description?: string;
  links: string[];
  scrapedAt: Date;
}

export class WebScraperService {
  private static readonly MAX_CONTENT_LENGTH = 50000;
  private static readonly RATE_LIMIT_MS = 1000;
  private static lastRequestTime = 0;
  private static readonly USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  ];
  private static readonly SKIP_EXTENSIONS = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.svg',
    '.pdf',
    '.zip',
    '.rar',
    '.7z',
    '.mp4',
    '.mp3',
    '.avi',
  ]);

  static async scrapeUrl(url: string): Promise<ScrapedContent> {
    await WebScraperService.rateLimit();

    try {
      const html = await WebScraperService.fetchHtml(url);
      const title = WebScraperService.extractTitle(html);
      const description = WebScraperService.extractMetaDescription(html);
      const content = WebScraperService.extractText(html);
      const links = WebScraperService.extractLinks(html, url);

      return {
        url,
        title,
        content: content.substring(0, WebScraperService.MAX_CONTENT_LENGTH),
        description,
        links,
        scrapedAt: new Date(),
      };
    } catch (error: any) {
      throw new Error(`Failed to scrape ${url}: ${error.message}`);
    }
  }

  static async crawlWebsite(
    startUrl: string,
    maxPages: number,
    sourceId: string,
    botId: string,
    organizationId?: string,
  ): Promise<ScrapedContent[]> {
    const visited = new Set<string>();
    const normalizedStartUrl = WebScraperService.normalizeUrl(startUrl);
    const toVisit = [normalizedStartUrl];
    const results: ScrapedContent[] = [];
    const baseUrl = new URL(normalizedStartUrl);

    while (toVisit.length > 0 && results.length < maxPages) {
      const currentUrl = toVisit.shift()!;

      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      try {
        const scraped = await WebScraperService.scrapeUrl(currentUrl);
        results.push(scraped);

        const chunks = WebScraperService.chunkContent(scraped.content);
        for (let i = 0; i < chunks.length; i++) {
          await db.insert(knowledgeChunks).values({
            id: uuidv4(),
            sourceId,
            botId,
            content: chunks[i],
            contentHash: WebScraperService.hashContent(chunks[i]),
            metadata: {
              title: scraped.title,
              url: scraped.url,
              pageIndex: results.length,
            },
            chunkIndex: i,
            tokenCount: Math.ceil(chunks[i].length / 4),
          });
        }

        for (const link of scraped.links) {
          try {
            const linkUrl = new URL(link, currentUrl);
            const normalizedLink = WebScraperService.normalizeUrl(linkUrl.href);
            if (
              WebScraperService.shouldVisitUrl(linkUrl, baseUrl) &&
              !visited.has(normalizedLink)
            ) {
              toVisit.push(normalizedLink);
            }
          } catch {}
        }

        await db
          .update(knowledgeSources)
          .set({
            pagesCrawled: results.length,
            updatedAt: new Date(),
          })
          .where(eq(knowledgeSources.id, sourceId));
      } catch (error: any) {
        console.error(`Error scraping ${currentUrl}:`, error.message);
      }
    }

    await db
      .update(knowledgeSources)
      .set({
        status: 'completed',
        pagesCrawled: results.length,
        lastCrawledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(knowledgeSources.id, sourceId));

    return results;
  }

  static extractTitle(html: string): string {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : 'Untitled';
  }

  static extractMetaDescription(html: string): string | undefined {
    const metaMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
    );
    return metaMatch ? metaMatch[1].trim() : undefined;
  }

  static extractText(html: string): string {
    const text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
      .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
      .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, ' ')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text;
  }

  static extractLinks(html: string, baseUrl: string): string[] {
    const links: string[] = [];
    const linkPattern = /<a[^>]+href=["']([^"'#\s]+)["']/gi;
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
      const href = match[1].trim();
      if (
        href.startsWith('javascript:') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
      ) {
        continue;
      }
      links.push(href);
    }

    return [...new Set(links)].slice(0, 100);
  }

  static chunkContent(text: string, maxTokens = 500): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = '';
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = Math.ceil(sentence.length / 4);

      if (currentTokens + sentenceTokens > maxTokens && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
        currentTokens = sentenceTokens;
      } else {
        currentChunk += ` ${sentence}`;
        currentTokens += sentenceTokens;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  static hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  private static async fetchHtml(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const headers = {
      'User-Agent': WebScraperService.pickUserAgent(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    };

    try {
      const response = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType && !contentType.includes('text/html')) {
        throw new Error(`Unsupported content type: ${contentType}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private static pickUserAgent(): string {
    const agents = WebScraperService.USER_AGENTS;
    return agents[Math.floor(Math.random() * agents.length)];
  }

  private static normalizeUrl(url: string): string {
    const normalized = new URL(url);
    normalized.hash = '';
    return normalized.toString().replace(/\/$/, '');
  }

  private static shouldVisitUrl(linkUrl: URL, baseUrl: URL): boolean {
    if (linkUrl.hostname !== baseUrl.hostname) return false;
    const lastDot = linkUrl.pathname.lastIndexOf('.');
    if (lastDot !== -1) {
      const extension = linkUrl.pathname.slice(lastDot).toLowerCase();
      if (WebScraperService.SKIP_EXTENSIONS.has(extension)) return false;
    }
    return true;
  }

  private static async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - WebScraperService.lastRequestTime;

    if (timeSinceLastRequest < WebScraperService.RATE_LIMIT_MS) {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          WebScraperService.RATE_LIMIT_MS - timeSinceLastRequest,
        ),
      );
    }

    WebScraperService.lastRequestTime = Date.now();
  }
}
