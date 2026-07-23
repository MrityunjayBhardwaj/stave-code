/**
 * structuralWalk arrange arm-bucketing gate (#974, part of the collect.ts split #945).
 *
 * Regression guard for a bug the 57-tune corpus never exercised and only the real-app arrange
 * e2e caught: an `arrange(...)` whose arms span MORE than one cycle each. structuralWalk descends
 * into the selected arm with a SELECTION cycle (arm-local), and the leaf it reaches must still be
 * bucketed under the OUTER SONG cycle — the cycle collect emits as `floor(begin)` and the one
 * `armByCycle` indexes. Conflating the two put every arm on its arm-local 0..w-1 (last-write-wins
 * → `[2,2,2,2,null,…]`) instead of `[0,0,1,1,2,2,2,2]`, so a clip-split gesture on a multi-cycle
 * arrange lane targeted the wrong cycle and silently no-op'd.
 *
 * The corpus's one arrange tune (`bakery-arrange-root`) has single-cycle arms, so the byte-
 * identical gate could not see this. Here we pin `armByCycle` against collect's own bucketing for
 * multi-cycle arms directly.
 */
import { describe, it, expect } from 'vitest'
import { parseStrudel } from '../../../editor/src/ir/parseStrudel'
import { collectCycles } from '../../../editor/src/ir/collect'
import { laneKeyOf } from '../../../editor/src/ir/songAnalysis'
import { structuralWalk } from '../../../editor/src/ir/structuralWalk'
import type { IREvent } from '../../../editor/src/ir/IREvent'

/** collect's own armByCycle for a lane — the oracle: bucket each event under `floor(begin)`. */
function collectArmByCycle(events: IREvent[], laneKey: string, n: number): Array<number | null> {
  const bc = new Array<number | null>(n).fill(null)
  for (const ev of events) {
    if (laneKeyOf(ev) !== laneKey || typeof ev.armIndex !== 'number') continue
    const c = Math.floor(ev.begin)
    if (c >= 0 && c < n) bc[c] = ev.armIndex
  }
  return bc
}

function walkArmByCycle(code: string, laneKey: string, n: number): Array<number | null> {
  const lane = structuralWalk(parseStrudel(code), n).find((l) => l.laneKey === laneKey)
  return (lane?.armByCycle ?? new Array<number | undefined>(n)).map((x) => x ?? null)
}

describe('structuralWalk buckets arrange arms by the OUTER song cycle (#974)', () => {
  it('multi-cycle arms land on the cycles they play (matches collect)', () => {
    // arm0 weight2 → cycles 0-1, arm1 weight2 → 2-3, arm2 weight4 → 4-7.
    const code = '$: arrange([2, s("bd")], [2, s("hh")], [4, s("cp")])'
    const n = 8
    const oracle = collectArmByCycle(collectCycles(parseStrudel(code), 0, n), 'd1', n)
    expect(walkArmByCycle(code, 'd1', n)).toEqual(oracle)
    expect(walkArmByCycle(code, 'd1', n)).toEqual([0, 0, 1, 1, 2, 2, 2, 2])
  })

  it('the multi-track fixture the e2e split-gesture uses (d1 arrange, two sibling $: tracks)', () => {
    const code = [
      '$: arrange([2, s("bd")], [2, s("hh")], [4, s("cp")])',
      '$: s("bd*2, ~ sd, hh*8").bank("RolandTR909")',
      '$: note("c2 eb2 g2 c3").s("sawtooth").slow(2)',
    ].join('\n')
    const n = 8
    const oracle = collectArmByCycle(collectCycles(parseStrudel(code), 0, n), 'd1', n)
    expect(walkArmByCycle(code, 'd1', n)).toEqual(oracle)
  })

  it('single-cycle arms still bucket one-per-cycle (the corpus shape, unregressed)', () => {
    const code = '$: arrange([1, s("bd")], [1, s("hh")], [1, s("cp")])'
    const n = 3
    const oracle = collectArmByCycle(collectCycles(parseStrudel(code), 0, n), 'd1', n)
    expect(walkArmByCycle(code, 'd1', n)).toEqual(oracle)
    expect(walkArmByCycle(code, 'd1', n)).toEqual([0, 1, 2])
  })
})
