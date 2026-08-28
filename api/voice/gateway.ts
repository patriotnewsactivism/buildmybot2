/**
 * Inbound Twilio voice gateway routing with Cartesia & ElevenLabs TTS pipelines.
 */

export interface VoiceGatewayConfig {
  provider: 'cartesia' | 'elevenlabs' | 'twilio_default';
  voiceId?: string;
  cartesiaApiKey?: string;
  elevenLabsApiKey?: string;
  systemPrompt?: string;
  transferNumber?: string;
}

export interface VoiceWebhookPayload {
  CallSid: string;
  From: string;
  To: string;
  Digits?: string;
  SpeechResult?: string;
}

export function generateTwimlResponse(options: {
  message: string;
  gatherInput?: boolean;
  actionUrl?: string;
  transferTo?: string;
  ttsAudioUrl?: string;
}): string {
  const { message, gatherInput = false, actionUrl = '/api/voice/webhook', transferTo, ttsAudioUrl } = options;

  let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';

  if (ttsAudioUrl) {
    twiml += `  <Play>${escapeXml(ttsAudioUrl)}</Play>\n`;
  } else if (gatherInput) {
    twiml += `  <Gather input="speech dtmf" action="${escapeXml(actionUrl)}" method="POST" timeout="5" speechTimeout="auto">\n`;
    twiml += `    <Say voice="Polly.Joanna-Neural">${escapeXml(message)}</Say>\n`;
    twiml += '  </Gather>\n';
    twiml += '  <Say voice="Polly.Joanna-Neural">We did not receive any input. Goodbye!</Say>\n';
  } else if (transferTo) {
    twiml += `  <Say voice="Polly.Joanna-Neural">${escapeXml(message)}</Say>\n`;
    twiml += `  <Dial>${escapeXml(transferTo)}</Dial>\n`;
  } else {
    twiml += `  <Say voice="Polly.Joanna-Neural">${escapeXml(message)}</Say>\n`;
  }

  twiml += '</Response>';
  return twiml;
}

export async function synthesizeCartesiaVoice(text: string, options: { apiKey: string; voiceId: string }): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'X-API-Key': options.apiKey,
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-english',
        transcript: text,
        voice: {
          mode: 'id',
          id: options.voiceId,
        },
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: 24000,
        },
      }),
    });

    if (!response.ok) {
      return null;
    }
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

export async function synthesizeElevenLabsVoice(text: string, options: { apiKey: string; voiceId: string }): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${options.voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': options.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      return null;
    }
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
