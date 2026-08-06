/**
 * Platform voice options for the Phone Agent.
 *
 * Voices are provided by the platform's Grok TTS engine (server-side
 * XAI_API_KEY) via POST /api/voice/preview — customers no longer bring their
 * own voice-provider API key. This is the single source of truth shared by
 * PhoneAgent and VoiceSetupWizard.
 */

import { buildApiUrl } from '../../services/apiConfig';

export interface VoiceOption {
  /** Grok voice_id sent to /api/voice/preview and the Twilio call path. */
  id: string;
  name: string;
  description: string;
  personality: string;
  bestFor: string;
}

/** The current Grok voice roster (GET https://api.x.ai/v1/tts/voices). */
export const VOICE_OPTIONS: VoiceOption[] = [
  {
    id: 'eve',
    name: 'Eve',
    description: 'Warm, professional female',
    personality: 'Clear, friendly, trustworthy',
    bestFor: 'Customer support, reception, general inquiries',
  },
  {
    id: 'ara',
    name: 'Ara',
    description: 'Bright, conversational female',
    personality: 'Approachable, energetic, helpful',
    bestFor: 'Sales, hospitality, bookings',
  },
  {
    id: 'leo',
    name: 'Leo',
    description: 'Confident, professional male',
    personality: 'Authoritative, calm, clear',
    bestFor: 'Finance, legal, technical support',
  },
];

export const DEFAULT_VOICE_ID = 'eve';

const PREVIEW_TEXT =
  'Hello! This is a preview of how I sound. How can I help you today?';

/**
 * Fetch a spoken preview of a voice from the platform TTS endpoint and return
 * a ready-to-play <audio> element. The object URL is revoked automatically
 * when playback ends. No API key required — the server holds the Grok key.
 */
export async function fetchVoicePreview(
  voiceId: string,
  text: string = PREVIEW_TEXT,
): Promise<HTMLAudioElement> {
  const response = await fetch(buildApiUrl('/voice/preview'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'grok', voice: voiceId, text }),
  });

  if (!response.ok) {
    throw new Error(`Voice preview failed (${response.status})`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.addEventListener('ended', () => URL.revokeObjectURL(url), {
    once: true,
  });
  return audio;
}
