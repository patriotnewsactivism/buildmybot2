import { and, eq, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { type Bot, type InsertBot, bots } from '../../shared/schema';
import { db } from '../db';
import { AuditService } from './AuditService';

export class BotService {
  private auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  async createBot(
    botData: Partial<InsertBot>,
    userId: string,
    organizationId?: string,
  ): Promise<Bot> {
    const newBot = await db
      .insert(bots)
      .values({
        id: uuidv4(),
        ...botData,
        userId,
        organizationId,
        createdAt: new Date(),
      } as InsertBot)
      .returning();

    await this.auditService.log({
      userId,
      organizationId,
      action: 'bot.created',
      resourceType: 'bot',
      resourceId: newBot[0].id,
      newValues: newBot[0],
    });

    return newBot[0];
  }

  async getBotsByOrganization(organizationId: string): Promise<Bot[]> {
    return db
      .select()
      .from(bots)
      .where(
        and(eq(bots.organizationId, organizationId), isNull(bots.deletedAt)),
      );
  }

  async getBotsByUser(userId: string): Promise<Bot[]> {
    return db
      .select()
      .from(bots)
      .where(and(eq(bots.userId, userId), isNull(bots.deletedAt)));
  }

  async getBot(botId: string): Promise<Bot | undefined> {
    const [bot] = await db
      .select()
      .from(bots)
      .where(and(eq(bots.id, botId), isNull(bots.deletedAt)));
    return bot;
  }

  async updateBot(
    botId: string,
    updates: Partial<Bot>,
    userId: string,
    organizationId?: string,
  ): Promise<Bot> {
    const [oldBot] = await db.select().from(bots).where(eq(bots.id, botId));

    const [updatedBot] = await db
      .update(bots)
      .set(updates)
      .where(eq(bots.id, botId))
      .returning();

    await this.auditService.log({
      userId,
      organizationId,
      action: 'bot.updated',
      resourceType: 'bot',
      resourceId: botId,
      oldValues: oldBot,
      newValues: updatedBot,
    });

    return updatedBot;
  }

  async deleteBot(
    botId: string,
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    await db
      .update(bots)
      .set({ deletedAt: new Date() })
      .where(eq(bots.id, botId));

    await this.auditService.log({
      userId,
      organizationId,
      action: 'bot.deleted',
      resourceType: 'bot',
      resourceId: botId,
    });
  }

  async restoreBot(
    botId: string,
    userId: string,
    organizationId?: string,
  ): Promise<Bot> {
    const [restoredBot] = await db
      .update(bots)
      .set({ deletedAt: null })
      .where(eq(bots.id, botId))
      .returning();

    await this.auditService.log({
      userId,
      organizationId,
      action: 'bot.restored',
      resourceType: 'bot',
      resourceId: botId,
      newValues: restoredBot,
    });

    return restoredBot;
  }
}
