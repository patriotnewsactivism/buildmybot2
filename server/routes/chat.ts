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
import { chatService } from '../services/ChatService';
import { KnowledgeService } from '../services/KnowledgeService';

const router = Router();
const isDevelopment = process.env.NODE_ENV !== 'production';

const apiAuthStack = [
  authenticate,
  applyImpersonation,
  loadOrganizationContext,
  tenantIsolation,
];

const botChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDevelopment ? 120 : 60,
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
  sessionId?: string;
}

async function handleChatCompletion(req: Request, res: Response) {
  try {
    const {
      messages,
      systemPrompt,
      model = 'gpt-5o-mini',
      context,
      botId,
      sessionId,
    } = req.body as ChatRequest;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    let finalSystemPrompt = systemPrompt || '';
    let finalContext = context || '';
    let finalModel = model;
    let temperature = 0.7;
    let currentBot: any = null;

    if (botId) {
      const [bot] = await db
        .select()
        .from(bots)
        .where(eq(bots.id, botId))
        .limit(1);

      if (bot) {
        currentBot = bot;
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

    let response;
    try {
      response = await openai.chat.completions.create({
        model: finalModel,
        messages: openAIMessages,
        temperature,
        max_tokens: 500,
      });
    } catch (error: any) {
      const isModelNotFound =
        error?.code === 'model_not_found' ||
        error?.status === 404 ||
        (error?.status === 400 &&
          String(error?.message || '').toLowerCase().includes('model'));
      if (finalModel === 'gpt-5o-mini' && isModelNotFound) {
        finalModel = 'gpt-4o-mini';
        response = await openai.chat.completions.create({
          model: finalModel,
          messages: openAIMessages,
          temperature,
          max_tokens: 500,
        });
      } else {
        throw error;
      }
    }

    const responseText = response.choices[0]?.message?.content || '';

    // Save conversation and analyze sentiment
    if (sessionId && botId && currentBot) {
      const updatedMessages = [
        ...messages,
        { role: 'model', text: responseText },
      ];
      const user = (req as any).user;

      await chatService.saveConversation(
        sessionId,
        botId,
        updatedMessages,
        user?.id,
        user?.organizationId || currentBot.organizationId,
      );

      const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
      if (lastUserMessage) {
        chatService.updateSentiment(sessionId, lastUserMessage.text);
      }
    }

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
      const { messages, model, sessionId } = req.body as ChatRequest;

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

      let useModel = model || bot.model || 'gpt-5o-mini';
      let baseSystemPrompt = bot.systemPrompt || 'You are a helpful assistant.';

      // Phase 5: A/B Testing Logic
      if (bot.abTestConfig && (bot.abTestConfig as any).enabled && Array.isArray((bot.abTestConfig as any).variants)) {
        const variants = (bot.abTestConfig as any).variants;
        const totalWeight = variants.reduce((sum: number, v: any) => sum + (v.weight || 0), 0);
        let random = Math.random() * totalWeight;
        
        for (const variant of variants) {
          random -= (variant.weight || 0);
          if (random <= 0) {
            if (variant.systemPrompt) baseSystemPrompt = variant.systemPrompt;
            if (variant.model) useModel = variant.model;
            break;
          }
        }
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

      let response;
      try {
        response = await openai.chat.completions.create({
          model: useModel,
          messages: openAIMessages,
          temperature: bot.temperature || 0.7,
          max_tokens: 500,
        });
      } catch (error: any) {
        const isModelNotFound =
          error?.code === 'model_not_found' ||
          error?.status === 404 ||
          (error?.status === 400 &&
            String(error?.message || '').toLowerCase().includes('model'));
        if (useModel === 'gpt-5o-mini' && isModelNotFound) {
          useModel = 'gpt-4o-mini';
          response = await openai.chat.completions.create({
            model: useModel,
            messages: openAIMessages,
            temperature: bot.temperature || 0.7,
            max_tokens: 500,
          });
        } else {
          throw error;
        }
      }

      const responseText = response.choices[0]?.message?.content || '';

      // Save conversation and analyze sentiment
      if (sessionId) {
        const updatedMessages = [
          ...messages,
          { role: 'model', text: responseText },
        ];
        // For public bot chat, we might not have a logged-in user, so userId/orgId might be null
        // However, we should attribute it to the bot's organization
        await chatService.saveConversation(
          sessionId,
          botId,
          updatedMessages,
          undefined, // userId (anonymous)
          bot.organizationId || undefined,
        );

        if (userQuery) {
          chatService.updateSentiment(sessionId, userQuery);
        }
      }

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
