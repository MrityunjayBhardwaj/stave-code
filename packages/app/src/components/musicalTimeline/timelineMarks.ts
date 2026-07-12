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

import type { IREvent, PatternIR } from '@stave/editor'
import { collectCycles, laneKeyOf } from '@stave/editor'
import { extractPitch } from './pitch'
import {
  downsampleMarksToCap,
  EMPTY_MARKS,
  type CollectedMarks,
  type SceneClip,
  type SceneNote,
} from './timelineScene'

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
  events: IREvent[] | null,
  ir: PatternIR | null,
  displayCycles: number,
  capPerLane: number = NOTE_MARK_CAP_PER_LANE,
): CollectedMarks {
  if (!ir || !Number.isFinite(displayCycles) || displayCycles <= 0) return EMPTY_MARKS
  // Display fidelity requires the EVAL path when it's available: an evaluated
  // hap carries the RESOLVED note (`n("0 2 4").scale("C:major")` → "C3"/"E3"/"G3"
  // — Strudel applies the scale at query time) plus `context.locations`, while
  // the static IR carries the raw source token ("0") and drops `.scale` to an
  // unused param, so IR-read pitch is a flat/wrong-pitch bar for any degree/
  // scale pattern (PV174 / P274). So: STRUCTURE (lanes/clips/source anchors)
  // always comes from the IR walk below; MARKS come from `events` when present
  // (attributed to IR lanes by source containment) and fall back to the IR only
  // pre-eval — correct there for note-names + percussion, and the only source
  // before the first eval. `events` present ⇒ skip the IR mark build (discarded).
  const useEval = Array.isArray(events) && events.length > 0
  // IR-derived note marks — the pre-eval fallback. Left empty when `useEval`.
  const marksByLane = new Map<string, SceneNote[]>()
  // First-seen IR lane keys — the containment default for a hap with no `loc`
  // (continuous/sampled signal) or a `loc` before every lane's statement.
  const laneOrder: string[] = []
  const laneSeen = new Set<string>()
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
  const irEvents = collectCycles(ir, 0, nCycles)
  for (const ev of irEvents) {
    const cycle = ev.begin
    if (!Number.isFinite(cycle) || cycle < 0 || cycle >= displayCycles) continue
    const key = laneKeyOf(ev)
    if (!laneSeen.has(key)) {
      laneSeen.add(key)
      laneOrder.push(key)
    }
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
    // IR-derived marks (the pre-eval fallback). Skipped when eval events are
    // present — they'd be discarded in favour of the hap marks (PV174).
    if (!useEval) {
      let arr = marksByLane.get(key)
      if (!arr) {
        arr = []
        marksByLane.set(key, arr)
      }
      // Collect ALL marks here; the per-lane cap is applied AFTER the walk as a
      // span-preserving downsample (see below). Capping in cycle order here would
      // drop the tail and truncate a dense lane's clip mid-song (#714).
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
  }
  // When eval events are present, derive the marks from them instead of the IR
  // (display fidelity — PV174). Attributed to the IR lanes by source containment
  // (NOT trackId equality, which diverges for anon `$:` — PV175). Structure
  // (source/arrange/label offsets, clips) stays IR-owned above.
  const activeMarksByLane = useEval
    ? collectHapMarks(events as IREvent[], displayCycles, labelOffsetByLane, laneOrder)
    : marksByLane
  // Bound each lane to `capPerLane` marks by downsampling ACROSS its span (keep
  // every Nth), not by dropping the tail. A dense lane (e.g. a drum stack at
  // ~35 onsets/cycle) keeps its full clip extent with uniformly thinner ticks
  // instead of being cut off at cycle ~57 (#714). Sparse lanes (≤ cap) are
  // untouched (same array reference).
  for (const [key, arr] of activeMarksByLane) {
    const ds = downsampleMarksToCap(arr, capPerLane)
    if (ds.capped) {
      activeMarksByLane.set(key, ds.marks)
      capped = true
    }
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
  return { marksByLane: activeMarksByLane, sourceByLane, arrangeByLane, labelOffsetByLane, clipsByLane, capped }
}

/**
 * Derive note marks from EVALUATED haps (#861), attributed to the IR lanes by
 * SOURCE CONTAINMENT — the lane whose `$:`/`name:` statement offset (`dollarPos`,
 * carried in `labelOffsetByLane`) is the LARGEST one ≤ the hap's `loc[0].start`.
 *
 * Not `laneKeyOf(hap)` string equality: the IR lane key for an anonymous `$:` is
 * `d{N}` (trackId.ts) while the eval hap's trackId is `$N`, so equality would
 * SPLIT them (PV175). Containment aligns them via the shared source offsets both
 * sides already carry.
 *
 * A hap with no `loc` (a continuous/sampled signal) or a `loc` before every
 * lane's statement is attributed to the first-seen IR lane (`laneOrder[0]`) —
 * kept, not dropped (it still plays; it's just not yet lane-attributable; a
 * dedicated eval-backed lane for signal/bare-ref tracks is the P1b follow-on).
 * Returns an empty map when the IR produced no lanes (nothing to attach to).
 *
 * Pitch comes from `extractPitch` — the hap's `note` is already the RESOLVED
 * name/number ("C3", or a fractional MIDI for a sampled signal), so no scale/
 * degree logic is needed here.
 */
function collectHapMarks(
  events: readonly IREvent[],
  displayCycles: number,
  labelOffsetByLane: ReadonlyMap<string, number>,
  laneOrder: readonly string[],
): Map<string, SceneNote[]> {
  const out = new Map<string, SceneNote[]>()
  const defaultLane = laneOrder[0]
  // (laneKey, dollarPos) pairs ascending by dollarPos — the containment index.
  const anchors = [...labelOffsetByLane].sort((a, b) => a[1] - b[1])
  const laneFor = (start: number | undefined): string | undefined => {
    if (typeof start === 'number' && Number.isFinite(start)) {
      let hit: string | undefined
      for (const [key, pos] of anchors) {
        if (pos <= start) hit = key
        else break // ascending → no later anchor can be ≤ start
      }
      if (hit !== undefined) return hit
    }
    return defaultLane
  }
  for (const ev of events) {
    const cycle = ev.begin
    if (!Number.isFinite(cycle) || cycle < 0 || cycle >= displayCycles) continue
    const key = laneFor(ev.loc?.[0]?.start)
    if (key === undefined) continue // no IR lanes → nothing to attach to
    let arr = out.get(key)
    if (!arr) {
      arr = []
      out.set(key, arr)
    }
    const end = Number.isFinite(ev.end) && ev.end > cycle ? ev.end : cycle
    arr.push({
      cycle,
      end,
      pitch: extractPitch(ev)?.midi ?? null,
      gain: clamp01(ev.gain ?? 1),
      voice: ev.s ?? null,
    })
  }
  return out
}
