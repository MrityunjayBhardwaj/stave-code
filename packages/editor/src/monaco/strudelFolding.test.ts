/**
 * strudelFolding — unit tests for the pure `trackFoldingRanges` projection
 * (#708). Reuses the same REAL strip projection as the colour bars, through a
 * fake position-model, so fold boundaries are verified without a live Monaco
 * editor. (The gutter fold widgets + actual collapse are covered by the e2e
 * observation.)
 */
import { describe, it, expect } from 'vitest'
import { trackFoldingRanges } from './strudelFolding'
import type { PositionModel } from './useTrackColourBars'

/** A model that maps a 0-based char offset → Monaco 1-based position + getValue. */
function fakeModel(source: string): PositionModel & { getValue(): string } {
  return {
    getValue: () => source,
    getPositionAt(offset: number) {
      const clamped = Math.max(0, Math.min(offset, source.length))
      let line = 1
      let lastNl = -1
      for (let i = 0; i < clamped; i++) {
        if (source[i] === '\n') {
          line++
          lastNl = i
        }
      }
      return { lineNumber: line, column: clamped - lastNl }
    },
  }
}

const foldsFor = (src: string) => trackFoldingRanges(fakeModel(src))

describe('trackFoldingRanges', () => {
  it('returns no fold range for single-line tracks (nothing to collapse)', () => {
    expect(foldsFor(`bass: s("bd*4")\n$: s("hh*8")`)).toEqual([])
  })

  it('folds a multi-line (chained) track across its whole line range', () => {
    const src = `bass: s("bd*4")\n  .gain(0.8)\n  .lpf(800)`
    expect(foldsFor(src)).toEqual([{ start: 1, end: 3 }])
  })

  it('excludes config statements (setcps) and folds only the track block', () => {
    const src = `setcps(0.5)\nbass: s("bd*4")\n  .gain(0.8)`
    expect(foldsFor(src)).toEqual([{ start: 2, end: 3 }])
  })

  it('folds only the multi-line tracks in a mixed document', () => {
    const src = `lead: note("c e g")\nbass: s("bd*4")\n  .gain(0.8)\n  .lpf(800)`
    // lead is single-line (no fold); bass spans lines 2-4.
    expect(foldsFor(src)).toEqual([{ start: 2, end: 4 }])
  })

  it('returns no fold ranges for an empty document', () => {
    expect(foldsFor('')).toEqual([])
  })
})
