/**
 * structuralWalk byte-identical gate (#973, part of the collect.ts split #945).
 *
 * `structuralWalk` derives lane anchors from source structure alone — it must NOT depend on
 * `collect`'s behaviour engine (Phase 3 deletes that). This gate proves the derivation is
 * faithful: for EVERY lane collect produces over the corpus, structuralWalk reports the same
 * lane with byte-identical anchors (dollarPos / sourceOffset / arrangeOffset / leafIndex /
 * armByCycle / armLabels). structuralWalk MAY report ADDITIONAL lanes — leaves collect's
 * onset/window logic drops (the resilience it adds, leveraged in Phase 2). Those are counted
 * and reported, never failed on.
 *
 * The oracle aggregates `collectCycles` events with the SAME `aggregateLaneItems` reducer
 * structuralWalk uses, so the two cannot drift on the reduction — only on the item source.
 *
 * `Choice` (`.sometimes`) is the one non-deterministic collect arm (`Math.random`). We stub it
 * to always fire, matching structuralWalk's deterministic `then` pick, so the oracle is stable.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStrudel } from '../../../editor/src/ir/parseStrudel'
import { collectCycles } from '../../../editor/src/ir/collect'
import { laneKeyOf } from '../../../editor/src/ir/songAnalysis'
import type { IREvent } from '../../../editor/src/ir/IREvent'
import {
  structuralWalk,
  aggregateLaneItems,
  type LaneItem,
  type LaneSkeleton,
} from '../../../editor/src/ir/structuralWalk'

const N = 4
const corpusDir = path.dirname(fileURLToPath(import.meta.url))
const corpusFiles = fs
  .readdirSync(corpusDir)
  .filter((f) => f.endsWith('.strudel'))
  .sort()

/** Oracle: reduce collect's events with the SAME reducer structuralWalk uses. */
function collectLanes(events: IREvent[]): LaneSkeleton[] {
  const items: LaneItem[] = events.map((ev) => ({
    laneKey: laneKeyOf(ev),
    cycle: Math.floor(ev.begin),
    ...(ev.dollarPos !== undefined ? { dollarPos: ev.dollarPos } : {}),
    ...(ev.leafIndex !== undefined ? { leafIndex: ev.leafIndex } : {}),
    ...(ev.armIndex !== undefined ? { armIndex: ev.armIndex } : {}),
    ...(ev.loc ? { loc: ev.loc } : {}),
    labelValue: ev.s ?? (ev.note != null ? String(ev.note) : undefined),
  }))
  return aggregateLaneItems(items, N)
}

/** Canonical string of a lane's ANCHORS (not the key) for byte comparison. */
function canon(l: LaneSkeleton): string {
  return JSON.stringify({
    dollarPos: l.dollarPos ?? null,
    sourceOffset: l.sourceOffset ?? null,
    arrangeOffset: l.arrangeOffset ?? null,
    leafIndex: l.leafIndex ?? null,
    armByCycle: l.armByCycle ?? null,
    armLabels: l.armLabels ? [...l.armLabels.entries()].sort((a, b) => a[0] - b[0]) : null,
  })
}

const realRandom = Math.random
beforeAll(() => {
  // Deterministic collect: Choice always fires its `then` branch (0 < p).
  Math.random = () => 0
})
afterAll(() => {
  Math.random = realRandom
})

describe('structuralWalk anchors are byte-identical to collect over the corpus (#973)', () => {
  it('corpus is non-empty (sanity gate)', () => {
    expect(corpusFiles.length).toBeGreaterThan(0)
  })

  let totalShared = 0
  let totalExtra = 0
  const extrasByTune: Array<[string, string[]]> = []

  for (const fileName of corpusFiles) {
    const tuneName = fileName.replace(/\.strudel$/, '')
    it(`${tuneName}: every collect lane matches structuralWalk`, () => {
      const code = fs.readFileSync(path.join(corpusDir, fileName), 'utf8')
      const ir = parseStrudel(code)
      const oracle = collectLanes(collectCycles(ir, 0, N))
      const target = structuralWalk(ir, N)
      const targetByKey = new Map(target.map((l) => [l.laneKey, l]))

      const mismatches: string[] = []
      for (const o of oracle) {
        const t = targetByKey.get(o.laneKey)
        if (!t) {
          mismatches.push(`lane "${o.laneKey}": present in collect, MISSING in structuralWalk`)
          continue
        }
        if (canon(o) !== canon(t)) {
          mismatches.push(`lane "${o.laneKey}":\n    collect = ${canon(o)}\n    struct  = ${canon(t)}`)
        }
        totalShared += 1
      }
      // Extra structural lanes are allowed (resilience) — count + record, never fail.
      const oracleKeys = new Set(oracle.map((l) => l.laneKey))
      const extras = target.map((l) => l.laneKey).filter((k) => !oracleKeys.has(k))
      if (extras.length > 0) {
        totalExtra += extras.length
        extrasByTune.push([tuneName, extras])
      }

      expect(mismatches, `${tuneName} shared-lane anchor mismatch:\n${mismatches.join('\n')}`).toEqual([])
    })
  }

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.info(
      `[#973] shared lanes compared: ${totalShared}; extra structural lanes: ${totalExtra}` +
        (extrasByTune.length ? ` in ${extrasByTune.map(([t, e]) => `${t}(${e.join(',')})`).join(', ')}` : ''),
    )
  })
})
