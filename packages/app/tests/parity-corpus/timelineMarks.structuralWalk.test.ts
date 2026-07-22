/**
 * timelineMarks structural-map equivalence gate (#974, part of the collect.ts split #945).
 *
 * Phase 2 swaps the source of the timeline's five per-lane STRUCTURE maps
 * (`sourceByLane` / `labelOffsetByLane` / `arrangeByLane` / `armByCycleByLane` / `armLabelByLane`)
 * from an inline reduction over `collectCycles` events to `structuralWalk` → `LaneSkeleton[]`.
 *
 * `structuralWalk.test.ts` already proves the walk's anchors are byte-identical to collect's
 * (walk-vs-collect, both via `aggregateLaneItems`). But the map builder `collectNoteMarks` used
 * had its OWN inline reduction, which is what actually shipped — so this gate closes the
 * remaining link: the maps `structuralWalk` produces must equal the maps the DELETED inline loop
 * produced, over the whole corpus. The oracle below is that inline loop, verbatim; if the two
 * disagree on any tune, the swap moved a structure verdict and the diff must be explained, not
 * `-u`'d.
 *
 * Run at integer N: the only difference between the loops is the pre-eval mark path (not built
 * here) and a fractional `displayCycles` filter boundary, which coincides at integer N.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStrudel } from '../../../editor/src/ir/parseStrudel'
import { collectCycles } from '../../../editor/src/ir/collect'
import { laneKeyOf } from '../../../editor/src/ir/songAnalysis'
import type { IREvent } from '../../../editor/src/ir/IREvent'
import { structuralWalk } from '../../../editor/src/ir/structuralWalk'

const N = 4
const corpusDir = path.dirname(fileURLToPath(import.meta.url))
const corpusFiles = fs
  .readdirSync(corpusDir)
  .filter((f) => f.endsWith('.strudel'))
  .sort()

interface StructMaps {
  sourceByLane: Map<string, number>
  labelOffsetByLane: Map<string, number>
  arrangeByLane: Map<string, number>
  armByCycleByLane: Map<string, Array<number | undefined>>
  armLabelByLane: Map<string, Map<number, string>>
}

/**
 * The ORACLE: the exact inline reduction `collectNoteMarks` ran over `collectCycles` events
 * before #974, lifted verbatim (minus the pre-eval mark push, which is unrelated to structure).
 */
function oldInlineMaps(events: IREvent[], displayCycles: number): StructMaps {
  const nCycles = Math.ceil(displayCycles)
  const sourceByLane = new Map<string, number>()
  const labelOffsetByLane = new Map<string, number>()
  const arrangeByLane = new Map<string, number>()
  const armByCycleByLane = new Map<string, Array<number | undefined>>()
  const armLabelByLane = new Map<string, Map<number, string>>()
  for (const ev of events) {
    const cycle = ev.begin
    if (!Number.isFinite(cycle) || cycle < 0 || cycle >= displayCycles) continue
    const key = laneKeyOf(ev)
    if (!sourceByLane.has(key)) {
      const offset = ev.loc?.[0]?.start
      if (typeof offset === 'number' && Number.isFinite(offset)) sourceByLane.set(key, offset)
    }
    if (!labelOffsetByLane.has(key) && typeof ev.dollarPos === 'number' && Number.isFinite(ev.dollarPos)) {
      labelOffsetByLane.set(key, ev.dollarPos)
    }
    if (!arrangeByLane.has(key) && ev.loc && ev.loc.length > 0) {
      let outer: number | undefined
      for (const l of ev.loc) {
        const s = l?.start
        if (typeof s !== 'number' || !Number.isFinite(s)) continue
        if (ev.dollarPos !== undefined && s === ev.dollarPos) continue
        if (outer === undefined || s < outer) outer = s
      }
      if (outer !== undefined) arrangeByLane.set(key, outer)
    }
    if (typeof ev.armIndex === 'number') {
      let byCycle = armByCycleByLane.get(key)
      if (!byCycle) {
        byCycle = new Array<number | undefined>(nCycles)
        armByCycleByLane.set(key, byCycle)
      }
      const ci = Math.floor(cycle)
      if (ci >= 0 && ci < nCycles) byCycle[ci] = ev.armIndex
      let labels = armLabelByLane.get(key)
      if (!labels) {
        labels = new Map()
        armLabelByLane.set(key, labels)
      }
      if (!labels.has(ev.armIndex)) {
        const lbl = ev.s ?? (ev.note != null ? String(ev.note) : null)
        if (lbl != null) labels.set(ev.armIndex, lbl)
      }
    }
  }
  return { sourceByLane, labelOffsetByLane, arrangeByLane, armByCycleByLane, armLabelByLane }
}

/** NEW: the maps `collectNoteMarks` now derives from `structuralWalk` (same code path, lifted). */
function walkMaps(ir: Parameters<typeof structuralWalk>[0], nCycles: number): StructMaps {
  const sourceByLane = new Map<string, number>()
  const labelOffsetByLane = new Map<string, number>()
  const arrangeByLane = new Map<string, number>()
  const armByCycleByLane = new Map<string, Array<number | undefined>>()
  const armLabelByLane = new Map<string, Map<number, string>>()
  for (const lane of structuralWalk(ir, nCycles)) {
    const key = lane.laneKey
    if (lane.sourceOffset !== undefined) sourceByLane.set(key, lane.sourceOffset)
    if (lane.dollarPos !== undefined) labelOffsetByLane.set(key, lane.dollarPos)
    if (lane.arrangeOffset !== undefined) arrangeByLane.set(key, lane.arrangeOffset)
    if (lane.armByCycle) armByCycleByLane.set(key, lane.armByCycle)
    if (lane.armLabels) armLabelByLane.set(key, lane.armLabels)
  }
  return { sourceByLane, labelOffsetByLane, arrangeByLane, armByCycleByLane, armLabelByLane }
}

/** Canonical, order-independent view of one map keyed by lane; only lanes the ORACLE has are
 *  compared (structuralWalk may add resilience lanes collect never emits — allowed, they only
 *  annotate rows and the corpus already shows 0 extras). */
function canonScalar(m: Map<string, number>, keys: string[]): string {
  return JSON.stringify(keys.map((k) => [k, m.get(k) ?? null]))
}
function canonArm(m: Map<string, Array<number | undefined>>, keys: string[]): string {
  return JSON.stringify(keys.map((k) => [k, m.get(k) ? [...(m.get(k) as Array<number | undefined>)].map((x) => x ?? null) : null]))
}
function canonLabels(m: Map<string, Map<number, string>>, keys: string[]): string {
  return JSON.stringify(
    keys.map((k) => [k, m.get(k) ? [...(m.get(k) as Map<number, string>).entries()].sort((a, b) => a[0] - b[0]) : null]),
  )
}

// Choice is collect's one non-deterministic arm (Math.random); stub it to fire `then` so the
// oracle is stable and matches structuralWalk's deterministic first branch.
const realRandom = Math.random
beforeAll(() => {
  Math.random = () => 0
})
afterAll(() => {
  Math.random = realRandom
})

describe('collectNoteMarks structure maps: structuralWalk == the old inline collect reduction (#974)', () => {
  it('corpus is non-empty (sanity gate)', () => {
    expect(corpusFiles.length).toBeGreaterThan(0)
  })

  for (const fileName of corpusFiles) {
    const tuneName = fileName.replace(/\.strudel$/, '')
    it(`${tuneName}: every lane's structural anchors match`, () => {
      const code = fs.readFileSync(path.join(corpusDir, fileName), 'utf8')
      const ir = parseStrudel(code)
      const oracle = oldInlineMaps(collectCycles(ir, 0, N), N)
      const target = walkMaps(ir, N)

      // Compare on the ORACLE's lane keys (the lanes the old loop produced) — the invariant is
      // "no shipped lane's anchors moved", and extra resilience lanes are allowed.
      const keys = [
        ...new Set([
          ...oracle.sourceByLane.keys(),
          ...oracle.labelOffsetByLane.keys(),
          ...oracle.arrangeByLane.keys(),
          ...oracle.armByCycleByLane.keys(),
          ...oracle.armLabelByLane.keys(),
        ]),
      ]

      expect(canonScalar(target.sourceByLane, keys), `${tuneName} sourceByLane`).toBe(canonScalar(oracle.sourceByLane, keys))
      expect(canonScalar(target.labelOffsetByLane, keys), `${tuneName} labelOffsetByLane`).toBe(canonScalar(oracle.labelOffsetByLane, keys))
      expect(canonScalar(target.arrangeByLane, keys), `${tuneName} arrangeByLane`).toBe(canonScalar(oracle.arrangeByLane, keys))
      expect(canonArm(target.armByCycleByLane, keys), `${tuneName} armByCycleByLane`).toBe(canonArm(oracle.armByCycleByLane, keys))
      expect(canonLabels(target.armLabelByLane, keys), `${tuneName} armLabelByLane`).toBe(canonLabels(oracle.armLabelByLane, keys))
    })
  }
})
