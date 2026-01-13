#!/usr/bin/env node

/**
 * Railway Environment Check Script
 *
 * This script helps diagnose why authentication isn't working between
 * the frontend and backend.
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

async function checkBackendHealth() {
  log('\n=================================================', 'cyan');
  log('Railway Backend Health Check', 'cyan');
  log('=================================================', 'cyan');

  try {
    log(`\nChecking: ${API_BASE}`, 'blue');

    const response = await fetch(API_BASE);
    const status = response.status;

    log(`Status: ${status}`, status === 404 ? 'green' : 'red');

    if (status === 404) {
      log('✓ Backend is responding (404 is expected for root path)', 'green');
      return true;
    } else {
      log('✗ Unexpected status code', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Backend is not reachable: ${error.message}`, 'red');
    return false;
  }
}

async function checkAuthEndpoint() {
  log('\n=================================================', 'cyan');
  log('Authentication Endpoint Check', 'cyan');
  log('=================================================', 'cyan');

  try {
    const response = await fetch(`${API_BASE}/api/auth/user`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const status = response.status;
    const data = await response.json();

    log(`\nEndpoint: ${API_BASE}/api/auth/user`, 'blue');
    log(`Status: ${status}`, 'yellow');
    log(`Response: ${JSON.stringify(data, null, 2)}`, 'yellow');

    if (status === 401 && data.error === 'Not authenticated') {
      log('\n✓ Auth endpoint working correctly (401 expected without login)', 'green');
      return true;
    } else if (status === 200) {
      log('\n✓ You are already logged in!', 'green');
      log(`User: ${data.email}`, 'cyan');
      return true;
    } else {
      log('\n✗ Unexpected response from auth endpoint', 'red');
      return false;
    }
  } catch (error) {
    log(`\n✗ Error checking auth endpoint: ${error.message}`, 'red');
    return false;
  }
}

async function checkCookieHeaders() {
  log('\n=================================================', 'cyan');
  log('Cookie Configuration Check', 'cyan');
  log('=================================================', 'cyan');

  try {
    // Attempt to login (will fail but we can check headers)
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'wrongpassword',
      }),
    });

    const setCookie = response.headers.get('set-cookie');

    if (setCookie) {
      log('\n✓ Backend is setting cookies', 'green');
      log('Cookie header:', 'blue');
      log(setCookie, 'yellow');

      // Check for critical cookie attributes
      const hasSecure = setCookie.includes('Secure');
      const hasHttpOnly = setCookie.includes('HttpOnly');
      const hasSameSite = setCookie.includes('SameSite');
      const sameSiteNone = setCookie.includes('SameSite=None');

      log('\nCookie attributes:', 'cyan');
      log(`  Secure: ${hasSecure ? '✓' : '✗'}`, hasSecure ? 'green' : 'red');
      log(`  HttpOnly: ${hasHttpOnly ? '✓' : '✗'}`, hasHttpOnly ? 'green' : 'red');
      log(`  SameSite: ${hasSameSite ? '✓' : '✗'}`, hasSameSite ? 'green' : 'red');

      if (hasSameSite) {
        log(`  SameSite=None: ${sameSiteNone ? '✓' : '✗'}`, sameSiteNone ? 'green' : 'yellow');
      }

      if (hasSecure && hasHttpOnly && sameSiteNone) {
        log('\n✓ Cookie configuration looks correct for cross-origin requests!', 'green');
        return true;
      } else {
        log('\n⚠ Cookie configuration may not work for cross-origin requests', 'yellow');
        log('This suggests NODE_ENV might not be set to "production" on Railway', 'yellow');
        return false;
      }
    } else {
      log('\n⚠ No Set-Cookie header found', 'yellow');
      log('This is normal for failed login attempts', 'yellow');
      return false;
    }
  } catch (error) {
    log(`\n✗ Error checking cookie headers: ${error.message}`, 'red');
    return false;
  }
}

async function provideRecommendations(results) {
  log('\n=================================================', 'cyan');
  log('Diagnosis and Recommendations', 'cyan');
  log('=================================================', 'cyan');

  const allPassed = results.every(r => r);

  if (allPassed) {
    log('\n✓ All checks passed!', 'green');
    log('\nThe backend is configured correctly. If you\'re still getting 401 errors:', 'cyan');
    log('1. Clear your browser cookies for www.buildmybot.app', 'yellow');
    log('2. Close all browser windows', 'yellow');
    log('3. Open a new browser window', 'yellow');
    log('4. Go to https://www.buildmybot.app and login again', 'yellow');
    log('5. Try accessing the knowledge base features', 'yellow');
  } else {
    log('\n⚠ Some checks failed. Here\'s what to do:', 'yellow');
    log('\n1. Go to Railway Dashboard:', 'cyan');
    log('   https://railway.app', 'blue');
    log('\n2. Select "buildmybot2" project', 'cyan');
    log('\n3. Go to Variables tab', 'cyan');
    log('\n4. Add this variable if missing:', 'cyan');
    log('   Name: NODE_ENV', 'yellow');
    log('   Value: production', 'yellow');
    log('\n5. Redeploy the service', 'cyan');
    log('\n6. Wait for deployment to complete (1-2 minutes)', 'cyan');
    log('\n7. Run this script again to verify', 'cyan');
  }

  log('\n=================================================', 'cyan');
  log('Additional Resources', 'cyan');
  log('=================================================', 'cyan');
  log('\nFor detailed troubleshooting, see:', 'cyan');
  log('  FIX_AUTH_ISSUE.md', 'blue');
  log('\nFor manual testing guide, see:', 'cyan');
  log('  KNOWLEDGE_BASE_TEST.md', 'blue');
  log('\n', 'reset');
}

async function runDiagnostics() {
  const results = [];

  results.push(await checkBackendHealth());
  results.push(await checkAuthEndpoint());
  results.push(await checkCookieHeaders());

  await provideRecommendations(results);

  process.exit(results.every(r => r) ? 0 : 1);
}

// Run diagnostics
runDiagnostics().catch(error => {
  log(`\nFatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
