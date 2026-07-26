/**
 * The grid reader keeps each note's LENGTH (#1010 P4a).
 *
 * WHY THIS IS PINNED AT THE READER. Three axes have now been caught being dropped
 * on the way in — duration (#1026), gain (#1027), and a sounding note omitted
 * because `part` went unread (#1028) — and each one surfaced much later as a
 * silent-corruption class, once a writer re-derived what the model never held.
 * The reader is where that class starts, so it is where the axis is asserted.
 *
 * `readGridOnsets` is exported for this test alone. That is deliberate: the
 * boundary that drops axes is the one worth being able to interrogate directly,
 * and a field nothing asserts is a field that drifts (the lesson of #1031).
 *
 * The cases are chosen so that a reader which merely returned a CONSTANT — the
 * column width, say — would fail every one of them: each pattern has notes of
 * UNEQUAL length, and two of them have lengths that are not the grid's resolution
 * at all.
 */
import { describe, it, expect } from 'vitest'
import { mini as reifyMini } from '@strudel/mini/mini.mjs'
import { readGridOnsets, type Onset } from '../parse'

/** flatten to `atom@pos×dur` triples, rounded, so a mismatch reads in one line */
function read(mini: string): string[] {
  const r = readGridOnsets(reifyMini(mini), 0)
  if (!r.ok) throw new Error(`${mini} refused at gate: ${JSON.stringify(r.gate)}`)
  return (r.onsets as Onset[]).flatMap((o) =>
    o.atoms.map((a, i) => `${a}@${o.pos.toFixed(3)}×${o.durs[i].toFixed(3)}`),
  )
}

describe('#1010 P4a — the grid reader carries duration, as the roll always has', () => {
  it('reads equal lengths for an even pair', () => {
    expect(read('bd sd')).toEqual(['bd@0.000×0.500', 'sd@0.500×0.500'])
  })

  it('reads the WEIGHT an `@n` gives a note, not the column width', () => {
    // `bd@3 sd` is 3:1 — bd holds three quarters of the cycle. A reader that
    // returned the grid's resolution would say 0.5 for both.
    expect(read('bd@3 sd')).toEqual(['bd@0.000×0.750', 'sd@0.750×0.250'])
  })

  it('reads a length FINER than the grid resolution — the corruption case', () => {
    // `[hh ~]!16` is the unit named in the write path's duration-loss list: sixteen
    // notes of 1/32 each, laid on a 1/16 grid. Re-spelling it from a duration-free
    // cell model yields `~ hh hh …` — sixteen correct onsets, each twice as long.
    // This asserts the fact that makes that loss DETECTABLE rather than invisible.
    const got = read('[hh ~]!16')
    expect(got).toHaveLength(16)
    expect(got[0]).toBe('hh@0.000×0.031')
    expect(got[15]).toBe('hh@0.938×0.031')
    // every note the same length, and that length HALF the 1/16 column it sits in
    expect(new Set(got.map((g) => g.split('×')[1])).size).toBe(1)
  })

  it('reads a repeated element as several notes, each its own share', () => {
    expect(read('bd*2 sd')).toEqual([
      'bd@0.000×0.250',
      'bd@0.250×0.250',
      'sd@0.500×0.500',
    ])
  })

  it('reads a fractional weight against its siblings, not against the cycle', () => {
    // 0.5 : 1 : 1 : 1 — bd takes 0.5/3.5 of the cycle, an irrational-looking 1/7
    // that no resolution-derived guess would produce.
    expect(read('[bd@0.5 - - -]')).toEqual(['bd@0.000×0.143'])
  })
})
