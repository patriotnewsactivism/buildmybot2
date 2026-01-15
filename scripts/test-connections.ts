import { twilioService } from '../server/services/TwilioService';
import { openAIService } from '../server/services/OpenAIService';
import { db } from '../server/db';
import { users } from '../shared/schema';
import { env } from '../server/env';
import fetch from 'node-fetch';

async function testConnections() {
  console.log('🔍 Starting System Connection Tests...\n');
  let allPassed = true;

  // 1. Database Connection
  try {
    process.stdout.write('Testing Database Connection... ');
    await db.select().from(users).limit(1);
    console.log('✅ OK');
  } catch (error: any) {
    console.log('❌ FAILED');
    console.error('   Error:', error.message);
    allPassed = false;
  }

  // 2. OpenAI Connection
  try {
    process.stdout.write('Testing OpenAI API... ');
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing');
    
    await openAIService.complete({
      model: 'gpt-3.5-turbo', // Use cheap model for test
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    });
    console.log('✅ OK');
  } catch (error: any) {
    console.log('❌ FAILED');
    console.error('   Error:', error.message);
    allPassed = false;
  }

  // 3. Twilio Connection
  try {
    process.stdout.write('Testing Twilio API... ');
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) throw new Error('Twilio Credentials missing');
    
    // Attempt to list US numbers (does not cost money)
    await twilioService.listAvailableNumbers('415', 'US', 1);
    console.log('✅ OK');
  } catch (error: any) {
    console.log('❌ FAILED');
    console.error('   Error:', error.message);
    allPassed = false;
  }

  // 4. Cartesia Connection
  try {
    process.stdout.write('Testing Cartesia API... ');
    if (!env.CARTESIA_API_KEY) throw new Error('CARTESIA_API_KEY is missing');

    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Cartesia-Version': '2024-06-10',
        'X-API-Key': env.CARTESIA_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-2',
        transcript: 'test',
        voice: { mode: 'id', id: 'a0e99841-438c-4a64-b679-ae501e7d6091' }, // Katie
        output_format: { container: 'mp3', encoding: 'mp3', sample_rate: 44100 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Status ${response.status}: ${response.statusText}`);
    }
    console.log('✅ OK');
  } catch (error: any) {
    console.log('❌ FAILED');
    console.error('   Error:', error.message);
    allPassed = false;
  }

  console.log('\n----------------------------------------');
  if (allPassed) {
    console.log('🚀 SYSTEM READY: All external connections verified.');
  } else {
    console.error('⚠️  ISSUES DETECTED: Please check your .env file.');
    process.exit(1);
  }
  process.exit(0);
}

testConnections();
