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
import { paletteForTrack, trackIndexOf } from './colors'

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
}

/** One timeline row. */
export interface SceneLane {
  readonly laneKey: string
  readonly color: string
  /** `onsetsByCycle` — onset count per integer cycle (the coarse density). */
  readonly density: readonly number[]
  /** Capped mini-note marks; empty when no IR / not collected. */
  readonly notes: readonly SceneNote[]
  /** Min/max MIDI across this lane's pitched marks (for in-lane Y auto-fit),
   *  or null when the lane has no pitched marks (percussive). */
  readonly pitchMin: number | null
  readonly pitchMax: number | null
  /** Source-character offset of a representative event for this lane (the first
   *  collected event carrying a `loc`), or null when the IR has no source
   *  provenance. Drives expand-to-bind: lane → offset → editor cursor → the
   *  Pattern panel rebinds (#422, design §3.1). Not used for drawing. */
  readonly sourceOffset: number | null
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
  /** True if any lane hit the cap (marks dropped — surfaced, not silent). */
  readonly capped: boolean
}

/** A shared empty collection (the no-IR / no-marks default). */
export const EMPTY_MARKS: CollectedMarks = {
  marksByLane: new Map(),
  sourceByLane: new Map(),
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
): TimelineScene {
  const displayCycles = analysis
    ? Math.max(1, analysis.periodCycles ?? analysis.horizonCycles)
    : 1
  const lanesIn = analysis?.lanes ?? []

  // Peak onset across all lanes (≥1) so the busiest cell is full-intensity.
  let peakDensity = 1
  for (const lane of lanesIn) {
    for (const c of lane.onsetsByCycle) if (c > peakDensity) peakDensity = c
  }

  const lanes: SceneLane[] = lanesIn.map((lane) => {
    const notes = marks.marksByLane.get(lane.laneKey) ?? []
    let pitchMin: number | null = null
    let pitchMax: number | null = null
    for (const n of notes) {
      if (n.pitch == null) continue
      if (pitchMin == null || n.pitch < pitchMin) pitchMin = n.pitch
      if (pitchMax == null || n.pitch > pitchMax) pitchMax = n.pitch
    }
    return {
      laneKey: lane.laneKey,
      color: paletteForTrack(trackIndexOf(lane.laneKey), lane.laneKey),
      density: lane.onsetsByCycle,
      notes,
      pitchMin,
      pitchMax,
      sourceOffset: marks.sourceByLane.get(lane.laneKey) ?? null,
    }
  })

  return {
    lanes,
    sections: analysis?.sections ?? [],
    displayCycles,
    period: analysis?.periodCycles ?? null,
    peakDensity,
    notesCapped: marks.capped,
  }
}
