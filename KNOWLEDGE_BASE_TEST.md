# Knowledge Base Testing Guide

This guide will help you test the PDF upload and website scraping features on production.

## Prerequisites

- Production site: https://www.buildmybot.app
- Backend API: https://buildmybot2-production.up.railway.app
- Test account: mreardon@wtpnews.org / password

## Test 1: Website Scraping

### Steps:

1. **Login to the platform**
   - Go to https://www.buildmybot.app
   - Login with: mreardon@wtpnews.org / password

2. **Create or edit a bot**
   - Navigate to Bot Builder
   - Either create a new bot or edit an existing one
   - Scroll down to the "Knowledge Base" section

3. **Test website scraping**
   - In the "Add Website URL" field, enter a test URL:
     - Example: `https://docs.anthropic.com/claude/docs/intro-to-claude`
     - Or any simple website with text content
   - Select crawl depth (start with 1-2 pages)
   - Click "Scrape" button

4. **Expected behavior**
   - Button shows "Scraping..." with spinning loader
   - Success message appears: "Started crawling {url}. This may take a few minutes."
   - New source appears in "Knowledge Sources" list below with status "Processing"
   - After 10-30 seconds, status changes to "Completed"
   - Shows page count and chunk count

5. **Verify the data**
   - Click the eye icon (👁️) on the completed source
   - Preview modal opens showing extracted text content
   - Content should be readable and properly formatted

### Troubleshooting Website Scraping:

If scraping fails:
- Check browser console (F12) for errors
- Verify the URL is valid and accessible
- Check the error message in the Knowledge Base section
- Backend logs on Railway will show detailed errors

---

## Test 2: PDF Upload

### Test Files:

Use these test PDFs (or your own):
- Simple PDF with text
- PDF with images/scanned documents (tests OCR)
- Maximum size: 20MB

### Steps:

1. **Prepare test PDF**
   - Create a simple PDF with text content
   - Or use a PDF from your computer

2. **Upload method 1: Drag and drop**
   - In the Knowledge Base section, find the upload area
   - Drag your PDF file onto the dashed border area
   - It should highlight blue when dragging
   - Drop the file

3. **Upload method 2: Click to browse**
   - Click anywhere in the upload area
   - File browser opens
   - Select your PDF file
   - Click Open

4. **Expected behavior**
   - Upload progress bar appears
   - Shows "Uploading {filename}..." with percentage
   - Success message: "Documents uploaded successfully. Processing may take a moment."
   - New source appears in "Knowledge Sources" with status "Processing"
   - After processing, status changes to "Completed"
   - Shows chunk count

5. **Verify the upload**
   - Click the eye icon (👁️) on the completed source
   - Preview shows extracted PDF text
   - Text should be readable and properly formatted

### Additional PDF Tests:

**Test OCR (Image-based PDFs):**
- Upload a scanned PDF or PDF with images containing text
- System should automatically use OCR (OpenAI vision)
- Preview should show extracted text from images

**Test large files:**
- Upload a PDF close to 20MB limit
- Should upload successfully with progress indicator

**Test multiple files:**
- Upload 2-3 PDFs at once
- Each should process independently
- Progress bar shows total progress

### Troubleshooting PDF Upload:

Common issues:
- **"Please save your bot before uploading documents"**
  - You're on a new bot (botId = 'new')
  - Save the bot first, then upload

- **"{filename} exceeds 20MB limit"**
  - File too large
  - Compress the PDF or split into smaller files

- **Upload fails silently**
  - Check browser console for errors
  - Verify VITE_API_URL is set correctly
  - Check Railway backend logs

---

## Test 3: Delete and Refresh

### Delete a source:
1. Find a completed source in the list
2. Click the trash icon (🗑️)
3. Source should be removed from list
4. Success message appears

### Refresh a website source:
1. Find a completed website source (URL-based)
2. Click the refresh icon (🔄)
3. Status changes to "Processing"
4. Content is re-crawled
5. Status returns to "Completed"

---

## Test 4: Using Knowledge in Chat

### Test the bot uses knowledge:

1. **Add knowledge source**
   - Upload a PDF with specific information
   - Or scrape a website with unique content

2. **Test in chat**
   - Go to the chat interface for your bot
   - Ask a question that should be answered from your knowledge source
   - Example: If you uploaded a PDF about "Product X features", ask "What are the features of Product X?"

3. **Expected behavior**
   - Bot responds with information from your knowledge source
   - Answer should be accurate and relevant
   - May include specific details from your uploaded content

---

## Backend Verification

### Check Railway logs:

1. Go to https://railway.app
2. Select buildmybot2 project
3. View deployment logs
4. Look for:
   - "Document processed successfully"
   - "Web scraping completed"
   - OpenAI API calls
   - Any error messages

### Environment variables to verify on Railway:

```bash
OPENAI_API_KEY=sk-proj-...  # Required for OCR
DATABASE_URL=postgresql://... # Supabase connection
SESSION_SECRET=...           # For authentication
```

---

## Expected API Calls

When testing, these API endpoints are called:

### Website Scraping:
```
POST /api/knowledge/scrape/{botId}
Body: { "url": "https://example.com", "crawlDepth": 3 }
```

### PDF Upload:
```
POST /api/knowledge/upload/{botId}
Content-Type: multipart/form-data
Body: FormData with file
```

### Get Sources:
```
GET /api/knowledge/sources/{botId}
Response: { sources: [...], stats: {...} }
```

### Preview Content:
```
GET /api/knowledge/preview/{sourceId}
Response: { content: "..." }
```

### Delete Source:
```
DELETE /api/knowledge/sources/{sourceId}
```

### Refresh Source:
```
POST /api/knowledge/refresh/{sourceId}
```

---

## Success Criteria

### Website Scraping ✅
- [ ] Can enter URL and select crawl depth
- [ ] Scraping starts and shows loading state
- [ ] Source appears with "Processing" status
- [ ] Status changes to "Completed" after processing
- [ ] Preview shows extracted website content
- [ ] Page count and chunk count displayed correctly

### PDF Upload ✅
- [ ] Can drag-and-drop PDF files
- [ ] Can click to browse and select files
- [ ] Upload progress shows correctly
- [ ] Source appears with "Processing" status
- [ ] Status changes to "Completed" after processing
- [ ] Preview shows extracted PDF text
- [ ] OCR works for scanned PDFs
- [ ] Multiple files can be uploaded sequentially

### Knowledge Usage ✅
- [ ] Bot can answer questions using uploaded knowledge
- [ ] Responses are accurate and relevant
- [ ] Knowledge from multiple sources is combined

---

## Common Issues and Solutions

### Issue: "Failed to connect to server"
**Solution:**
- Check VITE_API_URL in Vercel environment variables
- Verify Railway backend is running
- Check CORS configuration

### Issue: PDF upload hangs at 100%
**Solution:**
- Check Railway logs for processing errors
- Verify OPENAI_API_KEY is set
- Check PDF file isn't corrupted

### Issue: Website scraping fails
**Solution:**
- Some websites block scrapers
- Try a different URL
- Check if URL requires authentication

### Issue: Preview shows empty content
**Solution:**
- Document processing may have failed
- Check if PDF is text-based or needs OCR
- Verify OpenAI API key is valid

---

## Need Help?

If tests fail:
1. Check browser console (F12) → Console tab
2. Check Railway logs for backend errors
3. Verify environment variables are set correctly
4. Check this file for troubleshooting steps

## Test Results Template

Copy this and fill it out:

```
Date: ___________
Tester: ___________

Website Scraping Test:
- URL tested: ___________
- Result: ☐ Pass ☐ Fail
- Notes: ___________

PDF Upload Test:
- File tested: ___________
- Result: ☐ Pass ☐ Fail
- Notes: ___________

Knowledge Usage Test:
- Question asked: ___________
- Bot response: ___________
- Result: ☐ Pass ☐ Fail
- Notes: ___________

Issues found:
___________
```
