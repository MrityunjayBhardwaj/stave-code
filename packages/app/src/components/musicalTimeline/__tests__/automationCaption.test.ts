/**
 * The bounds caption's geometry and the edits it produces (#1464 Stage 2).
 *
 * Two things are being pinned here, and they fail in opposite ways.
 *
 * The GEOMETRY half is shared with the draw path on purpose, so the risk is
 * drift: a click that lands one glyph off edits the wrong bound, and nothing
 * visible goes wrong. Those tests use a measure function with a known constant
 * advance, so a field's box is arithmetic anyone can check by hand.
 *
 * The EDIT half is where a wrong answer reaches the user's document. Those tests
 * are written as the three properties `captionEdit` exists to enforce — the
 * rounding cannot escape, an unchanged field writes nothing, an unspelled leg
 * inserts rather than replaces — because each is a silent corruption if it
 * regresses, not a visible one.
 */
import { describe, it, expect } from 'vitest'
import type { SignalAutomation } from '@stave/editor'
import {
  captionRows,
  captionHit,
  captionText,
  captionEdit,
  rateEditable,
  shapeEdit,
  shapeMenuOptions,
  shapeOptions,
  CAPTION_PAD_X,
  AUTOMATION_PAD_Y,
  AUTOMATION_LABEL_LINE_H,
} from '../automationCaption'
import { parseStrudel } from '../../../../../editor/src/ir/parseStrudel'
import { signalAutomations, shapeAlternatives, crossClassShapes } from '../../../../../editor/src/ir/signalAutomation'

const SHAPE_DEPS = { alternatives: shapeAlternatives, crossClass: crossClassShapes }

/** One character = 5px. Not the real face — a face whose arithmetic is legible,
 *  so `x=CAPTION_PAD_X + 5*n` names character n without a screenshot. */
const CHAR_W = 5
const measure = (s: string): number => s.length * CHAR_W

const NO_SPANS = { shape: null, rate: null, range: null, chainEnd: null } as const

const auto = (over: Partial<SignalAutomation> = {}): SignalAutomation => ({
  trackId: 'd1', paramKey: 'cutoff', kind: 'sine', periodCycles: 1, lanePeriodCycles: 1,
  lo: 200, hi: 2000, ranged: true, boundsAsWritten: true, offset: 0, spans: NO_SPANS, placements: [[]], ...over,
})

/** The x of character `n`'s left edge, under `measure`. */
const xOf = (n: number): number => CAPTION_PAD_X + n * CHAR_W

describe('captionText — what the lane actually says', () => {
  it('names the parameter and its two bounds', () => {
    // … and, since #1464 Stage 3, the bars one period spans (a bare signal: `~1 bar`).
    expect(captionText(auto())).toBe('cutoff 200→2000 ~1 bar')
  })

  it('marks a bound this code SUPPLIED with ~, so it is never read as the user\'s', () => {
    expect(captionText(auto({ paramKey: 'pan', lo: 0, hi: 1, ranged: false })))
      .toBe('pan ~0→1 ~1 bar')
  })

  it('rounds for display only', () => {
    expect(captionText(auto({ lo: 0.30001, hi: 1 }))).toBe('cutoff 0.3→1 ~1 bar')
  })
})

describe('captionRows — the three abstentions the draw path already made', () => {
  it('a collapsed lane has no captions to click', () => {
    expect(captionRows([auto()], 0, 40, false)).toEqual([])
  })

  it('a band too short to DRAW has none either', () => {
    // 15px row = 9px band, under the curve's own floor: nothing is painted here,
    // so there is nothing to label.
    expect(captionRows([auto()], 0, 15, true)).toEqual([])
  })

  it('LABELS THE LANE A DRUM TRACK ACTUALLY GETS (#1495)', () => {
    // A single-voice PERCUSSIVE lane is one sub-row tall, and the sub-row height
    // is the density setting — 25px by default. Not the 22px constant the issue
    // reasoned from: `FullSongTimeline` passes `rowH` for BOTH the row and the
    // sub-row, so the lane is 1 x 25 and expanding it changes nothing.
    //
    // 25px row = 19px band. That sat between the caption's old 22px floor and
    // the curve's 10px one, which is the whole of the bug: the sweep was drawn
    // and the numbers it swept between were not. Asserting the row is PRESENT
    // and carries all three fields, because an empty array was the old answer.
    const rows = captionRows([auto()], 0, 25, true)
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toBe('cutoff 200→2000 ~1 bar')
    expect(rows[0].fields.map((f) => f.kind)).toEqual(['param', 'lo', 'hi'])
  })

  it('a drum lane at the SMALLEST density still declines, and the largest still labels', () => {
    // The setting is clamped to 12..48 (`setMusicalTimelineSubRowHeight`), so
    // these are the real ends of the range, not hypotheticals. The floor has to
    // land inside it or it is not a floor at all.
    expect(captionRows([auto()], 0, 12, true)).toEqual([]) // 6px band
    expect(captionRows([auto()], 0, 48, true)).toHaveLength(1) // 42px band
  })

  it('stops before overflowing the row rather than laying out invisible lines', () => {
    // Room for two lines at 11px each inside a 30px row (pad 3 top).
    const many = [auto({ paramKey: 'a' }), auto({ paramKey: 'b' }), auto({ paramKey: 'c' })]
    const rows = captionRows(many, 0, 30, true)
    expect(rows.map((r) => r.automation.paramKey)).toEqual(['a', 'b'])
  })

  it('stacks lines from the band inset, one line height apart', () => {
    const rows = captionRows([auto({ paramKey: 'a' }), auto({ paramKey: 'b' })], 100, 60, true)
    expect(rows.map((r) => r.y)).toEqual([
      100 + AUTOMATION_PAD_Y,
      100 + AUTOMATION_PAD_Y + AUTOMATION_LABEL_LINE_H,
    ])
  })
})

describe('captionHit — a click resolves to one leg', () => {
  const rows = captionRows([auto()], 0, 60, true) // 'cutoff 200→2000 ~1 bar'
  //                                                 0123456789...

  it('lands on the parameter name', () => {
    const hit = captionHit(rows, xOf(2), AUTOMATION_PAD_Y + 1, measure)
    expect(hit?.field.kind).toBe('param')
    expect(hit?.field.text).toBe('cutoff')
  })

  it('lands on the low bound', () => {
    // 'cutoff ' is 7 chars, so '200' occupies characters 7..9.
    const hit = captionHit(rows, xOf(8), AUTOMATION_PAD_Y + 1, measure)
    expect(hit?.field.kind).toBe('lo')
    expect(hit?.field.text).toBe('200')
  })

  it('lands on the high bound, past the arrow', () => {
    // '200' ends at 10, the arrow is character 10, '2000' is 11..14.
    const hit = captionHit(rows, xOf(12), AUTOMATION_PAD_Y + 1, measure)
    expect(hit?.field.kind).toBe('hi')
    expect(hit?.field.text).toBe('2000')
  })

  it('the ARROW itself is not a field — a click between the bounds hits neither', () => {
    expect(captionHit(rows, xOf(10), AUTOMATION_PAD_Y + 1, measure)).toBeNull()
  })

  it('misses above the line, below it, and past its end', () => {
    expect(captionHit(rows, xOf(8), AUTOMATION_PAD_Y - 2, measure)).toBeNull()
    expect(captionHit(rows, xOf(8), AUTOMATION_PAD_Y + 40, measure)).toBeNull()
    expect(captionHit(rows, xOf(40), AUTOMATION_PAD_Y + 1, measure)).toBeNull()
  })

  it('reports the field\'s own box, so an input can sit exactly over it', () => {
    const hit = captionHit(rows, xOf(8), AUTOMATION_PAD_Y + 1, measure)
    expect(hit?.box).toEqual({ x: xOf(7), y: AUTOMATION_PAD_Y, w: 3 * CHAR_W, h: 10 })
  })
})

describe('captionEdit — the three things it exists to enforce', () => {
  const RANGED = { shape: null, rate: null, range: { start: 30, end: 46 }, chainEnd: 46 }
  const hitOn = (a: SignalAutomation, kind: 'lo' | 'hi' | 'param') => {
    const rows = captionRows([a], 0, 60, true)
    const field = rows[0].fields.find((f) => f.kind === kind)
    return { row: rows[0], field: field!, box: { x: 0, y: 0, w: 0, h: 0 } }
  }

  it('(1) the display\'s rounding cannot reach the document', () => {
    // The caption reads `0.3→1`; the document holds 0.30001. Editing the HIGH
    // bound must not rewrite the low one to the rounded string beside it.
    const a = auto({ lo: 0.30001, hi: 1, spans: RANGED })
    expect(captionText(a)).toBe('cutoff 0.3→1 ~1 bar')
    expect(captionEdit(hitOn(a, 'hi'), '2')).toEqual({
      range: [30, 46], text: '.range(0.30001,2)',
    })
  })

  it('(2) an unchanged field writes nothing — including a differently spelled same number', () => {
    const a = auto({ lo: 200, hi: 2000, spans: RANGED })
    expect(captionEdit(hitOn(a, 'lo'), '200')).toBeNull()
    expect(captionEdit(hitOn(a, 'lo'), '200.0')).toBeNull()
    expect(captionEdit(hitOn(a, 'lo'), ' 200 ')).toBeNull()
  })

  it('(3) a leg the document does not spell INSERTS at chainEnd rather than replacing', () => {
    // `pan ~0→1` — the bounds are this code's, not the document's, so there is
    // no `.range()` to overwrite.
    const a = auto({ paramKey: 'pan', lo: 0, hi: 1, ranged: false,
      spans: { shape: null, rate: null, range: null, chainEnd: 21 } })
    expect(captionEdit(hitOn(a, 'hi'), '0.8')).toEqual({
      range: [21, 21], text: '.range(0,0.8)',
    })
  })

  it('refuses a non-numeric entry', () => {
    const a = auto({ spans: RANGED })
    expect(captionEdit(hitOn(a, 'lo'), 'loud')).toBeNull()
    expect(captionEdit(hitOn(a, 'lo'), '')).toBeNull()
  })

  it('refuses a bound that turns the curve over, or leaves it spanning nothing (#1613)', () => {
    const a = auto({ lo: 200, hi: 2000, spans: RANGED })
    expect(captionEdit(hitOn(a, 'hi'), '100')).toBeNull()   // hi below lo
    expect(captionEdit(hitOn(a, 'hi'), '200')).toBeNull()   // hi equal to lo
  })

  it('refuses when the automation has nowhere to write at all', () => {
    const a = auto({ ranged: false, spans: NO_SPANS })
    expect(captionEdit(hitOn(a, 'hi'), '0.5')).toBeNull()
  })

  it('the parameter name is a menu anchor, not a typed field', () => {
    const a = auto({ spans: RANGED })
    expect(captionEdit(hitOn(a, 'param'), 'gain')).toBeNull()
  })
})

describe('a range written high-to-low keeps its direction (#1613)', () => {
  const RANGED = { shape: null, rate: null, range: { start: 30, end: 46 }, chainEnd: 46 }
  const hitOn = (a: SignalAutomation, kind: 'lo' | 'hi') => {
    const rows = captionRows([a], 0, 60, true)
    return { row: rows[0], field: rows[0].fields.find((f) => f.kind === kind)!, box: { x: 0, y: 0, w: 0, h: 0 } }
  }
  const turned = auto({ kind: 'tri', lo: 0.7, hi: 0.3, spans: RANGED })

  it('can be retyped, and stays high-to-low', () => {
    expect(captionEdit(hitOn(turned, 'hi'), '0.1')).toEqual({ range: [30, 46], text: '.range(0.7,0.1)' })
    expect(captionEdit(hitOn(turned, 'lo'), '0.9')).toEqual({ range: [30, 46], text: '.range(0.9,0.3)' })
  })

  it('refuses a bound that would turn it over, or leave it spanning nothing', () => {
    expect(captionEdit(hitOn(turned, 'hi'), '0.8')).toBeNull()
    expect(captionEdit(hitOn(turned, 'hi'), '0.7')).toBeNull()
    // Control: the upright curve refuses the mirror of that, and takes its own direction.
    const upright = auto({ kind: 'tri', lo: 0.3, hi: 0.7, spans: RANGED })
    expect(captionEdit(hitOn(upright, 'hi'), '0.2')).toBeNull()
    expect(captionEdit(hitOn(upright, 'hi'), '0.9')).toEqual({ range: [30, 46], text: '.range(0.3,0.9)' })
  })

  it('a flat range has no direction yet, so it widens either way', () => {
    const flat = auto({ lo: 5, hi: 5, spans: RANGED })
    expect(captionEdit(hitOn(flat, 'hi'), '6')).toEqual({ range: [30, 46], text: '.range(5,6)' })
    expect(captionEdit(hitOn(flat, 'hi'), '4')).toEqual({ range: [30, 46], text: '.range(5,4)' })
  })
})

describe('bounds that are not the range call\'s arguments (#1610)', () => {
  const RANGED = { shape: null, rate: null, range: { start: 30, end: 46 }, chainEnd: 46 }
  const bipolar = auto({ kind: 'sine2', lo: -1600, hi: 2000, boundsAsWritten: false, spans: RANGED })
  const unipolar = auto({ lo: 200, hi: 2000, spans: RANGED })

  it('says what plays, marks it as supplied, and offers no field over it', () => {
    expect(captionText(bipolar)).toBe('cutoff ~-1600→2000 ~1 bar')
    // The rate still has somewhere to go; only the bounds are withheld.
    expect(captionRows([bipolar], 0, 60, true)[0].fields.map((f) => f.kind)).toEqual(['param', 'rate'])
    // Control: the same curve where the arguments are the bounds.
    expect(captionText(unipolar)).toBe('cutoff 200→2000 ~1 bar')
    expect(captionRows([unipolar], 0, 60, true)[0].fields.map((f) => f.kind)).toEqual(['param', 'lo', 'hi', 'rate'])
  })

  it('writes nothing even when handed a bound field, beside a control that writes', () => {
    const rows = captionRows([unipolar], 0, 60, true)
    const field = rows[0].fields.find((f) => f.kind === 'hi')!
    const hit = (a: SignalAutomation) => ({ row: { ...rows[0], automation: a }, field, box: { x: 0, y: 0, w: 0, h: 0 } })
    expect(captionEdit(hit(unipolar), '3000')).toEqual({ range: [30, 46], text: '.range(200,3000)' })
    expect(captionEdit(hit(bipolar), '3000')).toBeNull()
  })

  it('through the real parser: none of these curves offers a bound, and the unipolar control reads back as typed', () => {
    const readOne = (src: string) => signalAutomations(parseStrudel(src) as never)[0]
    for (const src of [
      '$: s("bd*8").cutoff(sine2.slow(4).range(200, 2000))',
      '$: s("bd*8").pan(sine2.slow(4))',
      '$: s("bd*8").pan(sine.slow(4).range(0, 2).range(0.2, 0.8))',
    ]) {
      expect(captionRows([readOne(src)], 0, 60, true)[0].fields.map((f) => f.kind), src).toEqual(['param', 'rate'])
    }
    const src = '$: s("bd*8").pan(sine.slow(4))'
    const rows = captionRows([readOne(src)], 0, 60, true)
    const edit = captionEdit({ row: rows[0], field: rows[0].fields.find((f) => f.kind === 'hi')!, box: { x: 0, y: 0, w: 0, h: 0 } }, '0.8')
    expect(edit).not.toBeNull()
    const out = src.slice(0, edit!.range[0]) + edit!.text + src.slice(edit!.range[1])
    expect(out).toBe('$: s("bd*8").pan(sine.slow(4).range(0,0.8))')
    expect(readOne(out)).toMatchObject({ lo: 0, hi: 0.8, boundsAsWritten: true })
  })
})

describe('the rate field — what it says and where it can be clicked (#1464 Stage 3)', () => {
  const SLOWED = { shape: null, rate: { start: 20, end: 28 }, range: null, chainEnd: 40 }

  it('says the bars one period spans on the lane, and marks a rate the signal does not write', () => {
    expect(captionText(auto({ periodCycles: 4, lanePeriodCycles: 4, spans: SLOWED }))).toBe('cutoff 200→2000 4 bars')
    // Under a whole-track slow(2) the lane shows 8, not the 4 the signal spells.
    expect(captionText(auto({ periodCycles: 4, lanePeriodCycles: 8, spans: SLOWED }))).toBe('cutoff 200→2000 8 bars')
    expect(captionText(auto({ lanePeriodCycles: 1 }))).toBe('cutoff 200→2000 ~1 bar')
    // Routes that disagree have no one number to show.
    expect(captionText(auto({ lanePeriodCycles: null }))).toBe('cutoff 200→2000')
  })

  it('a click on the number lands on the rate; the unit is not a field', () => {
    const rows = captionRows([auto({ periodCycles: 4, lanePeriodCycles: 4, spans: SLOWED })], 0, 60, true)
    // 'cutoff 200→2000 4 bars' — the rate number is character 16, the unit 18..21.
    expect(captionHit(rows, xOf(16), AUTOMATION_PAD_Y + 1, measure)?.field).toEqual({ kind: 'rate', text: '4', from: 16, to: 17 })
    expect(captionHit(rows, xOf(19), AUTOMATION_PAD_Y + 1, measure)).toBeNull()
  })

  it('shows two composing rates without offering a field over them', () => {
    const ambiguous = auto({ periodCycles: 2, lanePeriodCycles: 2, spans: { shape: null, rate: null, range: null, chainEnd: 40 } })
    expect(captionText(ambiguous)).toBe('cutoff 200→2000 2 bars')
    expect(rateEditable(ambiguous)).toBe(false)
    expect(captionRows([ambiguous], 0, 60, true)[0].fields.map((f) => f.kind)).toEqual(['param', 'lo', 'hi'])
    // Control: the same automation with one spelled rate does offer it.
    expect(captionRows([auto({ periodCycles: 2, lanePeriodCycles: 2, spans: SLOWED })], 0, 60, true)[0].fields.map((f) => f.kind))
      .toEqual(['param', 'lo', 'hi', 'rate'])
  })
})

describe('captionEdit on the rate — what a typed number writes (#1464 Stage 3)', () => {
  const SLOWED = { shape: null, rate: { start: 20, end: 28 }, range: null, chainEnd: 40 }
  const rateHit = (a: SignalAutomation) => {
    const rows = captionRows([a], 0, 60, true)
    const field = rows[0].fields.find((f) => f.kind === 'rate')
    if (!field) throw new Error('no rate field on this fixture')
    return { row: rows[0], field, box: { x: 0, y: 0, w: 0, h: 0 } }
  }
  const spelled = auto({ periodCycles: 4, lanePeriodCycles: 4, spans: SLOWED })

  it('replaces the spelled rate with the typed bars', () => {
    expect(captionEdit(rateHit(spelled), '8')).toEqual({ range: [20, 28], text: '.slow(8)' })
  })

  it('writes a whole-number speed-up as fast, and anything else as slow', () => {
    expect(captionEdit(rateHit(spelled), '0.5')).toEqual({ range: [20, 28], text: '.fast(2)' })
    expect(captionEdit(rateHit(spelled), '1.5')).toEqual({ range: [20, 28], text: '.slow(1.5)' })
    expect(captionEdit(rateHit(spelled), '0.4')).toEqual({ range: [20, 28], text: '.slow(0.4)' })
  })

  it('divides the route\'s time change back out: 8 bars under a whole-track slow(2) writes slow(4)', () => {
    const a = auto({ periodCycles: 2, lanePeriodCycles: 4, spans: SLOWED })
    expect(captionEdit(rateHit(a), '8')).toEqual({ range: [20, 28], text: '.slow(4)' })
  })

  it('inserts a rate the signal does not write, at chainEnd', () => {
    const a = auto({ lanePeriodCycles: 1, spans: { shape: null, rate: null, range: null, chainEnd: 40 } })
    expect(captionEdit(rateHit(a), '4')).toEqual({ range: [40, 40], text: '.slow(4)' })
  })

  it('writes nothing for an unchanged, empty, zero, negative or non-numeric rate', () => {
    for (const typed of ['4', '4.0', ' 4 ', '', ' ', '0', '-2', 'fast']) {
      expect(captionEdit(rateHit(spelled), typed), JSON.stringify(typed)).toBeNull()
    }
  })

  it('writes nothing it cannot spell exactly: 2 bars under a whole-track slow(3)', () => {
    const a = auto({ periodCycles: 1, lanePeriodCycles: 3, spans: SLOWED })
    expect(captionEdit(rateHit(a), '2')).toBeNull()
    // Control: under the same slow, a number it can spell.
    expect(captionEdit(rateHit(a), '6')).toEqual({ range: [20, 28], text: '.slow(2)' })
  })

  it('writes nothing that would read back as a different number of bars, even in few digits', () => {
    // Under a whole-track fast(5) a 0.25-cycle signal shows 0.05 bars. Typing 0.85 means
    // `.slow(4.25)`, six digits or fewer, but 4.25 × 0.2 reads back as 0.8500000000000001,
    // so the next edit would see a changed number the user never typed. Found by a search
    // over whole-track scales and typed bars, not by reasoning: the precision rule alone
    // lets 28,515 of 1,378,007 such inputs through.
    const a = auto({ periodCycles: 0.25, lanePeriodCycles: 0.25 * (1 / 5), spans: SLOWED })
    expect(captionEdit(rateHit(a), '0.85')).toBeNull()
    // Control: under the same fast, a number that reads back exactly.
    expect(captionEdit(rateHit(a), '1')).toEqual({ range: [20, 28], text: '.slow(5)' })
  })
})

describe('the rate field through the real parser: written, then read back (#1464 Stage 3)', () => {
  const apply = (src: string, e: { range: [number, number]; text: string }) => src.slice(0, e.range[0]) + e.text + src.slice(e.range[1])
  const readOne = (src: string) => signalAutomations(parseStrudel(src) as never)[0]
  const retype = (src: string, typed: string): string | null => {
    const a = readOne(src)
    expect(a, `no automation read from ${src}`).toBeDefined()
    const rows = captionRows([a], 0, 60, true)
    const field = rows[0].fields.find((f) => f.kind === 'rate')
    if (!field) return null
    const edit = captionEdit({ row: rows[0], field, box: { x: 0, y: 0, w: 0, h: 0 } }, typed)
    return edit && apply(src, edit)
  }

  it.each([
    ['a spelled slow', '$: s("bd*8").cutoff(saw.slow(4).range(200, 2000))', '8', '$: s("bd*8").cutoff(saw.slow(8).range(200, 2000))'],
    ['a spelled fast, sped up further', '$: s("bd*8").cutoff(sine.fast(2).range(200, 2000))', '0.25', '$: s("bd*8").cutoff(sine.fast(4).range(200, 2000))'],
    ['no rate at all', '$: s("bd*8").cutoff(saw.range(200, 2000))', '4', '$: s("bd*8").cutoff(saw.range(200, 2000).slow(4))'],
    ['under a whole-track slow', '$: s("bd*8").cutoff(saw.slow(4).range(200, 2000)).slow(2)', '4', '$: s("bd*8").cutoff(saw.slow(2).range(200, 2000)).slow(2)'],
  ])('%s: writes only the rate call, and reads back as the bars typed', (_label, src, typed, out) => {
    expect(retype(src, typed)).toBe(out)
    expect(readOne(out).lanePeriodCycles).toBe(Number(typed))
  })

  it('offers no field on two composing rates', () => {
    expect(retype('$: s("bd*8").cutoff(sine.slow(2).fast(4).range(200, 2000))', '4')).toBeNull()
  })
})

describe('the shape menu — what the caption\'s name offers and writes (#1464)', () => {
  const SRC = '$: s("bd*8").cutoff(saw.slow(4).range(200, 2000))'
  const readOne = (src: string) => signalAutomations(parseStrudel(src) as never)[0]
  const apply = (src: string, e: { range: [number, number]; text: string }) => src.slice(0, e.range[0]) + e.text + src.slice(e.range[1])

  it('offers the editor\'s alternatives where the document spells a shape, and none where it does not', () => {
    expect(shapeOptions(readOne(SRC), SHAPE_DEPS)).toEqual([...shapeAlternatives('saw'), ...crossClassShapes('saw')])
    expect(shapeOptions(auto({ kind: 'saw', spans: NO_SPANS }), SHAPE_DEPS)).toEqual([])
  })

  it('replaces the identifier and no other byte, and reads back as the new shape with the same bounds and rate', () => {
    const a = readOne(SRC)
    const edit = shapeEdit(a, 'tri', SRC, SHAPE_DEPS)
    expect(edit).not.toBeNull()
    const out = apply(SRC, edit!)
    expect(out).toBe('$: s("bd*8").cutoff(tri.slow(4).range(200, 2000))')
    const back = readOne(out)
    expect({ kind: back.kind, lo: back.lo, hi: back.hi, period: back.periodCycles, lane: back.lanePeriodCycles })
      .toEqual({ kind: 'tri', lo: a.lo, hi: a.hi, period: a.periodCycles, lane: a.lanePeriodCycles })
  })

  it('writes nothing for the same shape, or a shape the editor does not offer', () => {
    const a = readOne(SRC)
    // Control first: an offered shape does write.
    expect(shapeEdit(a, 'sine', SRC, SHAPE_DEPS)).not.toBeNull()
    // `perlin` is offered since #1611 — the menu, not this function, holds it until the
    // song length is said (`shapeMenuOptions`).
    expect(shapeEdit(a, 'perlin', SRC, SHAPE_DEPS)).not.toBeNull()
    for (const next of ['saw', 'saw2', 'rand2', 'time', 'cutoff', '']) {
      expect(shapeEdit(a, next, SRC, SHAPE_DEPS), next).toBeNull()
    }
  })

  it('writes nothing where the document spells no shape', () => {
    expect(shapeEdit(auto({ kind: 'saw', spans: NO_SPANS }), 'tri', SRC, SHAPE_DEPS)).toBeNull()
  })

  it('#1611 — offers noise only once it can say what the swap does to the song\'s length', () => {
    const a = readOne(SRC)
    const labels = (preview: Parameters<typeof shapeMenuOptions>[2], was: number | null) =>
      shapeMenuOptions(a, SHAPE_DEPS, preview, was).map((o) => `${o.label}${o.disabled ? ' [disabled]' : ''}`)
    const same = shapeAlternatives('saw')

    // No owner to measure with: the waveforms only, as before.
    expect(labels(null, 16)).toEqual(same)
    // Measuring: offered, and cannot be chosen yet.
    expect(labels({ state: 'pending' }, 16)).toEqual([...same, 'perlin · measuring song length… [disabled]', 'rand · measuring song length… [disabled]'])
    // Measured: the new length, the same one, or none to be said.
    expect(labels({ state: 'done', cycles: 4 }, 16)).toEqual([...same, 'perlin · song repeats every 4 bars (was 16)', 'rand · song repeats every 4 bars (was 16)'])
    expect(labels({ state: 'done', cycles: 16 }, 16)).toEqual([...same, 'perlin · same song length', 'rand · same song length'])
    expect(labels({ state: 'done', cycles: null }, 16)).toEqual([...same, 'perlin · song length unknown', 'rand · song length unknown'])
    expect(labels({ state: 'done', cycles: 1 }, null)).toEqual([...same, 'perlin · song repeats every 1 bar', 'rand · song repeats every 1 bar'])
    // Nothing spelled, nothing offered.
    expect(shapeMenuOptions(auto({ kind: 'saw', spans: NO_SPANS }), SHAPE_DEPS, { state: 'done', cycles: 4 }, 16)).toEqual([])
  })

  it('#1611 — noise offers the waveforms, with the same labels', () => {
    const src = '$: s("bd*8").cutoff(perlin.slow(16).range(200, 2000))'
    const a = readOne(src)
    const options = shapeMenuOptions(a, SHAPE_DEPS, { state: 'done', cycles: 16 }, 4)
    expect(options.map((o) => o.label)).toEqual(['rand', ...crossClassShapes('perlin').map((k) => `${k} · song repeats every 16 bars (was 4)`)])
    const edit = shapeEdit(a, 'sine', src, SHAPE_DEPS)
    expect(apply(src, edit!)).toBe('$: s("bd*8").cutoff(sine.slow(16).range(200, 2000))')
  })

  it('writes nothing when the document moved under the open menu', () => {
    const a = readOne(SRC)
    // Two characters inserted before the curve: the captured offsets now land on `(s`.
    expect(shapeEdit(a, 'tri', `  ${SRC}`, SHAPE_DEPS)).toBeNull()
    // Control: the same bytes at the same place still write.
    expect(shapeEdit(a, 'tri', SRC, SHAPE_DEPS)).not.toBeNull()
  })
})
