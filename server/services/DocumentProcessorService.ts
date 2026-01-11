import { createRequire } from 'node:module';
import { eq } from 'drizzle-orm';
import mammoth from 'mammoth';
import { v4 as uuidv4 } from 'uuid';
import { knowledgeChunks, knowledgeSources } from '../../shared/schema';
import { db } from '../db';
import { env } from '../env';
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
  private static readonly MAX_TOKENS = 500;

  static async processDocument(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    sourceId: string,
    botId: string,
  ): Promise<ProcessedDocument> {
    let content = '';
    let ocrUsed = false;
    let pageCount: number | undefined;

    try {
      if (mimeType === 'application/pdf') {
        const pdfResult =
          await DocumentProcessorService.extractTextFromPdf(buffer);
        content = pdfResult.text;
        pageCount = pdfResult.pageCount;
        if (content.trim().length < 100) {
          content = await DocumentProcessorService.extractTextWithOCR(
            buffer,
            mimeType,
          );
          ocrUsed = true;
        }
      } else if (mimeType.includes('image/')) {
        content = await DocumentProcessorService.extractTextWithOCR(
          buffer,
          mimeType,
        );
        ocrUsed = true;
      } else if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
        content = buffer.toString('utf-8');
      } else if (mimeType.includes('word') || mimeType.includes('docx')) {
        content = await DocumentProcessorService.extractTextFromDocx(buffer);
      } else {
        content = buffer.toString('utf-8');
      }

      const chunks = DocumentProcessorService.chunkDocument(content);
      for (let i = 0; i < chunks.length; i++) {
        await db.insert(knowledgeChunks).values({
          id: uuidv4(),
          sourceId,
          botId,
          content: chunks[i],
          contentHash: DocumentProcessorService.hashContent(chunks[i]),
          metadata: {
            fileName,
            mimeType,
            chunkOf: chunks.length,
          },
          chunkIndex: i,
          tokenCount: Math.ceil(chunks[i].length / 4),
        });
      }

      await db
        .update(knowledgeSources)
        .set({
          status: 'completed',
          lastCrawledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(knowledgeSources.id, sourceId));

      return {
        fileName,
        mimeType,
        content,
        processedAt: new Date(),
        ocrUsed,
      };
    } catch (error: any) {
      await db
        .update(knowledgeSources)
        .set({
          status: 'failed',
          errorMessage: error.message,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeSources.id, sourceId));

      throw error;
    }
  }

  static async extractTextFromPdf(
    buffer: Buffer,
  ): Promise<{ text: string; pageCount: number }> {
    try {
      const data = await pdfParse(buffer);
      return {
        text: data.text.replace(/\s+/g, ' ').trim(),
        pageCount: data.numpages || 1,
      };
    } catch (error: any) {
      console.error('PDF parse error:', error.message);
      return { text: '', pageCount: 0 };
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
    const apiKey = env.AI_INTEGRATIONS_OPENAI_API_KEY || env.OPENAI_API_KEY;
    const baseURL = env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1';
    
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

  static chunkDocument(text: string, maxTokens = 500): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';
    let currentTokens = 0;

    for (const paragraph of paragraphs) {
      const paragraphTokens = Math.ceil(paragraph.length / 4);

      if (currentTokens + paragraphTokens > maxTokens && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = paragraph;
        currentTokens = paragraphTokens;
      } else {
        currentChunk += `\n\n${paragraph}`;
        currentTokens += paragraphTokens;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text];
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
}
