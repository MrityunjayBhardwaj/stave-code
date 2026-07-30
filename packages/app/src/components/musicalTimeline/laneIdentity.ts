/**
 * laneIdentity — the SINGLE lane-key resolver shared by the live row grouping,
 * the canvas scene, and (U3) the live overlay.
 *
 * A "lane" is one timeline row: a `$:`-track, or a hand-built producer's
 * events. Its identity is `trackId ?? s ?? '$default'` — the same formula the
 * editor's authoritative `laneKeyOf` (ir/songAnalysis.ts) uses for analysis
 * lanes, so a runtime hap (carries `trackId`/`s`) resolves to the SAME key as
 * the scene lane it belongs to. That equivalence is what lets the hap-stream
 * overlay (#500/U3) light a `SceneNote` from a firing hap.
 *
 * Why an app-side mirror of the editor's `laneKeyOf` instead of importing it:
 * `laneKeyOf` lives behind the `@stave/editor` barrel, whose runtime surface
 * drags `@strudel/draw → gifenc` (CJS) into vite-node and crashes unit tests
 * (P172). A pure app-side resolver keeps every consumer + its tests barrel-free.
 * `laneIdentity.test.ts` deep-imports the real `laneKeyOf` and asserts the two
 * never drift — one identity, guarded, not two that can diverge (the P189/P191
 * single-source lesson applied to lane identity).
 *
 * Milestone #497 (timeline unification), phase U1 (#498).
 */

/** Fallback sentinel — never a real producer name. `drumPattern.ts` sets
 *  `trackId = hit.s`, `chordProgression.ts` sets `trackId = 'chord-N'`; anything
 *  reaching this is a Pure node or a producer that hasn't claimed a track. */
export const DEFAULT_LANE_KEY = '$default'

/** The minimal shape a lane key is derived from — a runtime hap or an IR event. */
export interface LaneIdentifiable {
  readonly trackId?: string | null
  readonly s?: string | null
}

/** Resolve the lane (row) key for an event or hap. Mirrors the editor's
 *  `laneKeyOf` exactly (drift-guarded in tests). */
export function resolveLaneKey(ev: LaneIdentifiable): string {
  return ev.trackId ?? ev.s ?? DEFAULT_LANE_KEY
}

/**
 * SOURCE CONTAINMENT — the one reconciler for "which declared statement does
 * this source offset belong to": the anchor whose start is the LARGEST one ≤
 * `start`. This is the rule that aligns the two lane-NAME spaces at this
 * boundary, where string equality splits them (PV175): an anon `$:` is `d{N}` to
 * the IR and `$N` to the engine, and a `.p('name')` track is `d{N}` to the IR and
 * `name` to the row. Both sides carry source offsets; only the names disagree.
 *
 * `anchors` MUST be ascending by offset — the scan breaks on the first anchor
 * past `start`, so an unsorted list silently returns a wrong (or no) answer.
 * Callers sort once and pass the sorted list.
 *
 * Its completeness is load-bearing in the same way: an anchor list built only
 * from event-PRODUCING tracks makes a located hap of a silent track fold into
 * the previous track's lane (P306). Build anchors from what the DOCUMENT
 * declares, not from what produced output.
 *
 * `undefined` start (a hap with no `loc`, a row with no statement offset) has no
 * positional answer and returns `undefined` — never a guess.
 */
export function containingAnchor(
  anchors: ReadonlyArray<readonly [string, number]>,
  start: number | undefined,
): string | undefined {
  if (typeof start !== 'number' || !Number.isFinite(start)) return undefined
  let hit: string | undefined
  for (const [key, pos] of anchors) {
    if (pos <= start) hit = key
    else break // ascending → no later anchor can be ≤ start
  }
  return hit
}
