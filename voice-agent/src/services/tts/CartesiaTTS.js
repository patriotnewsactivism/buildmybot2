import { TTSProvider } from './TTSProvider.js';
import { CartesiaClient } from '@cartesia/cartesia-js';

export class CartesiaTTS extends TTSProvider {
  constructor(apiKey) {
    super();
    if (!apiKey) {
      throw new Error("Cartesia API Key is required");
    }
    this.client = new CartesiaClient({ apiKey });
  }

  /**
   * @param {string} text
   * @param {import('stream').Writable} stream
   */
  async speak(text, stream) {
    try {
      // Initialize the WebSocket connection for TTS
      const websocket = this.client.tts.websocket({
        container: "raw",
        encoding: "pcm_s16le",
        sampleRate: 24000
      });

      await websocket.connect();

      // Listen for incoming audio chunks from Cartesia
      // and write them to our output stream
      const response = await websocket.send({
        model_id: "sonic-english", // Defaulting to a standard model
        transcript: text,
        voice: {
          mode: "id",
          id: "a0e99841-438c-4a64-b679-ae501e7d6091" // Placeholder Voice ID
        }
      });

      // Stream the response to the provided writable stream
      // Note: Implementation details of 'response' depend on the specific SDK version
      // Assuming 'response' is an async iterable or stream source
      for await (const chunk of response.source) {
        stream.write(chunk);
      }
      
      // We don't close the stream here as it might be kept open for more speech
      // but if this is a single-shot, we might want to let the caller handle it.
      
    } catch (error) {
      console.error("Cartesia TTS Error:", error);
      throw error;
    }
  }
}
