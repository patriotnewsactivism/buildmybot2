import { describe, expect, it } from 'vitest';
import {
  CORPORATE_PICKUP_DELAY_MS,
  CORPORATE_TRANSFER_HOLD_MS,
  INBOUND_PCM_GAIN,
  generateHoldMusicMuLaw,
  generateRingbackMuLaw,
} from '../api/voice/ringback-tone';

describe('ringback tone', () => {
  it('generates ~7s of 8kHz µ-law audio with audible on/off cadence', () => {
    expect(CORPORATE_PICKUP_DELAY_MS).toBe(7000);
    const buf = generateRingbackMuLaw(CORPORATE_PICKUP_DELAY_MS);
    expect(buf.length).toBe(8000 * 7);
    // First 2s should not be silence-only (ring on); mid 4s-off has idle bytes.
    const firstSecond = buf.subarray(0, 8000);
    const unique = new Set(firstSecond);
    expect(unique.size).toBeGreaterThan(8);
    const quietSecond = buf.subarray(8000 * 3, 8000 * 4);
    expect(new Set(quietSecond).size).toBe(1);
  });

  it('generates continuous soft hold music for mid-call transfers', () => {
    expect(CORPORATE_TRANSFER_HOLD_MS).toBe(7500);
    expect(INBOUND_PCM_GAIN).toBeGreaterThan(1);
    const buf = generateHoldMusicMuLaw(CORPORATE_TRANSFER_HOLD_MS);
    expect(buf.length).toBe((8000 * 7500) / 1000);
    // No long silence gaps: every second should have audible variety.
    for (let s = 0; s < 7; s++) {
      const slice = buf.subarray(8000 * s, 8000 * (s + 1));
      expect(new Set(slice).size).toBeGreaterThan(8);
    }
  });
});
