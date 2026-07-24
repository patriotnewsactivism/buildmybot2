import { createHmac } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /api/voice/tts-clip?text=...&voice=...&token=...
 * Generates a Grok TTS audio clip for use in Twilio <Play> elements.
 * Token = first 16 hex chars of HMAC-SHA256(text|voice, XAI_API_KEY) — ties
 * the token to the exact (text, voice) pair so it can't be reused with
 * different content. No auth session required (Twilio fetches this URL).
 */

const XAI_API_KEY = process.env.XAI_API_KEY;

function makeToken(text: string, voice: string): string {
  return createHmac('sha256', XAI_API_KEY || 'unconfigured')
    .update(`${text}|${voice}`)
    .digest('hex')
    .slice(0, 16);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { text, voice = 'eve', token } = req.query as Record<string, string>;

  if (!text || typeof text !== 'string' || text.length === 0)
    return res.status(400).json({ error: 'text required' });
  if (text.length > 500)
    return res.status(400).json({ error: 'text too long (max 500 chars)' });
  if (!token) return res.status(403).json({ error: 'token required' });

  const expected = makeToken(text, voice);
  if (token !== expected)
    return res.status(403).json({ error: 'Invalid token' });

  if (!XAI_API_KEY) {
    console.error('[tts-clip] XAI_API_KEY not set');
    return res.status(503).json({ error: 'Grok TTS not configured' });
  }

  try {
    const response = await fetch('https://api.x.ai/v1/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice_id: voice,
        language: 'en',
        output_format: { codec: 'mp3', sample_rate: 24000, bit_rate: 128000 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(
        '[tts-clip] Grok TTS error:',
        response.status,
        errText.slice(0, 200),
      );
      return res.status(502).json({ error: 'TTS generation failed' });
    }

    const audioBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(Buffer.from(audioBuffer));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[tts-clip] Error:', message);
    return res.status(500).json({ error: 'Internal error' });
  }
}
