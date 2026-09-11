import { describe, expect, it } from 'vitest';
import {
  CORPORATE_PICKUP_DELAY_MS,
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
});
