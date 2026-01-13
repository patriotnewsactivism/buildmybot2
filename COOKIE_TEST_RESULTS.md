# Cookie Configuration Test Results

## ✅ GOOD NEWS: NODE_ENV is set to production on Railway!

The backend is correctly configured with the right cookie settings for cross-origin requests.

## Test Results

### Login Response Headers:
```
Set-Cookie: connect.sid=s%3A....; Path=/; Expires=Tue, 20 Jan 2026 15:18:11 GMT; HttpOnly; Secure; SameSite=None
```

### Cookie Attributes (All Correct ✓):
- ✅ **HttpOnly** - Prevents JavaScript access to cookie
- ✅ **Secure** - Cookie only sent over HTTPS
- ✅ **SameSite=None** - Allows cross-origin cookie sending (required for www.buildmybot.app → buildmybot2-production.up.railway.app)
- ✅ **Path=/** - Cookie available for all routes
- ✅ **7-day expiration** - Matches backend configuration

### CORS Headers (Correct ✓):
```
Access-Control-Allow-Credentials: true
```

This means Railway is properly configured!

## Why the test script shows 401 on second request

The Node.js `fetch()` API doesn't automatically store and send cookies between requests (unlike browsers). This is expected behavior for the test script.

**In a real browser, cookies ARE automatically stored and sent.**

## Browser Test

To verify cookies work in your browser:

1. **Open your browser** (Chrome, Firefox, Edge)

2. **Go to**: https://www.buildmybot.app

3. **Open Developer Tools** (F12)

4. **Go to Console tab**

5. **Run this code:**

```javascript
// Test 1: Login
fetch('https://buildmybot2-production.up.railway.app/api/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'mreardon@wtpnews.org',
    password: 'password'
  })
})
.then(r => r.json())
.then(data => {
  console.log('✓ Login:', data);

  // Test 2: Get user (should work if cookie was stored)
  return fetch('https://buildmybot2-production.up.railway.app/api/auth/user', {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  });
})
.then(r => r.json())
.then(data => {
  if (data.error) {
    console.error('✗ Still getting 401:', data);
    console.log('Check Application → Cookies in DevTools');
  } else {
    console.log('✓ Authenticated request worked!', data);
  }
})
.catch(err => console.error('Error:', err));
```

6. **Check the console output:**
   - If you see "✓ Authenticated request worked!" - cookies are working!
   - If you see "✗ Still getting 401" - check cookies in DevTools

7. **Also check Application/Storage tab → Cookies**
   - Look for cookie on domain: `.buildmybot2-production.up.railway.app` or similar
   - Check attributes: Secure ✓, HttpOnly ✓, SameSite: None

## Expected Result

✅ **In the browser, the second request should succeed** because browsers automatically store and send cookies with `credentials: 'include'`.

## If Browser Test Still Fails

If the browser test shows 401 errors:

1. **Clear all cookies** for both:
   - www.buildmybot.app
   - buildmybot2-production.up.railway.app

2. **Close all browser windows**

3. **Open a fresh browser window**

4. **Try the test again**

## Alternative: Check Railway Logs

1. Go to https://railway.app
2. Select buildmybot2 project
3. View logs
4. Look for startup message:
   ```
   Server running on port 5000 (production)
   ```

   If it says **(production)**, NODE_ENV is set correctly!

   If it says **(development)**, NODE_ENV is missing or wrong.

## Summary

Based on the test results:

- ✅ Backend is responding correctly
- ✅ Cookies have correct attributes (HttpOnly, Secure, SameSite=None)
- ✅ CORS headers allow credentials
- ✅ NODE_ENV=production is configured on Railway

**The backend is configured correctly!**

The 401 errors you're seeing are most likely a browser-side issue:
- Stale cookies
- Browser blocking third-party cookies
- Need to clear cache/cookies and login again

**Next steps:**
1. Run the browser test above
2. If still failing, clear all cookies and try again
3. Check if your browser has "Block third-party cookies" enabled (should allow for this site)
