import OpenAI from 'openai';
import { buildProviderChain, createOpenAIClient, createWithFallback } from './ai-fallback';

/** Configurable default model — set DEFAULT_AI_MODEL env var to override. */
const DEFAULT_MODEL = process.env.DEFAULT_AI_MODEL || 'gpt-4o-mini';
const providerChain = buildProviderChain();

export class OpenAIService {
  private openai: OpenAI;

  constructor() {
    this.openai =
      providerChain.length > 0
        ? createOpenAIClient(providerChain[0])
        : new OpenAI({ apiKey: 'missing' });
  }

  async complete(
    params: OpenAI.Chat.ChatCompletionCreateParams,
  ): Promise<string> {
    try {
      const response = await createWithFallback(params, providerChain);
      return response.choices[0]?.message?.content || '';
    } catch (error: any) {
      console.error('[OpenAIService] All providers exhausted:', error?.message || error);
      throw error;
    }
  }

  async analyzeSentiment(text: string): Promise<string> {
    if (!text || text.length < 5) return 'Neutral';

    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content:
            'You are a Sentiment Analyzer. Analyze the following user message and classify it as exactly one of: "Positive", "Neutral", "Negative". Return ONLY the label.',
        },
        {
          role: 'user',
          content: text,
        },
      ];

      const content = await this.complete({
        model: DEFAULT_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 10,
      });

      const sentiment = content.trim() || 'Neutral';
      if (sentiment.toLowerCase().includes('positive')) return 'Positive';
      if (sentiment.toLowerCase().includes('negative')) return 'Negative';
      return 'Neutral';
    } catch (error) {
      console.error('Sentiment Analysis Error:', error);
      return 'Neutral';
    }
  }

  async scoreLead(data: {
    name?: string;
    email?: string;
    phone?: string;
    conversationContext?: any;
  }): Promise<number> {
    try {
      const context =
        typeof data.conversationContext === 'string'
          ? data.conversationContext
          : JSON.stringify(data.conversationContext || []);

      const prompt = `
        Analyze this lead and assign a score from 0-100 based on purchase intent and qualification.
        
        Lead Details:
        - Name: ${data.name || 'Anonymous'}
        - Email: ${data.email || 'N/A'}
        - Phone: ${data.phone || 'N/A'}
        
        Conversation Context:
        ${context.substring(0, 2000)}
        
        Scoring Criteria:
        - +10 for valid name
        - +20 for valid corporate email (gmail/yahoo are lower quality)
        - +20 for phone number
        - +50 based on intent in conversation (asking for price, demo, specific features = high; just saying hi = low)
        
        Return ONLY the number (0-100).
      `;

      const content = await this.complete({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a Lead Scoring Expert. Output a single integer between 0 and 100.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 5,
      });

      const scoreStr = content.trim();
      const score = Number.parseInt(scoreStr || '50', 10);
      return Number.isNaN(score) ? 50 : Math.min(Math.max(score, 0), 100);
    } catch (error) {
      console.error('Lead Scoring Error:', error);
      return 50; // Default fallback
    }
  }
}

export const openAIService = new OpenAIService();
