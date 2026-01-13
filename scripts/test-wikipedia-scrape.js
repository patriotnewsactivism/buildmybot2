#!/usr/bin/env node

/**
 * Test scraping with Wikipedia (good for Readability)
 */

const API_BASE = 'https://buildmybot2-production.up.railway.app';

async function testWikipediaScrape() {
  console.log('Testing with Wikipedia (optimal for Readability)...\n');

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

  // Create bot
  const botResponse = await fetch(`${API_BASE}/api/bots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookies
    },
    body: JSON.stringify({
      name: `Wikipedia Test ${Date.now()}`,
      type: 'customer-service',
      systemPrompt: 'Test bot for Wikipedia content',
      model: 'gpt-5o-mini'
    })
  });

  const bot = await botResponse.json();
  console.log(`✓ Bot created: ${bot.id}\n`);

  // Test with Wikipedia article (good structured content)
  const testUrl = 'https://en.wikipedia.org/wiki/Artificial_intelligence';
  console.log(`Testing with: ${testUrl}`);
  console.log('Wikipedia has clean HTML structure, perfect for Readability\n');

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

    // Wait for processing
    console.log('Waiting 15 seconds for processing...\n');
    await new Promise(resolve => setTimeout(resolve, 15000));

    const statusResponse = await fetch(`${API_BASE}/api/knowledge/sources/${bot.id}`, {
      method: 'GET',
      headers: { 'Cookie': cookies }
    });

    if (statusResponse.status === 200) {
      const statusData = await statusResponse.json();
      const source = statusData.sources.find(s => s.id === data.sourceId);

      console.log('=' .repeat(60));
      console.log('RESULTS');
      console.log('='.repeat(60));
      console.log(`Status: ${source.status}`);
      console.log(`Pages crawled: ${source.pagesCrawled}`);
      console.log(`Chunks created: ${source.chunkCount}`);
      console.log(`Total tokens: ${statusData.stats.totalTokens}`);

      if (source.errorMessage) {
        console.log(`Error: ${source.errorMessage}`);
      }

      if (source.status === 'completed' && source.chunkCount > 0) {
        const previewResponse = await fetch(`${API_BASE}/api/knowledge/preview/${data.sourceId}`, {
          method: 'GET',
          headers: { 'Cookie': cookies }
        });

        if (previewResponse.status === 200) {
          const previewData = await previewResponse.json();
          const content = previewData.content || '';

          console.log(`\n✓ Content extracted successfully!`);
          console.log(`Content length: ${content.length} chars`);
          console.log(`Word count: ~${content.split(' ').length} words`);

          // Show a meaningful preview
          console.log(`\nFirst 500 characters:`);
          console.log('-'.repeat(60));
          console.log(content.substring(0, 500));
          console.log('-'.repeat(60));

          // Quality checks
          console.log(`\n✓ QUALITY CHECKS:`);
          const hasGoodLength = content.length > 1000;
          const hasEnoughWords = content.split(' ').length > 200;
          const notJustHTML = !content.includes('<div>') && !content.includes('</div>');

          console.log(`  Good length (>1000 chars): ${hasGoodLength ? '✓' : '✗'}`);
          console.log(`  Enough words (>200): ${hasEnoughWords ? '✓' : '✗'}`);
          console.log(`  Clean text (no HTML): ${notJustHTML ? '✓' : '✗'}`);

          if (hasGoodLength && hasEnoughWords && notJustHTML) {
            console.log(`\n🎉 SUCCESS! Readability extraction working perfectly!`);
          } else {
            console.log(`\n⚠ Content quality could be better`);
          }
        }
      }
    }
  } else {
    console.error('Scraping failed:', await scrapeResponse.text());
  }
}

testWikipediaScrape();
