# Fix 401 Authentication Errors

## Problem

The frontend (www.buildmybot.app) is getting 401 errors when calling the backend API (buildmybot2-production.up.railway.app):

```
/api/bots/.../documents: 401 Unauthorized
/api/knowledge/prebuilt: 401 Unauthorized
```

This means the session cookies aren't being sent or accepted between the frontend and backend.

## Root Cause

Cross-origin requests between different domains require special cookie configuration. The session cookie needs:
- `sameSite: 'none'` (allows cross-origin cookies)
- `secure: true` (required for sameSite: 'none')
- `NODE_ENV=production` must be set on Railway

## Fix Steps

### Step 1: Verify Railway Environment Variables

Go to Railway dashboard and check that these are set:

```bash
NODE_ENV=production  # CRITICAL - this must be set!
SESSION_SECRET=2NtQTz77O8mlRrJXNc0/FhdwyJ/CpblK3Zps3x1v9jKCGovTd5ghViK6OS91Qs/Ek+HpFltZTVLixPFSTEwWLw==
DATABASE_URL=postgresql://postgres.qjwwkcoredotrjtstigt:BuildMyBot123!@aws-0-us-west-2.pooler.supabase.com:5432/postgres
OPENAI_API_KEY=sk-proj-...
APP_BASE_URL=https://www.buildmybot.app
```

**Critical:** If `NODE_ENV` is not set or is set to `development`, the cookies won't work for cross-origin requests!

### Step 2: Check Railway Logs

1. Go to https://railway.app
2. Select buildmybot2 project
3. Click on Deployments → Latest deployment
4. View logs and check for:
   - `Server running on port 5000 (production)` - Should say "production"
   - Any session-related errors
   - CORS errors

### Step 3: Test Session Cookie Configuration

Open your browser's Developer Tools (F12):

1. **Go to www.buildmybot.app and login**
2. **Open Application/Storage tab → Cookies**
3. **Check for cookie named `connect.sid`:**
   - Domain: Should be `.buildmybot2-production.up.railway.app` or similar
   - Secure: Should be ✓ (checked)
   - HttpOnly: Should be ✓ (checked)
   - SameSite: Should be "None"
   - Path: `/`

If you don't see the cookie or the attributes are wrong, the backend configuration isn't correct.

### Step 4: Test API Call

In browser console (F12 → Console), run:

```javascript
fetch('https://buildmybot2-production.up.railway.app/api/user', {
  method: 'GET',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(d => console.log('User:', d))
.catch(e => console.error('Error:', e));
```

Expected results:
- ✓ Success: Returns your user object `{ id: '...', email: '...', ... }`
- ✗ Fail: Returns `{ error: 'Authentication required' }`

### Step 5: Verify CORS Configuration

The backend CORS is configured to accept credentials:

```typescript
app.use(cors({
  origin: true,  // Accepts all origins
  credentials: true  // Allows cookies
}));
```

This should be working. If not, check Railway logs for CORS errors.

## Additional Diagnostics

### Check if Railway is in Production Mode

SSH into Railway or check logs for startup message:

```bash
# Should see:
Server running on port 5000 (production)

# NOT:
Server running on port 3001 (development)
```

### Check Session Table in Database

The sessions should be stored in PostgreSQL:

```sql
-- Connect to Supabase and run:
SELECT * FROM sessions LIMIT 5;
```

You should see session records. If empty, sessions aren't being created.

### Test with curl

Test if the backend sets cookies correctly:

```bash
# Login and capture cookies
curl -v -X POST https://buildmybot2-production.up.railway.app/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"mreardon@wtpnews.org","password":"password"}' \
  -c cookies.txt

# Check cookies.txt file
cat cookies.txt

# Should see connect.sid cookie with:
# - Domain: buildmybot2-production.up.railway.app
# - Secure flag
# - HttpOnly flag
```

## Quick Fix Commands

If NODE_ENV is missing, add it to Railway:

1. Go to Railway project settings
2. Add environment variable:
   - Name: `NODE_ENV`
   - Value: `production`
3. Redeploy the service

## Alternative Solution: Proxy Through Vercel

If cross-origin cookies continue to fail, we can proxy all API requests through Vercel:

Update `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://buildmybot2-production.up.railway.app/api/:path*"
    }
  ]
}
```

Then update frontend to use relative URLs:

```typescript
// In apiConfig.ts
export const API_BASE = '/api';
```

This makes all API calls go through www.buildmybot.app/api instead of directly to Railway, avoiding cross-origin cookie issues.

## Expected Behavior After Fix

Once fixed:

1. Login at www.buildmybot.app → Creates session cookie
2. All API requests include cookie automatically
3. Backend validates session from cookie
4. No more 401 errors
5. Knowledge base works: PDF upload, website scraping, etc.

## Still Not Working?

If you've verified all the above and it's still not working:

1. **Check browser console** for specific error messages
2. **Check Railway logs** for authentication errors
3. **Verify Supabase** connection is working
4. **Test with a different browser** (clear all cookies first)
5. **Check if Railway domain changed** (Railway sometimes changes URLs)

## Contact Info

If none of these fixes work, there may be a Railway-specific configuration issue. Check:
- Railway documentation on session cookies
- Railway support for cross-origin cookie issues
- Consider switching to JWT tokens instead of sessions
