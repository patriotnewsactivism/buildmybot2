import OpenAI from 'openai';
import { env } from '../env';

export class EmbeddingService {
  private static client = new OpenAI({
    apiKey: env.AI_INTEGRATIONS_OPENAI_API_KEY || env.OPENAI_API_KEY,
    baseURL: env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1',
  });

  static isConfigured() {
    return Boolean(env.AI_INTEGRATIONS_OPENAI_API_KEY || env.OPENAI_API_KEY);
  }

  static async embedText(text: string): Promise<number[] | null> {
    if (!EmbeddingService.isConfigured()) {
      return null;
    }

    const trimmed = text.trim();
    if (!trimmed) return null;

    try {
      const response = await EmbeddingService.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: trimmed,
      });
      return response.data?.[0]?.embedding || null;
    } catch (error) {
      console.error('Embedding error:', error);
      return null;
    }
  }

  static async embedTexts(texts: string[]): Promise<number[][] | null> {
    if (!EmbeddingService.isConfigured()) {
      return null;
    }

    const inputs = texts.map((text) => text.trim()).filter(Boolean);
    if (inputs.length === 0) return null;

    try {
      const response = await EmbeddingService.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: inputs,
      });
      return response.data.map((item) => item.embedding);
    } catch (error) {
      console.error('Embedding batch error:', error);
      return null;
    }
  }

  static toVectorLiteral(vector: number[]): string {
    const formatted = vector.map((value) => Number(value).toFixed(6));
    return `[${formatted.join(',')}]`;
  }
}
