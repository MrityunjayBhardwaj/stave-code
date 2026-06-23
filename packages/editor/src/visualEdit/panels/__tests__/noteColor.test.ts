import { describe, it, expect } from 'vitest'

import { velocityColor } from '../noteColor'

/** parse `hsl(H, S%, L%)` → H for ordering assertions */
function hueOf(hsl: string): number {
  const m = hsl.match(/^hsl\((\d+),/)
  if (!m) throw new Error(`not an hsl string: ${hsl}`)
  return parseInt(m[1], 10)
}

describe('velocityColor (#428)', () => {
  it('returns a valid hsl string', () => {
    expect(velocityColor(0.5)).toMatch(/^hsl\(\d+, 72%, 56%\)$/)
  })

  it('loud (high gain) is warmer than soft (low gain)', () => {
    // warm = lower hue (toward red); cool = higher hue (toward blue)
    expect(hueOf(velocityColor(1))).toBeLessThan(hueOf(velocityColor(0)))
  })

  it('preserves relative differences (monotonic in gain)', () => {
    const h0 = hueOf(velocityColor(0))
    const h5 = hueOf(velocityColor(0.5))
    const h1 = hueOf(velocityColor(1))
    expect(h0).toBeGreaterThan(h5)
    expect(h5).toBeGreaterThan(h1)
  })

  it('clamps gain to [0,1] — a >1 gain reads as full-warm, not past it', () => {
    expect(velocityColor(1.5)).toBe(velocityColor(1))
    expect(velocityColor(-0.2)).toBe(velocityColor(0))
  })
})
