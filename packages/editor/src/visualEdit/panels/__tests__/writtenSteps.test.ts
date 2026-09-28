/**
 * writtenSteps (#1841) — the written steps the parser already recorded, in drawn columns.
 *
 * Every expected value below was read off the model's own regions first (`source.parts[]
 * .regions`, `altSource.regions`) and only then pinned, so these arms say "the drawing
 * follows the model", not "the drawing follows a second reading of the text".
 */
import { describe, expect, it } from 'vitest'
import { parsePianoRoll, parseStepGrid } from '../../notation/parse'
import { columnCount } from '../../notation/model'
import { UNREFINED } from '../../notation/viewResolution'
import { drawnBarStarts, rulerLabels, writtenStepStarts } from '../writtenSteps'

const grid = (mini: string, scale = UNREFINED) => {
  const r = parseStepGrid(mini, scale)
  if (!r.ok) throw new Error(`${mini}: ${r.reason}`)
  return r.model
}
const roll = (mini: string) => {
  const r = parsePianoRoll(mini)
  if (!r.ok) throw new Error(`${mini}: ${r.reason}`)
  return r.model
}
const starts = (m: Parameters<typeof writtenStepStarts>[0]) => Object.fromEntries(writtenStepStarts(m))
const labels = (m: Parameters<typeof writtenStepStarts>[0] & { lanes?: unknown }, part = 0) =>
  Object.fromEntries(rulerLabels(m, columnCount(m as never), writtenStepStarts(m).get(part)))

describe('written-step starts, in drawn columns', () => {
  it('a group inside a step: four written steps over eight columns', () => {
    const m = grid('bd [~ bd] sd ~')
    expect(starts(m)).toEqual({ 0: [0, 2, 4, 6] })
    expect(labels(m)).toEqual({ 0: '1', 2: '1.2', 4: '1.3', 6: '1.4' })
  })

  it('`hh*8` is one written step, as the model records it', () => {
    expect(starts(grid('hh*8'))).toEqual({ 0: [0] })
    expect(labels(grid('hh*8'))).toEqual({ 0: '1' })
  })

  it('each `,`-part has its own steps, stretched onto the shared grid by its factor', () => {
    // `bd sd` is 2 own columns stretched ×3 onto the 6 shared ones; `hh*3` is one step
    expect(starts(grid('bd sd, hh*3'))).toEqual({ 0: [0, 3], 1: [0] })
  })

  it('a two-against-three bar keeps both groups as steps', () => {
    expect(starts(grid('[bd sd] [lt mt ht]'))).toEqual({ 0: [0, 6] })
  })

  it('an alternation used as a step repeats its within-bar steps in every bar', () => {
    const m = grid('bd <sd hh>')
    expect(m.altSource).toBeDefined()
    expect(starts(m)).toEqual({ 0: [0, 1, 2, 3] })
    expect(labels(m)).toEqual({ 0: '1', 1: '1.2', 2: '2', 3: '2.2' })
  })

  it('a grid drawn per bar maps through the shared grid (bars of 3 and 2)', () => {
    const m = grid('<bd*3 [sd hh]>')
    expect(m.barSteps).toEqual([3, 2])
    expect(starts(m)).toEqual({ 0: [0, 3] })
    expect(labels(m)).toEqual({ 0: '1', 3: '2' })
  })

  it('a finer Slots view moves the lines with the columns', () => {
    expect(starts(grid('bd [~ bd] sd ~', 2 as never))).toEqual({ 0: [0, 4, 8, 12] })
  })

  it('a leaf-read grid has no written-step regions: bar numbers only', () => {
    const m = grid('<bd [~ bd]>@2 hh@2 bd <bd ~> [hh bd] [~ hh]')
    expect(m.leafSource).toBeDefined()
    expect(starts(m)).toEqual({})
    expect(labels(m)).toEqual({ 0: '1', 16: '2' })
  })

  it('a region set that no longer tiles the model is skipped, not guessed', () => {
    const m = grid('bd [~ bd] sd ~')
    // the writers' covers-check: a width moved out from under the regions
    expect(starts({ ...m, steps: 16 })).toEqual({})
  })

  it('the piano roll reads the same regions', () => {
    expect(starts(roll('c4 [e4 g4] a4 b4'))).toEqual({ 0: [0, 2, 4, 6] })
    expect(starts(roll('<[c3 e3 g3] [c3 e3 g3 b3]>'))).toEqual({ 0: [0, 3] })
  })
})

describe('bar starts come from the panels’ own layout', () => {
  it('uniform bars and bars drawn per bar', () => {
    const two = grid('<bd [sd sd]>')
    expect(drawnBarStarts(two, columnCount(two))).toEqual([0, 2, 4])
    const perBar = grid('<bd*3 [sd hh]>')
    expect(drawnBarStarts(perBar, columnCount(perBar))).toEqual([0, 3, 5])
  })
})
