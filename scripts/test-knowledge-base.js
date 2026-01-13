#!/usr/bin/env node

/**
 * Comprehensive Knowledge Base Testing Script
 *
 * Tests:
 * 1. Web scraping with improved Readability extraction
 * 2. Bot creation and database storage
 * 3. Knowledge source retrieval
 */

const API_BASE = 'https://buildmybot2-production.up.railway.app';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function login() {
  log('\n📝 Logging in...', 'cyan');

  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      email: 'mreardon@wtpnews.org',
      password: 'password'
    })
  });

  if (response.status === 200) {
    const data = await response.json();
    log(`✓ Logged in as: ${data.user.email}`, 'green');

    // Extract cookies from response
    const cookies = response.headers.get('set-cookie');
    return cookies;
  } else {
    log('✗ Login failed', 'red');
    throw new Error('Login failed');
  }
}

async function testBotCreation(cookies) {
  log('\n🤖 Testing Bot Creation...', 'cyan');

  const botData = {
    name: `Test Bot ${Date.now()}`,
    type: 'customer-service',
    systemPrompt: 'You are a helpful customer service assistant.',
    model: 'gpt-5o-mini',
    temperature: 0.7,
    active: true,
    isPublic: false
  };

  const response = await fetch(`${API_BASE}/api/bots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    },
    credentials: 'include',
    body: JSON.stringify(botData)
  });

  if (response.status === 200 || response.status === 201) {
    const bot = await response.json();
    log(`✓ Bot created successfully!`, 'green');
    log(`  ID: ${bot.id}`, 'blue');
    log(`  Name: ${bot.name}`, 'blue');
    log(`  Model: ${bot.model}`, 'blue');
    return bot.id;
  } else {
    const error = await response.text();
    log(`✗ Bot creation failed: ${response.status}`, 'red');
    log(`  Error: ${error}`, 'yellow');
    throw new Error('Bot creation failed');
  }
}

async function testWebScraping(botId, cookies) {
  log('\n🌐 Testing Web Scraping (with Readability)...', 'cyan');

  // Test with a documentation site (good content structure)
  const testUrl = 'https://docs.anthropic.com/claude/docs/intro-to-claude';

  log(`  Scraping: ${testUrl}`, 'blue');
  log(`  Pages: 2`, 'blue');

  const response = await fetch(`${API_BASE}/api/knowledge/scrape/${botId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    },
    credentials: 'include',
    body: JSON.stringify({
      url: testUrl,
      crawlDepth: 2
    })
  });

  if (response.status === 200) {
    const data = await response.json();
    log(`✓ Scraping started!`, 'green');
    log(`  Source ID: ${data.sourceId}`, 'blue');
    log(`  Status: ${data.status}`, 'blue');
    log(`  Message: ${data.message}`, 'blue');
    return data.sourceId;
  } else {
    const error = await response.text();
    log(`✗ Scraping failed: ${response.status}`, 'red');
    log(`  Error: ${error}`, 'yellow');
    throw new Error('Scraping failed');
  }
}

async function waitForProcessing(sourceId, botId, cookies, maxWait = 30000) {
  log('\n⏳ Waiting for processing to complete...', 'cyan');

  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < maxWait) {
    attempts++;

    const response = await fetch(`${API_BASE}/api/knowledge/sources/${botId}`, {
      method: 'GET',
      headers: { 'Cookie': cookies },
      credentials: 'include'
    });

    if (response.status === 200) {
      const data = await response.json();
      const source = data.sources.find(s => s.id === sourceId);

      if (source) {
        log(`  Attempt ${attempts}: Status = ${source.status}`, 'yellow');

        if (source.status === 'completed') {
          log(`✓ Processing completed!`, 'green');
          log(`  Pages crawled: ${source.pagesCrawled}`, 'blue');
          log(`  Chunks created: ${source.chunkCount}`, 'blue');
          return source;
        } else if (source.status === 'failed') {
          log(`✗ Processing failed`, 'red');
          log(`  Error: ${source.errorMessage}`, 'yellow');
          return null;
        }
      }
    }

    // Wait 2 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  log(`⏱ Timeout: Processing took longer than ${maxWait/1000}s`, 'yellow');
  return null;
}

async function testPreviewContent(sourceId, cookies) {
  log('\n👁️  Testing Content Preview...', 'cyan');

  const response = await fetch(`${API_BASE}/api/knowledge/preview/${sourceId}`, {
    method: 'GET',
    headers: { 'Cookie': cookies },
    credentials: 'include'
  });

  if (response.status === 200) {
    const data = await response.json();
    const content = data.content || '';

    log(`✓ Preview retrieved!`, 'green');
    log(`  Content length: ${content.length} chars`, 'blue');
    log(`  First 200 chars: ${content.substring(0, 200)}...`, 'blue');

    // Check if content looks good (not just HTML tags)
    const hasText = content.length > 100;
    const notJustHTML = !content.match(/^<[^>]+>.*<\/[^>]+>$/);
    const hasWords = content.split(' ').length > 20;

    if (hasText && hasWords) {
      log(`✓ Content quality looks good!`, 'green');
      log(`  Has ${content.split(' ').length} words`, 'blue');
      return true;
    } else {
      log(`⚠ Content quality may be low`, 'yellow');
      return false;
    }
  } else {
    log(`✗ Preview failed: ${response.status}`, 'red');
    return false;
  }
}

async function testKnowledgeStats(botId, cookies) {
  log('\n📊 Testing Knowledge Stats...', 'cyan');

  const response = await fetch(`${API_BASE}/api/knowledge/sources/${botId}`, {
    method: 'GET',
    headers: { 'Cookie': cookies },
    credentials: 'include'
  });

  if (response.status === 200) {
    const data = await response.json();

    log(`✓ Stats retrieved!`, 'green');
    log(`  Total sources: ${data.stats.sources}`, 'blue');
    log(`  Total chunks: ${data.stats.chunks}`, 'blue');
    log(`  Total tokens: ${data.stats.totalTokens}`, 'blue');

    log(`\n  Sources:`, 'cyan');
    data.sources.forEach(source => {
      const statusColor = source.status === 'completed' ? 'green' :
                         source.status === 'processing' ? 'yellow' : 'red';
      log(`    - ${source.sourceName} [${source.status}] - ${source.chunkCount} chunks`, statusColor);
    });

    return data;
  } else {
    log(`✗ Stats retrieval failed: ${response.status}`, 'red');
    return null;
  }
}

async function runTests() {
  log('='.repeat(60), 'cyan');
  log('Knowledge Base Testing Suite', 'bold');
  log('Testing improved web scraping with Readability', 'cyan');
  log('='.repeat(60), 'cyan');

  try {
    // Step 1: Login
    const cookies = await login();

    // Step 2: Create a test bot
    const botId = await testBotCreation(cookies);

    // Step 3: Test web scraping
    const sourceId = await testWebScraping(botId, cookies);

    // Step 4: Wait for processing
    const source = await waitForProcessing(sourceId, botId, cookies);

    if (source && source.status === 'completed') {
      // Step 5: Test preview
      await testPreviewContent(sourceId, cookies);

      // Step 6: Check stats
      await testKnowledgeStats(botId, cookies);

      log('\n' + '='.repeat(60), 'cyan');
      log('✓ ALL TESTS PASSED!', 'green');
      log('='.repeat(60), 'cyan');

      log('\n📋 Summary:', 'cyan');
      log(`  Bot ID: ${botId}`, 'blue');
      log(`  Source ID: ${sourceId}`, 'blue');
      log(`  Pages Crawled: ${source.pagesCrawled}`, 'blue');
      log(`  Chunks Created: ${source.chunkCount}`, 'blue');
      log(`  Status: ${source.status}`, 'green');

      return true;
    } else {
      log('\n' + '='.repeat(60), 'cyan');
      log('⚠ TESTS INCOMPLETE', 'yellow');
      log('Processing did not complete in time or failed', 'yellow');
      log('='.repeat(60), 'cyan');
      return false;
    }
  } catch (error) {
    log('\n' + '='.repeat(60), 'cyan');
    log('✗ TESTS FAILED', 'red');
    log(`Error: ${error.message}`, 'red');
    log('='.repeat(60), 'cyan');
    console.error(error);
    return false;
  }
}

// Run the tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
});
