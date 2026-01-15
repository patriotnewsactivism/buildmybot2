import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { bots, knowledgeChunks, knowledgeSources } from '../../shared/schema';
import { db } from '../db';

export interface KnowledgeSearchResult {
  id: string;
  content: string;
  metadata: any;
  score: number;
  sourceId: string;
}

export class KnowledgeService {
  static async searchKnowledge(
    botId: string,
    query: string,
    limit = 5,
  ): Promise<KnowledgeSearchResult[]> {
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

    const chunks = await db
      .select()
      .from(knowledgeChunks)
      .where(
        or(
          eq(knowledgeChunks.botId, botId),
          isNull(knowledgeChunks.botId)
        )
      )
      .limit(200);

    // Fetch manual knowledge base from bot definition
    const [bot] = await db
      .select({ knowledgeBase: bots.knowledgeBase })
      .from(bots)
      .where(eq(bots.id, botId))
      .limit(1);

    const manualChunks: any[] = [];
    if (bot && Array.isArray(bot.knowledgeBase)) {
      bot.knowledgeBase.forEach((item: any, index: number) => {
        if (typeof item === 'string' && item.trim().length > 0 && !item.startsWith('http')) {
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

    const scoredChunks = allChunks.map((chunk) => {
      const content = chunk.content.toLowerCase();
      let score = 0;

      const exactMatch = content.includes(queryLower);
      if (exactMatch) {
        score += 50;
      }

      const wordsToSearch =
        importantWords.length > 0 ? importantWords : queryWords;
      let matchedWords = 0;
      for (const word of wordsToSearch) {
        if (content.includes(word)) {
          matchedWords++;
          const regex = new RegExp(`\\b${word}\\b`, 'gi');
          const matches = content.match(regex);
          if (matches) {
            score += matches.length * 3;
          } else {
            score += 1;
          }
        }
      }

      if (wordsToSearch.length > 0) {
        const coverage = matchedWords / wordsToSearch.length;
        score *= 0.5 + coverage * 0.5;
      }

      const meta = chunk.metadata as any;
      if (meta?.title?.toLowerCase().includes(queryLower.slice(0, 20))) {
        score += 20;
      }

      return {
        id: chunk.id,
        content: chunk.content,
        metadata: chunk.metadata,
        score: Math.round(score),
        sourceId: chunk.sourceId!,
      };
    });

    return scoredChunks
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
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

    return {
      sources: Number(sourceCount?.count || 0),
      chunks: Number(chunkCount?.count || 0),
      totalTokens: Number(tokenSum?.total || 0),
    };
  }
}
