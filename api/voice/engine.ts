/**
 * Live phone-path voice engine selection.
 * Deepgram Voice Agent owns Telnyx `/api/voice/telnyx-media` by default.
 * Gemini Live remains an explicit fallback when VOICE_ENGINE=gemini.
 */

export type LiveVoiceEngineName = 'deepgram' | 'gemini' | 'none';

export function isDeepgramVoiceEnabled(): boolean {
  const key = (process.env.DEEPGRAM_API_KEY || '').trim();
  if (!key) return false;
  const engine = (process.env.VOICE_ENGINE || 'deepgram').trim().toLowerCase();
  return engine !== 'gemini';
}

export function hasLiveVoiceEngine(): boolean {
  return (
    isDeepgramVoiceEnabled() ||
    Boolean((process.env.GEMINI_API_KEY || '').trim())
  );
}

export function liveVoiceEngineName(): LiveVoiceEngineName {
  if (isDeepgramVoiceEnabled()) return 'deepgram';
  if ((process.env.GEMINI_API_KEY || '').trim()) return 'gemini';
  return 'none';
}
