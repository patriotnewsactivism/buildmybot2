#!/usr/bin/env node

/**
 * Test scraping with a simpler website
 */

const API_BASE = 'https://buildmybot2-production.up.railway.app';

async function testSimpleScrape() {
  console.log('Testing with a simple HTML website...\n');

  // Login
  const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'mreardon@wtpnews.org',
      password: 'password'
    })
  });

  if (loginResponse.status !== 200) {
    console.error('Login failed');
    return;
  }

  const cookies = loginResponse.headers.get('set-cookie');
  console.log('✓ Logged in\n');

  // Create a test bot
  const botResponse = await fetch(`${API_BASE}/api/bots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    },
    body: JSON.stringify({
      name: `Simple Test ${Date.now()}`,
      type: 'customer-service',
      systemPrompt: 'Test bot',
      model: 'gpt-5o-mini'
    })
  });

  const bot = await botResponse.json();
  console.log(`✓ Bot created: ${bot.id}\n`);

  // Test with example.com (simple HTML)
  const testUrl = 'https://example.com';
  console.log(`Testing with: ${testUrl}`);
  console.log('This is a simple HTML page, should work well with Readability\n');

  const scrapeResponse = await fetch(`${API_BASE}/api/knowledge/scrape/${bot.id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    },
    body: JSON.stringify({
      url: testUrl,
      crawlDepth: 1
    })
  });

  if (scrapeResponse.status === 200) {
    const data = await scrapeResponse.json();
    console.log(`✓ Scraping started: ${data.sourceId}`);
    console.log(`Status: ${data.status}\n`);

    // Wait and check status
    console.log('Waiting 10 seconds for processing...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));

    const statusResponse = await fetch(`${API_BASE}/api/knowledge/sources/${bot.id}`, {
      method: 'GET',
      headers: { 'Cookie': cookies }
    });

    if (statusResponse.status === 200) {
      const statusData = await statusResponse.json();
      const source = statusData.sources.find(s => s.id === data.sourceId);

      console.log('Result:');
      console.log(`  Status: ${source.status}`);
      console.log(`  Pages crawled: ${source.pagesCrawled}`);
      console.log(`  Chunks: ${source.chunkCount}`);

      if (source.errorMessage) {
        console.log(`  Error: ${source.errorMessage}`);
      }

      if (source.status === 'completed') {
        const previewResponse = await fetch(`${API_BASE}/api/knowledge/preview/${data.sourceId}`, {
          method: 'GET',
          headers: { 'Cookie': cookies }
        });

        if (previewResponse.status === 200) {
          const previewData = await previewResponse.json();
          console.log(`\n✓ Content extracted successfully!`);
          console.log(`  Length: ${previewData.content.length} chars`);
          console.log(`  Preview: ${previewData.content.substring(0, 200)}...`);
        }
      }
    }
  } else {
    console.error('Scraping failed:', await scrapeResponse.text());
  }
}

testSimpleScrape();
