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
  private static readonly MIN_CONTENT_LENGTH = 200;
  private static readonly USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ];
  private static lastRequestTime = 0;

  static async scrapeUrl(url: string): Promise<ScrapedContent> {
    await WebScraperService.rateLimit();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const userAgent =
        WebScraperService.USER_AGENTS[
          Math.floor(Math.random() * WebScraperService.USER_AGENTS.length)
        ];

      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const rawTitle = WebScraperService.extractTitle(html);
      const title =
        rawTitle === 'Untitled' ? new URL(url).hostname : rawTitle;
      const description = WebScraperService.extractMetaDescription(html);
      let content = WebScraperService.extractText(html);
      let links = WebScraperService.extractLinks(html, url);

      if (content.length < WebScraperService.MIN_CONTENT_LENGTH) {
        const readerText = await WebScraperService.fetchReaderText(url);
        if (readerText) {
          content = readerText;
          links = WebScraperService.extractLinksFromText(readerText);
        }
      }

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
    const toVisit = [WebScraperService.normalizeUrl(startUrl)];
    const results: ScrapedContent[] = [];
    const baseUrl = new URL(startUrl);

    try {
      const sitemapLinks = await WebScraperService.fetchSitemapLinks(baseUrl);
      for (const link of sitemapLinks) {
        const normalized = WebScraperService.normalizeUrl(link);
        if (!visited.has(normalized)) {
          toVisit.push(normalized);
        }
      }
    } catch (error: any) {
      console.warn('Sitemap discovery failed:', error.message);
    }

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
            if (
              linkUrl.hostname === baseUrl.hostname &&
              !visited.has(linkUrl.href)
            ) {
              toVisit.push(WebScraperService.normalizeUrl(linkUrl.href));
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
    const mainContentMatch =
      html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
      html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);

    const targetHtml = mainContentMatch ? mainContentMatch[1] : html;

    const text = targetHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
      .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ')
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
    const linkPattern = /<a[^>]+href=["']([^"'#]+)["']/gi;
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
      const href = match[1];
      if (!href.startsWith('javascript:') && !href.startsWith('mailto:')) {
        links.push(href);
      }
    }

    return [...new Set(links)].slice(0, 100);
  }

  static extractLinksFromText(text: string): string[] {
    const links = new Set<string>();
    const urlPattern = /https?:\/\/[^\s)]+/gi;
    const markdownPattern = /\((https?:\/\/[^)\s]+)\)/gi;

    for (const match of text.matchAll(urlPattern)) {
      links.add(match[0]);
    }

    for (const match of text.matchAll(markdownPattern)) {
      links.add(match[1]);
    }

    return Array.from(links).slice(0, 100);
  }

  static parseSitemapLinks(xml: string): string[] {
    const links = new Set<string>();
    const locPattern = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
    let match;

    while ((match = locPattern.exec(xml)) !== null) {
      links.add(match[1]);
    }

    return Array.from(links);
  }

  static normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      if (parsed.pathname.length > 1) {
        parsed.pathname = parsed.pathname.replace(/\/+$/, '');
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }

  static async fetchReaderText(url: string): Promise<string> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const readerUrl = `https://r.jina.ai/${url}`;

      const response = await fetch(readerUrl, {
        headers: {
          Accept: 'text/plain',
          'User-Agent': 'BuildMyBot/1.0 Knowledge Scraper',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return '';
      }

      const text = await response.text();
      return text.replace(/\s+/g, ' ').trim();
    } catch {
      return '';
    }
  }

  static async fetchSitemapLinks(baseUrl: URL): Promise<string[]> {
    const sitemapUrl = `${baseUrl.origin}/sitemap.xml`;
    const response = await fetch(sitemapUrl, {
      headers: {
        Accept: 'application/xml,text/xml',
        'User-Agent': 'BuildMyBot/1.0 Knowledge Scraper',
      },
    });

    if (!response.ok) {
      return [];
    }

    const xml = await response.text();
    return WebScraperService.parseSitemapLinks(xml).filter((link) => {
      try {
        const parsed = new URL(link);
        return parsed.hostname === baseUrl.hostname;
      } catch {
        return false;
      }
    });
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
