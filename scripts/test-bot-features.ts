import fs from 'fs';
import path from 'path';

// Manually load .env since dotenv package might be missing
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = value;
    }
  });
}

import { db, pool } from '../server/db';
import { BotService } from '../server/services/BotService';
import { KnowledgeService } from '../server/services/KnowledgeService';
import { UserService } from '../server/services/UserService';
import { users, bots, knowledgeChunks, knowledgeSources, auditLogs } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function runTest() {
  console.log('Starting Bot Features Test...');

  const userService = new UserService();
  const botService = new BotService();
  
  let testUser;
  let testBot;
  let testSourceId = 'test-source-manual';

  try {
    // 1. Create Test User
    console.log('Creating test user...');
    testUser = await userService.createUser({
      name: 'Test User',
      email: `test-${Date.now()}@example.com`,
      role: 'CLIENT',
      plan: 'FREE',
    });
    console.log('Test user created:', testUser.id);

    // 2. Test Voice Agent Config (User Phone Config)
    console.log('Testing Voice Agent Configuration...');
    const phoneConfig = {
      enabled: true,
      voiceId: 'voice-123',
      introMessage: 'Hello from voice agent',
      cartesiaApiKey: 'test-key-123',
    };
    
    await userService.updateUser(testUser.id, { phoneConfig }, testUser.id);
    const updatedUser = await userService.getUser(testUser.id);
    
    if (updatedUser?.phoneConfig?.cartesiaApiKey === 'test-key-123') {
      console.log('✅ Voice Agent Config saved successfully.');
    } else {
      console.error('❌ Voice Agent Config failed to save.');
      throw new Error('Voice Agent Config verification failed');
    }

    // 3. Create Test Bot with Manual Knowledge
    console.log('Creating test bot with manual knowledge...');
    testBot = await botService.createBot({
      name: 'Test Bot',
      type: 'customer_support',
      knowledgeBase: ['BuildMyBot is the best platform.', 'We offer 24/7 support.'],
    }, testUser.id);
    console.log('Test bot created:', testBot.id);

    // 4. Test Knowledge Base Search (Manual Entries)
    console.log('Testing Knowledge Base Search (Manual)...');
    const searchResults = await KnowledgeService.searchKnowledge(testBot.id, 'platform');
    
    // We expect the manual entry "BuildMyBot is the best platform." to be found
    const manualMatch = searchResults.find(r => r.content.includes('BuildMyBot is the best platform'));
    
    if (manualMatch) {
      console.log('✅ Manual knowledge entry found in search.');
    } else {
      console.error('❌ Manual knowledge entry NOT found.');
      console.log('Search results:', JSON.stringify(searchResults, null, 2));
      throw new Error('Manual knowledge search failed');
    }

    // 5. Test Knowledge Base (DB Chunks - Simulation)
    console.log('Testing Knowledge Base Search (DB Chunks)...');
    
    // Create a dummy source first
    await db.insert(knowledgeSources).values({
      id: testSourceId,
      botId: testBot.id,
      sourceType: 'manual',
      sourceName: 'Test Source',
      status: 'completed'
    });

    await db.insert(knowledgeChunks).values({
      id: 'test-chunk-1',
      botId: testBot.id,
      content: 'The sky is blue and the grass is green.',
      sourceId: testSourceId,
      tokenCount: 10,
      chunkIndex: 0,
      metadata: { title: 'Nature Facts' }
    });

    const chunkResults = await KnowledgeService.searchKnowledge(testBot.id, 'sky');
    const chunkMatch = chunkResults.find(r => r.content.includes('The sky is blue'));

    if (chunkMatch) {
        console.log('✅ DB Chunk knowledge entry found in search.');
    } else {
        console.error('❌ DB Chunk knowledge entry NOT found.');
        throw new Error('DB Chunk knowledge search failed');
    }

    console.log('All tests passed successfully! 🎉');

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('Cleaning up...');
    try {
        if (testBot) {
            await db.delete(knowledgeChunks).where(eq(knowledgeChunks.botId, testBot.id));
            await db.delete(knowledgeSources).where(eq(knowledgeSources.botId, testBot.id));
            await db.delete(bots).where(eq(bots.id, testBot.id));
        }
        if (testUser) {
            // Delete audit logs first to satisfy FK constraint
            await db.delete(auditLogs).where(eq(auditLogs.userId, testUser.id));
            await db.delete(users).where(eq(users.id, testUser.id));
        }
    } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
    }
    await pool.end();
  }
}

runTest();
