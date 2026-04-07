import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import axios from 'axios';

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const CARTESIA_API_URL = 'https://api.cartesia.ai/tts/bytes';

// Professional voice IDs from Cartesia (update with actual Cartesia voice IDs)
export const CARTESIA_VOICES = {
  // Professional female voices
  'professional-female-us': 'a0e99841-438c-4a64-b679-ae501e7d6091',
  'professional-female-uk': '79a125e8-cd45-4c13-8a67-188112f4dd22',

  // Professional male voices
  'professional-male-us': '694f9389-aac1-45b6-b726-9d9369183238',
  'professional-male-uk': '2ee87190-8f84-4925-97da-e52547f9462c',

  // Friendly/casual voices
  'friendly-female': '71a5d7b0-1e8e-4c0e-9c3f-98e3a5b8c2a1',
  'friendly-male': '9b3e4f2a-7c6d-4e1b-8a5f-3d2c1e9a8b7c',
};

export class CartesiaService {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = CARTESIA_API_KEY;
    if (!this.apiKey) {
      console.warn('CARTESIA_API_KEY not configured — Cartesia TTS will be unavailable');
    }
  }

  private ensureApiKey(): string {
    if (!this.apiKey) {
      throw new Error('CARTESIA_API_KEY environment variable is required for TTS');
    }
    return this.apiKey;
  }

  /**
   * Generates speech from text using Cartesia API
   * Returns audio buffer for playback
   */
  async generateSpeech(
    text: string,
    voiceId: string = CARTESIA_VOICES['professional-female-us'],
    options?: {
      language?: string;
      speed?: number;
      emotion?: string;
    },
  ): Promise<Buffer> {
    const apiKey = this.ensureApiKey();
    try {
      const response = await axios.post(
        CARTESIA_API_URL,
        {
          model_id: 'sonic-english',
          transcript: text,
          voice: {
            mode: 'id',
            id: voiceId,
          },
          language: options?.language || 'en',
          output_format: {
            container: 'wav',
            encoding: 'pcm_s16le',
            sample_rate: 8000,
          },
          ...(options?.speed && { speed: options.speed }),
          ...(options?.emotion && { emotion: options.emotion }),
        },
        {
          headers: {
            'Cartesia-Version': '2024-06-10',
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        },
      );

      return Buffer.from(response.data);
    } catch (error) {
      console.error('Cartesia TTS error:', error);
      throw new Error('Failed to generate speech');
    }
  }

  /**
   * Generates speech and saves to file
   * Returns file path for serving to Twilio
   */
  async generateSpeechFile(
    text: string,
    voiceId: string,
    callId: string,
  ): Promise<string> {
    try {
      const audioBuffer = await this.generateSpeech(text, voiceId);

      // Create audio directory if it doesn't exist
      const audioDir = join(process.cwd(), 'public', 'voice', 'audio');
      mkdirSync(audioDir, { recursive: true });

      // Generate unique filename
      const filename = `${callId}-${Date.now()}.wav`;
      const filepath = join(audioDir, filename);

      // Write audio file
      writeFileSync(filepath, audioBuffer);

      // Return public URL
      return `/voice/audio/${filename}`;
    } catch (error) {
      console.error('Error saving speech file:', error);
      throw error;
    }
  }

  /**
   * Streams audio directly (for real-time responses)
   */
  async streamSpeech(text: string, voiceId: string): Promise<ReadableStream> {
    const apiKey = this.ensureApiKey();
    try {
      const response = await axios.post(
        CARTESIA_API_URL,
        {
          model_id: 'sonic-english',
          transcript: text,
          voice: {
            mode: 'id',
            id: voiceId,
          },
          output_format: {
            container: 'wav',
            encoding: 'pcm_f32le',
            sample_rate: 22050,
          },
        },
        {
          headers: {
            'Cartesia-Version': '2024-06-10',
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
        },
      );

      return response.data;
    } catch (error) {
      console.error('Cartesia streaming error:', error);
      throw new Error('Failed to stream speech');
    }
  }

  /**
   * Get available voices
   */
  getAvailableVoices() {
    return CARTESIA_VOICES;
  }

  /**
   * Estimate cost per minute (Cartesia pricing)
   * Approximately $0.00005 per character
   * Average 150 words per minute = ~750 characters
   */
  estimateCost(characterCount: number): number {
    const PRICE_PER_CHAR = 0.00005;
    return characterCount * PRICE_PER_CHAR;
  }
}

export const cartesiaService = new CartesiaService();
