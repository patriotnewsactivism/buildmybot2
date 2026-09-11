/**
 * Telephony-style tones for corporate pickup delay and mid-call handoffs.
 * Encoded as 8 kHz µ-law (PCMU) for Telnyx bidirectional media streaming.
 * Generated in-process so no hosted asset or carrier playback config is required.
 */

const SAMPLE_RATE = 8000;
const RING_ON_SEC = 2;
const RING_CYCLE_SEC = 6; // 2s on + 4s off
/** Default hold before the destination agent greets on corporate inbound. */
export const CORPORATE_PICKUP_DELAY_MS = 7000;
/** Mid-call department transfer hold (acknowledge → tone → destination greets). */
export const CORPORATE_TRANSFER_HOLD_MS = 5000;
/** Cap outbound PCMU backlog (~3s) to limit latency after Gemini bursts. */
export const MAX_OUTBOUND_PENDING_BYTES = 8000 * 3;
/**
 * Modest inbound PCM gain for distant phone mics. Applied after µ-law decode
 * so Gemini VAD hears realistic handset levels without aggressive barge-in.
 */
export const INBOUND_PCM_GAIN = 1.55;

function encodeMuLawSample(sample: number): number {
  const bias = 0x84;
  const clip = 32635;
  let pcm = Math.max(-clip, Math.min(clip, Math.round(sample)));
  const sign = pcm < 0 ? 0x80 : 0;
  if (pcm < 0) pcm = -pcm;
  pcm += bias;
  let exponent = 7;
  for (let mask = 0x4000; exponent > 0 && (pcm & mask) === 0; mask >>= 1) {
    exponent -= 1;
  }
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** Generate `durationMs` of ringback as raw µ-law bytes (not base64). */
export function generateRingbackMuLaw(durationMs: number): Buffer {
  const samples = Math.max(0, Math.floor((durationMs / 1000) * SAMPLE_RATE));
  const out = Buffer.allocUnsafe(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    const phase = t % RING_CYCLE_SEC;
    let amplitude = 0;
    if (phase < RING_ON_SEC) {
      // Soft level (~-14 dBFS peak) so it reads as hold tone, not blasting.
      amplitude =
        0.18 * Math.sin(2 * Math.PI * 440 * t) +
        0.18 * Math.sin(2 * Math.PI * 480 * t);
    }
    out[i] = encodeMuLawSample(amplitude * 32767);
  }
  return out;
}

/**
 * Soft continuous hold music for mid-call department transfers.
 * Unlike ringback, this has no long silent gaps so the caller hears that
 * they are still on the line while the destination agent connects.
 */
export function generateHoldMusicMuLaw(durationMs: number): Buffer {
  const samples = Math.max(0, Math.floor((durationMs / 1000) * SAMPLE_RATE));
  const out = Buffer.allocUnsafe(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    // Gentle A minor-ish pad with slow tremolo (~0.35 Hz).
    const tremolo = 0.72 + 0.28 * Math.sin(2 * Math.PI * 0.35 * t);
    const amplitude =
      tremolo *
      (0.09 * Math.sin(2 * Math.PI * 440 * t) +
        0.07 * Math.sin(2 * Math.PI * 523.25 * t) +
        0.05 * Math.sin(2 * Math.PI * 659.25 * t));
    out[i] = encodeMuLawSample(amplitude * 32767);
  }
  return out;
}
