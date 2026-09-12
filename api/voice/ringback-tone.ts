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
 * Hold-music bed after a transfer tool fires. Voice/prompt swap happens
 * immediately; destination greeting waits at least this long so the caller
 * hears a realistic office hold, not a clipped beep.
 */
export const TRANSFER_MIN_HOLD_MS = 7500;
/** Gemini fallback uses the same mid-call hold interval. */
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
 * Soft telephony hold-music bed: warm Rhodes, rounded bass, slow pad.
 * 16s loop, band-limited to the PSTN voice channel, crossfaded so Deepgram
 * chunked playback can continue from an offset without a restart click.
 */
const HOLD_LOOP_SECONDS = 16;
const HOLD_BPM = 80;
const HOLD_CROSSFADE_SEC = 0.16;
const HOLD_HP_HZ = 280;
const HOLD_LP_HZ = 3400;
let holdLoopCache: Buffer | null = null;

function onePoleCoeffs(cutoffHz: number): number {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / SAMPLE_RATE;
  return dt / (rc + dt);
}

function rhodesTone(freq: number, t: number, age: number): number {
  const env = Math.exp(-age * 1.15) * (1 - Math.exp(-age * 28));
  return (
    env *
    (0.46 * Math.sin(2 * Math.PI * freq * t) +
      0.2 * Math.sin(2 * Math.PI * freq * 2 * t) +
      0.1 * Math.sin(2 * Math.PI * freq * 3.005 * t) +
      0.05 * Math.sin(2 * Math.PI * freq * 4.02 * t) +
      0.04 * Math.sin(2 * Math.PI * freq * 6.7 * t))
  );
}

function holdSample(t: number): number {
  const beat = t * (HOLD_BPM / 60);
  const chordIndex = Math.floor(beat / 2) % 8;
  const age = (beat % 2) * (60 / HOLD_BPM);
  const chords = [
    [261.63, 329.63, 392.0, 493.88],
    [220.0, 261.63, 329.63, 392.0],
    [293.66, 349.23, 440.0, 523.25],
    [196.0, 246.94, 293.66, 349.23],
    [329.63, 392.0, 493.88, 587.33],
    [220.0, 261.63, 329.63, 392.0],
    [174.61, 220.0, 261.63, 329.63],
    [196.0, 246.94, 293.66, 349.23],
  ];
  const bassFreqs = [65.41, 55.0, 73.42, 98.0, 82.41, 55.0, 87.31, 98.0];
  const chord = chords[chordIndex];
  const bassFreq = bassFreqs[chordIndex];
  const bassEnv =
    (1 - Math.exp(-age * 36)) * (0.74 + 0.26 * Math.exp(-age * 1.8));
  const bass =
    bassEnv *
    (0.16 * Math.sin(2 * Math.PI * bassFreq * t) +
      0.05 * Math.sin(2 * Math.PI * bassFreq * 2 * t));
  const keys =
    0.11 * rhodesTone(chord[0], t, age) +
    0.09 * rhodesTone(chord[1], t, age) +
    0.07 * rhodesTone(chord[2], t, age) +
    0.05 * rhodesTone(chord[3], t, age);
  const tremolo = 0.78 + 0.22 * Math.sin(2 * Math.PI * 0.22 * t);
  const pad =
    tremolo *
    (0.045 * Math.sin(2 * Math.PI * chord[0] * 0.5 * t) +
      0.035 * Math.sin(2 * Math.PI * chord[1] * 0.5 * 1.003 * t) +
      0.028 * Math.sin(2 * Math.PI * chord[2] * 0.5 * t));
  const melodyNotes = [0, 523.25, 0, 587.33, 523.25, 0, 659.25, 392.0];
  const melodyFreq = melodyNotes[chordIndex];
  const melody =
    melodyFreq && age < 1.15
      ? 0.045 * Math.sin(2 * Math.PI * melodyFreq * t) * Math.exp(-age * 1.8)
      : 0;
  return bass + keys + pad + melody;
}

function holdLoopMuLaw(): Buffer {
  if (holdLoopCache) return holdLoopCache;
  const samples = HOLD_LOOP_SECONDS * SAMPLE_RATE;
  const fade = Math.floor(HOLD_CROSSFADE_SEC * SAMPLE_RATE);
  const raw = new Float64Array(samples);
  const hpA = onePoleCoeffs(HOLD_HP_HZ);
  const lpA = onePoleCoeffs(HOLD_LP_HZ);
  let hpY = 0;
  let lpY = 0;
  for (let i = 0; i < samples; i++) {
    const x = holdSample(i / SAMPLE_RATE);
    hpY += hpA * (x - hpY);
    const highpassed = x - hpY;
    lpY += lpA * (highpassed - lpY);
    raw[i] = Math.tanh(lpY * 1.15);
  }
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    const mixed = raw[i] * w + raw[samples - fade + i] * (1 - w);
    raw[i] = mixed;
    raw[samples - fade + i] = mixed;
  }
  const out = Buffer.allocUnsafe(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = encodeMuLawSample(raw[i] * 0.72 * 32767);
  }
  holdLoopCache = out;
  return out;
}

/**
 * Generate `durationMs` of hold music. `offsetMs` continues through the
 * cached loop so chunked Deepgram playback does not restart the bed.
 */
export function generateHoldMusicMuLaw(
  durationMs: number,
  offsetMs = 0,
): Buffer {
  const loop = holdLoopMuLaw();
  const samples = Math.max(0, Math.floor((durationMs / 1000) * SAMPLE_RATE));
  const start = Math.max(0, Math.floor((offsetMs / 1000) * SAMPLE_RATE));
  const out = Buffer.allocUnsafe(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = loop[(start + i) % loop.length];
  }
  return out;
}
