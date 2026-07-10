import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * POST /api/voice/preview
 * Generates high-quality TTS audio via OpenAI for the landing page demo.
 * Returns raw MP3 audio bytes — no auth required (public demo).
 *
 * Body: { text: string, voice?: string }
 * Supported voices: alloy, echo, fable, onyx, nova, shimmer
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE = 'https://api.openai.com/v1';

// Rate limit: 30 requests per minute per IP
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 30;
}

// Valid voices for OpenAI TTS
const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'TTS not configured' });
  }

  // Rate limit
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { text, voice } = req.body || {};

  if (!text || typeof text !== 'string' || text.length > 1000) {
    return res
      .status(400)
      .json({ error: 'Text required (max 1000 characters)' });
  }

  const selectedVoice = VALID_VOICES.includes(voice) ? voice : 'shimmer';

  try {
    const ttsResponse = await fetch(`${OPENAI_BASE}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: text,
        voice: selectedVoice,
        response_format: 'mp3',
        speed: 1.0,
      }),
    });

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error('[voice-preview] OpenAI TTS error:', errorText);
      return res.status(500).json({ error: 'Voice generation failed' });
    }

    // Stream the MP3 audio back
    const audioBuffer = await ttsResponse.arrayBuffer();

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength.toString());
    res.setHeader('Cache-Control', 'public, max-age=3600');

    return res.send(Buffer.from(audioBuffer));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[voice-preview] Fatal error:', message);
    return res.status(500).json({ error: 'Voice generation failed' });
  }
}
