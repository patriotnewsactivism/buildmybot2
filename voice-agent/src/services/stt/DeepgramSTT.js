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
   * Initialize a streaming STT connection with production-grade settings.
   * @param {Object} options
   * @returns {Object} A Deepgram live client object.
   */
  async startStream(options = {}) {
    try {
      const dgConnection = this.client.listen.live({
        // Model: nova-2-general is highest accuracy for conversational speech
        model: options.model || 'nova-2-general',
        language: options.language || 'en-US',
        // Audio encoding: linear16 (PCM) from browser at 16kHz
        encoding: options.encoding || 'linear16',
        sample_rate: options.sample_rate || 16000,
        channels: options.channels || 1,
        // Smart formatting: punctuation, numbers, dates
        smart_format: options.smart_format !== false,
        // Punctuation for sentence detection
        punctuate: true,
        // Interim results for real-time transcript display
        interim_results: options.interim_results !== false,
        // Utterance detection: 1200ms silence = end of utterance
        utterance_end_ms: options.utterance_end_ms || 1200,
        // VAD events for turn-taking
        vad_events: options.vad_events !== false,
        // Endpointing: 300ms (fast response, natural pauses)
        endpointing: options.endpointing || 300,
        // Remove filler words (um, uh, like) for cleaner transcripts
        filler_words: options.filler_words || false,
        // Profanity filter off for accurate transcription
        profanity_filter: false,
        // Diarize for multi-speaker (future: multi-party calls)
        diarize: false,
      });

      return dgConnection;
    } catch (error) {
      console.error('Deepgram STT Error:', error);
      throw error;
    }
  }
}
