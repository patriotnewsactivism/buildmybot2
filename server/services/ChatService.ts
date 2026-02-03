import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { conversations } from '../../shared/schema';
import { db } from '../db';
import { openAIService } from './OpenAIService';

export class ChatService {
  async saveConversation(
    sessionId: string,
    botId: string,
    messages: any[],
    userId?: string,
    organizationId?: string,
  ) {
    // Check if conversation exists for this session
    const [existing] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.sessionId, sessionId));

    if (existing) {
      // Update existing conversation
      await db
        .update(conversations)
        .set({
          messages,
          timestamp: new Date(), // Update timestamp to now
          // Update userId/orgId if they were null and now provided (e.g. user logged in)
          userId: userId || existing.userId,
          organizationId: organizationId || existing.organizationId,
        })
        .where(eq(conversations.id, existing.id));

      return existing.id;
    }
    // Create new conversation
    const id = uuidv4();
    await db.insert(conversations).values({
      id,
      sessionId,
      botId,
      messages,
      userId: userId || null,
      organizationId: organizationId || null,
      timestamp: new Date(),
      sentiment: 'Neutral', // Default
    });

    return id;
  }

  async updateSentiment(sessionId: string, text: string) {
    if (!text) return;

    // Run in background (fire and forget from caller perspective, but await inside)
    try {
      const sentiment = await openAIService.analyzeSentiment(text);

      await db
        .update(conversations)
        .set({ sentiment })
        .where(eq(conversations.sessionId, sessionId));
    } catch (error) {
      console.error('Failed to update sentiment:', error);
    }
  }
}

export const chatService = new ChatService();
