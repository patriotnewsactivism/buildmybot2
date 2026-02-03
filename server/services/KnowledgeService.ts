import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { bots, knowledgeChunks, knowledgeSources } from '../../shared/schema';
import { db } from '../db';
import { EmbeddingService } from './EmbeddingService';

export interface KnowledgeSearchResult {
  id: string;
  content: string;
  metadata: any;
  score: number;
  sourceId: string;
  method?: 'vector' | 'keyword' | 'hybrid';
}

interface SearchMetrics {
  queryLength: number;
  vectorSearchUsed: boolean;
  keywordSearchUsed: boolean;
  resultCount: number;
  executionTimeMs: number;
  cacheHit: boolean;
}

// Simple in-memory cache for search results
const searchCache = new Map<
  string,
  { results: KnowledgeSearchResult[]; timestamp: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class KnowledgeService {
  /**
   * Enhanced search with hybrid vector + keyword approach
   * Phase 3: Hardened RAG with multiple fallback strategies
   */
  static async searchKnowledge(
    botId: string,
    query: string,
    limit = 5,
    options?: {
      useCache?: boolean;
      method?: 'auto' | 'vector' | 'keyword' | 'hybrid';
    },
  ): Promise<KnowledgeSearchResult[]> {
    const startTime = Date.now();
    const useCache = options?.useCache !== false;
    const method = options?.method || 'auto';

    // Check cache first
    if (useCache) {
      const cacheKey = `${botId}:${query}:${limit}`;
      const cached = searchCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        console.log(`[Search] Cache hit for query: "${query.slice(0, 50)}..."`);
        return cached.results;
      }
    }

    console.log(
      `[Search] Query: "${query.slice(0, 100)}..." (method: ${method})`,
    );

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);
    const importantWords = queryWords.filter(
      (w) =>
        ![
          'the',
          'and',
          'for',
          'are',
          'but',
          'not',
          'you',
          'all',
          'can',
          'her',
          'was',
          'one',
          'our',
          'out',
          'has',
          'have',
          'with',
          'this',
          'that',
          'what',
          'when',
          'where',
          'how',
          'why',
          'which',
        ].includes(w),
    );

    if (importantWords.length === 0 && queryWords.length === 0) {
      return [];
    }

    let results: KnowledgeSearchResult[] = [];

    // Try vector search first (if auto or vector mode)
    if (method === 'auto' || method === 'vector' || method === 'hybrid') {
      const vectorResults = await KnowledgeService.vectorSearch(
        botId,
        query,
        method === 'hybrid' ? limit * 2 : limit,
      );

      if (vectorResults.length > 0) {
        console.log(
          `[Search] Vector search returned ${vectorResults.length} results`,
        );

        if (
          method === 'vector' ||
          (method === 'auto' && vectorResults.length >= limit)
        ) {
          // Vector search sufficient
          results = vectorResults.slice(0, limit);

          // Cache results
          if (useCache) {
            const cacheKey = `${botId}:${query}:${limit}`;
            searchCache.set(cacheKey, { results, timestamp: Date.now() });
            KnowledgeService.cleanCache();
          }

          const duration = Date.now() - startTime;
          console.log(`[Search] Completed in ${duration}ms (vector only)`);
          return results;
        }

        // Hybrid mode: combine with keyword results
        if (method === 'hybrid') {
          const keywordResults = await KnowledgeService.keywordSearch(
            botId,
            query,
            importantWords,
            queryWords,
            limit * 2,
          );

          console.log(
            `[Search] Keyword search returned ${keywordResults.length} results`,
          );

          // Merge and re-rank using hybrid scoring
          results = KnowledgeService.mergeResults(
            vectorResults,
            keywordResults,
            limit,
          );

          // Cache results
          if (useCache) {
            const cacheKey = `${botId}:${query}:${limit}`;
            searchCache.set(cacheKey, { results, timestamp: Date.now() });
            KnowledgeService.cleanCache();
          }

          const duration = Date.now() - startTime;
          console.log(`[Search] Completed in ${duration}ms (hybrid)`);
          return results;
        }
      } else {
        console.warn(
          '[Search] Vector search returned no results, falling back to keyword',
        );
      }
    }

    // Fallback to keyword search
    console.log('[Search] Using keyword search');
    results = await KnowledgeService.keywordSearch(
      botId,
      query,
      importantWords,
      queryWords,
      limit,
    );

    // Cache results
    if (useCache) {
      const cacheKey = `${botId}:${query}:${limit}`;
      searchCache.set(cacheKey, { results, timestamp: Date.now() });
      KnowledgeService.cleanCache();
    }

    const duration = Date.now() - startTime;
    console.log(
      `[Search] Completed in ${duration}ms (keyword only, ${results.length} results)`,
    );
    return results;
  }

  /**
   * Vector similarity search using pgvector
   */
  private static async vectorSearch(
    botId: string,
    query: string,
    limit: number,
  ): Promise<KnowledgeSearchResult[]> {
    try {
      const embedding = await EmbeddingService.embedText(query);
      if (!embedding) {
        console.warn('[Search] Failed to generate embedding for query');
        return [];
      }

      const vectorLiteral = EmbeddingService.toVectorLiteral(embedding);
      const vectorParam = sql.raw(`'${vectorLiteral}'::vector`);

      const scored = await db
        .select({
          id: knowledgeChunks.id,
          content: knowledgeChunks.content,
          metadata: knowledgeChunks.metadata,
          sourceId: knowledgeChunks.sourceId,
          score: sql<number>`1 - (${knowledgeChunks.embedding} <=> ${vectorParam})`,
        })
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.botId, botId),
            isNotNull(knowledgeChunks.embedding),
          ),
        )
        .orderBy(sql`(${knowledgeChunks.embedding} <=> ${vectorParam})`)
        .limit(limit);

      return scored.map((row) => ({
        id: row.id,
        content: row.content,
        metadata: row.metadata,
        score: Math.round(Number(row.score) * 100),
        sourceId: row.sourceId!,
        method: 'vector' as const,
      }));
    } catch (error: any) {
      console.warn('[Search] Vector search failed:', error.message);
      return [];
    }
  }

  /**
   * Keyword-based search with BM25-like scoring
   */
  private static async keywordSearch(
    botId: string,
    query: string,
    importantWords: string[],
    queryWords: string[],
    limit: number,
  ): Promise<KnowledgeSearchResult[]> {
    const queryLower = query.toLowerCase();

    // Fetch chunks efficiently - only needed columns
    const chunks = await db
      .select({
        id: knowledgeChunks.id,
        content: knowledgeChunks.content,
        metadata: knowledgeChunks.metadata,
        sourceId: knowledgeChunks.sourceId,
      })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.botId, botId))
      .limit(500); // Increased from 200 for better coverage

    // Fetch manual knowledge base entries
    const [bot] = await db
      .select({ knowledgeBase: bots.knowledgeBase })
      .from(bots)
      .where(eq(bots.id, botId))
      .limit(1);

    const manualChunks: any[] = [];
    if (bot && Array.isArray(bot.knowledgeBase)) {
      bot.knowledgeBase.forEach((item: any, index: number) => {
        if (
          typeof item === 'string' &&
          item.trim().length > 0 &&
          !item.startsWith('http')
        ) {
          manualChunks.push({
            id: `manual-${index}`,
            content: item,
            metadata: { title: 'Manual Entry' },
            sourceId: 'manual',
          });
        }
      });
    }

    const allChunks = [...chunks, ...manualChunks];

    // Enhanced BM25-like scoring
    const scoredChunks = allChunks.map((chunk) => {
      const content = chunk.content.toLowerCase();
      const contentLength = content.length;
      let score = 0;

      // Exact phrase match (highest weight)
      if (content.includes(queryLower)) {
        score += 100;
      }

      // Word-level matching with BM25-inspired scoring
      const wordsToSearch =
        importantWords.length > 0 ? importantWords : queryWords;
      let matchedWords = 0;

      for (const word of wordsToSearch) {
        if (content.includes(word)) {
          matchedWords++;

          // Count word frequency with boundary matching
          const regex = new RegExp(`\\b${word}\\b`, 'gi');
          const matches = content.match(regex);
          const termFreq = matches ? matches.length : 0;

          if (termFreq > 0) {
            // BM25-like: log(1 + termFreq) with length normalization
            const avgLength = 500; // Estimated average chunk length
            const lengthNorm = contentLength / avgLength;
            const tfScore =
              (termFreq * (1.5 + 1)) / (termFreq + 1.5 * lengthNorm);
            score += tfScore * 10;
          } else {
            // Substring match (lower weight)
            score += 2;
          }
        }
      }

      // Query coverage bonus
      if (wordsToSearch.length > 0) {
        const coverage = matchedWords / wordsToSearch.length;
        score *= 0.3 + coverage * 0.7; // Stronger emphasis on coverage
      }

      // Metadata matching
      const meta = chunk.metadata as any;
      if (meta?.title) {
        const titleLower = meta.title.toLowerCase();
        if (titleLower.includes(queryLower.slice(0, 30))) {
          score += 30;
        }
      }

      // Recency bonus (if timestamp available)
      if (meta?.createdAt) {
        const ageMs = Date.now() - new Date(meta.createdAt).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        if (ageDays < 30) {
          score *= 1.1; // 10% boost for recent content
        }
      }

      return {
        id: chunk.id,
        content: chunk.content,
        metadata: chunk.metadata,
        score: Math.round(score),
        sourceId: chunk.sourceId!,
        method: 'keyword' as const,
      };
    });

    return scoredChunks
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Merge and re-rank results from vector and keyword search
   */
  private static mergeResults(
    vectorResults: KnowledgeSearchResult[],
    keywordResults: KnowledgeSearchResult[],
    limit: number,
  ): KnowledgeSearchResult[] {
    const resultMap = new Map<string, KnowledgeSearchResult>();

    // Add vector results with weight
    for (const result of vectorResults) {
      resultMap.set(result.id, {
        ...result,
        score: result.score * 0.6, // 60% weight for vector
        method: 'hybrid' as const,
      });
    }

    // Merge keyword results with weight
    for (const result of keywordResults) {
      const existing = resultMap.get(result.id);
      if (existing) {
        // Combine scores if chunk appears in both
        existing.score += result.score * 0.4; // 40% weight for keyword
      } else {
        resultMap.set(result.id, {
          ...result,
          score: result.score * 0.4,
          method: 'hybrid' as const,
        });
      }
    }

    // Sort by combined score and return top results
    return Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Clean expired cache entries
   */
  private static cleanCache() {
    const now = Date.now();
    for (const [key, value] of searchCache.entries()) {
      if (now - value.timestamp > CACHE_TTL_MS) {
        searchCache.delete(key);
      }
    }

    // Limit cache size to 1000 entries
    if (searchCache.size > 1000) {
      const entries = Array.from(searchCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, entries.length - 1000);
      for (const [key] of toDelete) {
        searchCache.delete(key);
      }
    }
  }

  static async buildContext(
    botId: string,
    query: string,
    maxTokens = 4000,
  ): Promise<string> {
    const results = await KnowledgeService.searchKnowledge(botId, query, 10);

    if (results.length === 0) {
      return '';
    }

    let context = '';
    let tokenCount = 0;

    for (const result of results) {
      const chunkTokens = Math.ceil(result.content.length / 4);

      if (tokenCount + chunkTokens > maxTokens) {
        break;
      }

      const source =
        result.metadata?.title || result.metadata?.fileName || 'Knowledge Base';
      context += `\n\n[From: ${source}]\n${result.content}`;
      tokenCount += chunkTokens;
    }

    return context.trim();
  }

  static async getSystemPromptWithKnowledge(
    botId: string,
    basePrompt: string,
    userQuery: string,
  ): Promise<string> {
    const context = await KnowledgeService.buildContext(botId, userQuery);

    if (!context) {
      return basePrompt;
    }

    return `${basePrompt}

---

IMPORTANT: Use the following knowledge base information to answer questions accurately. Always prioritize this information over general knowledge:

${context}

---

When answering:
1. Base your responses on the knowledge provided above
2. If the information isn't in the knowledge base, say so honestly
3. Cite the source when possible (e.g., "According to the documentation...")`;
  }

  static async getKnowledgeSources(botId: string) {
    const sources = await db
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.botId, botId))
      .orderBy(desc(knowledgeSources.createdAt));

    const sourcesWithCounts = await Promise.all(
      sources.map(async (source) => {
        const chunkCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(knowledgeChunks)
          .where(eq(knowledgeChunks.sourceId, source.id));

        return {
          ...source,
          chunkCount: Number(chunkCount[0]?.count || 0),
        };
      }),
    );

    return sourcesWithCounts;
  }

  static async deleteSource(sourceId: string, botId: string): Promise<boolean> {
    const source = await db
      .select()
      .from(knowledgeSources)
      .where(
        and(
          eq(knowledgeSources.id, sourceId),
          eq(knowledgeSources.botId, botId),
        ),
      )
      .limit(1);

    if (source.length === 0) {
      return false;
    }

    await db
      .delete(knowledgeChunks)
      .where(eq(knowledgeChunks.sourceId, sourceId));

    await db.delete(knowledgeSources).where(eq(knowledgeSources.id, sourceId));

    return true;
  }

  static async getStats(botId: string) {
    const [sourceCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.botId, botId));

    const [chunkCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.botId, botId));

    const [tokenSum] = await db
      .select({
        total: sql<number>`COALESCE(SUM(token_count), 0)`,
      })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.botId, botId));

    // Count chunks with embeddings
    const [embeddedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.botId, botId),
          isNotNull(knowledgeChunks.embedding),
        ),
      );

    return {
      sources: Number(sourceCount?.count || 0),
      chunks: Number(chunkCount?.count || 0),
      chunksWithEmbeddings: Number(embeddedCount?.count || 0),
      totalTokens: Number(tokenSum?.total || 0),
    };
  }

  /**
   * Phase 3: Detect chunks missing embeddings
   */
  static async detectMissingEmbeddings(botId?: string) {
    const query = botId
      ? sql`
          SELECT
            bot_id,
            COUNT(*) as total_chunks,
            COUNT(embedding) as chunks_with_embeddings,
            COUNT(*) - COUNT(embedding) as missing_embeddings
          FROM knowledge_chunks
          WHERE bot_id = ${botId}
          GROUP BY bot_id
        `
      : sql`
          SELECT
            bot_id,
            COUNT(*) as total_chunks,
            COUNT(embedding) as chunks_with_embeddings,
            COUNT(*) - COUNT(embedding) as missing_embeddings
          FROM knowledge_chunks
          GROUP BY bot_id
          HAVING COUNT(*) > COUNT(embedding)
        `;

    const results = await db.execute(query);
    return results.rows;
  }

  /**
   * Phase 3: Backfill missing embeddings for a bot
   */
  static async backfillEmbeddings(
    botId: string,
    batchSize = 50,
  ): Promise<{
    success: boolean;
    processed: number;
    failed: number;
    errors: string[];
  }> {
    console.log(`[Backfill] Starting embedding backfill for bot ${botId}`);

    // Get chunks without embeddings
    const chunksWithoutEmbeddings = await db
      .select({
        id: knowledgeChunks.id,
        content: knowledgeChunks.content,
      })
      .from(knowledgeChunks)
      .where(and(eq(knowledgeChunks.botId, botId), sql`embedding IS NULL`))
      .limit(batchSize);

    if (chunksWithoutEmbeddings.length === 0) {
      console.log('[Backfill] No missing embeddings found');
      return {
        success: true,
        processed: 0,
        failed: 0,
        errors: [],
      };
    }

    console.log(
      `[Backfill] Found ${chunksWithoutEmbeddings.length} chunks without embeddings`,
    );

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process in batches of 10 to avoid rate limits
    const EMBED_BATCH_SIZE = 10;
    for (let i = 0; i < chunksWithoutEmbeddings.length; i += EMBED_BATCH_SIZE) {
      const batch = chunksWithoutEmbeddings.slice(i, i + EMBED_BATCH_SIZE);
      const texts = batch.map((c) => c.content);

      try {
        const embeddings = await EmbeddingService.embedTexts(texts);

        if (embeddings && embeddings.length === batch.length) {
          // Update chunks with embeddings
          await db.transaction(async (tx) => {
            for (let j = 0; j < batch.length; j++) {
              await tx
                .update(knowledgeChunks)
                .set({ embedding: embeddings[j] })
                .where(eq(knowledgeChunks.id, batch[j].id));
            }
          });

          processed += batch.length;
          console.log(
            `[Backfill] Processed ${processed}/${chunksWithoutEmbeddings.length} chunks`,
          );
        } else {
          console.error(
            `[Backfill] Embedding generation failed for batch ${i / EMBED_BATCH_SIZE + 1}`,
          );
          failed += batch.length;
          errors.push(
            `Batch ${i / EMBED_BATCH_SIZE + 1}: Embedding generation failed`,
          );
        }
      } catch (error: any) {
        console.error(
          `[Backfill] Error processing batch ${i / EMBED_BATCH_SIZE + 1}:`,
          error.message,
        );
        failed += batch.length;
        errors.push(`Batch ${i / EMBED_BATCH_SIZE + 1}: ${error.message}`);
      }

      // Rate limiting: wait 100ms between batches
      if (i + EMBED_BATCH_SIZE < chunksWithoutEmbeddings.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log(
      `[Backfill] Completed: ${processed} processed, ${failed} failed`,
    );

    return {
      success: failed === 0,
      processed,
      failed,
      errors,
    };
  }

  /**
   * Clear search cache (for testing/admin)
   */
  static clearCache() {
    searchCache.clear();
    console.log('[Cache] Search cache cleared');
  }

  /**
   * Get cache statistics
   */
  static getCacheStats() {
    const now = Date.now();
    let expired = 0;
    for (const [_, value] of searchCache.entries()) {
      if (now - value.timestamp > CACHE_TTL_MS) {
        expired++;
      }
    }

    return {
      size: searchCache.size,
      expired,
      ttlMs: CACHE_TTL_MS,
    };
  }
}
