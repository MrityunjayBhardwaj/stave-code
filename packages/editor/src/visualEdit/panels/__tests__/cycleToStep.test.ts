import { describe, it, expect } from 'vitest'
import { cycleToStep } from '../usePlayingStep'

describe('cycleToStep', () => {
  it('maps a flat-pattern cycle to its step', () => {
    expect(cycleToStep(0, 4, 1)).toBe(0)
    expect(cycleToStep(0.25, 4, 1)).toBe(1)
    expect(cycleToStep(0.5, 4, 1)).toBe(2)
    expect(cycleToStep(0.99, 4, 1)).toBe(3)
    expect(cycleToStep(1, 4, 1)).toBe(0) // wraps each cycle
    expect(cycleToStep(2.5, 4, 1)).toBe(2)
  })

  it('takes the phase mod bars for multi-bar patterns', () => {
    // 8 steps across 2 bars → 4 steps per bar
    expect(cycleToStep(0, 8, 2)).toBe(0)
    expect(cycleToStep(1, 8, 2)).toBe(4) // start of bar 2
    expect(cycleToStep(1.5, 8, 2)).toBe(6)
    expect(cycleToStep(2, 8, 2)).toBe(0) // wraps after 2 bars
  })

  it('is robust to negative cycles', () => {
    expect(cycleToStep(-0.25, 4, 1)).toBe(3)
  })

  it('returns null when not playing or empty', () => {
    expect(cycleToStep(null, 4, 1)).toBeNull()
    expect(cycleToStep(0.5, 0, 1)).toBeNull()
    expect(cycleToStep(Infinity, 4, 1)).toBeNull()
  })

  it('clamps into range', () => {
    expect(cycleToStep(0.999999, 4, 1)).toBe(3)
  })
})
