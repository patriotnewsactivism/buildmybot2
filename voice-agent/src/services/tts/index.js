export { TTSProvider } from './TTSProvider.js';
export { CartesiaTTS } from './CartesiaTTS.js';
export { ElevenLabsTTS } from './ElevenLabsTTS.js';
export { ShadowTTS } from './ShadowTTS.js';

import { CartesiaTTS } from './CartesiaTTS.js';
import { ElevenLabsTTS } from './ElevenLabsTTS.js';
import { MockTTS } from './MockTTS.js';
import { ShadowTTS } from './ShadowTTS.js';

function createProvider(name) {
  switch (name) {
    case 'cartesia':
      return new CartesiaTTS(process.env.CARTESIA_API_KEY);
    case 'elevenlabs':
      return new ElevenLabsTTS(process.env.ELEVENLABS_API_KEY);
    case 'mock-primary':
      return new MockTTS('MockPrimary', 50); // Fast
    case 'mock-shadow':
      return new MockTTS('MockShadow', 200); // Slower
    default:
      throw new Error(`Unknown TTS Provider: ${name}`);
  }
}

// Factory to get the configured provider
export function getTTSProvider(context = {}) {
  // Tiered Rollout Logic: Standard (Cartesia) vs Premium (ElevenLabs)
  let primaryName = context.preferredProvider || process.env.TTS_PROVIDER || 'cartesia';

  if (context.tier === 'premium') {
    primaryName = 'elevenlabs';
  } else if (context.tier === 'standard') {
    primaryName = 'cartesia';
  }

  const shadowName = process.env.SHADOW_TTS_PROVIDER;
  const primary = createProvider(primaryName);

  if (shadowName && shadowName !== primaryName) {
    // We only shadow if not explicitly overriding for a single request,
    // though arguably we might want to shadow 'premium' users too.
    // For now, simple logic:
    console.log(
      `Initializing TTS with Shadow Mode: Primary=${primaryName}, Shadow=${shadowName}`,
    );
    const shadow = createProvider(shadowName);
    return new ShadowTTS(primary, shadow);
  }

  return primary;
}
