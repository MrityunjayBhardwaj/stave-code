import { describe, it, expect } from 'vitest'
import {
  parseStepGrid,
  parsePianoRoll,
  bjorklund,
  parseGainMini,
  applyStepGain,
  applyRollGain,
} from '../parse'
import {
  serializeStepGrid,
  serializePianoRoll,
  serializeStepGain,
  serializeRollGain,
} from '../serialize'
import { pitchToMidi, midiToPitch, noteDisplayName, isBlackKey, cLabel } from '../pitch'
import { placeNote, resizeNote } from '../place'
import { resizeGrid, resizeRoll } from '../resize'
import type { StepGridModel, PianoRollModel } from '../model'

/** the round-trip law for canonical strings: serialize(parse(s)) === s */
function gridRoundTrips(s: string) {
  const r = parseStepGrid(s)
  expect(r.ok, `expected ${s} to parse`).toBe(true)
  if (r.ok) expect(serializeStepGrid(r.model)).toBe(s)
}
function rollRoundTrips(s: string) {
  const r = parsePianoRoll(s)
  expect(r.ok, `expected ${s} to parse`).toBe(true)
  if (r.ok) expect(serializePianoRoll(r.model)).toBe(s)
}

describe('step grid — parse', () => {
  it('reads a single-lane sequence with rests', () => {
    const r = parseStepGrid('bd ~ bd ~')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.steps).toBe(4)
    expect(r.model.lanes).toEqual([{ sound: 'bd', cells: [true, false, true, false] }])
  })

  it('reads a multi-sound sequence as one lane per sound', () => {
    const r = parseStepGrid('bd hh sn hh')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.lanes.map((l) => l.sound)).toEqual(['bd', 'hh', 'sn'])
    expect(r.model.lanes[1].cells).toEqual([false, true, false, true])
  })

  it('keeps :variant in the lane sound', () => {
    const r = parseStepGrid('bd:3 ~')
    expect(r.ok && r.model.lanes[0].sound).toBe('bd:3')
  })

  it('reads a `,`-stack as parts, preserving grouping', () => {
    const r = parseStepGrid('bd ~ bd ~, hh hh hh hh')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.lanes.map((l) => [l.sound, l.part])).toEqual([
      ['bd', 0],
      ['hh', 1],
    ])
  })

  it('expands a sub-sequence onto a finer grid', () => {
    const r = parseStepGrid('bd [hh hh]')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // bd ~ hh hh on a 4-cell grid
    expect(r.model.steps).toBe(4)
    expect(r.model.lanes.find((l) => l.sound === 'bd')!.cells).toEqual([
      true, false, false, false,
    ])
  })

  it('reads simultaneous hits as a [a,b] column', () => {
    const r = parseStepGrid('[bd,sn] ~')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.lanes.map((l) => l.sound)).toEqual(['bd', 'sn'])
    expect(r.model.lanes[0].cells[0]).toBe(true)
    expect(r.model.lanes[1].cells[0]).toBe(true)
  })

  it('reads a whole-string <...> alternation as bars', () => {
    const r = parseStepGrid('<[bd ~] [bd bd]>')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.bars).toBe(2)
    expect(r.model.steps).toBe(4)
  })

  it('rejects features outside the subset', () => {
    expect(parseStepGrid('{bd hh}%4').ok).toBe(false)
    expect(parseStepGrid('bd@2 hh').ok).toBe(false) // elongation not a grid concept
  })

  it('expands `atom*n` into n columns of the atom', () => {
    const r = parseStepGrid('hh*8')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.steps).toBe(8)
    expect(r.model.lanes).toEqual([{ sound: 'hh', cells: Array(8).fill(true) }])
  })

  it('packs `atom*n` into its own step alongside plain steps', () => {
    const r = parseStepGrid('bd hh*4')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // bd holds the first half (4 cols), hh fires across the second half
    expect(r.model.steps).toBe(8)
    expect(r.model.lanes.find((l) => l.sound === 'bd')!.cells).toEqual([
      true, false, false, false, false, false, false, false,
    ])
    expect(r.model.lanes.find((l) => l.sound === 'hh')!.cells).toEqual([
      false, false, false, false, true, true, true, true,
    ])
  })

  it('rejects `*` combined with other modifiers (conservative scope)', () => {
    expect(parseStepGrid('bd*2@2').ok).toBe(false) // * with @
    expect(parseStepGrid('[bd hh]*2@2').ok).toBe(false) // group * with @
    expect(parseStepGrid('bd*0').ok).toBe(false) // zero multiplier
    expect(parseStepGrid('bd*').ok).toBe(false) // missing count
  })

  it('rejects `atom*n` that expands past the step ceiling', () => {
    expect(parseStepGrid('hh*128').ok).toBe(false)
  })

  it('expands `atom(k,n)` euclid into an n-step lane with k hits', () => {
    const r = parseStepGrid('bd(3,8)')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.steps).toBe(8)
    // Bjørklund(3,8) = x . . x . . x .
    expect(r.model.lanes).toEqual([
      { sound: 'bd', cells: [true, false, false, true, false, false, true, false] },
    ])
  })

  it('reads other euclid grooves (5,8) and (7,16)', () => {
    const five = parseStepGrid('bd(5,8)')
    expect(five.ok).toBe(true)
    if (five.ok) {
      expect(five.model.steps).toBe(8)
      expect(five.model.lanes[0].cells.filter(Boolean).length).toBe(5)
    }
    const seven = parseStepGrid('hh(7,16)')
    expect(seven.ok).toBe(true)
    if (seven.ok) {
      expect(seven.model.steps).toBe(16)
      expect(seven.model.lanes[0].cells.filter(Boolean).length).toBe(7)
    }
  })

  it('rotates the euclid pattern with the 3rd argument `(3,8,2)` (matches Strudel euclidRot)', () => {
    const r = parseStepGrid('bd(3,8,2)')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Strudel applies rotate(b, -rot) — a right rotation: x..x..x. → x.x..x..
    expect(r.model.lanes[0].cells).toEqual([
      true, false, true, false, false, true, false, false,
    ])
  })

  it('packs euclid into its own step alongside plain steps', () => {
    const r = parseStepGrid('bd sn(3,8)')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // bd holds the first half (8 cols), sn euclid fills the second half
    expect(r.model.steps).toBe(16)
    expect(r.model.lanes.find((l) => l.sound === 'bd')!.cells[0]).toBe(true)
    expect(r.model.lanes.find((l) => l.sound === 'sn')!.cells.filter(Boolean).length).toBe(3)
  })

  it('rejects euclid combined with other modifiers / groups (conservative scope)', () => {
    expect(parseStepGrid('bd(3,8)*2').ok).toBe(false) // euclid with *
    expect(parseStepGrid('bd(3,8)@2').ok).toBe(false) // euclid with @
    expect(parseStepGrid('[bd hh](3,8)').ok).toBe(false) // group euclid
    expect(parseStepGrid('bd(3)').ok).toBe(false) // missing step count
    expect(parseStepGrid('bd(3,8').ok).toBe(false) // unbalanced
    expect(parseStepGrid('bd()').ok).toBe(false) // empty args
  })

  it('rejects euclid that expands past the step ceiling', () => {
    expect(parseStepGrid('bd(3,128)').ok).toBe(false)
  })

  it('expands `atom!n` into n separate steps of the atom', () => {
    const r = parseStepGrid('bd!3')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.steps).toBe(3)
    expect(r.model.lanes).toEqual([{ sound: 'bd', cells: [true, true, true] }])
  })

  it('`!n` replicates as whole steps, unlike `*n` (subdivision)', () => {
    // bd!3 sn = bd bd bd sn → 4 equal steps; bd*3 sn would be 6 cells
    const r = parseStepGrid('bd!3 sn')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.steps).toBe(4)
    expect(r.model.lanes.find((l) => l.sound === 'bd')!.cells).toEqual([true, true, true, false])
    expect(r.model.lanes.find((l) => l.sound === 'sn')!.cells).toEqual([
      false,
      false,
      false,
      true,
    ])
  })

  it('rejects `!` combined with other modifiers / groups (conservative scope)', () => {
    expect(parseStepGrid('bd!3*2').ok).toBe(false) // ! with *
    expect(parseStepGrid('bd!3@2').ok).toBe(false) // ! with @
    expect(parseStepGrid('[bd hh]!2').ok).toBe(false) // group replicate
    expect(parseStepGrid('bd!0').ok).toBe(false) // zero replicate
    expect(parseStepGrid('bd!').ok).toBe(false) // missing count
  })

  it('rejects `atom!n` that expands past the step ceiling', () => {
    expect(parseStepGrid('bd!128').ok).toBe(false)
  })
})

describe('step grid — round-trip identity', () => {
  const canonical = [
    'bd ~ bd ~',
    'bd hh sn hh',
    'bd:3 ~ sn ~',
    'bd ~ bd ~, hh hh hh hh',
    '[bd,sn] ~ sn ~',
    '~ ~ ~ ~',
    '<[bd ~] [bd bd]>',
    '<bd sn>',
  ]
  for (const s of canonical) it(`"${s}"`, () => gridRoundTrips(s))
})

describe('step grid — `*` is parse-only sugar', () => {
  // `*` is INPUT sugar: it expands on parse and serializes back as the
  // expanded sequence (no `*` on output). So the round-trip is parse → expand,
  // not the identity law that holds for canonical strings.
  it('serializes `hh*8` as the expanded sequence', () => {
    const r = parseStepGrid('hh*8')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(serializeStepGrid(r.model)).toBe('hh hh hh hh hh hh hh hh')
  })

  it('the expanded form re-parses to the same model (stable, no reseed loop)', () => {
    const sugar = parseStepGrid('hh*4')
    const expanded = parseStepGrid('hh hh hh hh')
    expect(sugar.ok && expanded.ok).toBe(true)
    if (!sugar.ok || !expanded.ok) return
    expect(sugar.model).toEqual(expanded.model)
    expect(serializeStepGrid(sugar.model)).toBe(serializeStepGrid(expanded.model))
  })
})

describe('step grid — `[group]*n` (#467 nested-group multiplier, parse-only sugar)', () => {
  // `[sd hh]*2` ≡ the group played n× within its slot → the group's slots
  // repeated n times. Serializes to the expanded sequence (same sugar law as
  // atom `*n`); the onsets are identical to the original.
  it('binds `[sd hh]*2` (previously rejected) and expands it', () => {
    const r = parseStepGrid('[sd hh]*2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(serializeStepGrid(r.model)).toBe('sd hh sd hh')
  })

  it('handles a rest in the group and a higher count', () => {
    const r = parseStepGrid('[~ sd]*2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(serializeStepGrid(r.model)).toBe('~ sd ~ sd')
    expect(parseStepGrid('[sd hh]*3').ok).toBe(true)
  })

  it('composes with sibling steps (`bd [sd hh]*2`)', () => {
    const r = parseStepGrid('bd [sd hh]*2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(serializeStepGrid(r.model)).toBe('bd ~ ~ ~ sd hh sd hh')
  })

  it('the expanded form re-parses to the same model (stable)', () => {
    const sugar = parseStepGrid('[sd hh]*2')
    const expanded = parseStepGrid('sd hh sd hh')
    expect(sugar.ok && expanded.ok).toBe(true)
    if (!sugar.ok || !expanded.ok) return
    expect(sugar.model).toEqual(expanded.model)
  })

  it('applies to the piano roll too (`[60 62]*2`)', () => {
    expect(parsePianoRoll('[60 62]*2').ok).toBe(true)
    expect(parsePianoRoll('[c3 e3]*2').ok).toBe(true)
  })
})

describe('step grid — euclid is parse-only sugar', () => {
  // `(k,n[,rot])` is INPUT sugar like `*`: it expands on parse and serializes
  // back as the expanded sequence (no `(` on output). The round-trip is
  // parse → expand, not the identity law that holds for canonical strings.
  it('serializes `bd(3,8)` as the expanded sequence', () => {
    const r = parseStepGrid('bd(3,8)')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(serializeStepGrid(r.model)).toBe('bd ~ ~ bd ~ ~ bd ~')
  })

  it('the expanded form re-parses to the same model (stable, no reseed loop)', () => {
    const sugar = parseStepGrid('bd(3,8)')
    const expanded = parseStepGrid('bd ~ ~ bd ~ ~ bd ~')
    expect(sugar.ok && expanded.ok).toBe(true)
    if (!sugar.ok || !expanded.ok) return
    expect(sugar.model).toEqual(expanded.model)
    expect(serializeStepGrid(sugar.model)).toBe(serializeStepGrid(expanded.model))
  })
})

describe('step grid — `!` is parse-only sugar', () => {
  it('serializes `bd!3` as the expanded sequence', () => {
    const r = parseStepGrid('bd!3')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(serializeStepGrid(r.model)).toBe('bd bd bd')
  })

  it('the expanded form re-parses to the same model (stable, no reseed loop)', () => {
    const sugar = parseStepGrid('bd!3')
    const expanded = parseStepGrid('bd bd bd')
    expect(sugar.ok && expanded.ok).toBe(true)
    if (!sugar.ok || !expanded.ok) return
    expect(sugar.model).toEqual(expanded.model)
  })
})

describe('bjorklund (euclid distribution)', () => {
  it('distributes (3,8) evenly: x . . x . . x .', () => {
    expect(bjorklund(3, 8)).toEqual([
      true, false, false, true, false, false, true, false,
    ])
  })

  it('distributes (5,8): x . x x . x x .', () => {
    expect(bjorklund(5, 8)).toEqual([true, false, true, true, false, true, true, false])
  })

  it('handles degenerate counts (all rests / all pulses)', () => {
    expect(bjorklund(0, 4)).toEqual([false, false, false, false])
    expect(bjorklund(4, 4)).toEqual([true, true, true, true])
    expect(bjorklund(5, 4)).toEqual([true, true, true, true]) // k >= n
  })

  it('always places exactly k pulses across n steps', () => {
    for (const [k, n] of [
      [3, 8],
      [5, 8],
      [7, 16],
      [4, 9],
      [2, 5],
    ]) {
      expect(bjorklund(k, n).filter(Boolean).length).toBe(k)
      expect(bjorklund(k, n)).toHaveLength(n)
    }
  })
})

describe('piano roll — parse', () => {
  it('reads notes and rests at the right columns', () => {
    const r = parsePianoRoll('c3 ~ e3 g3')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.steps).toBe(4)
    expect(r.model.notes).toEqual([
      { pitch: 'c3', start: 0, duration: 1 },
      { pitch: 'e3', start: 2, duration: 1 },
      { pitch: 'g3', start: 3, duration: 1 },
    ])
  })

  it('reads @n elongation as duration', () => {
    const r = parsePianoRoll('c3@2 e3')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.notes).toEqual([
      { pitch: 'c3', start: 0, duration: 2 },
      { pitch: 'e3', start: 2, duration: 1 },
    ])
  })

  it('reads a chord as same-start notes', () => {
    const r = parsePianoRoll('[c3,e3,g3] ~')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.notes.map((n) => n.pitch)).toEqual(['c3', 'e3', 'g3'])
    expect(r.model.notes.every((n) => n.start === 0)).toBe(true)
  })

  it('expands `note*n` into n notes (shared tokenizer)', () => {
    const r = parsePianoRoll('c3*4')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.steps).toBe(4)
    expect(r.model.notes).toEqual([
      { pitch: 'c3', start: 0, duration: 1 },
      { pitch: 'c3', start: 1, duration: 1 },
      { pitch: 'c3', start: 2, duration: 1 },
      { pitch: 'c3', start: 3, duration: 1 },
    ])
  })

  it('expands `note(k,n)` euclid via the shared tokenizer', () => {
    const r = parsePianoRoll('c3(3,8)')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.steps).toBe(8)
    expect(r.model.notes).toEqual([
      { pitch: 'c3', start: 0, duration: 1 },
      { pitch: 'c3', start: 3, duration: 1 },
      { pitch: 'c3', start: 6, duration: 1 },
    ])
  })

  it('expands `note!n` replicate via the shared tokenizer', () => {
    const r = parsePianoRoll('c3!3')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.steps).toBe(3)
    expect(r.model.notes).toEqual([
      { pitch: 'c3', start: 0, duration: 1 },
      { pitch: 'c3', start: 1, duration: 1 },
      { pitch: 'c3', start: 2, duration: 1 },
    ])
  })

  it('rejects a non-note token', () => {
    expect(parsePianoRoll('bd c3').ok).toBe(false)
  })
})

describe('piano roll — round-trip identity', () => {
  const canonical = [
    'c3 ~ e3 g3',
    'c3@2 e3',
    '[c3,e3,g3] ~',
    'c3 e3 g3 ~',
    '~ c3 ~ e3',
    '<c3 e3>',
    '<c3@2 [e3 g3]>',
  ]
  for (const s of canonical) it(`"${s}"`, () => rollRoundTrips(s))
})

describe('pitch', () => {
  it('round-trips note ↔ midi (c3 = 48)', () => {
    expect(pitchToMidi('c3')).toBe(48)
    expect(pitchToMidi('eb4')).toBe(63)
    expect(pitchToMidi('f#2')).toBe(42)
    expect(pitchToMidi('cs3')).toBe(49)
    expect(midiToPitch(48)).toBe('c3')
    expect(midiToPitch(49)).toBe('c#3')
  })
  it('noteDisplayName uppercases the letter for the note bars (#605)', () => {
    expect(noteDisplayName(48)).toBe('C3') // c3 → C3
    expect(noteDisplayName(49)).toBe('C#3') // c#3 → C#3
    expect(noteDisplayName(64)).toBe('E4') // e4 → E4
    // it's display-only — the code token stays lowercase for round-trip fidelity
    expect(midiToPitch(48)).toBe('c3')
  })
  it('returns null for non-notes', () => {
    expect(pitchToMidi('bd')).toBeNull()
  })
  it('a bare note name (no octave) defaults to octave 3 — grounded vs Strudel (#467)', () => {
    // noteToMidi('c') === noteToMidi('c3') === 48 in @strudel/core.
    expect(pitchToMidi('c')).toBe(48)
    expect(pitchToMidi('c3')).toBe(48)
    expect(pitchToMidi('C')).toBe(48) // case-insensitive
    expect(pitchToMidi('e')).toBe(52)
    expect(pitchToMidi('g')).toBe(55)
    expect(pitchToMidi('eb')).toBe(51) // c→48, eb = 51
    expect(pitchToMidi('f#')).toBe(54)
    expect(pitchToMidi('bd')).toBeNull() // still not a note (b + stray d)
  })
  it('flags black keys', () => {
    expect(isBlackKey(49)).toBe(true) // c#3
    expect(isBlackKey(48)).toBe(false) // c3
  })
  it('labels C rows for the keyboard gutter (#430), null elsewhere', () => {
    expect(cLabel(48)).toBe('C3') // c3
    expect(cLabel(60)).toBe('C4') // c4
    expect(cLabel(49)).toBeNull() // c#3
    expect(cLabel(50)).toBeNull() // d3
    expect(cLabel(48)).toBe(midiToPitch(48).toUpperCase()) // agrees with the note token
  })
})

describe('piano roll — bare note names (#467)', () => {
  it('binds `note("c d f e")` (previously rejected for missing octaves)', () => {
    const r = parsePianoRoll('c d f e')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.model.notes.map((n) => n.pitch)).toEqual(['c', 'd', 'f', 'e'])
  })
  it('preserves the verbatim token on round-trip (lower-cased)', () => {
    const r = parsePianoRoll('g c g c')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(serializePianoRoll(r.model)).toBe('g c g c')
  })
  it('still rejects mixed numeric+named and true non-notes', () => {
    expect(parsePianoRoll('c 60').ok).toBe(false) // #469 XOR gate intact
    expect(parsePianoRoll('bd sd').ok).toBe(false) // sample names, not notes
  })
})

describe('placeNote', () => {
  it('trims an earlier sustaining note', () => {
    const model: PianoRollModel = { steps: 4, notes: [{ pitch: 'c3', start: 0, duration: 4 }] }
    const next = placeNote(model, 'e3', 2, 2)
    expect(next.notes.find((n) => n.pitch === 'c3')!.duration).toBe(2)
    expect(next.notes.find((n) => n.pitch === 'e3')).toEqual({ pitch: 'e3', start: 2, duration: 2 })
  })
  it('joins a chord at the same start, adopting its duration', () => {
    const model: PianoRollModel = { steps: 4, notes: [{ pitch: 'c3', start: 0, duration: 2 }] }
    const next = placeNote(model, 'e3', 0, 1)
    expect(next.notes.find((n) => n.pitch === 'e3')!.duration).toBe(2)
  })
})

describe('resize', () => {
  it('spread preserves musical time when doubling steps', () => {
    const model: StepGridModel = {
      steps: 2,
      lanes: [{ sound: 'bd', cells: [true, false] }],
    }
    const next = resizeGrid(model, 4, 'spread')
    expect(next.steps).toBe(4)
    expect(next.lanes[0].cells).toEqual([true, false, false, false])
  })
  it('pad appends empty steps', () => {
    const model: StepGridModel = {
      steps: 2,
      lanes: [{ sound: 'bd', cells: [true, true] }],
    }
    const next = resizeGrid(model, 4, 'pad')
    expect(next.lanes[0].cells).toEqual([true, true, false, false])
  })
  it('does not resize multi-bar patterns', () => {
    const model: StepGridModel = { steps: 4, bars: 2, lanes: [] }
    expect(resizeGrid(model, 8, 'spread')).toBe(model)
  })
  it('resizeRoll spread scales note starts', () => {
    const model: PianoRollModel = { steps: 2, notes: [{ pitch: 'c3', start: 1, duration: 1 }] }
    const next = resizeRoll(model, 4, 'spread')
    expect(next.notes[0].start).toBe(2)
  })
})

describe('resizeNote (single-note `@n` duration)', () => {
  it('grows a note up to the grid end', () => {
    const model: PianoRollModel = { steps: 4, notes: [{ pitch: 'c3', start: 0, duration: 1 }] }
    const next = resizeNote(model, 0, 'c3', 3)
    expect(next.notes[0].duration).toBe(3)
    // serializes as `@n`
    expect(serializePianoRoll(next)).toBe('c3@3 ~')
  })

  it('lets a note sustain UNDER a later onset (overlap → parallel lanes, #628)', () => {
    const model: PianoRollModel = {
      steps: 4,
      notes: [
        { pitch: 'c3', start: 0, duration: 1 },
        { pitch: 'e3', start: 2, duration: 1 },
      ],
    }
    const next = resizeNote(model, 0, 'c3', 4) // overlaps e3@2 → now allowed (caps at grid end)
    expect(next.notes.find((n) => n.start === 0)!.duration).toBe(4)
    expect(serializePianoRoll(next)).toBe('c3@4, ~ ~ e3 ~')
  })

  it('floors the duration at 1 when shrinking', () => {
    const model: PianoRollModel = { steps: 4, notes: [{ pitch: 'c3', start: 0, duration: 3 }] }
    expect(resizeNote(model, 0, 'c3', 0).notes[0].duration).toBe(1)
  })

  it('resizes ONLY the grabbed chord member, not the whole chord (#628)', () => {
    const model: PianoRollModel = {
      steps: 4,
      notes: [
        { pitch: 'c3', start: 0, duration: 1 },
        { pitch: 'e3', start: 0, duration: 1 },
      ],
    }
    const next = resizeNote(model, 0, 'c3', 3) // stretch c3 only
    expect(next.notes.find((n) => n.pitch === 'c3')!.duration).toBe(3)
    expect(next.notes.find((n) => n.pitch === 'e3')!.duration).toBe(1) // e3 untouched
    // independent durations → two parallel lanes
    expect(serializePianoRoll(next)).toContain(',')
  })

  it('multi-bar keeps the legacy no-overlap cap (lanes are single-bar only)', () => {
    // `<c3 e3>` = 2 bars, c3 onset 0 dur1, e3 onset 1 dur1; stretching c3 can hold
    // up to e3's onset (a held bar `<c3@2 ...>`) but never overlap it.
    const model: PianoRollModel = {
      steps: 2,
      bars: 2,
      notes: [
        { pitch: 'c3', start: 0, duration: 1 },
        { pitch: 'e3', start: 1, duration: 1 },
      ],
    }
    const next = resizeNote(model, 0, 'c3', 5) // would overlap → capped at e3's onset (1)
    expect(next.notes.find((n) => n.pitch === 'c3')!.duration).toBe(1)
    expect(serializePianoRoll(next)).not.toBeNull() // still expressible (no dropped write)
  })

  it('the resized model re-parses to the same model (stable)', () => {
    const model: PianoRollModel = { steps: 4, notes: [{ pitch: 'c3', start: 0, duration: 1 }] }
    const resized = resizeNote(model, 0, 'c3', 2)
    const text = serializePianoRoll(resized)!
    const reparsed = parsePianoRoll(text)
    expect(reparsed.ok).toBe(true)
    if (reparsed.ok) expect(reparsed.model).toEqual(resized)
  })
})

/** ChunkGain constructors for the apply* tests */
const strGain = (mini: string) => ({ mini, numeric: null, foreign: false })
const numGain = (n: number) => ({ mini: null, numeric: n, foreign: false })
const noGain = { mini: null, numeric: null, foreign: false }
const foreignGain = { mini: null, numeric: null, foreign: true }

describe('step grid — velocity (.gain)', () => {
  const base = (steps: number, gains?: number[]): StepGridModel => ({
    steps,
    lanes: [{ sound: 'bd', cells: Array<boolean>(steps).fill(true) }],
    ...(gains ? { gains } : {}),
  })

  describe('parseGainMini', () => {
    it('reads a flat numeric gain into per-position values', () => {
      expect(parseGainMini('1 0.5 1 0.25', 4)).toEqual([1, 0.5, 1, 0.25])
    })
    it('reads a `~` (rest column) as neutral 1', () => {
      expect(parseGainMini('1 ~ 0.5 ~', 4)).toEqual([1, 1, 0.5, 1])
    })
    it('rejects a wrong token count (a broadcast `.gain("0.8")`)', () => {
      expect(parseGainMini('0.8', 4)).toBeNull()
      expect(parseGainMini('1 0.5', 4)).toBeNull()
    })
    it('rejects a non-numeric / sub-divided gain we did not write', () => {
      expect(parseGainMini('1 0.5@2 1', 3)).toBeNull()
      expect(parseGainMini('1 [0.5 0.5] 1', 3)).toBeNull()
      expect(parseGainMini('loud soft', 2)).toBeNull()
    })
  })

  describe('serializeStepGain', () => {
    it('clears (removes .gain) when every column is neutral', () => {
      expect(serializeStepGain(base(4))).toEqual({ kind: 'clear' })
      expect(serializeStepGain(base(4, [1, 1, 1, 1]))).toEqual({ kind: 'clear' })
    })
    it('collapses a uniform non-1 level to a scalar .gain(v)', () => {
      expect(serializeStepGain(base(4, [0.4, 0.4, 0.4, 0.4]))).toEqual({
        kind: 'write',
        value: '0.4',
        quoted: false,
      })
    })
    it('writes a quoted per-column string for mixed levels, rests as `~`', () => {
      const m: StepGridModel = {
        steps: 4,
        lanes: [{ sound: 'bd', cells: [true, false, true, true] }],
        gains: [1, 1, 0.5, 0.25],
      }
      // column 1 is a rest (bd off) → `~`, regardless of its stored gain
      expect(serializeStepGain(m)).toEqual({ kind: 'write', value: '1 ~ 0.5 0.25', quoted: true })
    })
    it('ignores rest columns when deciding uniform-collapse', () => {
      // active columns 0 & 2 both 0.4 (col 1 is a rest) → collapses to a scalar
      const m: StepGridModel = {
        steps: 3,
        lanes: [{ sound: 'bd', cells: [true, false, true] }],
        gains: [0.4, 1, 0.4],
      }
      expect(serializeStepGain(m)).toEqual({ kind: 'write', value: '0.4', quoted: false })
    })
    it('skips (leaves .gain untouched) for multi-bar, `,`-stack, or foreign', () => {
      expect(serializeStepGain({ ...base(4, [1, 0.5, 1, 1]), bars: 2 })).toEqual({ kind: 'skip' })
      expect(
        serializeStepGain({
          steps: 2,
          lanes: [
            { sound: 'bd', part: 0, cells: [true, false] },
            { sound: 'hh', part: 1, cells: [true, true] },
          ],
          gains: [0.5, 0.5],
        }),
      ).toEqual({ kind: 'skip' })
      expect(serializeStepGain({ ...base(4, [1, 0.5, 1, 1]), gainForeign: true })).toEqual({
        kind: 'skip',
      })
    })
  })

  describe('applyStepGain', () => {
    it('leaves the model neutral when there is no .gain', () => {
      const m = base(4)
      expect(applyStepGain(m, noGain)).toBe(m)
    })
    it('reads a scalar .gain(0.4) as a uniform base on every column', () => {
      expect(applyStepGain(base(4), numGain(0.4)).gains).toEqual([0.4, 0.4, 0.4, 0.4])
    })
    it('reads an aligned string .gain onto the columns', () => {
      const r = applyStepGain(base(4), strGain('1 0.5 1 0.25'))
      expect(r.gains).toEqual([1, 0.5, 1, 0.25])
      expect(r.gainForeign).toBeUndefined()
    })
    it('flags foreign (hands off) when the string .gain does not align', () => {
      expect(applyStepGain(base(4), strGain('0.8')).gainForeign).toBe(true) // broadcast (1 ≠ 4)
      expect(applyStepGain(base(3), strGain('1 0.5@2 1')).gainForeign).toBe(true) // sub-divided
    })
    it('flags foreign for a .gain arg we do not manage (a signal)', () => {
      expect(applyStepGain(base(4), foreignGain).gainForeign).toBe(true)
    })
  })

  it('round-trips: column gains → .gain mini → parse back ≡ gains', () => {
    const stepMini = 'bd ~ sn hh'
    const gains = [1, 1, 0.8, 0.5] // col 1 is a rest → serialized as `~`
    const seed = parseStepGrid(stepMini)
    expect(seed.ok).toBe(true)
    if (!seed.ok) return
    const withGain: StepGridModel = { ...seed.model, gains }
    // the head mini is unchanged by velocity
    expect(serializeStepGrid(withGain)).toBe(stepMini)
    const g = serializeStepGain(withGain)
    expect(g).toEqual({ kind: 'write', value: '1 ~ 0.8 0.5', quoted: true })
    // re-reading the serialized gain reproduces the per-column values
    if (g.kind !== 'write') return
    const fresh = parseStepGrid(stepMini)
    expect(fresh.ok).toBe(true)
    if (!fresh.ok) return
    expect(applyStepGain(fresh.model, strGain(g.value)).gains).toEqual([1, 1, 0.8, 0.5])
  })

  it('round-trips a scalar base: .gain(0.4) → uniform gains → .gain(0.4)', () => {
    const seed = parseStepGrid('bd hh sn hh')
    if (!seed.ok) return
    const m = applyStepGain(seed.model, numGain(0.4))
    expect(serializeStepGain(m)).toEqual({ kind: 'write', value: '0.4', quoted: false })
  })
})

describe('piano roll — velocity (.gain)', () => {
  const withGains = (mini: string, gains: Record<number, number>): PianoRollModel => {
    const r = parsePianoRoll(mini)
    if (!r.ok) throw new Error(`expected ${mini} to parse`)
    return {
      ...r.model,
      notes: r.model.notes.map((n) => (gains[n.start] != null ? { ...n, gain: gains[n.start] } : n)),
    }
  }

  describe('serializeRollGain', () => {
    it('clears when every note is neutral', () => {
      expect(serializeRollGain(withGains('c3 e3 g3', {}))).toEqual({ kind: 'clear' })
    })
    it('collapses a uniform non-1 level to a scalar .gain(v)', () => {
      const m = withGains('c3 e3 g3', { 0: 0.4, 1: 0.4, 2: 0.4 })
      expect(serializeRollGain(m)).toEqual({ kind: 'write', value: '0.4', quoted: false })
    })
    it('writes a quoted token per note group, rests as `~`', () => {
      // c3@0, e3@2 (col1 is a rest)
      const m = withGains('c3 ~ e3', { 0: 1, 2: 0.5 })
      expect(serializeRollGain(m)).toEqual({ kind: 'write', value: '1 ~ 0.5', quoted: true })
    })
    it('mirrors `@n` holds in the gain token', () => {
      const m = withGains('c3@2 e3', { 0: 0.5, 2: 1 })
      expect(serializeRollGain(m)).toEqual({ kind: 'write', value: '0.5@2 1', quoted: true })
    })
    it('emits one shared token for a chord (per-chord velocity)', () => {
      // [c3,e3] is one group at col 0 → one gain token for both
      const m = withGains('[c3,e3] g3', { 0: 0.66 })
      expect(serializeRollGain(m)).toEqual({ kind: 'write', value: '0.66 1', quoted: true })
    })
    it('skips a chord whose members carry different gains (inexpressible)', () => {
      const r = parsePianoRoll('[c3,e3]')
      if (!r.ok) throw new Error('parse')
      const m: PianoRollModel = {
        ...r.model,
        notes: [
          { ...r.model.notes[0], gain: 0.5 },
          { ...r.model.notes[1], gain: 0.8 },
        ],
      }
      expect(serializeRollGain(m)).toEqual({ kind: 'skip' })
    })
    it('skips multi-bar and foreign', () => {
      const alt = withGains('<c3 e3>', {})
      expect(serializeRollGain({ ...alt, bars: 2, notes: alt.notes.map((n) => ({ ...n, gain: 0.5 })) })).toEqual({ kind: 'skip' })
      expect(serializeRollGain({ ...withGains('c3 e3', { 0: 0.5 }), gainForeign: true })).toEqual({ kind: 'skip' })
    })
  })

  describe('applyRollGain', () => {
    it('reads a scalar .gain(0.4) as a uniform base on every note', () => {
      const r = parsePianoRoll('c3 e3 g3')
      if (!r.ok) throw new Error('parse')
      const m = applyRollGain(r.model, numGain(0.4))
      expect(m.notes.every((n) => n.gain === 0.4)).toBe(true)
    })
    it('reads an aligned string .gain onto the notes by start column', () => {
      const r = parsePianoRoll('c3 ~ e3')
      if (!r.ok) throw new Error('parse')
      const m = applyRollGain(r.model, strGain('1 ~ 0.5'))
      expect(m.notes.find((n) => n.start === 2)!.gain).toBe(0.5)
      expect(m.notes.find((n) => n.start === 0)!.gain).toBeUndefined() // neutral stays bare
      expect(m.gainForeign).toBeUndefined()
    })
    it('applies one chord gain to all its members', () => {
      const r = parsePianoRoll('[c3,e3] g3')
      if (!r.ok) throw new Error('parse')
      const m = applyRollGain(r.model, strGain('0.66 1'))
      const chord = m.notes.filter((n) => n.start === 0)
      expect(chord.length).toBe(2)
      expect(chord.every((n) => n.gain === 0.66)).toBe(true)
    })
    it('flags foreign for a grid-mismatched or non-numeric gain', () => {
      const r = parsePianoRoll('c3 e3')
      if (!r.ok) throw new Error('parse')
      expect(applyRollGain(r.model, strGain('1 0.5 1')).gainForeign).toBe(true) // 3 tokens vs 2 cols
      expect(applyRollGain(r.model, strGain('loud soft')).gainForeign).toBe(true)
    })
  })

  it('round-trips: note gains → .gain mini → parse back ≡ gains', () => {
    const rollMini = 'c3 ~ [c4,e4]@2'
    const m = withGains(rollMini, { 0: 0.8, 2: 0.4 })
    expect(serializePianoRoll(m)).toBe(rollMini) // head mini unchanged by velocity
    const g = serializeRollGain(m)
    expect(g).toEqual({ kind: 'write', value: '0.8 ~ 0.4@2', quoted: true })
    if (g.kind !== 'write') return
    const fresh = parsePianoRoll(rollMini)
    expect(fresh.ok).toBe(true)
    if (!fresh.ok) return
    const reread = applyRollGain(fresh.model, strGain(g.value))
    expect(reread.notes.find((n) => n.start === 0)!.gain).toBe(0.8)
    expect(reread.notes.filter((n) => n.start === 2).every((n) => n.gain === 0.4)).toBe(true)
  })
})

// ── #628 parallel-lane piano roll (independent note durations / overlap) ──────
describe('#628 parallel note lanes', () => {
  const m = (steps: number, notes: PianoRollModel['notes']): PianoRollModel => ({ steps, notes })
  const reparse = (mini: string): PianoRollModel => {
    const r = parsePianoRoll(mini)
    if (!r.ok) throw new Error(`expected ${mini} to parse: ${r.reason}`)
    return r.model
  }

  it('an empty (all-rest) roll serializes the grid, not an empty string', () => {
    expect(serializePianoRoll(m(4, []))).toBe('~ ~ ~ ~')
  })

  it('a non-overlapping roll stays single-lane (no comma, unchanged)', () => {
    expect(serializePianoRoll(m(4, [
      { pitch: 'c3', start: 0, duration: 1 },
      { pitch: 'e3', start: 2, duration: 1 },
    ]))).toBe('c3 ~ e3 ~')
  })

  it('independent chord-note durations → parallel lanes', () => {
    // c3 held 2 steps + e3 held 1 step, both onset at 0 → two lanes
    const s = serializePianoRoll(m(4, [
      { pitch: 'c3', start: 0, duration: 2 },
      { pitch: 'e3', start: 0, duration: 1 },
    ]))
    expect(s).toContain(',') // two lanes
    expect(s).toContain('c3@2')
    // round-trips back to the same note set
    const back = reparse(s!).notes.map((n) => `${n.pitch}@${n.start}:${n.duration}`).sort()
    expect(back).toEqual(['c3@0:2', 'e3@0:1'])
  })

  it('a note sustaining UNDER a later onset (stretch-over) serializes', () => {
    const s = serializePianoRoll(m(4, [
      { pitch: 'c3', start: 0, duration: 2 }, // sustains over e3's onset at step 1
      { pitch: 'e3', start: 1, duration: 1 },
      { pitch: 'g3', start: 2, duration: 1 },
      { pitch: 'a3', start: 3, duration: 1 },
    ]))
    expect(s).toBe('c3@2 g3 a3, ~ e3 ~ ~')
    const back = reparse(s!).notes.map((n) => `${n.pitch}@${n.start}:${n.duration}`).sort()
    expect(back).toEqual(['a3@3:1', 'c3@0:2', 'e3@1:1', 'g3@2:1'])
  })

  it('round-trips: parse(serialize(m)) ≡ m for an overlapping model', () => {
    const model = m(8, [
      { pitch: 'c3', start: 0, duration: 4 },
      { pitch: 'e3', start: 1, duration: 1 },
      { pitch: 'g3', start: 4, duration: 4 },
    ])
    const s = serializePianoRoll(model)
    expect(s).not.toBeNull()
    const back = reparse(s!)
    expect(back.steps).toBe(8)
    expect(back.notes.map((n) => `${n.pitch}@${n.start}:${n.duration}`).sort())
      .toEqual(['c3@0:4', 'e3@1:1', 'g3@4:4'])
    // stable: serialize(parse(serialize(m))) === serialize(m)
    expect(serializePianoRoll(back)).toBe(s)
  })

  it('parses a hand-written aligned comma-stack', () => {
    const back = reparse('c3@2 ~ ~, e3 ~ ~ ~')
    expect(back.steps).toBe(4)
    expect(back.notes.map((n) => `${n.pitch}@${n.start}:${n.duration}`).sort())
      .toEqual(['c3@0:2', 'e3@0:1'])
  })

  it('rejects misaligned lanes (different step widths)', () => {
    const r = parsePianoRoll('c3 ~ ~, e3 ~ ~ ~') // 3 vs 4 columns
    expect(r.ok).toBe(false)
  })
})
