import crypto from 'node:crypto';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { knowledgeChunks, knowledgeSources } from '../../shared/schema';
import { db } from '../db';
import { EmbeddingService } from './EmbeddingService';
import { chunkTextWithOverlap } from './KnowledgeChunker';
import { WebScraperService } from './WebScraperService';

type RepairSummary = {
  checkedSources: number;
  repairedSources: number;
  deadLettered: number;
  embeddingBackfills: number;
  skipped: number;
};

export class KnowledgeRepairService {
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_DELAY_MS = 60_000;
  private static readonly EMBEDDING_BATCH = 50;

  static async reconcile(limit = 25): Promise<RepairSummary> {
    const summary: RepairSummary = {
      checkedSources: 0,
      repairedSources: 0,
      deadLettered: 0,
      embeddingBackfills: 0,
      skipped: 0,
    };

    const candidates = await KnowledgeRepairService.loadCandidateSources(limit);
    summary.checkedSources = candidates.length;

    for (const source of candidates) {
      const result = await KnowledgeRepairService.repairSource(source);
      if (result === 'repaired') summary.repairedSources += 1;
      else if (result === 'dead_lettered') summary.deadLettered += 1;
      else summary.skipped += 1;
    }

    const embeddingBackfills =
      await KnowledgeRepairService.backfillEmbeddings();
    summary.embeddingBackfills = embeddingBackfills;

    return summary;
  }

  private static async loadCandidateSources(limit: number) {
    const failures = await db
      .select({
        id: knowledgeSources.id,
        botId: knowledgeSources.botId,
        organizationId: knowledgeSources.organizationId,
        sourceType: knowledgeSources.sourceType,
        sourceUrl: knowledgeSources.sourceUrl,
        sourceName: knowledgeSources.sourceName,
        status: knowledgeSources.status,
        processingState: knowledgeSources.processingState,
        retryCount: knowledgeSources.retryCount,
        nextRetryAt: knowledgeSources.nextRetryAt,
        deadLetteredAt: knowledgeSources.deadLetteredAt,
        sourceText: knowledgeSources.sourceText,
        pagesCrawled: knowledgeSources.pagesCrawled,
        createdAt: knowledgeSources.createdAt,
      })
      .from(knowledgeSources)
      .where(
        or(
          eq(knowledgeSources.status, 'failed'),
          eq(knowledgeSources.status, 'processing'),
          sql`${knowledgeSources.processingState} ->> 'chunk' = 'failed'`,
          sql`${knowledgeSources.processingState} ->> 'embed' = 'failed'`,
          sql`${knowledgeSources.processingState} ->> 'ocr' = 'failed'`,
        ),
      )
      .limit(limit);

    const incomplete = await db
      .select({
        id: knowledgeSources.id,
        botId: knowledgeSources.botId,
        organizationId: knowledgeSources.organizationId,
        sourceType: knowledgeSources.sourceType,
        sourceUrl: knowledgeSources.sourceUrl,
        sourceName: knowledgeSources.sourceName,
        status: knowledgeSources.status,
        processingState: knowledgeSources.processingState,
        retryCount: knowledgeSources.retryCount,
        nextRetryAt: knowledgeSources.nextRetryAt,
        deadLetteredAt: knowledgeSources.deadLetteredAt,
        sourceText: knowledgeSources.sourceText,
        pagesCrawled: knowledgeSources.pagesCrawled,
        createdAt: knowledgeSources.createdAt,
        chunkCount: sql<number>`COUNT(${knowledgeChunks.id})`,
      })
      .from(knowledgeSources)
      .leftJoin(
        knowledgeChunks,
        eq(knowledgeChunks.sourceId, knowledgeSources.id),
      )
      .where(eq(knowledgeSources.status, 'completed'))
      .groupBy(knowledgeSources.id)
      .having(sql`COUNT(${knowledgeChunks.id}) = 0`)
      .limit(limit);

    const seen = new Set<string>();
    const merged = [];
    for (const item of [...failures, ...incomplete]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }

    return merged;
  }

  private static shouldRetry(source: {
    retryCount: number | null;
    nextRetryAt: Date | null;
    deadLetteredAt: Date | null;
  }) {
    if (source.deadLetteredAt) return false;
    const retryCount = source.retryCount ?? 0;
    if (retryCount >= KnowledgeRepairService.MAX_RETRIES) return false;
    if (source.nextRetryAt && source.nextRetryAt > new Date()) return false;
    return true;
  }

  private static async repairSource(source: any) {
    if (!KnowledgeRepairService.shouldRetry(source)) {
      if (
        source.retryCount >= KnowledgeRepairService.MAX_RETRIES &&
        !source.deadLetteredAt
      ) {
        await KnowledgeRepairService.deadLetter(source.id, 'retry_limit');
        return 'dead_lettered';
      }
      return 'skipped';
    }

    try {
      if (source.sourceType === 'url' && source.sourceUrl) {
        await db
          .update(knowledgeSources)
          .set({
            status: 'processing',
            lastError: null,
            errorMessage: null,
            updatedAt: new Date(),
            processingState: {
              extract: 'processing',
              ocr: 'skipped',
              chunk: 'pending',
              embed: 'pending',
              index: 'pending',
            },
          })
          .where(eq(knowledgeSources.id, source.id));

        WebScraperService.crawlWebsite(
          source.sourceUrl,
          source.pagesCrawled || 20,
          source.id,
          source.botId,
          source.organizationId,
        ).catch((error) => console.error('Repair crawl error:', error));

        await KnowledgeRepairService.bumpRetry(source.id, source.retryCount);
        return 'repaired';
      }

      if (source.sourceType === 'document') {
        if (!source.sourceText) {
          await KnowledgeRepairService.recordFailure(
            source.id,
            source.retryCount,
            'missing_source_text',
          );
          return 'skipped';
        }

        const chunks = chunkTextWithOverlap(source.sourceText, {
          minTokens: 500,
          maxTokens: 1000,
          targetTokens: 800,
          overlapTokens: 100,
        });

        await db.transaction(async (tx) => {
          await tx
            .delete(knowledgeChunks)
            .where(eq(knowledgeChunks.sourceId, source.id));
          if (chunks.length > 0) {
            await tx.insert(knowledgeChunks).values(
              chunks.map((chunk, index) => ({
                id: crypto.randomUUID(),
                sourceId: source.id,
                botId: source.botId,
                content: chunk,
                contentHash: KnowledgeRepairService.hashContent(chunk),
                metadata: {
                  docId: source.id,
                  fileName: source.sourceName,
                  pageNumber: 1,
                  pageCount: 1,
                  organizationId: source.organizationId,
                },
                chunkIndex: index,
                tokenCount: Math.ceil(chunk.length / 4),
              })),
            );
          }
        });

        await KnowledgeRepairService.backfillEmbeddingsForSource(source.id);
        await KnowledgeRepairService.markCompleted(source.id);
        return 'repaired';
      }

      return 'skipped';
    } catch (error: any) {
      await KnowledgeRepairService.recordFailure(
        source.id,
        source.retryCount,
        error?.message || 'repair_failed',
      );
      return 'skipped';
    }
  }

  private static async markCompleted(sourceId: string) {
    await db
      .update(knowledgeSources)
      .set({
        status: 'completed',
        lastProcessedAt: new Date(),
        updatedAt: new Date(),
        processingState: {
          extract: 'completed',
          ocr: 'completed',
          chunk: 'completed',
          embed: 'completed',
          index: 'completed',
        },
      })
      .where(eq(knowledgeSources.id, sourceId));
  }

  private static async bumpRetry(sourceId: string, retryCount: number | null) {
    const current = retryCount ?? 0;
    const nextRetryAt = new Date(
      Date.now() + KnowledgeRepairService.BASE_DELAY_MS * 2 ** current,
    );
    await db
      .update(knowledgeSources)
      .set({
        retryCount: current + 1,
        nextRetryAt,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeSources.id, sourceId));
  }

  private static async recordFailure(
    sourceId: string,
    retryCount: number | null,
    error: string,
  ) {
    const current = retryCount ?? 0;
    const nextRetryAt = new Date(
      Date.now() + KnowledgeRepairService.BASE_DELAY_MS * 2 ** current,
    );
    await db
      .update(knowledgeSources)
      .set({
        status: 'failed',
        lastError: error,
        errorMessage: error,
        retryCount: current + 1,
        nextRetryAt,
        updatedAt: new Date(),
        processingState: {
          chunk: 'failed',
          embed: 'failed',
        },
      })
      .where(eq(knowledgeSources.id, sourceId));

    if (current + 1 >= KnowledgeRepairService.MAX_RETRIES) {
      await KnowledgeRepairService.deadLetter(sourceId, error);
    }
  }

  private static async deadLetter(sourceId: string, reason: string) {
    await db
      .update(knowledgeSources)
      .set({
        deadLetteredAt: new Date(),
        lastError: reason,
        errorMessage: reason,
        updatedAt: new Date(),
        processingState: {
          dead_letter: 'true',
        },
      })
      .where(eq(knowledgeSources.id, sourceId));
  }

  private static async backfillEmbeddingsForSource(sourceId: string) {
    const chunks = await db
      .select({
        id: knowledgeChunks.id,
        content: knowledgeChunks.content,
      })
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.sourceId, sourceId),
          sql`${knowledgeChunks.embedding} IS NULL`,
        ),
      );

    if (chunks.length === 0) return 0;

    const embeddings = await EmbeddingService.embedTexts(
      chunks.map((chunk) => chunk.content),
    );
    if (!embeddings || embeddings.length !== chunks.length) return 0;

    for (let i = 0; i < chunks.length; i++) {
      await db
        .update(knowledgeChunks)
        .set({ embedding: embeddings[i] })
        .where(eq(knowledgeChunks.id, chunks[i].id));
    }

    return chunks.length;
  }

  private static async backfillEmbeddings() {
    const chunks = await db
      .select({
        id: knowledgeChunks.id,
        content: knowledgeChunks.content,
        sourceId: knowledgeChunks.sourceId,
      })
      .from(knowledgeChunks)
      .where(sql`${knowledgeChunks.embedding} IS NULL`)
      .limit(KnowledgeRepairService.EMBEDDING_BATCH);

    if (chunks.length === 0) return 0;

    const embeddings = await EmbeddingService.embedTexts(
      chunks.map((chunk) => chunk.content),
    );
    if (!embeddings || embeddings.length !== chunks.length) return 0;

    for (let i = 0; i < chunks.length; i++) {
      await db
        .update(knowledgeChunks)
        .set({ embedding: embeddings[i] })
        .where(eq(knowledgeChunks.id, chunks[i].id));
    }

    const sourceIds = [
      ...new Set(chunks.map((chunk) => chunk.sourceId).filter(Boolean)),
    ];
    if (sourceIds.length > 0) {
      await db
        .update(knowledgeSources)
        .set({
          updatedAt: new Date(),
          processingState: sql`COALESCE(${knowledgeSources.processingState}, '{}'::jsonb) || '{"embed":"completed","index":"completed"}'::jsonb`,
        })
        .where(inArray(knowledgeSources.id, sourceIds));
    }

    return chunks.length;
  }

  private static hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}
