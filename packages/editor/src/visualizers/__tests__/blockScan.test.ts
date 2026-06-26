import { describe, it, expect } from 'vitest'
import { startsTopLevelBlock } from '../blockScan'

describe('startsTopLevelBlock', () => {
  it('recognizes an audible anonymous track', () => {
    expect(startsTopLevelBlock('$: note("c e g")')).toBe(true)
  })

  it('recognizes a soloed-out / muted anonymous track (`_$:`) — the #569 case', () => {
    // The solo overlay silences non-soloed tracks with a `_` prefix. Without
    // recognizing this form, a soloed track absorbs the following `_$:` lines.
    expect(startsTopLevelBlock('_$: note("c e g")')).toBe(true)
  })

  it('recognizes the transport statement', () => {
    expect(startsTopLevelBlock('setcps(90/240).gain(0.3)')).toBe(true)
  })

  it('recognizes a bare expression wrapped by the solo overlay (`/* … */`)', () => {
    expect(startsTopLevelBlock('/* setcps(0.5).gain(0.3)')).toBe(true)
  })

  it('does NOT treat a method-chain continuation line as a boundary', () => {
    expect(startsTopLevelBlock('.s("sawtooth")')).toBe(false)
    expect(startsTopLevelBlock('.lpf(sine.range(300, 900).slow(8))')).toBe(false)
    expect(startsTopLevelBlock('.pan(0.5).viz(\'Prism\')')).toBe(false)
  })

  it('does NOT treat a stack(...) member line as a boundary', () => {
    expect(startsTopLevelBlock('s("bd ~ ~ ~ bd ~ bd ~").gain(0.19),')).toBe(false)
  })

  it('does NOT treat a line comment as a boundary', () => {
    expect(startsTopLevelBlock('// ── the bass pulse ──')).toBe(false)
  })

  it('does NOT treat a blank line as a boundary', () => {
    expect(startsTopLevelBlock('')).toBe(false)
  })
})
