import { describe, it, expect } from 'vitest'
import { cycleToStep } from '../usePlayingStep'

describe('cycleToStep', () => {
  it('maps a flat-pattern cycle to its step', () => {
    expect(cycleToStep(0, 4, 1, 4)).toBe(0)
    expect(cycleToStep(0.25, 4, 1, 4)).toBe(1)
    expect(cycleToStep(0.5, 4, 1, 4)).toBe(2)
    expect(cycleToStep(0.99, 4, 1, 4)).toBe(3)
    expect(cycleToStep(1, 4, 1, 4)).toBe(0) // wraps each cycle
    expect(cycleToStep(2.5, 4, 1, 4)).toBe(2)
  })

  it('takes the phase mod bars for multi-bar patterns', () => {
    // 8 steps across 2 bars → 4 steps per bar
    expect(cycleToStep(0, 8, 2, 8)).toBe(0)
    expect(cycleToStep(1, 8, 2, 8)).toBe(4) // start of bar 2
    expect(cycleToStep(1.5, 8, 2, 8)).toBe(6)
    expect(cycleToStep(2, 8, 2, 8)).toBe(0) // wraps after 2 bars
  })

  it('is robust to negative cycles', () => {
    expect(cycleToStep(-0.25, 4, 1, 4)).toBe(3)
  })

  it('returns null when not playing or empty', () => {
    expect(cycleToStep(null, 4, 1, 4)).toBeNull()
    expect(cycleToStep(0.5, 0, 1, 0)).toBeNull()
    expect(cycleToStep(Infinity, 4, 1, 4)).toBeNull()
  })

  it('clamps into range', () => {
    expect(cycleToStep(0.999999, 4, 1, 4)).toBe(3)
  })

  /**
   * #1087 — a pattern's length need not be a whole number of columns (`note("c4@1.5
   * e4@1.2")` is 2.7 long). The clamp used to be `steps - 1`, so on such a pattern it
   * returned `1.7` — a value no column index can equal, so the playing highlight simply
   * never fired on the last column. The mapping still divides the true length; only the
   * bound is a column count.
   */
  it('clamps a fractional-length pattern to a real column', () => {
    // `note("c4@1.5 e4@1.2")` — 2.7 long, three columns drawn
    for (const cycle of [0, 0.3, 0.6, 0.9, 0.999999]) {
      const step = cycleToStep(cycle, 2.7, 1, 3)
      expect(Number.isInteger(step), `cycle ${cycle} gave ${step}`).toBe(true)
      expect(step).toBeGreaterThanOrEqual(0)
      expect(step).toBeLessThanOrEqual(2)
    }
    // the position still comes from the true LENGTH, not from the column count:
    // at 70% of a 2.7-column pattern the playhead is in column 1, not column 2
    expect(cycleToStep(0.7, 2.7, 1, 3)).toBe(1)
    expect(cycleToStep(0.999999, 2.7, 1, 3)).toBe(2)
  })

  it('never highlights a column the panel did not draw', () => {
    // `note("c4 ~@0.5")` — 1.5 long, but the fractional tail holds a rest, so only
    // ONE column is drawn. The mapping reaches 1 near the end of the cycle; the bound
    // is what keeps the highlight on a column that exists.
    expect(cycleToStep(0.9, 1.5, 1, 1)).toBe(0)
    expect(cycleToStep(0.999999, 1.5, 1, 1)).toBe(0)
  })
})
