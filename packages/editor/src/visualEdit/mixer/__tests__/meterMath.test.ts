import { describe, it, expect } from 'vitest'

import {
  rmsFromTimeDomain,
  levelFromActiveHaps,
  advanceMeter,
  DEFAULT_BALLISTICS,
  ZERO_METER,
  type MeterState,
  type MeterHap,
} from '../meterMath'

const hap = (begin: number, end: number, gain = 1, velocity = 1): MeterHap => ({
  begin,
  end,
  gain,
  velocity,
})

/** a flat time-domain buffer at a constant byte value (128 = silence). */
function flat(value: number, n = 8): Uint8Array {
  return new Uint8Array(n).fill(value)
}

/** a full-scale square wave: alternating 0 / 255 around the 128 centre. */
function square(n = 8): Uint8Array {
  const a = new Uint8Array(n)
  for (let i = 0; i < n; i++) a[i] = i % 2 === 0 ? 0 : 255
  return a
}

describe('rmsFromTimeDomain', () => {
  it('is 0 for silence (all samples at the 128 centre)', () => {
    expect(rmsFromTimeDomain(flat(128))).toBe(0)
  })

  it('is 0 for an empty buffer', () => {
    expect(rmsFromTimeDomain(new Uint8Array(0))).toBe(0)
  })

  it('is ~1 for a full-scale square wave', () => {
    // every sample is ±1 → RMS = 1 (255 maps to 127/128 ≈ 0.992, 0 maps to −1).
    expect(rmsFromTimeDomain(square())).toBeCloseTo(0.996, 2)
  })

  it('rises monotonically with amplitude', () => {
    const quiet = rmsFromTimeDomain(flat(140)) // |12/128|
    const loud = rmsFromTimeDomain(flat(180)) // |52/128|
    expect(loud).toBeGreaterThan(quiet)
    expect(quiet).toBeGreaterThan(0)
  })

  it('is symmetric about the centre (recentred, not raw bytes)', () => {
    expect(rmsFromTimeDomain(flat(108))).toBeCloseTo(rmsFromTimeDomain(flat(148)), 6)
  })
})

describe('levelFromActiveHaps', () => {
  it('is 0 when no hap covers now', () => {
    expect(levelFromActiveHaps([hap(0, 0.25)], 0.5)).toBe(0)
  })

  it('reads gain × velocity of the hap covering now', () => {
    expect(levelFromActiveHaps([hap(0, 0.5, 0.8, 0.5)], 0.25)).toBeCloseTo(0.4, 6)
  })

  it('picks the loudest of several overlapping haps', () => {
    const haps = [hap(0, 1, 0.3, 1), hap(0, 1, 0.9, 1), hap(0, 1, 0.5, 1)]
    expect(levelFromActiveHaps(haps, 0.5)).toBeCloseTo(0.9, 6)
  })

  it('includes a hap that begins exactly at now (onset), excludes one that ended', () => {
    expect(levelFromActiveHaps([hap(0.5, 0.75, 0.7, 1)], 0.5)).toBeCloseTo(0.7, 6)
    expect(levelFromActiveHaps([hap(0, 0.5, 0.7, 1)], 0.5)).toBe(0) // end === now → not active
  })

  it('reflects the track gain (so the fader and meter share one value)', () => {
    const quiet = levelFromActiveHaps([hap(0, 1, 0.2, 1)], 0.5)
    const loud = levelFromActiveHaps([hap(0, 1, 0.9, 1)], 0.5)
    expect(loud).toBeGreaterThan(quiet)
  })

  it('is 0 for an empty hap list (silent / un-evaluated track)', () => {
    expect(levelFromActiveHaps([], 0.5)).toBe(0)
  })
})

describe('advanceMeter', () => {
  it('attacks instantly: a louder reading jumps straight to it', () => {
    const next = advanceMeter(ZERO_METER, 0.7, 16)
    expect(next.rms).toBe(0.7)
    expect(next.peak).toBe(0.7)
  })

  it('releases slowly: a drop to silence eases down, not instant', () => {
    const loud: MeterState = { rms: 1, peak: 1, peakHoldMs: DEFAULT_BALLISTICS.peakHoldMs }
    const next = advanceMeter(loud, 0, 16)
    expect(next.rms).toBeGreaterThan(0) // hasn't snapped to 0
    expect(next.rms).toBeLessThan(1) // but is falling
  })

  it('release reaches near-silence after several time constants', () => {
    let s: MeterState = { rms: 1, peak: 1, peakHoldMs: 0 }
    // advance ~4 release time-constants worth of frames at silence
    for (let t = 0; t < DEFAULT_BALLISTICS.releaseMs * 4; t += 16) s = advanceMeter(s, 0, 16)
    expect(s.rms).toBeLessThan(0.02)
  })

  it('holds the peak above the falling bar during the hold window', () => {
    let s = advanceMeter(ZERO_METER, 0.9, 16) // peak latched at 0.9, hold full
    s = advanceMeter(s, 0, 16) // bar starts releasing
    expect(s.peak).toBe(0.9) // peak still held
    expect(s.rms).toBeLessThan(0.9) // bar already below it
  })

  it('peak falls after the hold expires and never drops below the live bar', () => {
    let s: MeterState = { rms: 0, peak: 0.8, peakHoldMs: 0 }
    s = advanceMeter(s, 0.3, 100) // hold already expired → peak falls toward live
    expect(s.peak).toBeLessThan(0.8)
    expect(s.peak).toBeGreaterThanOrEqual(0.3) // clamped to the live bar
  })

  it('a new louder reading re-latches the peak and resets the hold', () => {
    let s: MeterState = { rms: 0.2, peak: 0.5, peakHoldMs: 10 }
    s = advanceMeter(s, 0.95, 16)
    expect(s.peak).toBe(0.95)
    expect(s.peakHoldMs).toBe(DEFAULT_BALLISTICS.peakHoldMs)
  })

  it('treats a negative dt as a no-op step (frame-clock guard)', () => {
    const loud: MeterState = { rms: 0.6, peak: 0.6, peakHoldMs: 0 }
    const next = advanceMeter(loud, 0, -5)
    expect(next.rms).toBe(0.6) // exp(-0) = 1 → unchanged
  })
})
