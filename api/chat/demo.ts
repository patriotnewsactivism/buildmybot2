import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// ─── Self-contained chat demo endpoint for Vercel serverless ───
// This avoids depending on the Render backend (which sleeps on free tier).
// Uses the same AI provider fallback chain: DeepSeek → OpenAI → GitHub Models.

interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKey: string | undefined;
  model: string;
  isAzure?: boolean;
}

function buildProviderChain(): ProviderConfig[] {
  const chain: ProviderConfig[] = [];

  // 1. DeepSeek (cheapest, if configured)
  const deepSeekKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (deepSeekKey.length > 10) {
    chain.push({
      name: 'deepseek',
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: deepSeekKey,
      model: 'deepseek-v4-flash',
    });
  }

  // 2. Primary: OpenAI / Azure AI / custom OpenAI-compatible
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
      model: 'gpt-4o-mini',
    });
  }

  return chain;
}

function createClient(cfg: ProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: cfg.apiKey || 'missing',
    baseURL: cfg.baseURL,
    timeout: 20000, // 20s per-provider
    maxRetries: 0,
    ...(cfg.isAzure
      ? { defaultQuery: { 'api-version': '2024-05-01-preview' } }
      : {}),
  });
}

async function createWithFallback(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  model?: string,
): Promise<string> {
  const providers = buildProviderChain();
  if (providers.length === 0) {
    throw new Error('No AI provider configured');
  }

  let lastError: any = null;

  for (const provider of providers) {
    try {
      const client = createClient(provider);
      const completion = await client.chat.completions.create({
        model: provider.model || model || 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 500,
        stream: false,
      });
      return completion.choices[0]?.message?.content || '';
    } catch (error: any) {
      lastError = error;
      const status = error?.status || error?.statusCode;
      const isQuotaError =
        status === 429 ||
        status === 403 ||
        String(error?.message || '').toLowerCase().includes('quota') ||
        String(error?.message || '').toLowerCase().includes('rate limit');

      if (isQuotaError) {
        console.warn(`[chat-demo] Provider "${provider.name}" hit quota (${status}), trying next...`);
        continue;
      }

      // Model not found — retry with provider's default model
      if (status === 404 || (status === 400 && String(error?.message || '').toLowerCase().includes('model'))) {
        try {
          const client = createClient(provider);
          const completion = await client.chat.completions.create({
            model: provider.model,
            messages,
            temperature: 0.7,
            max_tokens: 500,
            stream: false,
          });
          return completion.choices[0]?.message?.content || '';
        } catch (retryError: any) {
          lastError = retryError;
          if (retryError?.status === 429 || retryError?.status === 403) continue;
        }
      }

      console.error(`[chat-demo] Provider "${provider.name}" error:`, error?.message || error);
    }
  }

  throw lastError || new Error('All AI providers failed');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, systemPrompt, context } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Build OpenAI messages
    const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      let systemContent = systemPrompt;
      if (context) {
        systemContent += `\n\n### KNOWLEDGE BASE (Use this to answer):\n${context}\n\n### INSTRUCTIONS:\nAnswer strictly based on the provided Knowledge Base. If the answer is not in the text, state that you do not have that information.`;
      }
      openAIMessages.push({ role: 'system', content: systemContent });
    }

    messages.forEach((msg: { role: string; text: string }) => {
      openAIMessages.push({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.text,
      });
    });

    const responseText = await createWithFallback(openAIMessages, req.body.model);

    return res.status(200).json({ response: responseText });
  } catch (error: any) {
    console.error('[chat-demo] Fatal error:', error?.message || error);
    return res.status(500).json({
      error: 'Failed to get AI response',
      details: error?.message || 'Unknown error',
    });
  }
}
