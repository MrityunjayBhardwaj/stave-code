/**
 * useTrackMeta — Phase 20-12 α-3.
 *
 * React hook surfacing per-track UI metadata (custom palette swatch + chevron
 * collapsed state) from the per-file PM Yjs doc. Mirrors useWorkspaceFile's
 * useSyncExternalStore pattern (useWorkspaceFile.ts:39-64).
 *
 * Backed by `subscribeToTrackMeta` + `getTrackMeta` + `setTrackMeta` (added
 * in α-2). The hook is the React-side surface β chrome will mount against.
 *
 * @remarks
 * - `fileId` source: chrome derives this from `IRSnapshot.source` (the
 *   workspace file path). When undefined (no snapshot yet, or snapshot from
 *   a non-file source) the hook returns the empty default and the setter
 *   no-ops — RESEARCH §A.6.
 *
 * - The store's `getTrackMeta` already returns a shared frozen sentinel for
 *   absent records (WorkspaceFile.ts EMPTY_TRACK_META) AND the exact stored
 *   reference when present, so `getSnapshot` is ref-stable without further
 *   handling here. Allocating `{}` per call would trip StrictMode tearing.
 *
 * - `set` is `useCallback`-memoised on `(fileId, trackId)` so dependents
 *   (e.g. effects, child memo blockers) get a stable reference across renders
 *   while fileId/trackId remain unchanged. feedback_useeffect_per_render_dep.md.
 */

import { useCallback, useSyncExternalStore } from 'react'
import {
  getTrackMeta,
  getTrackMetaMapSnapshot,
  setTrackMeta as storeSetTrackMeta,
  subscribeToTrackMeta,
  type TrackMeta,
} from './WorkspaceFile'

/** Frozen sentinel for the fileId-undefined branch — distinct from the
 *  store's internal EMPTY_TRACK_META by encapsulation only; both are
 *  ref-stable empty TrackMetas. */
const EMPTY_META: TrackMeta = Object.freeze({})

/** Ref-stable empty map for the fileId-undefined branch (Phase D, #581). */
const EMPTY_META_MAP: ReadonlyMap<string, TrackMeta> = new Map()

export interface UseTrackMetaResult {
  meta: TrackMeta
  set: (partial: Partial<TrackMeta>) => void
}

export function useTrackMeta(
  fileId: string | undefined,
  trackId: string,
): UseTrackMetaResult {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!fileId) return () => {}
      return subscribeToTrackMeta(fileId, onStoreChange)
    },
    [fileId],
  )

  // getSnapshot must be ref-stable for the same store state. The store
  // returns the SAME object reference for an unchanged record (Y.Map.get
  // returns the stored value identity); the frozen sentinel handles the
  // fileId-undefined branch.
  const getSnapshot = useCallback((): TrackMeta => {
    if (!fileId) return EMPTY_META
    return getTrackMeta(fileId, trackId)
  }, [fileId, trackId])

  const meta = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const set = useCallback(
    (partial: Partial<TrackMeta>) => {
      if (!fileId) return
      storeSetTrackMeta(fileId, trackId, partial)
    },
    [fileId, trackId],
  )

  return { meta, set }
}

/**
 * useTrackMetaMap — Phase D (#581). ALL of a file's per-track metadata as a
 * ref-stable map keyed by trackId (the track's DISPLAY NAME, the key both the
 * Mixer and the Song Timeline resolve to). Where `useTrackMeta` surfaces ONE
 * track for a focused control, this surfaces the whole map so a view that paints
 * many tracks at once (the Mixer strip row, the Timeline scene) reads every
 * custom-colour override in a single reactive subscription rather than N hooks.
 *
 * Backed by `getTrackMetaMapSnapshot` (cached, ref-stable) + `subscribeToTrackMeta`,
 * so the returned map identity changes ONLY when an override is set/cleared — which
 * is exactly the signal a `useMemo`/scene rebuild wants. Returns the shared empty
 * map when `fileId` is undefined (no snapshot yet) — the setter on the per-track
 * hook still no-ops there.
 */
export function useTrackMetaMap(
  fileId: string | undefined,
): ReadonlyMap<string, TrackMeta> {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!fileId) return () => {}
      return subscribeToTrackMeta(fileId, onStoreChange)
    },
    [fileId],
  )
  const getSnapshot = useCallback((): ReadonlyMap<string, TrackMeta> => {
    if (!fileId) return EMPTY_META_MAP
    return getTrackMetaMapSnapshot(fileId)
  }, [fileId])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
