import type { VercelRequest, VercelResponse } from '@vercel/node';

const GEMINI_MODEL = 'models/gemini-3.1-flash-live-preview';
const DEMO_VOICE = 'Sulafat';
const TOKEN_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/auth_tokens';
const DEMO_SESSION_SECONDS = 90;
const DEMO_MAX_TURNS = 6;
const RATE_LIMIT_WINDOW_MS = 60 * 60_000;
const RATE_LIMIT_MAX_SESSIONS = 4;
const rateLimits = new Map<string, { count: number; resetAt: number }>();

const DEMO_SYSTEM_INSTRUCTION = `You are the BuildMyBot live voice concierge in a short public product demo.

VOICE AND CONVERSATION
- Sound warm, confident, relaxed, and genuinely conversational.
- Speak naturally with contractions and varied pacing. Avoid canned call-center language.
- Keep most replies to one to three short sentences.
- Let the visitor finish their thought and tolerate normal pauses.
- If the visitor interrupts, stop and listen naturally.
- If they correct a detail mid-sentence, use the corrected detail.
- Ask one useful question at a time.
- Never pretend to be human.

DEMO PURPOSE
- Demonstrate how a BuildMyBot AI receptionist can answer questions, qualify a caller, capture intent, discuss scheduling, explain hot-lead alerts, and explain warm human handoffs.
- This public demo cannot execute real transfers, bookings, payments, text messages, or CRM writes. Never claim one succeeded.
- If asked to demonstrate an action, explain briefly what the production agent would do and continue the conversation naturally.
- Do not turn the demo into an open-ended general assistant. Keep the conversation focused on BuildMyBot and realistic business-call scenarios.

LIMITS
- This is intentionally a short showcase. Aim to demonstrate the experience within about 60 to 90 seconds and no more than roughly ${DEMO_MAX_TURNS} meaningful back-and-forth exchanges.
- As the demo approaches its end, give a concise, friendly closing and invite the visitor to start free or contact BuildMyBot.
- Do not prolong the conversation merely because the visitor keeps talking.`;

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

function getClientIp(req: VercelRequest): string {
  const cloudflareIp = req.headers['cf-connecting-ip'];
  if (typeof cloudflareIp === 'string' && cloudflareIp.trim()) {
    return cloudflareIp.trim();
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  const realIp = req.headers['x-real-ip'];
  return typeof realIp === 'string' && realIp.trim()
    ? realIp.trim()
    : 'unknown';
}

function getRateLimit(ip: string): {
  limited: boolean;
  remaining: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const current = rateLimits.get(ip);

  if (!current || current.resetAt <= now) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return {
      limited: false,
      remaining: RATE_LIMIT_MAX_SESSIONS - 1,
      retryAfterSeconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    };
  }

  if (current.count >= RATE_LIMIT_MAX_SESSIONS) {
    return {
      limited: true,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return {
    limited: false,
    remaining: RATE_LIMIT_MAX_SESSIONS - current.count,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
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

  const rateLimit = getRateLimit(getClientIp(req));
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX_SESSIONS));
  res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
  if (rateLimit.limited) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
    return res.status(429).json({
      error: 'Demo limit reached. Please try again later.',
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[voice-live-token] GEMINI_API_KEY is not configured');
    return res.status(503).json({ error: 'Live voice is not configured' });
  }

  const now = Date.now();
  const expireTime = new Date(
    now + (DEMO_SESSION_SECONDS + 10) * 1000,
  ).toISOString();
  const newSessionExpireTime = new Date(now + 45_000).toISOString();

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
        bidiGenerateContentSetup: {
          model: GEMINI_MODEL,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: DEMO_VOICE },
              },
              languageCode: 'en-US',
            },
            thinkingConfig: { thinkingLevel: 'minimal' },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: false,
              startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
              endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
              prefixPaddingMs: 120,
              silenceDurationMs: 800,
            },
            activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
            turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
          },
          systemInstruction: {
            parts: [{ text: DEMO_SYSTEM_INSTRUCTION }],
          },
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(
        '[voice-live-token] Gemini token request failed:',
        response.status,
        detail.slice(0, 500),
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
      voice: DEMO_VOICE,
      maxDurationSeconds: DEMO_SESSION_SECONDS,
      maxTurns: DEMO_MAX_TURNS,
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
