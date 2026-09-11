/**
 * Telephony-style North American ringback for corporate pickup delay.
 * 440 Hz + 480 Hz, 2s on / 4s off, encoded as 8 kHz µ-law (PCMU) for Telnyx
 * bidirectional media streaming. Generated in-process so no hosted asset or
 * carrier playback config is required.
 */

const SAMPLE_RATE = 8000;
const RING_ON_SEC = 2;
const RING_CYCLE_SEC = 6; // 2s on + 4s off
/** Default hold before the destination agent greets on corporate inbound. */
export const CORPORATE_PICKUP_DELAY_MS = 7000;
/** Cap outbound PCMU backlog (~3s) to limit latency after Gemini bursts. */
export const MAX_OUTBOUND_PENDING_BYTES = 8000 * 3;

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
