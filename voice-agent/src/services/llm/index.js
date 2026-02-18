export { LLMProvider } from './LLMProvider.js';
export { OpenAILLM } from './OpenAILLM.js';

import { OpenAILLM } from './OpenAILLM.js';

function createProvider(name) {
  switch (name) {
    case 'openai':
      return new OpenAILLM(process.env.OPENAI_API_KEY);
    default:
      throw new Error(`Unknown LLM Provider: ${name}`);
  }
}

// Factory to get the configured provider
export function getLLMProvider(context = {}) {
  const primaryName =
    context.preferredProvider || process.env.LLM_PROVIDER || 'openai';
  return createProvider(primaryName);
}
