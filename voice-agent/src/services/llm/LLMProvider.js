export class LLMProvider {
  /**
   * Complete a prompt or chat history.
   * @param {Array} messages - Chat history.
   * @param {Object} options - Provider-specific options (e.g., model, temperature).
   * @returns {Promise<string>} Completion response text.
   */
  async complete(messages, options) {
    throw new Error("Method 'complete' must be implemented.");
  }

  /**
   * Generate a streaming completion.
   * @param {Array} messages - Chat history.
   * @param {Object} options - Provider-specific options.
   * @returns {AsyncIterable<string>} Streaming text chunks.
   */
  async *streamComplete(messages, options) {
    throw new Error("Method 'streamComplete' must be implemented.");
  }
}
