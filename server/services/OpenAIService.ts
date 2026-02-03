import OpenAI from 'openai';

export class OpenAIService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey:
        process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
        process.env.OPENAI_API_KEY,
      baseURL:
        process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
        'https://api.openai.com/v1',
    });
  }

  async complete(
    params: OpenAI.Chat.ChatCompletionCreateParams,
  ): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create(params);
      return response.choices[0]?.message?.content || '';
    } catch (error: any) {
      const isModelNotFound =
        error?.code === 'model_not_found' ||
        error?.status === 404 ||
        (error?.status === 400 &&
          String(error?.message || '')
            .toLowerCase()
            .includes('model'));

      if (params.model === 'gpt-5o-mini' && isModelNotFound) {
        console.warn('GPT-5o Mini not found, falling back to GPT-4o Mini');
        try {
          const fallbackParams = { ...params, model: 'gpt-4o-mini' };
          const response =
            await this.openai.chat.completions.create(fallbackParams);
          return response.choices[0]?.message?.content || '';
        } catch (fallbackError) {
          console.error('OpenAI Fallback Completion Error:', fallbackError);
          throw fallbackError;
        }
      }

      console.error('OpenAI Completion Error:', error);
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

      // Use complete method to handle fallback
      const content = await this.complete({
        model: 'gpt-5o-mini',
        messages,
        temperature: 0.3,
        max_tokens: 10,
      });

      const sentiment = content.trim() || 'Neutral';
      // Normalize response
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

      // Use complete method to handle fallback
      const content = await this.complete({
        model: 'gpt-5o-mini',
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
