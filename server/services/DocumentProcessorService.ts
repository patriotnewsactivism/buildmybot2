import { createRequire } from 'node:module';
import { eq } from 'drizzle-orm';
import mammoth from 'mammoth';
import { v4 as uuidv4 } from 'uuid';
import { knowledgeChunks, knowledgeSources } from '../../shared/schema';
import { db } from '../db';
import { env } from '../env';
import { EmbeddingService } from './EmbeddingService';
import { chunkTextWithOverlap } from './KnowledgeChunker';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export interface ProcessedDocument {
  fileName: string;
  mimeType: string;
  content: string;
  pageCount?: number;
  processedAt: Date;
  ocrUsed: boolean;
}

export class DocumentProcessorService {
  static async processDocument(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    sourceId: string,
    botId: string,
    options?: { userId?: string; organizationId?: string },
  ): Promise<ProcessedDocument> {
    let content = '';
    let ocrUsed = false;
    let pageCount: number | undefined;
    const userId = options?.userId;
    const organizationId = options?.organizationId;

    try {
      await DocumentProcessorService.updateProcessingState(sourceId, {
        status: 'processing',
        processingState: {
          extract: 'processing',
          ocr: 'pending',
          chunk: 'pending',
          embed: 'pending',
          index: 'pending',
        },
      });

      let pages: Array<{ pageNumber: number; text: string }> = [];

      if (mimeType === 'application/pdf') {
        const pdfResult =
          await DocumentProcessorService.extractTextFromPdfPages(buffer);
        content = pdfResult.text;
        pages = pdfResult.pages;
        pageCount = pdfResult.pageCount;

        await DocumentProcessorService.updateProcessingState(sourceId, {
          processingState: { extract: 'completed' },
        });

        if (content.trim().length < 100) {
          try {
            const ocrContent =
              await DocumentProcessorService.extractTextFromPdfWithOCR(
                buffer,
                fileName,
              );
            if (ocrContent.trim()) {
              content = ocrContent;
              ocrUsed = true;
              pages = DocumentProcessorService.splitOcrTextIntoPages(
                ocrContent,
                pageCount,
              );
            }

            await DocumentProcessorService.updateProcessingState(sourceId, {
              processingState: { ocr: 'completed' },
            });
          } catch (error: any) {
            console.warn(
              'PDF OCR failed, proceeding with parsed text:',
              error?.message || error,
            );
            await DocumentProcessorService.updateProcessingState(sourceId, {
              processingState: { ocr: 'failed' },
              lastError: error?.message || String(error),
            });
          }
        }
      } else if (mimeType.includes('image/')) {
        content = await DocumentProcessorService.extractTextWithOCR(
          buffer,
          mimeType,
        );
        ocrUsed = true;
        pageCount = 1;
        pages = [{ pageNumber: 1, text: content }];

        await DocumentProcessorService.updateProcessingState(sourceId, {
          processingState: { extract: 'completed', ocr: 'completed' },
        });
      } else if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
        content = buffer.toString('utf-8');
        pageCount = 1;
        pages = [{ pageNumber: 1, text: content }];

        await DocumentProcessorService.updateProcessingState(sourceId, {
          processingState: { extract: 'completed' },
        });
      } else if (mimeType.includes('word') || mimeType.includes('docx')) {
        content = await DocumentProcessorService.extractTextFromDocx(buffer);
        pageCount = 1;
        pages = [{ pageNumber: 1, text: content }];

        await DocumentProcessorService.updateProcessingState(sourceId, {
          processingState: { extract: 'completed' },
        });
      } else {
        content = buffer.toString('utf-8');
        pageCount = 1;
        pages = [{ pageNumber: 1, text: content }];

        await DocumentProcessorService.updateProcessingState(sourceId, {
          processingState: { extract: 'completed' },
        });
      }

      if (!pages.length && content.trim()) {
        pages = [{ pageNumber: 1, text: content }];
      }

      const chunkInputs = pages.filter((page) => page.text.trim());

      await db
        .update(knowledgeSources)
        .set({
          sourceText: content.trim(),
          pageCount,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeSources.id, sourceId));
      const chunkRows: Array<{
        id: string;
        sourceId: string;
        botId: string;
        content: string;
        contentHash: string;
        metadata: Record<string, unknown>;
        chunkIndex: number;
        tokenCount: number;
      }> = [];

      let chunkIndex = 0;
      for (const page of chunkInputs) {
        const chunks = DocumentProcessorService.chunkDocument(page.text);
        for (const chunk of chunks) {
          chunkRows.push({
            id: uuidv4(),
            sourceId,
            botId,
            content: chunk,
            contentHash: DocumentProcessorService.hashContent(chunk),
            metadata: {
              docId: sourceId,
              fileName,
              mimeType,
              pageNumber: page.pageNumber,
              pageCount,
              userId,
              organizationId,
              ocrUsed,
            },
            chunkIndex,
            tokenCount: Math.ceil(chunk.length / 4),
          });
          chunkIndex += 1;
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .delete(knowledgeChunks)
          .where(eq(knowledgeChunks.sourceId, sourceId));
        if (chunkRows.length > 0) {
          await tx.insert(knowledgeChunks).values(chunkRows);
        }
      });

      await DocumentProcessorService.updateProcessingState(sourceId, {
        processingState: { chunk: 'completed' },
      });

      if (chunkRows.length > 0) {
        const embeddings = await EmbeddingService.embedTexts(
          chunkRows.map((row) => row.content),
        );
        if (embeddings && embeddings.length === chunkRows.length) {
          await db.transaction(async (tx) => {
            for (let i = 0; i < chunkRows.length; i++) {
              await tx
                .update(knowledgeChunks)
                .set({ embedding: embeddings[i] })
                .where(eq(knowledgeChunks.id, chunkRows[i].id));
            }
          });
          await DocumentProcessorService.updateProcessingState(sourceId, {
            processingState: { embed: 'completed', index: 'completed' },
          });
        } else {
          await DocumentProcessorService.updateProcessingState(sourceId, {
            processingState: { embed: 'skipped', index: 'skipped' },
          });
        }
      }

      await db
        .update(knowledgeSources)
        .set({
          status: 'completed',
          lastCrawledAt: new Date(),
          updatedAt: new Date(),
          lastProcessedAt: new Date(),
        })
        .where(eq(knowledgeSources.id, sourceId));

      return {
        fileName,
        mimeType,
        content,
        processedAt: new Date(),
        ocrUsed,
        pageCount,
      };
    } catch (error: any) {
      await db
        .update(knowledgeSources)
        .set({
          status: 'failed',
          errorMessage: error.message,
          updatedAt: new Date(),
          lastError: error.message,
        })
        .where(eq(knowledgeSources.id, sourceId));

      throw error;
    }
  }

  static async extractTextFromPdfPages(
    buffer: Buffer,
  ): Promise<{ text: string; pageCount: number; pages: Array<{ pageNumber: number; text: string }> }> {
    try {
      const pages: Array<{ pageNumber: number; text: string }> = [];
      const data = await pdfParse(buffer, {
        pagerender: async (pageData: any) => {
          const textContent = await pageData.getTextContent();
          const strings = textContent.items
            .map((item: any) => item?.str || '')
            .filter(Boolean);
          const text = strings.join(' ').replace(/\s+/g, ' ').trim();
          pages.push({ pageNumber: pageData.pageIndex + 1, text });
          return text;
        },
      });

      pages.sort((a, b) => a.pageNumber - b.pageNumber);
      const mergedText = pages.map((p) => p.text).join('\n\n').trim();
      return {
        text: mergedText || data.text.replace(/\s+/g, ' ').trim(),
        pageCount: data.numpages || pages.length || 1,
        pages,
      };
    } catch (error: any) {
      console.error('PDF parse error:', error.message);
      return { text: '', pageCount: 0, pages: [] };
    }
  }

  static async extractTextFromDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.replace(/\s+/g, ' ').trim();
    } catch (error: any) {
      console.error('DOCX parse error:', error.message);
      return '';
    }
  }

  static async extractTextWithOCR(
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1';
    
    if (!apiKey) {
      throw new Error('OpenAI API key required for OCR');
    }

    const base64 = buffer.toString('base64');
    const mediaType = mimeType.startsWith('image/') ? mimeType : 'image/png';

    try {
      const response = await fetch(
        `${baseURL}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Extract all text content from this image. Return only the extracted text, preserving the original structure and formatting as much as possible. Do not add any commentary or explanations.',
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mediaType};base64,${base64}`,
                    },
                  },
                ],
              },
            ],
            max_completion_tokens: 4000,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      console.error('OCR extraction failed:', error);
      throw new Error(`OCR failed: ${error.message}`);
    }
  }

  static async extractTextFromPdfWithOCR(
    buffer: Buffer,
    fileName: string,
  ): Promise<string> {
    const apiKey =
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const baseURL =
      process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
      'https://api.openai.com/v1';

    if (!apiKey) {
      throw new Error('OpenAI API key required for OCR');
    }

    console.log(`[OCR] Processing PDF: ${fileName}`);

    try {
      // Parse PDF to get page count
      const pdfData = await pdfParse(buffer);
      const pageCount = pdfData.numpages;
      console.log(`[OCR] PDF has ${pageCount} pages`);

      // For now, extract text from first 10 pages to avoid excessive API calls
      const maxPages = Math.min(pageCount, 10);
      const extractedTexts: string[] = [];

      // Use GPT-4o vision with the PDF file directly
      // OpenAI now supports PDF files in vision API
      const base64Pdf = buffer.toString('base64');

      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Extract all text content from this PDF document. Return only the extracted text, preserving the original structure and formatting as much as possible. Process up to ${maxPages} pages. Do not add any commentary or explanations.`,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:application/pdf;base64,${base64Pdf}`,
                  },
                },
              ],
            },
          ],
          max_completion_tokens: 16000, // Increased for larger documents
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[OCR] OpenAI API error:`, error);
        throw new Error(`OpenAI API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      const extractedText = data.choices?.[0]?.message?.content || '';

      if (!extractedText || extractedText.trim().length < 50) {
        console.warn(`[OCR] Extraction produced minimal text (${extractedText.length} chars)`);
        throw new Error('OCR produced insufficient text content');
      }

      console.log(`[OCR] Successfully extracted ${extractedText.length} characters`);
      return extractedText;

    } catch (error: any) {
      console.error(`[OCR] Failed to extract text from PDF:`, error.message);
      throw new Error(`OCR failed: ${error.message}`);
    }
  }

  private static async uploadOpenAIFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    apiKey: string,
    baseURL: string,
  ): Promise<string> {
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: mimeType }), fileName);
    formData.append('purpose', 'vision');

    const response = await fetch(`${baseURL}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      if (error.includes('Invalid purpose')) {
        return DocumentProcessorService.uploadOpenAIFileWithPurpose(
          buffer,
          fileName,
          mimeType,
          apiKey,
          baseURL,
          'assistants',
        );
      }
      throw new Error(`OpenAI file upload error: ${error}`);
    }

    const data = await response.json();
    return data.id;
  }

  private static async uploadOpenAIFileWithPurpose(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    apiKey: string,
    baseURL: string,
    purpose: string,
  ): Promise<string> {
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: mimeType }), fileName);
    formData.append('purpose', purpose);

    const response = await fetch(`${baseURL}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI file upload error: ${error}`);
    }

    const data = await response.json();
    return data.id;
  }

  private static async deleteOpenAIFile(
    fileId: string,
    apiKey: string,
    baseURL: string,
  ): Promise<void> {
    await fetch(`${baseURL}/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  }

  static chunkDocument(text: string, maxTokens = 500): string[] {
    return chunkTextWithOverlap(text, {
      minTokens: Math.min(500, maxTokens),
      maxTokens: Math.max(1000, maxTokens),
      targetTokens: Math.min(Math.max(800, maxTokens), 1000),
      overlapTokens: 100,
    });
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

  private static splitOcrTextIntoPages(
    text: string,
    pageCount?: number,
  ): Array<{ pageNumber: number; text: string }> {
    const normalized = text.replace(/\r\n/g, '\n');
    const formFeedSplit = normalized.split('\f').map((page) => page.trim());
    if (formFeedSplit.length > 1) {
      return formFeedSplit
        .filter(Boolean)
        .map((pageText, index) => ({
          pageNumber: index + 1,
          text: pageText,
        }));
    }

    const pages = pageCount && pageCount > 1 ? pageCount : 1;
    if (pages === 1) {
      return [{ pageNumber: 1, text: normalized.trim() }];
    }

    const approxLength = Math.ceil(normalized.length / pages);
    const result: Array<{ pageNumber: number; text: string }> = [];
    for (let i = 0; i < pages; i++) {
      const start = i * approxLength;
      const end = i === pages - 1 ? normalized.length : (i + 1) * approxLength;
      const slice = normalized.slice(start, end).trim();
      if (slice) {
        result.push({ pageNumber: i + 1, text: slice });
      }
    }

    return result.length > 0
      ? result
      : [{ pageNumber: 1, text: normalized.trim() }];
  }

  private static async updateProcessingState(
    sourceId: string,
    updates: {
      status?: string;
      processingState?: Record<string, string>;
      lastError?: string;
    },
  ) {
    const [current] = await db
      .select({ processingState: knowledgeSources.processingState })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, sourceId))
      .limit(1);

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (updates.status) {
      updateData.status = updates.status;
    }
    if (updates.lastError) {
      updateData.lastError = updates.lastError;
      updateData.errorMessage = updates.lastError;
    }

    if (updates.processingState) {
      updateData.processingState = {
        ...(current?.processingState as Record<string, string> | undefined),
        ...updates.processingState,
      };
    }

    await db
      .update(knowledgeSources)
      .set(updateData)
      .where(eq(knowledgeSources.id, sourceId));
  }
}
