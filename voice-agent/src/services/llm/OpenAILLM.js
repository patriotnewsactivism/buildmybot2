import OpenAI from 'openai';
import { LLMProvider } from './LLMProvider.js';

export class OpenAILLM extends LLMProvider {
  constructor(apiKey) {
    super();
    if (!apiKey) {
      throw new Error('OpenAI API Key is required');
    }
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Complete a chat history.
   * @param {Array} messages - Chat history.
   * @param {Object} options - Provider-specific options.
   * @returns {Promise<string>} Response text.
   */
  async complete(messages, options = {}) {
    try {
      const fullMessages = [];
      if (options.system) {
        fullMessages.push({ role: 'system', content: options.system });
      }
      fullMessages.push(...messages);

      const completion = await this.client.chat.completions.create({
        model: options.model || 'gpt-4o-mini',
        messages: fullMessages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 150,
        ...options,
      });

      return completion.choices[0].message.content || '';
    } catch (error) {
      console.error('OpenAI LLM Error:', error);
      throw error;
    }
  }

  /**
   * Generate a streaming completion.
   * @param {Array} messages - Chat history.
   * @param {Object} options - Provider-specific options.
   * @returns {AsyncIterable<string>} Streaming text chunks.
   */
  async *streamComplete(messages, options = {}) {
    try {
      const stream = await this.client.chat.completions.create({
        model: options.model || 'gpt-4o-mini',
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 150,
        stream: true,
        ...options,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      }
    } catch (error) {
      console.error('OpenAI LLM Error:', error);
      throw error;
    }
  }
}
