/**
 * Square-bracket chord parsing (#508).
 *
 * Mini-notation `[a,b,c]` (comma) is a CHORD — parallel notes each spanning the
 * full cycle — distinct from `[a b c]` (spaces), a sequence. Before the fix the
 * `[...]` parser ignored top-level commas, so a chord parsed identically to a
 * sequence and the structural IR arpeggiated it. The audio path (real Strudel)
 * was always correct; this guards the structural IR + its round-trip.
 */
import { describe, it, expect } from 'vitest'
import { parseStrudel } from '../parseStrudel'
import { toStrudel } from '../toStrudel'
import { collectCycles } from './helpers/collectCycles'

const begins = (code: string): Array<{ b: number; e: number; n: unknown }> =>
  collectCycles(parseStrudel(code), 0, 1).map((ev) => ({
    b: +ev.begin.toFixed(4),
    e: +ev.end.toFixed(4),
    n: ev.note,
  }))

describe('square-bracket chords (#508)', () => {
  it('`[a,b,c]` is a chord: all notes share begin=0, end=1', () => {
    expect(begins('note("[c2,e2,g2]")')).toEqual([
      { b: 0, e: 1, n: 'c2' },
      { b: 0, e: 1, n: 'e2' },
      { b: 0, e: 1, n: 'g2' },
    ])
  })

  it('`[a b c]` stays a sequence: staggered begins (unchanged)', () => {
    const seq = begins('note("[c2 e2 g2]")')
    expect(seq.map((x) => x.b)).toEqual([0, 0.3333, 0.6667])
  })

  it('mixed `[a b, c]` = a stack of one sub-sequence and one full-cycle note', () => {
    expect(begins('note("[c2 e2, g2]")')).toEqual([
      { b: 0, e: 0.5, n: 'c2' },
      { b: 0.5, e: 1, n: 'e2' },
      { b: 0, e: 1, n: 'g2' },
    ])
  })

  it('a chord alternates per cycle inside `<...>`', () => {
    expect(begins('note("<[c2,e2,g2] [d2,f2,a2]>")')).toEqual([
      { b: 0, e: 1, n: 'c2' },
      { b: 0, e: 1, n: 'e2' },
      { b: 0, e: 1, n: 'g2' },
    ])
  })

  it('sample chords stack too: `[bd,hh]`', () => {
    const evs = collectCycles(parseStrudel('s("[bd,hh]")'), 0, 1)
    expect(evs.map((e) => ({ b: +e.begin.toFixed(4), s: e.s }))).toEqual([
      { b: 0, s: 'bd' },
      { b: 0, s: 'hh' },
    ])
  })

  it('round-trips faithfully back to mini-notation', () => {
    for (const code of [
      'note("[c2,e2,g2]")',
      'note("<[c2,e2,g2] [d2,f2,a2]>")',
    ]) {
      // toStrudel is byte-faithful for these; re-parse must be a fixpoint either way.
      expect(toStrudel(parseStrudel(code))).toBe(code)
    }
  })

  it('mixed note+sample stack is NOT collapsed to one mini wrapper', () => {
    // A note token inside `s("…")` would play as a sample — fall back to stack().
    const ir = parseStrudel('stack(s("bd sd"), note("c4 e4"))')
    expect(toStrudel(ir)).toContain('stack(')
  })
})
