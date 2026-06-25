import { describe, it, expect } from 'vitest'

import { stripScaleFor, STRIP_BASE_HEIGHT } from '../useStripScale'

const PAD = 16 // band vertical padding subtracted before the ratio

describe('stripScaleFor — aspect-locked strip zoom from band height', () => {
  it('is exactly 1× when the band fits one base strip', () => {
    expect(stripScaleFor(STRIP_BASE_HEIGHT + PAD)).toBe(1)
  })

  it('never shrinks below 1× on a short drawer (strips clip, faders stay usable)', () => {
    expect(stripScaleFor(80)).toBe(1)
    expect(stripScaleFor(0)).toBe(1)
  })

  it('grows with the drawer height above the base', () => {
    // (2*190 + 16 - 16) / 190 = 2.0
    expect(stripScaleFor(2 * STRIP_BASE_HEIGHT + PAD)).toBe(2)
    expect(stripScaleFor(STRIP_BASE_HEIGHT * 1.5 + PAD)).toBeCloseTo(1.5, 2)
  })

  it('caps at 2.4× on a very tall drawer', () => {
    expect(stripScaleFor(5000)).toBe(2.4)
  })

  it('degrades to 1× for a non-finite height (unmeasured / detached)', () => {
    expect(stripScaleFor(NaN)).toBe(1)
    expect(stripScaleFor(Infinity)).toBe(1) // non-finite ratio → safe 1×
  })

  it('rounds to 2dp so a resize drag does not thrash React', () => {
    const u = stripScaleFor(333)
    expect(u).toBe(Math.round(u * 100) / 100)
  })
})
