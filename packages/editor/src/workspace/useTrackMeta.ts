/**
 * useTrackMetaMap — Phase D (#581).
 *
 * React hook surfacing ALL of a file's per-track UI metadata (custom palette
 * swatch + chevron collapsed state) from the per-file PM Yjs doc, as a ref-stable
 * map. Mirrors useWorkspaceFile's useSyncExternalStore pattern.
 *
 * (#588: the original per-track `useTrackMeta` hook — α-3 — was removed; it had no
 * call sites. Every view that paints overrides reads the whole map at once via
 * this hook, so the single-track surface was dead.)
 */

import { useCallback, useSyncExternalStore } from 'react'
import {
  getTrackMetaMapSnapshot,
  subscribeToTrackMeta,
  type TrackMeta,
} from './WorkspaceFile'

/** Ref-stable empty map for the fileId-undefined branch (Phase D, #581). */
const EMPTY_META_MAP: ReadonlyMap<string, TrackMeta> = new Map()

/**
 * useTrackMetaMap — ALL of a file's per-track metadata as a ref-stable map keyed
 * by trackId (the track's DISPLAY NAME, the key both the Mixer and the Song
 * Timeline resolve to). A view that paints many tracks at once (the Mixer strip
 * row, the Timeline scene) reads every custom-colour override in a single
 * reactive subscription rather than N hooks.
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
