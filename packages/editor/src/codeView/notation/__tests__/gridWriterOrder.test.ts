import { describe, it, expect } from 'vitest'
import { miniPattern } from '../../strudelMini/pattern'
import { isCellOn, type StepGridModel } from '../model'
import { parsePianoRoll, parseStepGrid } from '../parse'
import { canToggleCell, toggleCell } from '../place'
import { serializeStepGrid } from '../serialize'

/**
 * #1983 — below the syntactic core, the element writer keeps every grid it opens, with
 * the byte-local overlay tried first. Until then a view whose only region was the whole
 * bar, over several bars, went to the leaf writer whenever that could take it; with the
 * overlay that order gave these patterns the writer that can do less for them: most
 * empty cells took nothing, a note two bars share could not be removed, and no finer
 * view was offered.
 *
 * These are the five corpus patterns both writers can open. Every written document is
 * compared with what Strudel plays, never with a re-parse.
 */
const FIVE = [
  '[<a3 c4 e4> <d3 g3 b3>]',
  '[[sh hh*2 [<~ oh>] rim]]',
  '[bd <[oh hh] [hh hh]> sd hh]',
  '[c eb g <f bb>](3,8,<0 1>)',
  '{c [f g] d# d}%2',
]

function open(mini: string, scale: 1 | 2 = 1): StepGridModel {
  const r = parseStepGrid(mini, scale)
  if (!r.ok) throw new Error(`${mini} did not open at x${scale}: ${r.gate ?? r.reason}`)
  return r.model
}

/** every hit of `cycles` cycles as `sound@start+length`, sorted, one list per cycle */
function plays(mini: string, cycles: number): string[][] {
  const pat = miniPattern(mini)
  return Array.from({ length: cycles }, (_, c) =>
    pat
      .hits(c)
      .map((h) => `${String(h.value).toLowerCase()}@${(h.begin.valueOf() - c).toFixed(6)}+${(h.end.valueOf() - h.begin.valueOf()).toFixed(6)}`)
      .sort(),
  )
}

/** the cells of `model`, as [lane, column, on] */
function cells(model: StepGridModel): Array<[number, number, boolean]> {
  return model.lanes.flatMap((lane, l) => lane.cells.map((c, col): [number, number, boolean] => [l, col, isCellOn(c)]))
}

describe('#1983 — the element writer keeps a grid whose only region is the whole bar', () => {
  it('serves all five by the element writer, with the byte-local overlay offered', () => {
    for (const mini of FIVE) {
      const m = open(mini)
      expect(m.leafSource, mini).toBeUndefined()
      expect(m.surgical, mini).toBeDefined()
    }
  })

  it('offers all five one step finer', () => {
    for (const mini of FIVE) {
      const m = open(mini, 2)
      expect(m.steps, mini).toBe(open(mini).steps * 2)
    }
  })

  it('takes every delete, and each one plays the original minus exactly that hit', () => {
    let deletes = 0
    for (const mini of FIVE) {
      const m = open(mini)
      const bars = m.bars ?? 1
      const before = plays(mini, 2 * bars)
      for (const [lane, col, on] of cells(m)) {
        if (!on) continue
        expect(canToggleCell(m, lane, col, false), `${mini} [${lane},${col}]`).toBe(true)
        const out = serializeStepGrid(toggleCell(m, lane, col, false))
        expect(out, `${mini} [${lane},${col}]`).not.toBeNull()
        const after = plays(out!, 2 * bars)
        // one hit gone from this bar each time the period comes round, nothing else moved
        const lost = before.map((cyc, c) => {
          const rest = [...after[c]]
          return cyc.filter((h) => {
            const i = rest.indexOf(h)
            if (i < 0) return true
            rest.splice(i, 1)
            return false
          })
        })
        expect(after.flat().length, `${mini} [${lane},${col}] -> ${out}`).toBe(before.flat().length - 2)
        expect(lost.flat().length, `${mini} [${lane},${col}] -> ${out}`).toBe(2)
        deletes++
      }
    }
    // the leaf writer took 20 of these and declined 16
    expect(deletes).toBe(36)
  })

  it('keeps the author’s spelling on a delete the overlay can make', () => {
    const m = open('{c [f g] d# d}%2')
    // the last `d`: bar 1, the second half
    const lane = m.lanes.findIndex((l) => l.sound === 'd')
    const col = m.lanes[lane].cells.map((c) => isCellOn(c)).lastIndexOf(true)
    expect(serializeStepGrid(toggleCell(m, lane, col, false))).toBe('{c [f g] d# ~}%2')
  })

  it('writes the delete the overlay cannot make, as bars — a note two bars share', () => {
    // `c` is played by both bars from one piece of text; the leaf writer declined this
    const mini = '[c eb g <f bb>](3,8,<0 1>)'
    const m = open(mini)
    const lane = m.lanes.findIndex((l) => l.sound === 'c')
    const col = m.lanes[lane].cells.findIndex((c) => isCellOn(c))
    const out = serializeStepGrid(toggleCell(m, lane, col, false))
    expect(out).toBe('<[~ ~ ~ eb ~ ~ f ~] [~ c ~ ~ g ~ ~ bb]>')
  })

  it('takes a hit on every empty cell, and every hit that played before still starts where it did', () => {
    let placed = 0
    for (const mini of FIVE) {
      const m = open(mini)
      const bars = m.bars ?? 1
      const starts = (doc: string): string[] => plays(doc, 2 * bars).flatMap((cyc, c) => cyc.map((h) => `${c}:${h.split('+')[0]}`)).sort()
      const before = starts(mini)
      for (const [lane, col, on] of cells(m)) {
        if (on) continue
        expect(canToggleCell(m, lane, col, true), `${mini} [${lane},${col}]`).toBe(true)
        const out = serializeStepGrid(toggleCell(m, lane, col, true))
        expect(out, `${mini} [${lane},${col}]`).not.toBeNull()
        const after = starts(out!)
        // two more hits (one per time the period comes round), and none of the old ones gone
        expect(after.length, `${mini} [${lane},${col}] -> ${out}`).toBe(before.length + 2)
        const rest = [...after]
        for (const h of before) {
          const i = rest.indexOf(h)
          expect(i, `${mini} [${lane},${col}] -> ${out} lost ${h}`).toBeGreaterThanOrEqual(0)
          rest.splice(i, 1)
        }
        placed++
      }
    }
    // the leaf writer took 4 of these
    expect(placed).toBe(248)
  })

  it('leaves the leaf writer what the element writer cannot open', () => {
    // one hit every four bars: no re-emit can spell it, so it stays the leaf writer's
    const m = open('amen/4')
    expect(m.leafSource).toBeDefined()
    const col = m.lanes[0].cells.findIndex((c) => isCellOn(c))
    expect(serializeStepGrid(toggleCell(m, 0, col, false))).toBe('~/4')
  })

  it('is the order the roll already had: the same patterns are element-written there', () => {
    for (const mini of ['[c eb g <f bb>](3,8,<0 1>)', '{c [f g] d# d}%2']) {
      const r = parsePianoRoll(mini)
      expect(r.ok && !r.model.leafSource, mini).toBe(true)
    }
  })
})
