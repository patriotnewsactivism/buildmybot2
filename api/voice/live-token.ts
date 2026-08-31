import type { VercelRequest, VercelResponse } from '@vercel/node';

const GEMINI_MODEL = 'models/gemini-3.1-flash-live-preview';
const TOKEN_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/auth_tokens';
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return true;
  if (/^https?:\/\/localhost(?::\d+)?$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/.test(origin)) {
    return true;
  }

  return new Set([
    'https://buildmybot.app',
    'https://www.buildmybot.app',
    'https://buildmmybot.app',
    'https://www.buildmmybot.app',
  ]).has(origin);
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const current = rateLimits.get(ip);
  if (!current || current.resetAt <= now) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }

  current.count += 1;
  return current.count > 10;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const origin =
    typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
      : '') ||
    (typeof req.headers['x-real-ip'] === 'string'
      ? req.headers['x-real-ip']
      : '') ||
    'unknown';
  if (isRateLimited(ip)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many live voice sessions' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[voice-live-token] GEMINI_API_KEY is not configured');
    return res.status(503).json({ error: 'Live voice is not configured' });
  }

  const now = Date.now();
  const expireTime = new Date(now + 30 * 60_000).toISOString();
  const newSessionExpireTime = new Date(now + 60_000).toISOString();

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: GEMINI_MODEL,
          config: {
            responseModalities: ['AUDIO'],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(
        '[voice-live-token] Gemini token request failed:',
        response.status,
        detail.slice(0, 300),
      );
      return res
        .status(502)
        .json({ error: 'Unable to create live voice session' });
    }

    const token = (await response.json()) as { name?: string };
    if (!token.name) {
      console.error('[voice-live-token] Gemini returned no token name');
      return res
        .status(502)
        .json({ error: 'Unable to create live voice session' });
    }

    return res.status(200).json({
      token: token.name,
      model: GEMINI_MODEL.replace('models/', ''),
      expiresAt: expireTime,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[voice-live-token] Request error:', message);
    return res
      .status(502)
      .json({ error: 'Unable to create live voice session' });
  }
}
