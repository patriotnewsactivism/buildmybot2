import { createClient } from '@deepgram/sdk';
import { STTProvider } from './STTProvider.js';

export class DeepgramSTT extends STTProvider {
  constructor(apiKey) {
    super();
    if (!apiKey) {
      throw new Error('Deepgram API Key is required');
    }
    this.client = createClient(apiKey);
  }

  /**
   * Initialize a streaming STT connection.
   * @param {Object} options - Provider-specific options (e.g., model, language).
   * @returns {Object} A Deepgram live client object.
   */
  async startStream(options = {}) {
    try {
      const dgConnection = this.client.listen.live({
        model: options.model || 'nova-2-phonecall',
        language: options.language || 'en-US',
        smart_format: true,
        encoding: options.encoding || 'mulaw',
        sample_rate: options.sample_rate || 8000,
        ...options,
      });

      return dgConnection;
    } catch (error) {
      console.error('Deepgram STT Error:', error);
      throw error;
    }
  }
}
