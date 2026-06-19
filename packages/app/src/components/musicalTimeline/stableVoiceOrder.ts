/**
 * stableVoiceOrder — pin each lane's per-voice sub-row order across re-evals
 * (#480).
 *
 * `groupVoices` (timelineScene) emits a lane's voices in FIRST-APPEARANCE-IN-TIME
 * order — the order their first mark is seen while walking the marks. Reordering
 * clips in time (drag or code-edit) changes who appears first, so the voice rows
 * reshuffle even though the marks are correct. For a DAW that's wrong: reordering
 * CLIPS must not move TRACKS.
 *
 * Top-level lanes already get first-seen-stable ordering from `stableTrackOrder`
 * (D-04). This applies the SAME treatment one level down — PER LANE, keyed on the
 * voice partition key (`SceneVoice.key`). A voice keeps its slot once seen; a
 * genuinely new voice appends at the end (NOT alphabetical — musical-intent
 * order is preserved, just frozen). Because it reuses `stableTrackOrder`, a voice
 * that vanishes from one eval keeps its slot reserved, so removing then re-adding
 * it within a session returns it to its original row.
 *
 * PURE — no React, no canvas. The caller (FullSongTimeline) holds the previous
 * order in a ref and threads it back, mirroring MusicalTimeline's `slotMapRef`.
 *
 * Per-lane keying matters: the same sample name (e.g. `bd`) can appear in two
 * different lanes; each lane owns an independent voice-order map so their slots
 * never collide.
 */

import { stableTrackOrder } from './stableTrackOrder'
import type { TimelineScene } from './timelineScene'

/** laneKey → (voiceKey → pinned slot). Held in a ref by the component and
 *  threaded back each re-eval so the ordering persists within a session. */
export type VoiceOrderByLane = ReadonlyMap<string, ReadonlyMap<string, number>>

/** A shared empty starting point (first build of a session). */
export const EMPTY_VOICE_ORDER: VoiceOrderByLane = new Map()

/**
 * Reorder every lane's `voices` array by a stable, first-seen slot map and
 * return BOTH the reordered scene and the updated order map (the caller writes
 * the latter back to its ref). Lanes with fewer than two voices are returned
 * untouched (nothing to reorder, and they render as a single band anyway), but
 * their slot map is still advanced so a later-appearing second voice pins
 * correctly. Lane order itself is never changed here — that stays `analyzeSong`'s
 * first-seen order (already stable).
 */
export function applyStableVoiceOrder(
  scene: TimelineScene,
  prev: VoiceOrderByLane,
): { scene: TimelineScene; order: VoiceOrderByLane } {
  const order = new Map<string, ReadonlyMap<string, number>>()
  let changed = false
  const lanes = scene.lanes.map((lane) => {
    const prevForLane = prev.get(lane.laneKey) ?? new Map<string, number>()
    const slots = stableTrackOrder(
      prevForLane,
      lane.voices.map((v) => v.key),
    )
    order.set(lane.laneKey, slots)
    if (lane.voices.length < 2) return lane
    const sorted = [...lane.voices].sort(
      (a, b) => (slots.get(a.key) ?? 0) - (slots.get(b.key) ?? 0),
    )
    // Preserve the lane object identity when the order is already stable so
    // downstream `useMemo`s keyed on `scene.lanes` don't churn on no-op re-evals.
    const moved = sorted.some((v, i) => v.key !== lane.voices[i].key)
    if (!moved) return lane
    changed = true
    return { ...lane, voices: sorted }
  })
  return { scene: changed ? { ...scene, lanes } : scene, order }
}
