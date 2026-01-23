import { getTTSProvider } from '../src/services/tts/index.js';
import { Writable } from 'stream';

// Mock environment variables for this test
process.env.TTS_PROVIDER = 'mock-primary';
process.env.SHADOW_TTS_PROVIDER = 'mock-shadow';

const tts = getTTSProvider();

console.log("--- Starting Shadow Mode Verification ---");

// Simple stream to capture output
const outputStream = new Writable({
  write(chunk, encoding, callback) {
    console.log(`[Client Received]: ${chunk.toString()}`);
    callback();
  }
});

async function runTest() {
  try {
    console.log("1. Calling tts.speak()...");
    const start = Date.now();
    
    // This await should only wait for the Primary provider (50ms), not the Shadow (200ms)
    await tts.speak("Hello Shadow Mode", outputStream);
    
    const elapsed = Date.now() - start;
    console.log(`2. speak() returned in ${elapsed}ms (Expected ~50ms)`);
    
    // Wait a bit to let the background shadow process finish logging
    await new Promise(r => setTimeout(r, 300));
    console.log("--- Test Complete ---");
    
  } catch (err) {
    console.error("Test Failed:", err);
  }
}

runTest();
