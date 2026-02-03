import { and, eq, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../server/db';
import {
  auditLogs,
  bots,
  knowledgeSources,
  organizations,
  users,
} from '../../shared/schema';

describe('Bot Persistence - Phase 1 Fixes', () => {
  let testUserId: string;
  let testOrgId: string;

  beforeAll(async () => {
    // Create test user and organization
    testOrgId = uuidv4();
    testUserId = uuidv4();

    await db.insert(organizations).values({
      id: testOrgId,
      name: 'Test Organization',
      slug: `test-org-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(users).values({
      id: testUserId,
      email: `test-${Date.now()}@example.com`,
      name: 'Test User',
      password: 'hashed_password',
      organizationId: testOrgId,
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(bots).where(eq(bots.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  describe('Bot Creation', () => {
    it('should create bot with all required fields', async () => {
      const botData = {
        id: uuidv4(),
        name: 'Test Bot',
        type: 'customer_support',
        systemPrompt: 'You are a helpful assistant',
        model: 'gpt-5o-mini',
        temperature: 0.7,
        knowledgeBase: ['Manual entry 1', 'Manual entry 2'],
        active: true,
        conversationsCount: 0,
        themeColor: '#3B82F6',
        maxMessages: 1000,
        randomizeIdentity: false,
        responseDelay: 500,
        embedType: 'hover',
        leadCapture: {
          enabled: false,
          promptAfter: 3,
          emailRequired: true,
          nameRequired: false,
          phoneRequired: false,
        },
        userId: testUserId,
        organizationId: testOrgId,
        isPublic: true,
        analytics: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Insert bot
      const result = await db.insert(bots).values(botData).returning();

      // VALIDATION: Ensure bot was created
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(botData.id);
      expect(result[0].name).toBe('Test Bot');
      expect(result[0].systemPrompt).toBe('You are a helpful assistant');

      // Fetch bot to verify persistence
      const [fetchedBot] = await db
        .select()
        .from(bots)
        .where(eq(bots.id, botData.id));

      expect(fetchedBot).toBeDefined();
      expect(fetchedBot.name).toBe('Test Bot');
      expect(fetchedBot.knowledgeBase).toEqual([
        'Manual entry 1',
        'Manual entry 2',
      ]);
    });

    it('should fail with clear error if required fields missing', async () => {
      const invalidBotData = {
        id: uuidv4(),
        // Missing name (required)
        systemPrompt: 'Test',
        userId: testUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(async () => {
        await db.insert(bots).values(invalidBotData as any);
      }).rejects.toThrow();
    });

    it('should handle knowledgeBase as JSON array', async () => {
      const botData = {
        id: uuidv4(),
        name: 'JSON Test Bot',
        systemPrompt: 'Test',
        knowledgeBase: ['Entry 1', 'Entry 2', 'https://example.com'],
        userId: testUserId,
        organizationId: testOrgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const [createdBot] = await db.insert(bots).values(botData).returning();

      expect(createdBot.knowledgeBase).toEqual([
        'Entry 1',
        'Entry 2',
        'https://example.com',
      ]);
      expect(Array.isArray(createdBot.knowledgeBase)).toBe(true);
    });

    it('should create audit log in transaction', async () => {
      const botId = uuidv4();
      const auditId = uuidv4();

      // Simulate transactional insert
      await db.transaction(async (tx) => {
        const [createdBot] = await tx
          .insert(bots)
          .values({
            id: botId,
            name: 'Audit Test Bot',
            systemPrompt: 'Test',
            userId: testUserId,
            organizationId: testOrgId,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        // Insert audit log in same transaction
        await tx.insert(auditLogs).values({
          id: auditId,
          userId: testUserId,
          organizationId: testOrgId,
          action: 'create_bot',
          resourceType: 'bot',
          resourceId: createdBot.id,
          newValues: createdBot,
          createdAt: new Date(),
        });
      });

      // Verify both bot and audit log exist
      const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.id, auditId));

      expect(bot).toBeDefined();
      expect(audit).toBeDefined();
      expect(audit.action).toBe('create_bot');
      expect(audit.resourceId).toBe(botId);
    });

    it('should rollback transaction if audit log fails', async () => {
      const botId = uuidv4();

      await expect(async () => {
        await db.transaction(async (tx) => {
          await tx.insert(bots).values({
            id: botId,
            name: 'Rollback Test Bot',
            systemPrompt: 'Test',
            userId: testUserId,
            organizationId: testOrgId,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          // Force error in audit log
          throw new Error('Simulated audit log failure');
        });
      }).rejects.toThrow('Simulated audit log failure');

      // Verify bot was NOT created (transaction rolled back)
      const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
      expect(bot).toBeUndefined();
    });
  });

  describe('Bot Update', () => {
    let existingBotId: string;

    beforeEach(async () => {
      // Create a bot to update
      existingBotId = uuidv4();
      await db.insert(bots).values({
        id: existingBotId,
        name: 'Original Name',
        systemPrompt: 'Original Prompt',
        model: 'gpt-5o-mini',
        temperature: 0.7,
        knowledgeBase: ['Original entry'],
        userId: testUserId,
        organizationId: testOrgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('should update bot fields correctly', async () => {
      const updateData = {
        name: 'Updated Name',
        systemPrompt: 'Updated Prompt',
        temperature: 0.9,
        updatedAt: new Date(),
      };

      const result = await db
        .update(bots)
        .set(updateData)
        .where(eq(bots.id, existingBotId))
        .returning();

      // VALIDATION: Ensure update succeeded
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Updated Name');
      expect(result[0].systemPrompt).toBe('Updated Prompt');
      expect(result[0].temperature).toBe(0.9);

      // Verify persistence
      const [fetchedBot] = await db
        .select()
        .from(bots)
        .where(eq(bots.id, existingBotId));
      expect(fetchedBot.name).toBe('Updated Name');
      expect(fetchedBot.systemPrompt).toBe('Updated Prompt');
    });

    it('should preserve unchanged fields during update', async () => {
      const [originalBot] = await db
        .select()
        .from(bots)
        .where(eq(bots.id, existingBotId));

      // Update only name
      await db
        .update(bots)
        .set({ name: 'New Name', updatedAt: new Date() })
        .where(eq(bots.id, existingBotId));

      const [updatedBot] = await db
        .select()
        .from(bots)
        .where(eq(bots.id, existingBotId));

      expect(updatedBot.name).toBe('New Name');
      expect(updatedBot.systemPrompt).toBe(originalBot.systemPrompt);
      expect(updatedBot.model).toBe(originalBot.model);
      expect(updatedBot.knowledgeBase).toEqual(originalBot.knowledgeBase);
    });

    it('should return empty array if bot not found', async () => {
      const nonExistentId = uuidv4();

      const result = await db
        .update(bots)
        .set({ name: 'Test', updatedAt: new Date() })
        .where(eq(bots.id, nonExistentId))
        .returning();

      expect(result.length).toBe(0);
    });

    it('should create audit log for update', async () => {
      const auditId = uuidv4();

      await db.transaction(async (tx) => {
        const [oldBot] = await tx
          .select()
          .from(bots)
          .where(eq(bots.id, existingBotId));

        const [updatedBot] = await tx
          .update(bots)
          .set({ name: 'Audited Update', updatedAt: new Date() })
          .where(eq(bots.id, existingBotId))
          .returning();

        await tx.insert(auditLogs).values({
          id: auditId,
          userId: testUserId,
          organizationId: testOrgId,
          action: 'update_bot',
          resourceType: 'bot',
          resourceId: existingBotId,
          oldValues: oldBot,
          newValues: updatedBot,
          createdAt: new Date(),
        });
      });

      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.id, auditId));
      expect(audit).toBeDefined();
      expect(audit.action).toBe('update_bot');
      expect((audit.oldValues as any).name).toBe('Original Name');
      expect((audit.newValues as any).name).toBe('Audited Update');
    });
  });

  describe('Bot Retrieval', () => {
    let bot1Id: string;
    let bot2Id: string;

    beforeEach(async () => {
      // Create test bots
      bot1Id = uuidv4();
      bot2Id = uuidv4();

      await db.insert(bots).values([
        {
          id: bot1Id,
          name: 'Active Bot',
          systemPrompt: 'Test',
          userId: testUserId,
          organizationId: testOrgId,
          active: true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: bot2Id,
          name: 'Deleted Bot',
          systemPrompt: 'Test',
          userId: testUserId,
          organizationId: testOrgId,
          active: true,
          deletedAt: new Date(), // Soft deleted
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    });

    it('should retrieve bot by ID', async () => {
      const [bot] = await db.select().from(bots).where(eq(bots.id, bot1Id));

      expect(bot).toBeDefined();
      expect(bot.id).toBe(bot1Id);
      expect(bot.name).toBe('Active Bot');
    });

    it('should exclude soft-deleted bots', async () => {
      const activeBots = await db
        .select()
        .from(bots)
        .where(and(eq(bots.userId, testUserId), isNull(bots.deletedAt)));

      expect(activeBots.length).toBe(1);
      expect(activeBots[0].id).toBe(bot1Id);
    });

    it('should retrieve bots by organization', async () => {
      const orgBots = await db
        .select()
        .from(bots)
        .where(and(eq(bots.organizationId, testOrgId), isNull(bots.deletedAt)));

      expect(orgBots.length).toBeGreaterThanOrEqual(1);
      expect(orgBots.some((b) => b.id === bot1Id)).toBe(true);
    });
  });

  describe('Multi-Tenancy Isolation', () => {
    let otherUserId: string;
    let otherOrgId: string;
    let org1BotId: string;
    let org2BotId: string;

    beforeAll(async () => {
      // Create second organization
      otherOrgId = uuidv4();
      otherUserId = uuidv4();

      await db.insert(organizations).values({
        id: otherOrgId,
        name: 'Other Organization',
        slug: `other-org-${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(users).values({
        id: otherUserId,
        email: `other-${Date.now()}@example.com`,
        name: 'Other User',
        password: 'hashed_password',
        organizationId: otherOrgId,
        createdAt: new Date(),
      });

      // Create bots in different orgs
      org1BotId = uuidv4();
      org2BotId = uuidv4();

      await db.insert(bots).values([
        {
          id: org1BotId,
          name: 'Org 1 Bot',
          systemPrompt: 'Test',
          userId: testUserId,
          organizationId: testOrgId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: org2BotId,
          name: 'Org 2 Bot',
          systemPrompt: 'Test',
          userId: otherUserId,
          organizationId: otherOrgId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    });

    afterAll(async () => {
      await db.delete(bots).where(eq(bots.organizationId, otherOrgId));
      await db.delete(users).where(eq(users.id, otherUserId));
      await db.delete(organizations).where(eq(organizations.id, otherOrgId));
    });

    it('should only retrieve bots from same organization', async () => {
      const org1Bots = await db
        .select()
        .from(bots)
        .where(eq(bots.organizationId, testOrgId));

      const org2Bots = await db
        .select()
        .from(bots)
        .where(eq(bots.organizationId, otherOrgId));

      expect(org1Bots.some((b) => b.id === org2BotId)).toBe(false);
      expect(org2Bots.some((b) => b.id === org1BotId)).toBe(false);
    });

    it('should prevent cross-organization updates', async () => {
      // Attempt to update org2 bot as org1 user (should fail via access control)
      const result = await db
        .update(bots)
        .set({ name: 'Hacked Name', updatedAt: new Date() })
        .where(
          and(
            eq(bots.id, org2BotId),
            eq(bots.organizationId, testOrgId), // Wrong org filter
          ),
        )
        .returning();

      expect(result.length).toBe(0);

      // Verify bot was not updated
      const [bot] = await db.select().from(bots).where(eq(bots.id, org2BotId));
      expect(bot.name).toBe('Org 2 Bot');
    });
  });
});
