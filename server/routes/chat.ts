import { eq } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';
import { bots } from '../../shared/schema';
import { db } from '../db';
import { env } from '../env';
import {
  applyImpersonation,
  authenticate,
  loadOrganizationContext,
  strictLimiter,
  tenantIsolation,
} from '../middleware';
import { KnowledgeService } from '../services/KnowledgeService';

const router = Router();

const apiAuthStack = [
  authenticate,
  applyImpersonation,
  loadOrganizationContext,
  tenantIsolation,
];

const botChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL:
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
  model?: string;
  context?: string;
  botId?: string;
}

async function handleChatCompletion(req: Request, res: Response) {
  try {
    const {
      messages,
      systemPrompt,
      model = 'gpt-4o-mini',
      context,
      botId,
    } = req.body as ChatRequest;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    let finalSystemPrompt = systemPrompt || '';
    let finalContext = context || '';
    let finalModel = model;
    let temperature = 0.7;

    if (botId) {
      const [bot] = await db
        .select()
        .from(bots)
        .where(eq(bots.id, botId))
        .limit(1);

      if (bot) {
        const user = (req as any).user;
        if (
          bot.userId === user?.id ||
          bot.organizationId === user?.organizationId
        ) {
          finalSystemPrompt =
            bot.systemPrompt || 'You are a helpful assistant.';
          finalModel = bot.model || model;
          temperature = bot.temperature || 0.7;

          const lastUserMessage = messages
            .filter((m) => m.role === 'user')
            .pop();
          const userQuery = lastUserMessage?.text || '';

          if (userQuery) {
            const ragContext = await KnowledgeService.buildContext(
              botId,
              userQuery,
              4000,
            );
            if (ragContext) {
              finalContext = ragContext;
            }
          }
        }
      }
    }

    const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (finalSystemPrompt) {
      let systemContent = finalSystemPrompt;
      if (finalContext) {
        systemContent += `\n\n### KNOWLEDGE BASE (Use this to answer):\n${finalContext}\n\n### INSTRUCTIONS:\nAnswer strictly based on the provided Knowledge Base. If the answer is not in the text, state that you do not have that information.`;
      }
      openAIMessages.push({ role: 'system', content: systemContent });
    }

    messages.forEach((msg) => {
      openAIMessages.push({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.text,
      });
    });

    const response = await openai.chat.completions.create({
      model: finalModel,
      messages: openAIMessages,
      temperature,
      max_tokens: 500,
    });

    const responseText = response.choices[0]?.message?.content || '';

    res.json({ response: responseText });
  } catch (error: any) {
    console.error('Chat API Error:', error);

    if (error?.status === 429 || error?.code === 'rate_limit_exceeded') {
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment and try again.',
      });
    }
    if (error?.status === 401 || error?.code === 'invalid_api_key') {
      return res.status(401).json({ error: 'AI service configuration error.' });
    }
    if (error?.code === 'insufficient_quota') {
      return res.status(402).json({ error: 'AI service quota exceeded.' });
    }

    res.status(500).json({ error: 'Failed to process chat request' });
  }
}

router.post('/', ...apiAuthStack, handleChatCompletion);

router.post('/demo', strictLimiter, handleChatCompletion);

router.post(
  '/bot/:botId',
  botChatLimiter,
  async (req: Request, res: Response) => {
    try {
      const { botId } = req.params;
      const { messages, model } = req.body as ChatRequest;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages array is required' });
      }

      const [bot] = await db
        .select()
        .from(bots)
        .where(eq(bots.id, botId))
        .limit(1);

      if (!bot) {
        return res.status(404).json({ error: 'Bot not found' });
      }

      if (!bot.isPublic) {
        return res.status(403).json({ error: 'Bot is not available' });
      }

      if (!bot.active) {
        return res.status(403).json({ error: 'Bot is currently inactive' });
      }

      const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
      const userQuery = lastUserMessage?.text || '';

      let ragContext = '';
      if (userQuery) {
        ragContext = await KnowledgeService.buildContext(
          botId,
          userQuery,
          4000,
        );
      }

      const baseSystemPrompt =
        bot.systemPrompt || 'You are a helpful assistant.';
      let systemContent = baseSystemPrompt;

      if (ragContext) {
        systemContent += `\n\n---\n\nIMPORTANT: Use the following knowledge base information to answer questions accurately. Always prioritize this information over general knowledge:\n\n${ragContext}\n\n---\n\nWhen answering:\n1. Base your responses on the knowledge provided above\n2. If the information isn't in the knowledge base, say so honestly\n3. Cite the source when possible (e.g., "According to the documentation...")`;
      }

      const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      openAIMessages.push({ role: 'system', content: systemContent });

      messages.forEach((msg) => {
        openAIMessages.push({
          role: msg.role === 'model' ? 'assistant' : 'user',
          content: msg.text,
        });
      });

      const useModel = model || bot.model || 'gpt-4o-mini';

      const response = await openai.chat.completions.create({
        model: useModel,
        messages: openAIMessages,
        temperature: bot.temperature || 0.7,
        max_tokens: 500,
      });

      const responseText = response.choices[0]?.message?.content || '';

      res.json({
        response: responseText,
        hasKnowledge: !!ragContext,
      });
    } catch (error: any) {
      console.error('Bot Chat API Error:', error);

      if (error?.status === 429 || error?.code === 'rate_limit_exceeded') {
        return res.status(429).json({
          error: 'Too many requests. Please wait a moment and try again.',
        });
      }
      if (error?.status === 401 || error?.code === 'invalid_api_key') {
        return res
          .status(401)
          .json({ error: 'AI service configuration error.' });
      }
      if (error?.code === 'insufficient_quota') {
        return res.status(402).json({ error: 'AI service quota exceeded.' });
      }

      res.status(500).json({ error: 'Failed to process chat request' });
    }
  },
);

export default router;
