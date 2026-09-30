/**
 * A `,`-stack whose parts are written over different numbers of bars (#1849).
 *
 * `<[bd ~ bd ~] [bd ~ ~ bd]>, ~ sd ~ sd, hh*8` plays for two bars: the kick is written
 * over two, the snare and hats over one, and Strudel plays those again in bar 2 (`stack`
 * asks every part for the same cycle). The grid draws two bars, the one-bar parts
 * REPEATED, and an edit anywhere in a repeat is written into the part's one written bar —
 * so every repeat changes with it and the other parts keep their bytes.
 */
import { describe, expect, it } from 'vitest'
import { parseStepGrid } from '../parse'
import { linkGridRepeats, serializeStepGrid } from '../serialize'
import { toggleCell } from '../place'
import { collapseStepGridToDocument } from '../resolution'
import type { StepGridModel } from '../model'
import { writtenStepStarts, repeatedBar } from '../../panels/writtenSteps'

const BEAT = '<[bd ~ bd ~] [bd ~ ~ bd]>, ~ sd ~ sd, hh*8'
const CORPUS = 'bd bd bd bd, - sd - sd, <[cr oh hh oh hh oh hh oh] [hh oh]*4!3>'

function open(mini: string): StepGridModel {
  const r = parseStepGrid(mini)
  if (!r.ok) throw new Error(`refused: ${r.reason}`)
  return r.model
}
const lane = (m: StepGridModel, sound: string): number => {
  const i = m.lanes.findIndex((l) => l.sound === sound)
  if (i < 0) throw new Error(`no ${sound} lane`)
  return i
}
/** the columns a sound is struck in */
const hits = (m: StepGridModel, sound: string): number[] =>
  m.lanes[lane(m, sound)].cells.flatMap((c, i) => (c ? [i] : []))
/** toggle, write, and read the result back the way the panel does */
function edit(mini: string, sound: string, col: number, value: boolean): string {
  const m = open(mini)
  const next = toggleCell(m, lane(m, sound), col, value)
  expect(next, `the ${sound} toggle at ${col} must be admitted`).not.toBe(m)
  const out = serializeStepGrid(next)
  expect(out).not.toBeNull()
  return out!
}

describe('a stack with a `<…>` part reads bar by bar, shorter parts repeated (#1849)', () => {
  it('opens with its source: 2 bars, the kick written over 2, snare and hats over 1', () => {
    const m = open(BEAT)
    expect(m.leafSource).toBeUndefined()
    expect(m.bars).toBe(2)
    expect(m.steps).toBe(16)
    expect(m.source?.parts.map((p) => p.bars)).toEqual([2, 1, 1])
    // what Strudel plays: kick changes per bar, the snare is the same bar twice
    expect(hits(m, 'bd')).toEqual([0, 4, 8, 14])
    expect(hits(m, 'sd')).toEqual([2, 6, 10, 14])
    expect(hits(m, 'hh')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    expect(serializeStepGrid(m)).toBe(BEAT)
  })

  it('an edit in a REPEATED bar is written into the written bar: every repeat changes', () => {
    // remove the snare in bar 2 (column 10 repeats bar 1's column 2)
    const out = edit(BEAT, 'sd', 10, false)
    expect(out).toBe('<[bd ~ bd ~] [bd ~ ~ bd]>, ~ ~ ~ sd, hh*8')
    expect(hits(open(out), 'sd')).toEqual([6, 14])
  })

  it('adding in a repeated bar is the same edit as adding in the written bar', () => {
    // column 13 repeats column 5: between the snare's own columns, so its step splits
    // (a column ON the snare's own grid paints half a snare step, which the one-bar
    // stack `bd ~, hh*4` refuses too — not this path's rule)
    expect(edit(BEAT, 'sd', 13, true)).toBe(edit(BEAT, 'sd', 5, true))
    expect(edit(BEAT, 'sd', 5, true)).toBe('<[bd ~ bd ~] [bd ~ ~ bd]>, ~ sd [~ sd] sd, hh*8')
  })

  it('an edit to the part written over 2 bars changes only that bar, and no other part', () => {
    // column 11 is between the kick's own columns, so bar 2 is spelled at the shared
    // width — Strudel plays bar 2 as bd 1+1/4, 11/8+1/8, 7/4+1/4 and bar 1 unchanged
    const out = edit(BEAT, 'bd', 11, true)
    expect(out).toBe('<[bd ~ bd ~] [bd _ ~ bd ~ ~ bd _]>, ~ sd ~ sd, hh*8')
  })

  it('the corpus shape: a 4-bar hats part beside two 1-bar parts', () => {
    const m = open(CORPUS)
    expect(m.bars).toBe(4)
    expect(m.source?.parts.map((p) => p.bars)).toEqual([1, 1, 4])
    expect(serializeStepGrid(m)).toBe(CORPUS)
    // the kick struck in bar 3 only: written into its one bar
    const bdBar3 = 2 * (m.steps / 4) + 2
    expect(edit(CORPUS, 'bd', bdBar3, false)).toBe(
      'bd ~ bd bd, - sd - sd, <[cr oh hh oh hh oh hh oh] [hh oh]*4!3>',
    )
  })

  it('step lines and repeat marks follow the repeats', () => {
    const m = open(BEAT)
    const sdPart = m.lanes[lane(m, 'sd')].part!
    expect(writtenStepStarts(m).get(sdPart)).toEqual([0, 2, 4, 6, 8, 10, 12, 14])
    expect(repeatedBar(m, sdPart, 3)).toBeNull()
    expect(repeatedBar(m, sdPart, 11)).toBe(1)
    const bdPart = m.lanes[lane(m, 'bd')].part!
    expect(repeatedBar(m, bdPart, 11)).toBeNull()
  })

  it('the model a panel keeps after the edit is the one the text reads back as', () => {
    const m = open(BEAT)
    const edited = toggleCell(m, lane(m, 'sd'), 10, false)
    // as painted: only bar 2 lost its snare
    expect(hits(edited, 'sd')).toEqual([2, 6, 14])
    const shown = linkGridRepeats(edited)
    const back = open(serializeStepGrid(edited)!)
    for (const sound of ['bd', 'sd', 'hh']) expect(hits(shown, sound)).toEqual(hits(back, sound))
    expect(serializeStepGrid(shown)).toBe(serializeStepGrid(edited))
    // nothing repeats → the same model, by reference
    const flat = open('bd sd, hh*4')
    expect(linkGridRepeats(flat)).toBe(flat)
  })

  it('an edit that changes two repeats differently is declined, never half-written', () => {
    const m = open(BEAT)
    const sd = lane(m, 'sd')
    // take the bar-1 snare out and put one in bar 2 at a different column: a "move"
    // across the bar line of a part that is written once
    const cells = m.lanes[sd].cells.map((c, i) => (i === 6 ? false : i === 12 ? m.lanes[sd].cells[6] : c))
    const moved: StepGridModel = { ...m, lanes: m.lanes.map((l, i) => (i === sd ? { ...l, cells } : l)) }
    expect(serializeStepGrid(moved)).toBeNull()
    // …while the same change made in BOTH repeats is one edit, and writes
    const both = m.lanes[sd].cells.map((c, i) =>
      i === 6 || i === 14 ? false : i === 4 || i === 12 ? m.lanes[sd].cells[6] : c,
    )
    const alike: StepGridModel = { ...m, lanes: m.lanes.map((l, i) => (i === sd ? { ...l, cells: both } : l)) }
    expect(serializeStepGrid(alike)).toBe('<[bd ~ bd ~] [bd ~ ~ bd]>, ~ sd sd ~, hh*8')
  })

  it('a ×2 view comes back to the document, so zooming never respells the file (#1057)', () => {
    // the corpus unit whose one-bar and two-bar parts share a width: halving passes
    // through a model whose regions still describe ×2, and the two-bar part must
    // rebuild bar by bar there rather than decline
    for (const mini of [BEAT, CORPUS, 'c2 c2 c2 c2 , < [~ g1 ~ ~] [~ ~ ~ g1] >']) {
      const r = parseStepGrid(mini, 2)
      if (!r.ok) throw new Error(`×2 refused ${mini}`)
      const back = collapseStepGridToDocument(r.model)
      expect(back, mini).not.toBeNull()
      expect(serializeStepGrid(back!)).toBe(mini)
    }
  })

  it('CONTROL: a stack that plays one bar is read exactly as before', () => {
    const m = open('bd sd, hh*4')
    expect(m.bars).toBeUndefined()
    expect(m.source?.parts.every((p) => p.bars === undefined)).toBe(true)
    expect(edit('bd sd, hh*4', 'bd', 1, true)).toBe('[bd bd] sd, hh*4')
  })
})
