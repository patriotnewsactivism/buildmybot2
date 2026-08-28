import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';

export function validateTwilioSignature(
  authToken: string,
  twilioSignature: string | undefined,
  url: string,
  params: Record<string, string | string[] | undefined> = {},
): boolean {
  if (!twilioSignature || !authToken) return false;
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    const val = params[key];
    if (typeof val === 'string') {
      data += key + val;
    } else if (Array.isArray(val)) {
      data += key + val.join('');
    }
  }
  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(twilioSignature, 'utf-8'),
      Buffer.from(expected, 'utf-8'),
    );
  } catch {
    return false;
  }
}

export interface VoiceGatewayConfig {
  provider: 'cartesia' | 'elevenlabs';
  voiceId?: string;
  streamUrl?: string;
}

export function getVoiceGatewayTwiML(config: VoiceGatewayConfig, textGreeting: string): string {
  const streamUrl = config.streamUrl || (config.provider === 'cartesia'
    ? 'wss://api.cartesia.ai/tts/websocket'
    : 'wss://api.elevenlabs.io/v1/text-to-speech/stream-input');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${escapeXml(textGreeting)}</Say>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="provider" value="${config.provider}" />
      <Parameter name="voiceId" value="${config.voiceId || 'default'}" />
    </Stream>
  </Connect>
</Response>`.trim();
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const signature = (req.headers['x-twilio-signature'] || '') as string;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const fullUrl = `${protocol}://${host}${req.url}`;

  const bodyParams = (req.body || {}) as Record<string, string>;
  if (process.env.NODE_ENV === 'production' && !validateTwilioSignature(authToken, signature, fullUrl, bodyParams)) {
    return res.status(403).json({ error: 'Invalid Twilio signature' });
  }

  const provider = (process.env.TTS_PROVIDER === 'elevenlabs' ? 'elevenlabs' : 'cartesia');
  const voiceId = process.env.DEFAULT_VOICE_ID || 'car_sonic_english';
  const twiml = getVoiceGatewayTwiML({ provider, voiceId }, 'Thank you for calling. Connecting to AI agent now.');

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
}
