/**
 * timelineScene — the render-agnostic scene model for the canvas Song timeline
 * (#419 / canvas milestone #416, design §4.4).
 *
 * The DOM `FullSongTimeline` drew its onset heatmap straight from `SongAnalysis`.
 * The canvas view instead draws a `TimelineScene`: per-lane density (the same
 * `onsetsByCycle` the heatmap used) PLUS capped mini-note marks (real note
 * positions) so the renderer can show readable rhythm/pitch when zoomed in and
 * coarse density when zoomed out (design §4.5). The scene is pure data over the
 * shared content-space transform (PV116) — it knows nothing about canvas, DPR,
 * or scroll. `drawTimeline` consumes it; `SongTimelineCanvas` owns the surface.
 *
 * This module is PURE (only TYPE imports from `@stave/editor`, so it stays out
 * of vitest's CJS-`gifenc` trap). The note-mark COLLECTION — which needs the
 * runtime `collectCycles`/`laneKeyOf` — lives in `timelineMarks.ts`; this
 * builder merges its already-collected output as data.
 */

import type { SongAnalysis, SongSection } from '@stave/editor'
import { trackIdentity } from './colors'
import { resolveLaneName } from './trackLabel'

/** Grouping key for marks with no sample name (`s == null`) — synth notes that
 *  carry only a `note`. Shared by the scene builder and the renderer so a
 *  null-`s` voice maps to the same sub-group on both sides (#424). The NUL char
 *  can't collide with a real sample name. */
export const NO_VOICE = '\0'

/** A single read-only mini-note mark within a lane. */
export interface SceneNote {
  /** Fractional song cycle of the onset (event `begin`), in `[0, displayCycles)`. */
  readonly cycle: number
  /** Fractional song cycle of the offset (event `end`), `≥ cycle`. The mark's
   *  width is `(end − cycle) × pxPerCycle` — DURATION-proportional, mirroring the
   *  live view's note blocks (`eventToRect`), not a fixed dab. */
  readonly end: number
  /** MIDI pitch for in-lane vertical placement, or null for percussive events. */
  readonly pitch: number | null
  /** Gain 0–1 — drives mark intensity. */
  readonly gain: number
  /** Sample/instrument name (`ev.s`) — the per-voice partition key within a lane
   *  (#424). A `$:` drum stack lands in ONE lane (shared `trackId`) but its
   *  events carry distinct `s` (bd/sd/hh), so grouping by `s` recovers the
   *  voices the track merged. `null`/absent → grouped under `NO_VOICE`. Captured
   *  in the runtime walk (`timelineMarks`), so this pure module never reads the
   *  editor IR. Optional so hand-built fixtures stay terse (treated as null). */
  readonly voice?: string | null
}

/**
 * Bound a lane's note-mark array to `cap` entries WITHOUT truncating its time
 * extent. When a lane has more marks than `cap` (a dense track over a long
 * span), keep every Nth mark (`stride = ceil(len / cap)`) so the survivors are
 * spread evenly across the WHOLE span — the first mark and a mark within one
 * stride of the last both survive, so the drawn clip still covers the track's
 * true extent, just with uniformly thinner ticks. Output length is always
 * `≤ cap`, so the retained-marks / per-frame-draw budget is unchanged.
 *
 * Replaces the earlier TAIL-DROP (keep the first `cap` in cycle order, discard
 * the rest), which cut a dense lane's clip off partway through the song (#714):
 * a ~35-onset/cycle drum stack hit the 2000 cap at cycle ~57, so its expanded
 * voice bars stopped there while sparser tracks spanned the full timeline.
 *
 * `marks` is assumed in collection (≈ cycle-ascending) order — the order
 * `collectNoteMarks` pushes them. Returns the SAME array reference (no copy)
 * when already within `cap`. `capped` is true iff a downsample happened.
 */
export function downsampleMarksToCap(
  marks: SceneNote[],
  cap: number,
): { marks: SceneNote[]; capped: boolean } {
  if (cap <= 0 || marks.length <= cap) return { marks, capped: false }
  const stride = Math.ceil(marks.length / cap)
  const out: SceneNote[] = []
  for (let i = 0; i < marks.length; i += stride) out.push(marks[i])
  return { marks: out, capped: true }
}

/** One voice (distinct sample/instrument) within a lane — the sub-row model an
 *  EXPANDED lane splits into (#424). Mirrors the live view's leaf voices
 *  (`layoutTrackRows` `LeafLayout`), but partitioned by `s` rather than the
 *  unreliable `leafIndex` bridge. A single-voice lane has one entry and renders
 *  unchanged (one band). */
export interface SceneVoice {
  /** Partition key — the sample name, or `NO_VOICE` for null-`s` synth notes. */
  readonly key: string
  /** Gutter label — the sample name; `·` for the null-`s` group. */
  readonly label: string
  /** True when any mark in this voice carries a pitch (melodic → pitch-Y band);
   *  false for percussive (flat baseline per voice). */
  readonly melodic: boolean
  /** Min/max MIDI across this voice's pitched marks, or null when percussive. */
  readonly pitchMin: number | null
  readonly pitchMax: number | null
}

/** One read-only timeline CLIP — a time-sequenced segment of a lane (Phase 5a,
 *  #386). A clip maps to one arm of an `arrange`/`cat`/`slowcat` combinator; a
 *  bare track (no combinator) is ONE implicit clip spanning the whole song
 *  (design §5 option b). Clips are STRUCTURE (the timeline owns them), distinct
 *  from the note CONTENT drawn inside them (design §3 layering). Read-only this
 *  PR — the 4 edit ops (move/trim/duplicate/split) come in P5b/c. */
export interface SceneClip {
  /** Index of the source `Arrange` arm (`IREvent.armIndex`), or `-1` for the
   *  implicit single clip of a bare track. Together with the lane key this is
   *  the clip's identity. */
  readonly armIndex: number
  /** Start cycle (inclusive) on the shared content-space axis. */
  readonly startCycle: number
  /** End cycle (exclusive), `> startCycle`. Width = `(end − start) × pxPerCycle`.
   *  Clip boundaries are whole-cycle-aligned (arms span whole cycles — grounded). */
  readonly endCycle: number
  /** A representative voice/sample/note label for the clip (the first event's
   *  `s` or `note`), or null when none — drives an optional clip caption. */
  readonly label: string | null
}

/** One timeline row. */
export interface SceneLane {
  readonly laneKey: string
  /** The display NAME (#579 STEP 2). The source LABEL for a named track
   *  (`bass`, `lead`), else the positional `laneKey` (`d{N}`) for an anonymous
   *  `$:`. The lane's IDENTITY stays `laneKey` (drives the live overlay match);
   *  only this name — and `color`, derived from it — resolves to the label. */
  readonly displayName: string
  readonly color: string
  /** `onsetsByCycle` — onset count per integer cycle (the coarse density). */
  readonly density: readonly number[]
  /** Capped mini-note marks; empty when no IR / not collected. */
  readonly notes: readonly SceneNote[]
  /** Min/max MIDI across this lane's pitched marks (for in-lane Y auto-fit),
   *  or null when the lane has no pitched marks (percussive). */
  readonly pitchMin: number | null
  readonly pitchMax: number | null
  /** Ordered voice sub-groups (by `s`), first-seen order (#424). One entry for a
   *  single-voice lane (renders unchanged). When a lane has ≥2 voices AND is
   *  expanded, `laneLayout` splits it into per-voice sub-rows. Empty when the
   *  lane has no collected marks (density-only). */
  readonly voices: readonly SceneVoice[]
  /** Ordered read-only clips (#386). At least one entry: an arrangement track
   *  has one clip per `arrange`/`cat` arm; a bare track has a single implicit
   *  clip spanning `[0, displayCycles)`. Drawn as segment rects behind the
   *  lane's note marks (design §4.2); hit-testable for the later edit ops. */
  readonly clips: readonly SceneClip[]
  /** Source-character offset of a representative event for this lane (the first
   *  collected event's INNERMOST `loc[0].start`), or null when the IR has no
   *  source provenance. Drives expand-to-bind: lane → offset → editor cursor →
   *  the Pattern panel rebinds (#422, design §3.1) — the inner CONTENT anchor.
   *  Not used for drawing. */
  readonly sourceOffset: number | null
  /** Source offset of this lane's `$:`/`name:` STATEMENT (`IREvent.dollarPos`),
   *  or null when the lane has no source provenance. The rename anchor (#580):
   *  `detectAllChunks` finds the chunk whose `statementRange[0]` equals this, and
   *  `renameEdit` rewrites its label. Distinct from `sourceOffset` (the innermost
   *  CONTENT anchor for expand→bind) and `arrangeOffset` (the outer combinator). */
  readonly labelOffset: number | null
  /** Source-character offset of this lane's OUTERMOST arrangement combinator
   *  (the first event's MINIMUM `loc[*].start` — the outer call begins earliest;
   *  suffix wrappers like `.p`/`.gain` start later), or null. Drives clip
   *  GESTURES: `detectArrangeAt` resolves the outer `arrange`/`cat` so an arm
   *  whose pattern is itself a combinator edits as ONE outer clip (#451). Equals
   *  `sourceOffset` for a non-nested track (single `loc` entry). The
   *  structure-vs-content counterpart of `sourceOffset`. */
  readonly arrangeOffset: number | null
}

/** The full scene the canvas renderer draws. */
export interface TimelineScene {
  readonly lanes: readonly SceneLane[]
  readonly sections: readonly SongSection[]
  /** Display span in cycles (one loop period, or the analyzed horizon). ≥ 1. */
  readonly displayCycles: number
  /** Detected loop period, or null. */
  readonly period: number | null
  /** Peak onset count across all lanes — normalises density intensity. ≥ 1. */
  readonly peakDensity: number
  /** True when any lane's note marks were truncated at the cap (no silent loss
   *  — the renderer can surface it; density still covers the whole span). */
  readonly notesCapped: boolean
}

export interface CollectedMarks {
  readonly marksByLane: ReadonlyMap<string, SceneNote[]>
  /** Per-lane representative source offset (first event's `loc[0].start`) for
   *  expand-to-bind. Absent lane → no source provenance (hand-built IR). */
  readonly sourceByLane: ReadonlyMap<string, number>
  /** Per-lane OUTERMOST combinator offset (first event's MINIMUM `loc[*].start`)
   *  for clip gestures (#451). Absent lane → no source provenance. */
  readonly arrangeByLane: ReadonlyMap<string, number>
  /** Per-lane statement (label) offset = `IREvent.dollarPos` (#579 STEP 2). The
   *  pure builder reads the source at this offset to resolve a named track's
   *  display label. Absent lane → no source provenance → keeps `d{N}`. */
  readonly labelOffsetByLane: ReadonlyMap<string, number>
  /** Per-lane read-only clips derived from `IREvent.armIndex` (#386). Present
   *  ONLY for lanes whose track is an `arrange`/`cat`/`slowcat` combinator;
   *  absent → the builder synthesises one implicit clip (bare track). */
  readonly clipsByLane: ReadonlyMap<string, SceneClip[]>
  /** True if any lane hit the cap (marks dropped — surfaced, not silent). */
  readonly capped: boolean
}

/** A shared empty collection (the no-IR / no-marks default). */
export const EMPTY_MARKS: CollectedMarks = {
  marksByLane: new Map(),
  sourceByLane: new Map(),
  arrangeByLane: new Map(),
  labelOffsetByLane: new Map(),
  clipsByLane: new Map(),
  capped: false,
}

/**
 * Build the render scene from the analysis (density, sections, span, period)
 * merged with the collected note marks. PURE — no IR walk, no canvas. Lanes
 * keep `analyzeSong`'s first-seen order and key, so the canvas rows line up
 * with the DOM lane labels exactly.
 */
export function buildTimelineScene(
  analysis: SongAnalysis | null,
  marks: CollectedMarks = EMPTY_MARKS,
  displayCyclesOverride?: number,
  /** Raw user source (#579 STEP 2) — read at each lane's `labelOffset`
   *  (`dollarPos`) to resolve a NAMED track's display label. Absent → every
   *  lane keeps its positional `d{N}` name (the pre-STEP-2 behaviour). */
  code?: string | null,
  /** Per-track custom colour overrides (Phase D, #581), keyed by the lane's
   *  DISPLAY NAME (the same key the Mixer uses). A lane with an override colours
   *  `customColor ?? colorForTrack(name)` via the shared `trackIdentity`; absent
   *  → the deterministic palette. Drives the lane dot AND the canvas density bars
   *  (the renderer reads `lane.color`). */
  customColorByName?: ReadonlyMap<string, string>,
): TimelineScene {
  // The caller (FullSongTimeline) owns the authoritative span — it floors a bare
  // loop to a minimum arrangement length so the single implicit clip has room to
  // split (#489 D3). When provided, it drives both the bare clip's `endCycle` and
  // `scene.displayCycles`, keeping the clip rect and the geometry transform in
  // lock-step. Absent (tests / density-only callers) → the per-loop default.
  const displayCycles =
    displayCyclesOverride != null && displayCyclesOverride >= 1
      ? Math.max(1, Math.round(displayCyclesOverride))
      : analysis
        ? Math.max(1, analysis.periodCycles ?? analysis.horizonCycles)
        : 1
  const lanesIn = analysis?.lanes ?? []
  const analysisKeys = new Set(lanesIn.map((l) => l.laneKey))
  const nCycles = Math.ceil(displayCycles)

  // Eval-backed lanes (#864 / P1b): marks lanes the static-IR analysis never
  // produced — a signal (`.segment`) or bare-ref track that emits no static IR
  // events, so it has no `LaneActivity` here. `collectHapMarks` already keys them
  // by the positional/named eval identity (`evalTrackIdToLaneKey`), disjoint from
  // the IR lane keys, so any marks key not in `analysisKeys` is one such track.
  // Their coarse density is synthesised from their marks (below); they append
  // AFTER the IR lanes in first-seen (Map) order. Absent → the IR-only behaviour.
  const evalLaneKeys = [...marks.marksByLane.keys()].filter((k) => !analysisKeys.has(k))
  const evalDensities = new Map<string, number[]>()
  for (const key of evalLaneKeys) {
    evalDensities.set(key, densityFromNotes(marks.marksByLane.get(key) ?? [], nCycles))
  }

  // Peak onset across ALL lanes (IR + eval, ≥1) so the busiest cell is full-intensity.
  let peakDensity = 1
  for (const lane of lanesIn) {
    for (const c of lane.onsetsByCycle) if (c > peakDensity) peakDensity = c
  }
  for (const density of evalDensities.values()) {
    for (const c of density) if (c > peakDensity) peakDensity = c
  }

  const buildLane = (laneKey: string, density: readonly number[]): SceneLane => {
    const notes = marks.marksByLane.get(laneKey) ?? []
    let pitchMin: number | null = null
    let pitchMax: number | null = null
    for (const n of notes) {
      if (n.pitch == null) continue
      if (pitchMin == null || n.pitch < pitchMin) pitchMin = n.pitch
      if (pitchMax == null || n.pitch > pitchMax) pitchMax = n.pitch
    }
    // Clips: an arrangement track contributes per-arm clips; a bare/eval track
    // (no combinator → no `armIndex` events) gets ONE implicit clip spanning the
    // whole song (design §5 option b). The implicit clip is synthesised here
    // (the pure builder owns `displayCycles`) so every lane has ≥1 clip.
    const clips: SceneClip[] = marks.clipsByLane.get(laneKey) ?? [
      { armIndex: -1, startCycle: 0, endCycle: displayCycles, label: null },
    ]
    // Display name (#579 STEP 2): a NAMED track's source label, else the
    // positional `d{N}`. Both the name AND the colour key on it, so a named
    // lane reads + colours identically to its Mixer strip (one `trackIdentity`).
    // An eval lane has no `labelOffset` → `resolveLaneName` returns the key, which
    // `evalTrackIdToLaneKey` already made the positional `d{N}` (or the name).
    const displayName = resolveLaneName(laneKey, marks.labelOffsetByLane.get(laneKey), code)
    // Colour resolves through the SHARED `trackIdentity` (V-track-1/2): the
    // deterministic palette by default, the per-track custom override when set —
    // `customColor ?? colorForTrack(displayName)` — keyed by the display name so
    // the lane matches its Mixer strip. Drives the dot AND the canvas density bars
    // (the renderer reads `lane.color`).
    return {
      laneKey,
      displayName,
      color: trackIdentity(displayName, customColorByName?.get(displayName)).color,
      density,
      notes,
      pitchMin,
      pitchMax,
      voices: groupVoices(notes),
      clips,
      sourceOffset: marks.sourceByLane.get(laneKey) ?? null,
      arrangeOffset: marks.arrangeByLane.get(laneKey) ?? null,
      labelOffset: marks.labelOffsetByLane.get(laneKey) ?? null,
    }
  }

  const lanes: SceneLane[] = [
    ...lanesIn.map((lane) => buildLane(lane.laneKey, lane.onsetsByCycle)),
    ...evalLaneKeys.map((key) => buildLane(key, evalDensities.get(key)!)),
  ]

  return {
    lanes,
    sections: analysis?.sections ?? [],
    displayCycles,
    period: analysis?.periodCycles ?? null,
    peakDensity,
    notesCapped: marks.capped,
  }
}

/**
 * Hit-test: the clip in `lane` containing fractional song `cycle`, or null when
 * the cycle is outside every clip (#386). Pure — the scene-level primitive the
 * canvas host will map a pointer (x → cycle via the shared transform) onto when
 * the edit ops land (P5b/c). Read-only this PR; nothing wires a gesture yet.
 * `startCycle` inclusive, `endCycle` exclusive.
 */
export function clipAtCycle(lane: SceneLane, cycle: number): SceneClip | null {
  for (const clip of lane.clips) {
    if (cycle >= clip.startCycle && cycle < clip.endCycle) return clip
  }
  return null
}

/**
 * Per-integer-cycle onset counts for a lane synthesised from its marks (#864).
 * Eval-backed lanes have no `analyzeSong` `LaneActivity`, so their coarse density
 * (the zoomed-out heatmap) is counted here from the note onsets by `floor(cycle)`
 * — the same bucketing `accumulateLanes` uses for IR lanes. Length is `nCycles`
 * (the display span); onsets outside `[0, nCycles)` are ignored, mirroring the
 * IR path. PURE — operates on already-collected marks only.
 */
function densityFromNotes(notes: readonly SceneNote[], nCycles: number): number[] {
  const density = new Array<number>(Math.max(0, nCycles)).fill(0)
  for (const n of notes) {
    const c = Math.floor(n.cycle)
    if (c >= 0 && c < density.length) density[c] += 1
  }
  return density
}

/**
 * Partition a lane's marks into ordered voice sub-groups by sample name (`s`),
 * first-seen order (#424). Each group records whether it's melodic (any pitched
 * mark) and its pitch range. A lane with one distinct `s` (or all null-`s`)
 * yields one group → the lane renders unchanged (one band). Marks with no `s`
 * pool under `NO_VOICE`. PURE — operates on already-collected marks only.
 */
function groupVoices(notes: readonly SceneNote[]): SceneVoice[] {
  const order: string[] = []
  const acc = new Map<
    string,
    { label: string; min: number | null; max: number | null; melodic: boolean }
  >()
  for (const n of notes) {
    const key = n.voice ?? NO_VOICE
    let g = acc.get(key)
    if (!g) {
      g = { label: n.voice ?? '·', min: null, max: null, melodic: false }
      acc.set(key, g)
      order.push(key)
    }
    if (n.pitch != null) {
      g.melodic = true
      if (g.min == null || n.pitch < g.min) g.min = n.pitch
      if (g.max == null || n.pitch > g.max) g.max = n.pitch
    }
  }
  return order.map((key) => {
    const g = acc.get(key)!
    return { key, label: g.label, melodic: g.melodic, pitchMin: g.min, pitchMax: g.max }
  })
}
