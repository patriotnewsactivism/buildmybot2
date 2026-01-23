import { TTSProvider } from './TTSProvider.js';
import { Writable } from 'stream';

class NullStream extends Writable {
  _write(chunk, encoding, callback) {
    // Discard data
    callback();
  }
}

export class ShadowTTS extends TTSProvider {
  /**
   * @param {TTSProvider} primaryProvider - The provider currently serving users (e.g. Cartesia)
   * @param {TTSProvider} shadowProvider - The new provider being tested (e.g. ElevenLabs)
   */
  constructor(primaryProvider, shadowProvider) {
    super();
    this.primary = primaryProvider;
    this.shadow = shadowProvider;
  }

  async speak(text, stream) {
    const start = Date.now();
    const shadowStart = Date.now();

    // 1. Trigger Shadow Provider (Background)
    // We catch errors so they don't affect the main flow
    const shadowPromise = (async () => {
      try {
        const nullStream = new NullStream();
        await this.shadow.speak(text, nullStream);
        const duration = Date.now() - shadowStart;
        console.log(`[Shadow Metrics] Provider: ${this.shadow.constructor.name} | Latency: ${duration}ms | Status: Success`);
      } catch (err) {
        console.error(`[Shadow Metrics] Provider: ${this.shadow.constructor.name} | Error: ${err.message}`);
      }
    })();

    // 2. Trigger Primary Provider (Foreground)
    try {
      await this.primary.speak(text, stream);
      const duration = Date.now() - start;
      console.log(`[Primary Metrics] Provider: ${this.primary.constructor.name} | Latency: ${duration}ms | Status: Success`);
    } catch (err) {
      console.error(`[Primary Metrics] Provider: ${this.primary.constructor.name} | Error: ${err.message}`);
      throw err; // Propagate primary error to user
    }
    
    // Note: We don't await shadowPromise here because we don't want to delay the end of the call
    // However, Node process might exit if not handled. In a long-running server, this is fine.
  }
}
