import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Chat demo endpoint for Vercel serverless ───
// Proxies to Base44 backend function which handles AI provider fallback.
// This keeps AI keys off Vercel and eliminates Render dependency entirely.

const BASE44_CHAT_URL =
  'https://superagent-08b20413.base44.app/functions/chatDemo';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, systemPrompt, context } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Proxy to Base44 backend function (has AI keys + fallback chain)
    const base44Response = await fetch(BASE44_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, systemPrompt, context }),
      signal: AbortSignal.timeout(25000), // 25s max
    });

    if (!base44Response.ok) {
      const errorText = await base44Response.text();
      console.error(
        '[chat-demo] Base44 function error:',
        base44Response.status,
        errorText,
      );
      return res.status(500).json({
        error: 'Failed to get AI response',
        details: `AI service returned ${base44Response.status}`,
      });
    }

    const data = await base44Response.json();
    return res.status(200).json({ response: data.response || data.text || '' });
  } catch (error: any) {
    console.error('[chat-demo] Fatal error:', error?.message || error);
    return res.status(500).json({
      error: 'Failed to get AI response',
      details: error?.message || 'Unknown error',
    });
  }
}
