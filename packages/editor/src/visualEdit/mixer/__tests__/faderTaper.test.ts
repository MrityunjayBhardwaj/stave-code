import { describe, it, expect } from 'vitest'

import {
  MAX_FADER_GAIN,
  faderPosToGain,
  gainToFaderPos,
  gainToDb,
  formatDb,
} from '../faderTaper'

describe('fader taper', () => {
  it('round-trips position ↔ gain', () => {
    for (const pos of [0, 0.25, 0.5, 0.841, 1]) {
      expect(gainToFaderPos(faderPosToGain(pos))).toBeCloseTo(pos, 5)
    }
  })

  it('bottom is silence, top is +6 dB makeup', () => {
    expect(faderPosToGain(0)).toBe(0)
    expect(faderPosToGain(1)).toBeCloseTo(MAX_FADER_GAIN, 5)
    expect(gainToDb(MAX_FADER_GAIN)).toBeCloseTo(6, 3)
  })

  it('puts unity (0 dB) in the top portion of the travel', () => {
    const pos = gainToFaderPos(1)
    expect(pos).toBeGreaterThan(0.8)
    expect(pos).toBeLessThan(0.9)
  })

  it('clamps out-of-range gain to the fader ends', () => {
    expect(gainToFaderPos(0)).toBe(0)
    expect(gainToFaderPos(-1)).toBe(0)
    expect(gainToFaderPos(10)).toBe(1)
  })
})

describe('dB display', () => {
  it('shows -∞ at silence, a sign on positive, plain on negative', () => {
    expect(formatDb(0)).toBe('-∞')
    expect(formatDb(1)).toBe('0.0')
    expect(formatDb(MAX_FADER_GAIN)).toBe('+6.0')
    expect(gainToDb(0.5)).toBeCloseTo(-6.02, 1)
  })
})
