import { describe, it, expect } from 'vitest'
import { parseStepGrid, parsePianoRoll, bjorklund } from '../parse'
import { serializeStepGrid, serializePianoRoll } from '../serialize'
import { pitchToMidi, midiToPitch, isBlackKey } from '../pitch'
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
    expect(parseStepGrid('[bd hh]*2').ok).toBe(false) // group multiplier
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
  it('returns null for non-notes', () => {
    expect(pitchToMidi('bd')).toBeNull()
  })
  it('flags black keys', () => {
    expect(isBlackKey(49)).toBe(true) // c#3
    expect(isBlackKey(48)).toBe(false) // c3
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
    const next = resizeNote(model, 0, 3)
    expect(next.notes[0].duration).toBe(3)
    // serializes as `@n`
    expect(serializePianoRoll(next)).toBe('c3@3 ~')
  })

  it('caps the duration at the next note (no overlap)', () => {
    const model: PianoRollModel = {
      steps: 4,
      notes: [
        { pitch: 'c3', start: 0, duration: 1 },
        { pitch: 'e3', start: 2, duration: 1 },
      ],
    }
    const next = resizeNote(model, 0, 4) // would overlap e3@2 → capped to 2
    expect(next.notes.find((n) => n.start === 0)!.duration).toBe(2)
    expect(serializePianoRoll(next)).toBe('c3@2 e3 ~')
  })

  it('floors the duration at 1 when shrinking', () => {
    const model: PianoRollModel = { steps: 4, notes: [{ pitch: 'c3', start: 0, duration: 3 }] }
    expect(resizeNote(model, 0, 0).notes[0].duration).toBe(1)
  })

  it('resizes all chord members sharing a start together', () => {
    const model: PianoRollModel = {
      steps: 4,
      notes: [
        { pitch: 'c3', start: 0, duration: 1 },
        { pitch: 'e3', start: 0, duration: 1 },
      ],
    }
    const next = resizeNote(model, 0, 3)
    expect(next.notes.every((n) => n.duration === 3)).toBe(true)
    expect(serializePianoRoll(next)).toBe('[c3,e3]@3 ~')
  })

  it('the resized model re-parses to the same model (stable)', () => {
    const model: PianoRollModel = { steps: 4, notes: [{ pitch: 'c3', start: 0, duration: 1 }] }
    const resized = resizeNote(model, 0, 2)
    const text = serializePianoRoll(resized)!
    const reparsed = parsePianoRoll(text)
    expect(reparsed.ok).toBe(true)
    if (reparsed.ok) expect(reparsed.model).toEqual(resized)
  })
})
