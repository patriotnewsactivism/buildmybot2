#!/usr/bin/env node

/**
 * Check status of the scraping job
 */

const API_BASE = 'https://buildmybot2-production.up.railway.app';
const botId = '51542132-8113-44e0-a7f3-713fd7a1ed10';
const sourceId = '6ff298d6-2345-4db7-8e78-4c23aced7795';

async function checkStatus() {
  // Login first
  const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
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
  console.log('Logged in successfully\n');

  // Check sources
  const response = await fetch(`${API_BASE}/api/knowledge/sources/${botId}`, {
    method: 'GET',
    headers: { 'Cookie': cookies },
    credentials: 'include'
  });

  if (response.status === 200) {
    const data = await response.json();
    console.log('Knowledge Base Stats:');
    console.log(`  Total sources: ${data.stats.sources}`);
    console.log(`  Total chunks: ${data.stats.chunks}`);
    console.log(`  Total tokens: ${data.stats.totalTokens}\n`);

    const source = data.sources.find(s => s.id === sourceId);
    if (source) {
      console.log('Source Details:');
      console.log(`  ID: ${source.id}`);
      console.log(`  Name: ${source.sourceName}`);
      console.log(`  Status: ${source.status}`);
      console.log(`  Pages Crawled: ${source.pagesCrawled}`);
      console.log(`  Chunks: ${source.chunkCount}`);
      if (source.errorMessage) {
        console.log(`  Error: ${source.errorMessage}`);
      }

      // If completed, get preview
      if (source.status === 'completed') {
        console.log('\nFetching preview...');
        const previewResponse = await fetch(`${API_BASE}/api/knowledge/preview/${sourceId}`, {
          method: 'GET',
          headers: { 'Cookie': cookies },
          credentials: 'include'
        });

        if (previewResponse.status === 200) {
          const previewData = await previewResponse.json();
          const content = previewData.content || '';
          console.log(`\nContent Preview (first 500 chars):`);
          console.log(content.substring(0, 500));
          console.log(`\nTotal content length: ${content.length} chars`);
          console.log(`Word count: ~${content.split(' ').length} words`);
        }
      }
    } else {
      console.log('Source not found');
    }
  } else {
    console.error(`Failed to fetch sources: ${response.status}`);
    console.error(await response.text());
  }
}

checkStatus();
