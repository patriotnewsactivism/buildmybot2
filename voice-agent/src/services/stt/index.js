export { STTProvider } from './STTProvider.js';
export { DeepgramSTT } from './DeepgramSTT.js';

import { DeepgramSTT } from './DeepgramSTT.js';

function createProvider(name) {
  switch (name) {
    case 'deepgram':
      return new DeepgramSTT(process.env.DEEPGRAM_API_KEY);
    default:
      throw new Error(`Unknown STT Provider: ${name}`);
  }
}

// Factory to get the configured provider
export function getSTTProvider(context = {}) {
  const primaryName =
    context.preferredProvider || process.env.STT_PROVIDER || 'deepgram';
  return createProvider(primaryName);
}
