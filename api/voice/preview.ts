import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * POST /api/voice/preview
 * Generates high-quality TTS audio for the landing page demo.
 * Returns raw MP3 audio bytes — no auth required (public demo).
 *
 * Body: { text: string, voice?: string, provider?: string }
 * Supported providers: openai, cartesia, grok
 * Supported voices: alloy, echo, fable, onyx, nova, shimmer (OpenAI) | eve, ara, leo (Grok)
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY;
const OPENAI_BASE = 'https://api.openai.com/v1';
const CARTESIA_BASE = 'https://api.cartesia.ai/v1';
const XAI_BASE = 'https://api.x.ai/v1';

// Valid voices for OpenAI TTS
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

// Valid voices for Grok TTS (full list via GET https://api.x.ai/v1/tts/voices)
const GROK_VOICES = ['eve', 'ara', 'leo'];

// Valid voices for Cartesia TTS
const CARTESIA_VOICES = [
  'a0e99841-438c-4a64-b679-ae501e7d6091', // Sonia (English)
  '3f29c264-8501-4768-8996-6611cd608270', // Dorothy (English)
  '51152c88-9364-4049-9357-794174915703', // Liam (English)
  'a9391111-4723-4723-8b76-3d292c385d53', // Clara (English)
];

// Rate limit: 30 requests per minute per IP (in-memory, will reset on cold start)
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

interface TTSProvider {
  name: string;
  generateAudio: (text: string, voice: string, speed: number) => Promise<{ audioBuffer: ArrayBuffer; contentType: string }>;
  isConfigured: () => boolean;
  getDefaultVoice: () => string;
}

const openaiProvider: TTSProvider = {
  name: 'openai',
  isConfigured: () => !!OPENAI_API_KEY,
  getDefaultVoice: () => 'shimmer',
  generateAudio: async (text: string, voice: string, speed: number) => {
    const selectedVoice = OPENAI_VOICES.includes(voice) ? voice : 'shimmer';
    
    const response = await fetch(`${OPENAI_BASE}/audio/speech`, {
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
        speed: speed,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI TTS error: ${response.status} - ${errorText.slice(0, 200)}`);
    }

    const audioBuffer = await response.arrayBuffer();
    return { audioBuffer, contentType: 'audio/mpeg' };
  },
};

const cartesiaProvider: TTSProvider = {
  name: 'cartesia',
  isConfigured: () => !!CARTESIA_API_KEY,
  getDefaultVoice: () => 'a0e99841-438c-4a64-b679-ae501e7d6091', // Sonia
  generateAudio: async (text: string, voice: string, speed: number) => {
    const selectedVoice = CARTESIA_VOICES.includes(voice) ? voice : 'a0e99841-438c-4a64-b679-ae501e7d6091';
    
    const response = await fetch(`${CARTESIA_BASE}/tts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CARTESIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-2.0',
        voice_id: selectedVoice,
        text: text,
        speed: speed,
        output_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cartesia TTS error: ${response.status} - ${errorText.slice(0, 200)}`);
    }

    const audioBuffer = await response.arrayBuffer();
    return { audioBuffer, contentType: 'audio/mpeg' };
  },
};

const grokProvider: TTSProvider = {
  name: 'grok',
  isConfigured: () => !!XAI_API_KEY,
  getDefaultVoice: () => 'eve',
  generateAudio: async (text: string, voice: string, _speed: number) => {
    const selectedVoice = GROK_VOICES.includes(voice) ? voice : 'eve';

    const response = await fetch(`${XAI_BASE}/tts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice_id: selectedVoice,
        language: 'en',
        output_format: { codec: 'mp3', sample_rate: 24000, bit_rate: 128000 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grok TTS error: ${response.status} - ${errorText.slice(0, 200)}`);
    }

    const audioBuffer = await response.arrayBuffer();
    return { audioBuffer, contentType: 'audio/mpeg' };
  },
};

const providers: Record<string, TTSProvider> = {
  openai: openaiProvider,
  cartesia: cartesiaProvider,
  grok: grokProvider,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { text, voice, provider: providerName, speed = 1.0 } = req.body || {};

  // Validate input
  if (!text || typeof text !== 'string' || text.length === 0) {
    return res
      .status(400)
      .json({ error: 'Text required (max 5000 characters)' });
  }

  if (text.length > 5000) {
    return res
      .status(400)
      .json({ error: 'Text too long (max 5000 characters)' });
  }

  if (typeof speed !== 'number' || speed < 0.5 || speed > 2.0) {
    return res
      .status(400)
      .json({ error: 'Speed must be between 0.5 and 2.0' });
  }

  // Rate limit
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] as string ||
    'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  // Select provider
  const selectedProviderName = providerName && providers[providerName as string]
    ? (providerName as string)
    : 'openai';
  
  const selectedProvider = providers[selectedProviderName];
  
  if (!selectedProvider) {
    return res.status(400).json({ 
      error: `Unsupported provider: ${providerName}. Supported: ${Object.keys(providers).join(', ')}` 
    });
  }

  if (!selectedProvider.isConfigured()) {
    // Try fallback providers
    const availableProviders = Object.values(providers).filter(p => p.isConfigured());
    if (availableProviders.length === 0) {
      return res.status(500).json({ 
        error: 'No TTS provider configured. Please set OPENAI_API_KEY or CARTESIA_API_KEY' 
      });
    }
    // Use first available provider as fallback
    const fallbackProvider = availableProviders[0];
    console.warn(`[voice-preview] ${selectedProviderName} not configured, falling back to ${fallbackProvider.name}`);
    
    try {
      const { audioBuffer, contentType } = await fallbackProvider.generateAudio(text, voice || fallbackProvider.getDefaultVoice(), speed);
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', audioBuffer.byteLength.toString());
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-TTS-Provider', fallbackProvider.name);
      
      return res.send(Buffer.from(audioBuffer));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[voice-preview] Fallback provider ${fallbackProvider.name} failed:`, message);
      return res.status(500).json({ error: `TTS generation failed: ${message}` });
    }
  }

  try {
    const { audioBuffer, contentType } = await selectedProvider.generateAudio(
      text, 
      voice || selectedProvider.getDefaultVoice(), 
      speed
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', audioBuffer.byteLength.toString());
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-TTS-Provider', selectedProvider.name);

    return res.send(Buffer.from(audioBuffer));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[voice-preview] ${selectedProvider.name} failed:`, message);
    
    // Try fallback providers if primary fails
    const fallbackProviders = Object.values(providers).filter(p => p !== selectedProvider && p.isConfigured());
    for (const fallbackProvider of fallbackProviders) {
      try {
        console.warn(`[voice-preview] Trying fallback provider: ${fallbackProvider.name}`);
        const { audioBuffer, contentType } = await fallbackProvider.generateAudio(text, voice || fallbackProvider.getDefaultVoice(), speed);
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', audioBuffer.byteLength.toString());
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('X-TTS-Provider', fallbackProvider.name);
        res.setHeader('X-TTS-Fallback', 'true');
        
        return res.send(Buffer.from(audioBuffer));
      } catch (fallbackErr) {
        console.error(`[voice-preview] Fallback ${fallbackProvider.name} also failed:`, fallbackErr);
        continue;
      }
    }
    
    return res.status(500).json({ error: `All TTS providers failed: ${message}` });
  }
}
