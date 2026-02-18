export class STTProvider {
  /**
   * Initialize a streaming STT connection.
   * @param {Object} options - Provider-specific options.
   * @returns {Object} A streaming connection object.
   */
  startStream(options) {
    throw new Error("Method 'startStream' must be implemented.");
  }
}
