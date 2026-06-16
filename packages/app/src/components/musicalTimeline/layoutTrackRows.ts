/**
 * layoutTrackRows — Phase 20-12 β-2.
 *
 * Build per-track Y-band layouts for the timeline grid. When a track is
 * collapsed (chevron rotated, meta.collapsed === true) the row gets a flat
 * `ROW_HEIGHT` band and zero leaves. When expanded, the row's body is
 * flattened via α-5's `flattenLeafVoices` and each leaf gets its own
 * SUB_ROW_HEIGHT band stacked vertically. Empty Stack `stack()` (zero
 * voices) is treated as a flat ROW_HEIGHT placeholder so the chevron
 * toggle is a visual no-op rather than a crash (RESEARCH §C.4 / pre-mortem
 * trap #7).
 *
 * Y bands are scoped per leaf — β-4's pitch-to-Y reads `leaf.pitchRange`
 * and maps within `[leaf.top, leaf.top + leaf.height]` only. This is the
 * sub-row Y-band collapse mitigation (CONTEXT pre-mortem #1).
 *
 * The events-per-leaf bridge: events do NOT carry `leafIndex` natively, so
 * the caller bundles a `leafEvents` array (one entry per leaf, in the same
 * order `flattenLeafVoices` returned). The caller derives this by grouping
 * events on `evt.trackId` and partitioning per leaf — when there's only
 * one leaf (the common case: collapsed or single-voice expanded) every
 * event belongs to leaf 0. Multi-voice partitioning relies on the
 * producer's leaf assignment; for v1 we conservatively pool all events
 * onto leaf 0 when leaves > 1 — chrome users won't notice mis-assignment
 * since the visual difference is which sub-row a bar lands in, and the
 * tooltip stays correct. γ-2 wave can refine.
 */

import type { PatternIR } from '@stave/editor'
import type { IREvent } from '@stave/editor'
import { flattenLeafVoices } from '../irProjection'
import { extractPitch } from './pitch'

/** Vertical band heights — collapsed row vs expanded sub-row. SUB_ROW slightly
 *  tighter than ROW for a density bonus when expanded; visual jump is
 *  acceptable per planner G-2. */
export const ROW_HEIGHT = 24
export const SUB_ROW_HEIGHT = 18
/** Vertical gap between adjacent track lanes (#342). Without it, a track's
 *  pitch-band butts directly against the next track's, so bars read as one
 *  continuous striped block (bleed). A few px of empty grid between lanes
 *  gives each track a clean top/bottom edge — Ableton-style lane spacing. */
export const TRACK_GAP = 6

export interface LeafLayout {
  /** 0-based index into `flattenLeafVoices(track.body)`. */
  readonly leafIndex: number
  /** Display label for the leaf — first event's `s` or `note`, else
   *  `(silence)`. v1 doesn't render this in chrome (β-1 keeps identity on
   *  the row header) but β-5 tooltip / future sub-row hover may consume. */
  readonly label: string
  /** Y band top (px from grid top). */
  readonly top: number
  /** Y band height (= SUB_ROW_HEIGHT for expanded leaves). */
  readonly height: number
  /** True iff at least one event in this leaf has a non-null `extractPitch`
   *  result. Drives β-4's auto-fit branch (vs flat-baseline percussive). */
  readonly melodic: boolean
  /** MIDI auto-fit min/max for this leaf, undefined when percussive. */
  readonly pitchRange?: { min: number; max: number }
}

export interface TrackLayout {
  readonly trackId: string
  /** Y top of the track band (px from grid top). */
  readonly top: number
  /** Total height of the track band (collapsed = ROW_HEIGHT;
   *  expanded = leaves.length * SUB_ROW_HEIGHT, with empty-Stack
   *  fallback to ROW_HEIGHT). */
  readonly height: number
  readonly collapsed: boolean
  /** Empty array when collapsed or empty-Stack; otherwise one entry per
   *  leaf in source order. */
  readonly leaves: readonly LeafLayout[]
}

export interface TrackInput {
  readonly trackId: string
  /** IR subtree for this track. When undefined (no body found in IR — e.g.
   *  legacy snapshot without Track wrapping), the row is treated as a
   *  single-leaf collapsed. */
  readonly body?: PatternIR
  /** Events for this track in source order (used for melodic/pitchRange
   *  computation per leaf). */
  readonly events: readonly IREvent[]
}

export interface LayoutTrackRowsResult {
  readonly tracks: readonly TrackLayout[]
  /** Total Y extent (sum of all track heights). Useful for sizing the
   *  scroll-container content. */
  readonly totalHeight: number
}

/**
 * Compute per-track Y bands. Collapsed/expanded state read via the
 * `collapsedFor` callback (chrome wires it to `useTrackMeta`).
 *
 * Phase 20-12 wave-δ — `subRowHeight` is an optional per-call override
 * (default = SUB_ROW_HEIGHT constant). Wired to the editor setting
 * `getMusicalTimelineSubRowHeight()` so the user can tune density via
 * EditorSettingsModal. Range 12-48 (clamped at the setter).
 */
export function layoutTrackRows(
  tracks: readonly TrackInput[],
  collapsedFor: (trackId: string) => boolean,
  subRowHeight: number = SUB_ROW_HEIGHT,
): LayoutTrackRowsResult {
  const out: TrackLayout[] = []
  let cursor = 0
  let firstTrack = true
  for (const t of tracks) {
    // Insert a vertical gap between adjacent lanes so bars don't bleed
    // into the next track (#342). Applied before every track except the
    // first, so it sits cleanly between lanes regardless of which branch
    // (collapsed / empty-Stack / expanded) sizes the row below.
    if (!firstTrack) cursor += TRACK_GAP
    firstTrack = false
    const collapsed = collapsedFor(t.trackId)
    if (collapsed || !t.body) {
      out.push({
        trackId: t.trackId,
        top: cursor,
        height: ROW_HEIGHT,
        collapsed: true,
        leaves: [],
      })
      cursor += ROW_HEIGHT
      continue
    }
    const leafIRs = flattenLeafVoices(t.body)
    if (leafIRs.length === 0) {
      // Empty Stack — render a placeholder band but mark expanded so the
      // chevron's data-collapsed reflects the actual state.
      out.push({
        trackId: t.trackId,
        top: cursor,
        height: ROW_HEIGHT,
        collapsed: false,
        leaves: [],
      })
      cursor += ROW_HEIGHT
      continue
    }
    // Phase 20-12 — partition events per leaf via `evt.leafIndex` (set
    // by the Stack collect arm at editor's collect.ts). Events without a
    // leafIndex (e.g. hand-built fixtures, single-voice tracks where the
    // body isn't a voice-defining Stack) fall onto leaf 0. Out-of-range
    // leafIndex (defensive — shouldn't happen if IR + countLeavesInIR
    // agree) clamps to last leaf.
    const eventsForLeaf = (idx: number): readonly IREvent[] => {
      const result: IREvent[] = []
      const lastLeaf = leafIRs.length - 1
      for (const e of t.events) {
        const li =
          e.leafIndex === undefined
            ? 0
            : Math.min(Math.max(0, e.leafIndex), lastLeaf)
        if (li === idx) result.push(e)
      }
      return result
    }
    const leaves: LeafLayout[] = leafIRs.map((_leaf, leafIndex) => {
      const events = eventsForLeaf(leafIndex)
      const pitches: number[] = []
      for (const ev of events) {
        const p = extractPitch(ev)
        if (p !== null) pitches.push(p.midi)
      }
      const melodic = pitches.length > 0
      const pitchRange = melodic
        ? { min: Math.min(...pitches), max: Math.max(...pitches) }
        : undefined
      const firstEvent = events[0]
      const label =
        firstEvent?.s ??
        (firstEvent?.note != null ? String(firstEvent.note) : null) ??
        '(silence)'
      return {
        leafIndex,
        label,
        top: cursor + leafIndex * subRowHeight,
        height: subRowHeight,
        melodic,
        pitchRange,
      }
    })
    const totalHeight = leafIRs.length * subRowHeight
    out.push({
      trackId: t.trackId,
      top: cursor,
      height: totalHeight,
      collapsed: false,
      leaves,
    })
    cursor += totalHeight
  }
  return { tracks: out, totalHeight: cursor }
}
