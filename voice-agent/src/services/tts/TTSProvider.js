export class TTSProvider {
  /**
   * Convert text to speech and write audio to the provided stream.
   * @param {string} text - The text to synthesize.
   * @param {import('stream').Writable} stream - The writable stream to send audio data to.
   * @returns {Promise<void>}
   */
  async speak(text, stream) {
    throw new Error("Method 'speak' must be implemented.");
  }
}
