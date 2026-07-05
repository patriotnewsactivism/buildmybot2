import OpenAI from 'openai';

// ─── Shared AI Provider Fallback Chain ──────────────────────
// Used by both OpenAIService and chat routes to ensure AI calls
// automatically fall back to GitHub Models (free) when the primary
// provider hits quota/rate limit errors.

export interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKey: string | undefined;
  model: string;
  isAzure?: boolean;
}

export function buildProviderChain(): ProviderConfig[] {
  const chain: ProviderConfig[] = [];

  // 1. DeepSeek (if configured) — cheapest option
  const deepSeekKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (deepSeekKey.length > 10) {
    chain.push({
      name: 'deepseek',
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: deepSeekKey,
      model: 'deepseek-v4-flash',
    });
  }

  // 2. Primary: OpenAI / Azure AI / Google (via OpenAI-compat) / custom
  const primaryBaseURL =
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const primaryKey =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY;
  if (primaryKey) {
    chain.push({
      name: 'primary',
      baseURL: primaryBaseURL,
      apiKey: primaryKey,
      model: process.env.DEFAULT_AI_MODEL || 'gpt-4o-mini',
      isAzure: primaryBaseURL.includes('.services.ai.azure.com'),
    });
  }

  // 3. Fallback: GitHub Models (free, uses GitHub token)
  const githubToken =
    process.env.GITHUB_TOKEN ||
    process.env.GITHUB_ACCESS_TOKEN ||
    process.env.AI_INTEGRATIONS_GITHUB_TOKEN;
  if (githubToken) {
    chain.push({
      name: 'github_models',
      baseURL: 'https://models.inference.ai.azure.com',
      apiKey: githubToken,
      model: 'gpt-4o-mini', // 15 RPM free tier
    });
  }

  if (chain.length === 0) {
    console.warn(
      '[ai-fallback] No AI provider configured. Set OPENAI_API_KEY, DEEPSEEK_API_KEY, or GITHUB_TOKEN.',
    );
  }

  return chain;
}

export function createOpenAIClient(cfg: ProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: cfg.apiKey || 'missing',
    baseURL: cfg.baseURL,
    ...(cfg.isAzure
      ? { defaultQuery: { 'api-version': '2024-05-01-preview' } }
      : {}),
  });
}

/**
 * Try an AI completion across the full provider chain.
 * Automatically falls back to the next provider on 429/403/quota errors.
 */
export async function createWithFallback(
  params: OpenAI.Chat.ChatCompletionCreateParams,
  chain?: ProviderConfig[],
): Promise<OpenAI.Chat.ChatCompletion> {
  const providers = chain || buildProviderChain();
  let lastError: any = null;

  for (const provider of providers) {
    try {
      const client = createOpenAIClient(provider);
      const model = provider.model || params.model || 'gpt-4o-mini';
      return await client.chat.completions.create({ ...params, model, stream: false });
    } catch (error: any) {
      lastError = error;
      const status = error?.status || error?.statusCode;
      const isQuotaError =
        status === 429 ||
        status === 403 ||
        String(error?.message || '').toLowerCase().includes('quota') ||
        String(error?.message || '').toLowerCase().includes('rate limit');

      if (isQuotaError) {
        console.warn(
          `[ai-fallback] Provider "${provider.name}" failed (${status}), trying next...`,
        );
        continue;
      }

      // Model not found — retry with default model on same provider
      const isModelNotFound =
        error?.code === 'model_not_found' ||
        status === 404 ||
        (status === 400 &&
          String(error?.message || '').toLowerCase().includes('model'));

      if (isModelNotFound && params.model !== provider.model) {
        try {
          const client = createOpenAIClient(provider);
          return await client.chat.completions.create({
            ...params,
            model: provider.model,
            stream: false,
          }) as OpenAI.Chat.ChatCompletion;
        } catch (retryError: any) {
          lastError = retryError;
          if (retryError?.status === 429 || retryError?.status === 403) {
            continue;
          }
        }
      }

      // Non-recoverable — try next provider
      console.error(
        `[ai-fallback] Provider "${provider.name}" error:`,
        error?.message || error,
      );
    }
  }

  throw lastError || new Error('No AI provider available');
}
