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
import { toolExecutionService } from '../services/ToolExecutionService';
import { agencyBillingService } from '../services/AgencyBillingService';
import { AnalyticsService } from '../services/AnalyticsService';

const router = Router();
const analyticsService = new AnalyticsService();
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
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL:
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1',
=======
  apiKey: env.AI_INTEGRATIONS_OPENAI_API_KEY || env.OPENAI_API_KEY,
  baseURL: env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1',
>>>>>>> Stashed changes
=======
  apiKey: env.AI_INTEGRATIONS_OPENAI_API_KEY || env.OPENAI_API_KEY,
  baseURL: env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1',
>>>>>>> Stashed changes
=======
  apiKey: env.AI_INTEGRATIONS_OPENAI_API_KEY || env.OPENAI_API_KEY,
  baseURL: env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1',
>>>>>>> Stashed changes
=======
  apiKey: env.AI_INTEGRATIONS_OPENAI_API_KEY || env.OPENAI_API_KEY,
  baseURL: env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1',
>>>>>>> Stashed changes
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
            // Track user message
            analyticsService.trackEvent({
              organizationId: user?.organizationId || currentBot?.organizationId,
              botId: botId,
              userId: user?.id,
              eventType: 'chat_message',
              eventData: { role: 'user', length: userQuery.length, sessionId },
              sessionId
            }).catch(e => console.error('Analytics error:', e));

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

    // Get available tools for function calling
    let tools: any[] = [];
    let toolsMap: Map<string, any> = new Map();
    if (botId && currentBot) {
      try {
        const availableTools = await toolExecutionService.getAvailableTools(botId);
        tools = availableTools.map((t: any) => {
          toolsMap.set(t.function.name, {
            id: t._toolId,
            requiresApproval: t._requiresApproval,
          });
          return {
            type: 'function',
            function: {
              name: t.function.name,
              description: t.function.description,
              parameters: t.function.parameters,
            },
          };
        });
      } catch (err) {
        console.error('Error fetching tools:', err);
      }
    }

    let response;
    let responseText = '';
    let functionCallAttempts = 0;
    const maxFunctionCalls = 5; // Prevent infinite loops

    // Function calling loop
    while (functionCallAttempts < maxFunctionCalls) {
      try {
        const completionParams: any = {
          model: finalModel,
          messages: openAIMessages,
          temperature,
          max_tokens: 500,
        };

        // Add tools if available
        if (tools.length > 0) {
          completionParams.tools = tools;
          completionParams.tool_choice = 'auto';
        }

        response = await openai.chat.completions.create(completionParams);
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
            ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
          });
        } else {
          throw error;
        }
      }

      const choice = response.choices[0];
      const message = choice?.message;

      // Check if function call was requested
      if (message?.tool_calls && message.tool_calls.length > 0) {
        functionCallAttempts++;

        // Add assistant message with tool calls
        openAIMessages.push(message as any);

        // Execute each tool call
        for (const toolCall of message.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments || '{}');
          const toolInfo = toolsMap.get(functionName);

          let toolResult: any;
          try {
            if (toolInfo) {
              // Execute the tool
              const executionResult = await toolExecutionService.executeTool(
                toolInfo.id,
                functionArgs,
                {
                  botId: botId!,
                  conversationId: sessionId || 'unknown',
                  userId: (req as any).user?.id,
                }
              );

              if (executionResult.success) {
                toolResult = {
                  success: true,
                  data: executionResult.data,
                };

                                  // Track tool usage

                                  analyticsService.trackEvent({

                                    organizationId: (req as any).user?.organizationId || currentBot?.organizationId,

                                    botId: botId,

                                    userId: (req as any).user?.id,

                                    eventType: 'tool_usage',

                                    eventData: { toolName: functionName, success: true, sessionId },

                                    sessionId

                                  }).catch(e => console.error('Analytics error:', e));

                

                                  // Record usage for agency billing

                                  if (currentBot.organizationId) {

                                    try {

                                      await agencyBillingService.recordUsageEvent({

                
                      eventType: 'tool_execution',
                      quantity: 1,
                      agencyOrganizationId: currentBot.organizationId,
                      clientOrganizationId: (req as any).user?.organizationId,
                    });
                  } catch (billingErr) {
                    console.error('Billing record error:', billingErr);
                  }
                }
              } else {
                toolResult = {
                  success: false,
                  error: executionResult.error || 'Tool execution failed',
                };
              }
            } else {
              toolResult = {
                success: false,
                error: 'Tool not found',
              };
            }
          } catch (error: any) {
            toolResult = {
              success: false,
              error: error.message || 'Tool execution error',
            };
          }

          // Add tool result to messages
          openAIMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          } as any);
        }

        // Continue loop to get next response
        continue;
      }

      // No function call, we have the final response
      responseText = message?.content || '';
      break;
    }

    // If we hit max function calls, use the last response
    if (functionCallAttempts >= maxFunctionCalls && !responseText) {
      responseText =
        'I apologize, but I encountered an issue while processing your request. Please try again.';
    }

    // Save conversation and analyze sentiment
    if (sessionId && botId && currentBot) {
      const updatedMessages = [
        ...messages,
        { role: 'model', text: responseText },
      ];
      const user = (req as any).user;

      // Track bot response
      analyticsService.trackEvent({
        organizationId: user?.organizationId || currentBot?.organizationId,
        botId: botId,
        userId: user?.id,
        eventType: 'chat_message',
        eventData: { role: 'bot', length: responseText.length, sessionId },
        sessionId
      }).catch(e => console.error('Analytics error:', e));

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

      if (userQuery) {
        analyticsService.trackEvent({
          organizationId: bot.organizationId,
          botId: botId,
          userId: undefined,
          eventType: 'chat_message',
          eventData: { role: 'user', length: userQuery.length, sessionId },
          sessionId: sessionId || 'unknown'
        }).catch(e => console.error('Analytics error:', e));
      }

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

      // Get available tools for function calling
      let tools: any[] = [];
      let toolsMap: Map<string, any> = new Map();
      try {
        const availableTools = await toolExecutionService.getAvailableTools(botId);
        tools = availableTools.map((t: any) => {
          toolsMap.set(t.function.name, {
            id: t._toolId,
            requiresApproval: t._requiresApproval,
          });
          return {
            type: 'function',
            function: {
              name: t.function.name,
              description: t.function.description,
              parameters: t.function.parameters,
            },
          };
        });
      } catch (err) {
        console.error('Error fetching tools:', err);
      }

      let response;
      let responseText = '';
      let functionCallAttempts = 0;
      const maxFunctionCalls = 5;

      // Function calling loop
      while (functionCallAttempts < maxFunctionCalls) {
        try {
          const completionParams: any = {
            model: useModel,
            messages: openAIMessages,
            temperature: bot.temperature || 0.7,
            max_tokens: 500,
          };

          if (tools.length > 0) {
            completionParams.tools = tools;
            completionParams.tool_choice = 'auto';
          }

          response = await openai.chat.completions.create(completionParams);
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
              ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
            });
          } else {
            throw error;
          }
        }

        const choice = response.choices[0];
        const message = choice?.message;

        // Check if function call was requested
        if (message?.tool_calls && message.tool_calls.length > 0) {
          functionCallAttempts++;

          openAIMessages.push(message as any);

          for (const toolCall of message.tool_calls) {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments || '{}');
            const toolInfo = toolsMap.get(functionName);

            let toolResult: any;
            try {
              if (toolInfo) {
                const executionResult = await toolExecutionService.executeTool(
                  toolInfo.id,
                  functionArgs,
                  {
                    botId,
                    conversationId: sessionId || 'public-chat',
                  }
                );

                if (executionResult.success) {
                  toolResult = {
                    success: true,
                    data: executionResult.data,
                  };

                  analyticsService.trackEvent({
                    organizationId: bot.organizationId,
                    botId: botId,
                    userId: undefined,
                    eventType: 'tool_usage',
                    eventData: { toolName: functionName, success: true, sessionId },
                    sessionId: sessionId || 'unknown'
                  }).catch(e => console.error('Analytics error:', e));

                  // Record usage for agency billing (public bot usage)
                  if (bot.organizationId) {
                    try {
                      await agencyBillingService.recordUsageEvent({
                        eventType: 'tool_execution',
                        quantity: 1,
                        agencyOrganizationId: bot.organizationId,
                      });
                    } catch (billingErr) {
                      console.error('Billing record error:', billingErr);
                    }
                  }
                } else {
                  toolResult = {
                    success: false,
                    error: executionResult.error || 'Tool execution failed',
                  };
                }
              } else {
                toolResult = {
                  success: false,
                  error: 'Tool not found',
                };
              }
            } catch (error: any) {
              toolResult = {
                success: false,
                error: error.message || 'Tool execution error',
              };
            }

            openAIMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolResult),
            } as any);
          }

          continue;
        }

        responseText = message?.content || '';
        break;
      }

      if (functionCallAttempts >= maxFunctionCalls && !responseText) {
        responseText =
          'I apologize, but I encountered an issue while processing your request. Please try again.';
      }

      // Save conversation and analyze sentiment
      if (sessionId) {
        analyticsService.trackEvent({
          organizationId: bot.organizationId,
          botId: botId,
          userId: undefined,
          eventType: 'chat_message',
          eventData: { role: 'bot', length: responseText.length, sessionId },
          sessionId
        }).catch(e => console.error('Analytics error:', e));

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
