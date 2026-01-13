#!/usr/bin/env node

/**
 * Test actual login flow with real credentials
 */

const API_BASE = 'https://buildmybot2-production.up.railway.app';

async function testLogin() {
  console.log('Testing login with real credentials...\n');

  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'mreardon@wtpnews.org',
        password: 'password',
      }),
    });

    const status = response.status;
    const data = await response.json();

    console.log(`Status: ${status}`);
    console.log(`Response:`, JSON.stringify(data, null, 2));
    console.log('\nHeaders:');

    // Check for CORS and cookie headers
    console.log(`  Access-Control-Allow-Credentials: ${response.headers.get('access-control-allow-credentials')}`);
    console.log(`  Access-Control-Allow-Origin: ${response.headers.get('access-control-allow-origin')}`);

    // Try to get set-cookie (may not work in Node fetch)
    const setCookie = response.headers.get('set-cookie');
    console.log(`  Set-Cookie: ${setCookie || 'Not accessible via fetch API'}`);

    if (status === 200) {
      console.log('\n✓ Login successful!');
      console.log('\nNow testing authenticated request...\n');

      // Try to get user info (should work if cookie was set)
      const userResponse = await fetch(`${API_BASE}/api/auth/user`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const userStatus = userResponse.status;
      const userData = await userResponse.json();

      console.log(`Get User Status: ${userStatus}`);
      console.log(`User Data:`, JSON.stringify(userData, null, 2));

      if (userStatus === 200) {
        console.log('\n✓ Authentication working! Cookies are being set and sent correctly.');
        console.log('✓ NODE_ENV is likely set to "production" on Railway.');
        return true;
      } else {
        console.log('\n✗ Login succeeded but subsequent request failed.');
        console.log('This might indicate NODE_ENV is not set correctly.');
        return false;
      }
    } else {
      console.log('\n✗ Login failed');
      return false;
    }
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

testLogin().then(success => {
  process.exit(success ? 0 : 1);
});
