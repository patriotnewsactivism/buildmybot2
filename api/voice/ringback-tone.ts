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
/** Ringback while the voice engine connects so the caller is not on dead air after answer. */
export const CONNECT_COMFORT_MS = 4000;
/**
 * Minimum hold-music time after a transfer tool fires. Voice/prompt swap
 * happens immediately; destination greeting waits at least this long.
 */
export const TRANSFER_MIN_HOLD_MS = 2800;
/** Legacy alias used by the Gemini fallback path. */
export const CORPORATE_TRANSFER_HOLD_MS = TRANSFER_MIN_HOLD_MS;
/** Cap outbound PCMU backlog (~3s) to limit latency after Gemini bursts. */
export const MAX_OUTBOUND_PENDING_BYTES = 8000 * 3;
/**
 * Modest inbound PCM gain for distant phone mics. Applied after µ-law decode
 * so Gemini VAD hears realistic handset levels without aggressive barge-in.
 */
export const INBOUND_PCM_GAIN = 1.1;

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
 * Classic on-hold loop: walking bass, electric-piano chords, light melody.
 * Louder and more musical than a sine pad so PSTN callers hear real music.
 */
const HOLD_LOOP_SECONDS = 4;
const HOLD_BPM = 100;
let holdLoopCache: Buffer | null = null;

function hashedNoise(index: number): number {
  const x = Math.imul(index ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return (x / 0xffffffff) * 2 - 1;
}

function holdSample(t: number, index: number): number {
  const spb = 60 / HOLD_BPM;
  const beatIndex = Math.floor(t / spb) % 8;
  const bassFreqs = [65.41, 98.0, 110.0, 98.0, 87.31, 65.41, 73.42, 98.0];
  const bass = 0.2 * Math.sin(2 * Math.PI * bassFreqs[beatIndex] * t);
  const chordSets = [
    [261.63, 329.63, 392.0],
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 246.94, 293.66],
  ];
  const chord = chordSets[Math.floor(beatIndex / 2) % 4];
  const keys =
    0.1 * Math.sin(2 * Math.PI * chord[0] * t) +
    0.08 * Math.sin(2 * Math.PI * chord[1] * t) +
    0.07 * Math.sin(2 * Math.PI * chord[2] * t);
  const melodyNotes = [523.25, 0, 587.33, 523.25, 659.25, 0, 587.33, 392.0];
  const melodyFreq = melodyNotes[beatIndex];
  const decay = Math.exp(-((t % spb) * 3.6));
  const melody = melodyFreq
    ? 0.11 * Math.sin(2 * Math.PI * melodyFreq * t) * decay
    : 0;
  const hatPhase = t % (spb / 2);
  const hat =
    hatPhase < 0.025 ? hashedNoise(index) * 0.05 * (1 - hatPhase / 0.025) : 0;
  return Math.max(-1, Math.min(1, bass + keys + melody + hat));
}

function holdLoopMuLaw(): Buffer {
  if (holdLoopCache) return holdLoopCache;
  const samples = HOLD_LOOP_SECONDS * SAMPLE_RATE;
  const out = Buffer.allocUnsafe(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = encodeMuLawSample(holdSample(i / SAMPLE_RATE, i) * 32767);
  }
  holdLoopCache = out;
  return out;
}

export function generateHoldMusicMuLaw(durationMs: number): Buffer {
  const loop = holdLoopMuLaw();
  const samples = Math.max(0, Math.floor((durationMs / 1000) * SAMPLE_RATE));
  const out = Buffer.allocUnsafe(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = loop[i % loop.length];
  }
  return out;
}
