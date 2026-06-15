import { describe, it, expect } from 'vitest'
import { knobRangeFor } from '../knobRanges'

describe('knobRangeFor', () => {
  it('uses sensible ranges for known methods (S4)', () => {
    expect(knobRangeFor('gain', 0.6)).toMatchObject({ min: 0, max: 1, scale: 'linear' })
    expect(knobRangeFor('speed', 1)).toMatchObject({ min: -2, max: 2 })
    expect(knobRangeFor('room', 0.5)).toMatchObject({ min: 0, max: 1 })
    expect(knobRangeFor('crush', 4)).toMatchObject({ min: 1, max: 16, step: 1 })
  })

  it('marks filter cutoffs as logarithmic', () => {
    expect(knobRangeFor('lpf', 800)).toMatchObject({ scale: 'log', min: 20, max: 20000 })
    expect(knobRangeFor('cutoff', 1200).scale).toBe('log')
  })

  it('widens the ceiling when the authored value exceeds the default', () => {
    // a hand-written gain of 1.4 must still be representable
    expect(knobRangeFor('gain', 1.4).max).toBe(1.4)
  })

  it('widens the floor when the value is below the default minimum', () => {
    expect(knobRangeFor('speed', -3).min).toBe(-3)
  })

  it('falls back to 0..1 for an unknown method with a 0..1 value', () => {
    expect(knobRangeFor('wibble', 0.3)).toMatchObject({ min: 0, max: 1, step: 0.01 })
  })

  it('falls back to a value-containing range for an unknown out-of-unit method', () => {
    const r = knobRangeFor('wobble', 50)
    expect(r.min).toBeLessThanOrEqual(50)
    expect(r.max).toBeGreaterThanOrEqual(50)
  })

  it('handles a negative unknown value', () => {
    const r = knobRangeFor('wobble', -10)
    expect(r.min).toBeLessThanOrEqual(-10)
  })
})
