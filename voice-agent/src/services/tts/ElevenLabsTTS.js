import { TTSProvider } from './TTSProvider.js';
import { ElevenLabsClient } from 'elevenlabs';

export class ElevenLabsTTS extends TTSProvider {
  constructor(apiKey) {
    super();
    if (!apiKey) {
      throw new Error("ElevenLabs API Key is required");
    }
    this.client = new ElevenLabsClient({ apiKey });
  }

  /**
   * @param {string} text
   * @param {import('stream').Writable} stream
   */
  async speak(text, stream) {
    try {
      // ElevenLabs streaming implementation
      const response = await this.client.textToSpeech.convertAsStream("21m00Tcm4TlvDq8ikWAM", { // Default 'Rachel' voice
        text,
        model_id: "eleven_monolingual_v1",
        output_format: "pcm_24000"
      });

      for await (const chunk of response) {
        stream.write(chunk);
      }
      
    } catch (error) {
      console.error("ElevenLabs TTS Error:", error);
      throw error;
    }
  }
}
