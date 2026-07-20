/**
 * A stack arm is addressable by its own source span (#950).
 *
 * The song timeline partitions LANES by IR structure — one lane per stack arm —
 * but attributes MARKS by source containment: each evaluated hap goes to the
 * lane whose `Track` wrapper `loc` is the largest one ≤ the hap's own `loc`
 * (`timelineMarks.ts` `declaredTrackAnchors` → `irLaneFor`). That only works if
 * every arm carries a distinct anchor.
 *
 * Arms coming from real `$:` statements always did — they have a statement
 * offset. Arms produced by expanding a top-level comma inside ONE statement
 * (`$: s("bd, cp")`) had no statement of their own and so got NO `loc` at all.
 * The anchor map came out empty, every hap fell back to the engine trackId
 * (identical for all arms of one statement), and all marks piled onto the first
 * arm while every later arm rendered an empty lane.
 *
 * Nothing threw. Both lanes appeared, so a lane-COUNT assertion cannot see this
 * — it passes just as happily when one of the lanes is blank. The property that
 * discriminates is that the arms have DISTINCT anchors, which is what this pins.
 *
 * Measured in the running app before the fix: `labelOffsetByLane` empty and
 * `marksByLane` `[["d1", 8]]`; after, anchors `[["d1",6],["d2",10]]` and
 * `marksByLane` `[["d1",4],["d2",4]]`.
 */
import { describe, it, expect } from 'vitest'
import { IR, type PatternIR } from '../PatternIR'
import {
  runRawStage,
  runMiniExpandedStage,
  runChainAppliedStage,
  runFinalStage,
} from '../parseStrudelStages'
import { runPasses, type Pass } from '../passes'

const PASSES: readonly Pass<PatternIR>[] = [
  { name: 'RAW', run: runRawStage },
  { name: 'MINI-EXPANDED', run: runMiniExpandedStage },
  { name: 'CHAIN-APPLIED', run: runChainAppliedStage },
  { name: 'Parsed', run: runFinalStage },
]

function pipeline(code: string): PatternIR {
  const passes = runPasses(IR.code(code), PASSES)
  return passes[passes.length - 1].ir
}

/** Every `Track` wrapper as `[trackId, loc.start]` — the anchor map's input. */
function trackAnchors(node: unknown, out: Array<[string, number | undefined]> = []): Array<[string, number | undefined]> {
  if (!node || typeof node !== 'object') return out
  const n = node as Record<string, unknown>
  if (n.tag === 'Track') {
    const loc = (n.loc as Array<{ start?: number }> | undefined)?.[0]
    out.push([String(n.trackId), loc?.start])
  }
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach((x) => trackAnchors(x, out))
    else if (v && typeof v === 'object') trackAnchors(v, out)
  }
  return out
}

describe('stack arms are addressable (#950)', () => {
  it('a comma-expanded arm anchors on its own span, not on nothing', () => {
    //             0123456789...
    // `$: s("bd, cp")` — `bd` at 6, `cp` at 10.
    const anchors = trackAnchors(pipeline('$: s("bd, cp")'))
    expect(anchors).toEqual([
      ['d1', 6],
      ['d2', 10],
    ])
  })

  it('a bracketed stack anchors per arm too (the always-broken spelling)', () => {
    // `$: s("[bd,cp]")` — `bd` at 7, `cp` at 10.
    expect(trackAnchors(pipeline('$: s("[bd,cp]")'))).toEqual([
      ['d1', 7],
      ['d2', 10],
    ])
  })

  it('every arm of a multi-arm stack gets a DISTINCT anchor', () => {
    const anchors = trackAnchors(pipeline('$: s("bd*2, ~ sd, hh*4")'))
    expect(anchors).toHaveLength(3)
    const starts = anchors.map(([, start]) => start)
    expect(starts.every((s) => typeof s === 'number')).toBe(true)
    expect(new Set(starts).size).toBe(3)
    // Ascending, so `largest anchor ≤ hap start` partitions the mini BY ARM.
    expect([...starts].sort((a, b) => (a as number) - (b as number))).toEqual(starts)
  })

  it('real `$:` statements still anchor on the STATEMENT, byte-identically', () => {
    // The pre-existing path: two statements, anchored at their `$:` offsets
    // (0 and 11), NOT at their minis (6 and 17). Unchanged by the fix.
    expect(trackAnchors(pipeline('$: s("bd")\n$: s("cp")'))).toEqual([
      ['d1', 0],
      ['d2', 11],
    ])
  })

  it('a named track keeps its statement anchor', () => {
    expect(trackAnchors(pipeline('drums: s("bd")\nlead: s("cp")'))).toEqual([
      ['drums', 0],
      ['lead', 15],
    ])
  })
})
