/**
 * timelineMarks — note-mark collection for the canvas Song timeline (#419).
 *
 * Split from `timelineScene.ts` because it needs the RUNTIME `collectCycles` /
 * `laneKeyOf` from `@stave/editor` — importing those values pulls the whole
 * editor bundle (and its CJS `gifenc` dep) into vitest, which breaks the loader.
 * Keeping this in its own file lets `timelineScene.ts` (the pure builder) stay
 * unit-testable without mocking. The real collection path is covered by the
 * Playwright spec against a real evaluated song.
 */

import type { PatternIR } from '@stave/editor'
import { collectCycles, laneKeyOf } from '@stave/editor'
import { extractPitch } from './pitch'
import { EMPTY_MARKS, type CollectedMarks, type SceneNote } from './timelineScene'

/** Per-lane mini-note-mark cap, so a long/dense song can't retain unbounded
 *  marks. Density (per-cycle counts) always covers the full span regardless. */
export const NOTE_MARK_CAP_PER_LANE = 2000

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/**
 * Collect read-only mini-note marks for the display span by querying the IR
 * directly (`collectCycles`), grouped by the SAME `laneKeyOf` identity the
 * analysis lanes use, capped per lane. `null` IR / non-positive span → empty.
 *
 * Deterministic for a given IR. Returns marks keyed by lane so the pure scene
 * builder can merge them onto the matching analysis lanes.
 */
export function collectNoteMarks(
  ir: PatternIR | null,
  displayCycles: number,
  capPerLane: number = NOTE_MARK_CAP_PER_LANE,
): CollectedMarks {
  if (!ir || !Number.isFinite(displayCycles) || displayCycles <= 0) return EMPTY_MARKS
  const marksByLane = new Map<string, SceneNote[]>()
  // Per-lane representative source offset for expand-to-bind: the FIRST event of
  // the lane that carries a `loc` (char offsets into the evaluated source). The
  // bind maps this → editor cursor → the Pattern panel rebinds (#422). First-
  // wins so the anchor is stable (doesn't jump as later events stream in).
  const sourceByLane = new Map<string, number>()
  let capped = false
  const events = collectCycles(ir, 0, Math.ceil(displayCycles))
  for (const ev of events) {
    const cycle = ev.begin
    if (!Number.isFinite(cycle) || cycle < 0 || cycle >= displayCycles) continue
    const key = laneKeyOf(ev)
    if (!sourceByLane.has(key)) {
      const offset = ev.loc?.[0]?.start
      if (typeof offset === 'number' && Number.isFinite(offset)) sourceByLane.set(key, offset)
    }
    let arr = marksByLane.get(key)
    if (!arr) {
      arr = []
      marksByLane.set(key, arr)
    }
    if (arr.length >= capPerLane) {
      capped = true
      continue
    }
    const end = Number.isFinite(ev.end) && ev.end > cycle ? ev.end : cycle
    // `voice` = the sample name (`ev.s`), the per-voice partition key (#424). A
    // `$:` drum stack shares one lane key (`trackId`) but distinct `s` per voice,
    // so this recovers bd/sd/hh as sub-rows. `ev.s` is a native IREvent field —
    // reading it here (the runtime consumer) keeps the pure scene module out of
    // the editor-bundle / gifenc import (P172).
    arr.push({
      cycle,
      end,
      pitch: extractPitch(ev)?.midi ?? null,
      gain: clamp01(ev.gain ?? 1),
      voice: ev.s ?? null,
    })
  }
  return { marksByLane, sourceByLane, capped }
}
