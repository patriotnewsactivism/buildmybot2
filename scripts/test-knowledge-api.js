#!/usr/bin/env node

/**
 * Knowledge Base API Test Script
 *
 * This script tests the knowledge base API endpoints to ensure they're
 * properly configured and responding.
 *
 * Usage: node scripts/test-knowledge-api.js
 */

const API_BASE = process.env.VITE_API_URL || 'https://buildmybot2-production.up.railway.app';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEndpoint(name, url, expectedStatus, method = 'GET', body = null) {
  try {
    log(`\nTesting: ${name}`, 'cyan');
    log(`URL: ${url}`, 'blue');
    log(`Method: ${method}`, 'blue');

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const status = response.status;

    let responseText;
    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        responseText = JSON.stringify(await response.json(), null, 2);
      } else {
        responseText = await response.text();
      }
    } catch (e) {
      responseText = 'Could not parse response';
    }

    const passed = status === expectedStatus;

    if (passed) {
      log(`✓ PASS: Got expected status ${status}`, 'green');
    } else {
      log(`✗ FAIL: Expected ${expectedStatus}, got ${status}`, 'red');
    }

    if (responseText.length < 500) {
      log(`Response: ${responseText}`, 'yellow');
    } else {
      log(`Response: ${responseText.substring(0, 500)}... (truncated)`, 'yellow');
    }

    return passed;
  } catch (error) {
    log(`✗ ERROR: ${error.message}`, 'red');
    return false;
  }
}

async function runTests() {
  log('=================================================', 'cyan');
  log('Knowledge Base API Test Suite', 'cyan');
  log('=================================================', 'cyan');
  log(`API Base URL: ${API_BASE}`, 'blue');

  const results = [];

  // Test 1: Backend is responding
  results.push(await testEndpoint(
    'Backend Health Check',
    `${API_BASE}`,
    404, // Root path returns 404, but server is responding
    'GET'
  ));

  // Test 2: Knowledge sources endpoint (requires auth - should return 401)
  results.push(await testEndpoint(
    'Knowledge Sources Endpoint (Auth Required)',
    `${API_BASE}/api/knowledge/sources/test-bot-id`,
    401, // Should require authentication
    'GET'
  ));

  // Test 3: Knowledge scrape endpoint (requires auth - should return 401)
  results.push(await testEndpoint(
    'Knowledge Scrape Endpoint (Auth Required)',
    `${API_BASE}/api/knowledge/scrape/test-bot-id`,
    401, // Should require authentication
    'POST',
    { url: 'https://example.com', crawlDepth: 1 }
  ));

  // Test 4: Knowledge upload endpoint (requires auth - should return 401)
  results.push(await testEndpoint(
    'Knowledge Upload Endpoint (Auth Required)',
    `${API_BASE}/api/knowledge/upload/test-bot-id`,
    401, // Should require authentication
    'POST'
  ));

  // Test 5: Frontend is accessible
  results.push(await testEndpoint(
    'Frontend Homepage',
    'https://www.buildmybot.app',
    200,
    'GET'
  ));

  log('\n=================================================', 'cyan');
  log('Test Results Summary', 'cyan');
  log('=================================================', 'cyan');

  const passed = results.filter(r => r).length;
  const failed = results.filter(r => !r).length;

  log(`Total Tests: ${results.length}`, 'blue');
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'green');

  if (failed === 0) {
    log('\n✓ All tests passed! API is configured correctly.', 'green');
    log('You can now test manually at https://www.buildmybot.app', 'cyan');
    log('See KNOWLEDGE_BASE_TEST.md for manual testing guide.', 'cyan');
  } else {
    log('\n✗ Some tests failed. Check the output above for details.', 'red');
  }

  log('\n=================================================\n', 'cyan');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log(`\nFatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
