/**
 * chordLanes — is a step grid holding chord symbols rather than sound names?
 *
 * ── WHAT THESE ARMS ARE FOR ──────────────────────────────────────────────
 * The predicate decides two things that both fail SILENTLY when it is wrong:
 * whether a melodic head's declined content falls through to the grid (#1243),
 * and whether the grid drops its drum chrome (#1241). Neither throws, neither
 * corrupts a document, and every downstream fidelity gate is green either way —
 * the same detection profile as the routing defect this sits next to ([[PV327]]).
 * So the arms have to pin the DISCRIMINATION, in both directions, on the real
 * vocabulary rather than on hand-picked shapes.
 *
 * The token lists below are not invented: they are the lane names measured off
 * the 57 vendored fixtures and 150 real tunes, plus the curated drum and
 * instrument catalogues this repo ships. A predicate that passed on made-up
 * tokens and failed on `breaks165` would be worse than none.
 */
import { describe, it, expect } from 'vitest'

import { chordLanes, isChordSymbol } from '../chordLanes'

describe('isChordSymbol reads the chord grammar', () => {
  it('recognises the chord spellings that appear in the corpora', () => {
    // Every one of these is a real lane name from a real document.
    for (const sym of ['Gsus', 'G7', 'Em7', 'D7', 'am', 'dm', 'em', 'Em11', 'Am9', 'C', 'G', 'F', 'Am']) {
      expect(isChordSymbol(sym), sym).toBe(true)
    }
  })

  it('rejects every drum voice the grid already knows', () => {
    for (const tok of ['bd', 'sd', 'hh', 'oh', 'cp', 'sn', 'rim', 'perc', 'lt', 'mt', 'ht', 'cr', 'rd', 'sh', 'tb', 'kick', 'snare', 'hat']) {
      expect(isChordSymbol(tok), tok).toBe(false)
    }
  })

  it('rejects instrument, sample and pick-key tokens', () => {
    // `sawtooth` is a synth waveform under `.gain`, `breaks165` a sample under
    // `.mask`, and the last three are `pick` keys — all measured, all reaching
    // the grid through the content fallback, none of them chords.
    for (const tok of ['sawtooth', 'square', 'triangle', 'sine', 'piano', 'breaks165', 'casio', 'fungi', 'polyrhythm', 'polymeter', 'both']) {
      expect(isChordSymbol(tok), tok).toBe(false)
    }
  })

  it('⚠ lets the DRUM vocabulary win the one collision: cb is Cowbell, not C-flat', () => {
    // The single overlap in 85 catalogue tokens. Without the precedence rule the
    // chord grammar answers "Cb major" and a cowbell lane starts claiming to be
    // a chord. This is the arm that fails if `isKnownDrumVoice` is dropped from
    // `isChordSymbol` — the rest of the file passes with it gone.
    expect(isChordSymbol('cb')).toBe(false)
  })

  it('strips a :variant only for the DRUM lookup, never for the chord read', () => {
    // `sd:3` is a sampled snare and must stay a sound…
    expect(isChordSymbol('sd:3')).toBe(false)
    // …while `C:major` is a SCALE. Stripping at the colon here would hand the
    // grammar a bare `C`, and a list of scales would silently be promoted into a
    // chord chart. Measured: `note(scales)` in `bakery-152-block-comment` is
    // exactly this shape, and it correctly does NOT convert.
    expect(isChordSymbol('C:major')).toBe(false)
    expect(isChordSymbol('D:minor')).toBe(false)
  })

  it('rejects prose, which the grid otherwise accepts as happily as a drum kit', () => {
    for (const tok of ['lorem', 'ipsum', 'dolor', 'sit']) {
      expect(isChordSymbol(tok), tok).toBe(false)
    }
  })
})

describe('chordLanes needs EVERY lane, not a majority', () => {
  it('accepts a chart whose lanes are all chords', () => {
    expect(chordLanes(['Gsus', 'G7', 'Em7', 'D7'])).toBe(true)
  })

  it('refuses a melody the roll declined over one stray token', () => {
    // `note("F# E D C# C Bm1 Am1 G")` — the roll refuses the whole string on
    // account of `Bm1`/`Am1`, and the grid would happily draw eight lanes with
    // one note each: right shape, wrong kind, invisible to every fidelity gate
    // downstream. All-lanes is what stops it, and this is the case it stops.
    expect(chordLanes(['F#', 'E', 'D', 'C#', 'C', 'Bm1', 'Am1', 'G'])).toBe(false)
  })

  it('refuses a drum kit carrying one chord-shaped token', () => {
    // Belt and braces against the `cb` collision: even with the precedence rule
    // removed, a real kit does not become a chord chart, because `bd`/`sd`/`hh`
    // are not chords under any reading.
    expect(chordLanes(['bd', 'sd', 'hh', 'cb'])).toBe(false)
  })

  it('refuses an empty grid rather than answering vacuously true', () => {
    // `[].every(...)` is true, which would make a lane-less model a chord chart
    // and drop the drum chrome from a grid that has not drawn anything yet.
    expect(chordLanes([])).toBe(false)
  })
})
