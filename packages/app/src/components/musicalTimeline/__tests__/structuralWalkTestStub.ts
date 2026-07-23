/**
 * Test stub for the `structuralWalk` dependency timelineMarks / FullSongTimeline now pull from
 * `@stave/editor`. The app tests mock the whole barrel (it drags CJS `gifenc` into vitest, which
 * breaks the loader — see the mock comments), so they cannot get structuralWalk from it. This
 * re-exports the REAL walk + reducer straight from source (pure, type-only imports, no gifenc),
 * so the mocks derive lane skeletons the SAME way production does — never a hand-rolled copy of
 * the reducer, which would be a second oracle free to drift (PV192).
 */
import {
  aggregateLaneItems,
  structuralWalk,
  type LaneItem,
} from '../../../../../editor/src/ir/structuralWalk'
import type { IREvent } from '../../../../../editor/src/ir/IREvent'

export { structuralWalk }

/**
 * Reduce collect-style events to lane skeletons exactly as `structuralWalk` aggregates its own
 * walk items — the identical event→LaneItem mapping the corpus gate's oracle uses
 * (`structuralWalk.test.ts` `collectLanes`). Lets a synthetic-event mock produce the structure
 * maps without a real IR to walk, while still routing through the production reducer.
 */
export function skeletonsFromEvents(
  events: readonly Partial<IREvent>[],
  nCycles: number,
): ReturnType<typeof aggregateLaneItems> {
  const items: LaneItem[] = events.map((ev) => ({
    laneKey: ev.trackId ?? ev.s ?? '$default',
    cycle: Math.floor(ev.begin ?? 0),
    ...(ev.dollarPos !== undefined ? { dollarPos: ev.dollarPos } : {}),
    ...(ev.leafIndex !== undefined ? { leafIndex: ev.leafIndex } : {}),
    ...(ev.armIndex !== undefined ? { armIndex: ev.armIndex } : {}),
    ...(ev.loc ? { loc: ev.loc } : {}),
    labelValue: ev.s ?? (ev.note != null ? String(ev.note) : undefined),
  }))
  return aggregateLaneItems(items, nCycles)
}
