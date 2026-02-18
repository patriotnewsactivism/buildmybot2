import OpenAI from 'openai';
import { env } from '../env';

export class EmbeddingService {
  private static _client: OpenAI | null = null;

  private static getClient(): OpenAI | null {
    if (!EmbeddingService._client) {
      const apiKey = env.AI_INTEGRATIONS_OPENAI_API_KEY || env.OPENAI_API_KEY;
      if (!apiKey) {
        return null;
      }
      EmbeddingService._client = new OpenAI({
        apiKey,
        baseURL:
          env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1',
        dangerouslyAllowBrowser: false, // Explicitly set for server-side only
      });
    }
    return EmbeddingService._client;
  }

  static isConfigured() {
    return Boolean(env.AI_INTEGRATIONS_OPENAI_API_KEY || env.OPENAI_API_KEY);
  }

  static async embedText(text: string): Promise<number[] | null> {
    const client = EmbeddingService.getClient();
    if (!client) {
      return null;
    }

    const trimmed = text.trim();
    if (!trimmed) return null;

    try {
      const response = await client.embeddings.create({
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
    const client = EmbeddingService.getClient();
    if (!client) {
      return null;
    }

    const inputs = texts.map((text) => text.trim()).filter(Boolean);
    if (inputs.length === 0) return null;

    try {
      const response = await client.embeddings.create({
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
