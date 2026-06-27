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
import { EMPTY_MARKS, type CollectedMarks, type SceneClip, type SceneNote } from './timelineScene'

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
  // Per-lane OUTERMOST combinator offset for clip gestures (#451). `loc` is
  // ordered leaf→…→outermost wrappers, but the LAST entry can be a non-combinator
  // suffix (`.p('x')`, `.gain(…)`), so we take the MINIMUM start instead: the
  // outermost `arrange`/`cat` call begins earliest in the source, while leaves,
  // inner combinators and suffix methods all start later. `detectArrangeAt(min)`
  // then resolves the OUTER combinator (that offset lies only inside it, not the
  // inner one) so a nested combinator arm edits as one outer clip. `sourceByLane`
  // keeps the innermost (content) anchor for expand→bind. First-event-wins.
  //
  // #456 — in a MULTI-track (`$:`) file, `collect` appends a Track-WRAPPER loc
  // spanning the whole `$:` line (`withWrapperLoc` in collect.ts), whose start is
  // the line start = `ev.dollarPos` — STRICTLY before the combinator (which sits
  // after the `$: ` prefix). The raw minimum then picks that wrapper offset, which
  // lies OUTSIDE every combinator, so `detectArrangeAt` resolves null and the clip
  // op silently no-ops (selection still works — it's display-side). A single-track
  // file has no wrapper loc, which is why standalone arranges wrote back fine. So
  // we EXCLUDE the wrapper loc (`start === ev.dollarPos`) from the minimum; the
  // combinator start always exceeds `dollarPos`, so this never drops a real
  // combinator and is a no-op when `dollarPos` is absent (hand-built IR).
  const arrangeByLane = new Map<string, number>()
  // Per-lane statement (label) offset for the display NAME (#579 STEP 2). The
  // live engine drops the JS label and keys the track positionally as `d{N}`
  // (`ev.trackId`); `ev.dollarPos` is the `$:`/`bass:` STATEMENT offset, so the
  // label is recoverable from the source there. First-event-wins (one Track =
  // one dollarPos; a stack's voices share it). The pure scene builder reads the
  // source at this offset to resolve a named track's label (`resolveLaneName`).
  const labelOffsetByLane = new Map<string, number>()
  // Clip derivation (#386): per lane, the active arrange-arm index for each
  // integer cycle (events of one arm share a cycle; arms span whole cycles —
  // grounded). Run-length-encoded into clips below. Only lanes whose events
  // carry `armIndex` (an arrangement combinator) appear here; bare tracks get
  // an implicit clip from the pure builder. `label` = the arm's first event's
  // sample/note (read from the runtime event, like `voice`, so the pure module
  // stays out of the editor bundle — P172).
  const nCycles = Math.ceil(displayCycles)
  const armByCycleByLane = new Map<string, Array<number | undefined>>()
  const armLabelByLane = new Map<string, Map<number, string>>()
  let capped = false
  const events = collectCycles(ir, 0, nCycles)
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
        // Skip the `$:` Track-wrapper loc (#456) — it starts before every
        // combinator and would make `detectArrangeAt` miss.
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
  // Run-length-encode each lane's per-cycle arm index into contiguous clips.
  // A change in arm index (or a silent cycle) closes the current clip; this
  // yields one clip per arm-occurrence per period (so a song shown over
  // multiple periods repeats its clips, matching the timeline). Silent cycles
  // inside an arm split it — acceptable for read-only display this PR.
  const clipsByLane = new Map<string, SceneClip[]>()
  for (const [key, byCycle] of armByCycleByLane) {
    const labels = armLabelByLane.get(key)
    const clips: SceneClip[] = []
    let runArm: number | undefined
    let runStart = 0
    const flush = (endCycle: number): void => {
      if (runArm !== undefined) {
        clips.push({
          armIndex: runArm,
          startCycle: runStart,
          endCycle,
          label: labels?.get(runArm) ?? null,
        })
      }
    }
    for (let c = 0; c < nCycles; c++) {
      const arm = byCycle[c]
      if (arm !== runArm) {
        flush(c)
        runArm = arm
        runStart = c
      }
    }
    flush(nCycles)
    if (clips.length > 0) clipsByLane.set(key, clips)
  }
  return { marksByLane, sourceByLane, arrangeByLane, labelOffsetByLane, clipsByLane, capped }
}
