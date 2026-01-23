import { TTSProvider } from './TTSProvider.js';

export class MockTTS extends TTSProvider {
  constructor(name = 'Mock', latency = 100) {
    super();
    this.name = name;
    this.latency = latency;
  }

  async speak(text, stream) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, this.latency));
    
    // Simulate writing audio data
    stream.write(`[${this.name}] Audio data for: "${text}"`);
  }
}
