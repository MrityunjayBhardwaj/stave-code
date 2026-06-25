/**
 * soloStore — which Mixer strips are soloed (#550-S5, design §6.5 / D3).
 *
 * Solo is the most ephemeral mixer state: a transient "let me hear these alone."
 * It is NEVER written to the file (D3) AND — unlike expand — never persisted to
 * localStorage either; it lives only in memory for the session. Per file (strip
 * ids are document-scoped), like the meters and expand state.
 *
 * The store does two things beyond holding the set:
 *  1. It registers ONE eval-source transform (`registerEvalSourceTransform`) the
 *     first time a solo UI mounts, so the app's `getFileContent` runs the source
 *     through `applyMonitorOverlay` at eval time — silencing non-soloed tracks in
 *     the STRING sent to the engine, never the file. Ref-counted: when the last
 *     consumer unmounts, the transform is removed (full playback restored).
 *  2. On every toggle it calls `requestReeval(fileId)` so solo takes audible
 *     effect immediately while playing (the S3 live seam), exactly like mute.
 *
 * Backed by a tiny external store (`useSyncExternalStore`); a per-file cache
 * keeps the snapshot referentially stable.
 */
import * as React from 'react'

import {
  getActiveFileId,
  onActiveEditorChange,
  registerEvalSourceTransform,
  requestReeval,
} from '../../workspace/editorRegistry'
import { applyMonitorOverlay } from './soloOverlay'

const EMPTY: ReadonlySet<string> = new Set<string>()

// Per-file solo sets, in-memory only (no localStorage — solo is session-
// ephemeral). The cached Set is returned by reference until a toggle replaces
// it, so `getSnapshot` stays stable.
const cache = new Map<string, Set<string>>()
const listeners = new Set<() => void>()

function read(fileId: string | null): ReadonlySet<string> {
  if (!fileId) return EMPTY
  return cache.get(fileId) ?? EMPTY
}

/** flip a strip's solo for a file, then re-eval so it's audible immediately. */
export function toggleSolo(fileId: string, id: string): void {
  const next = new Set(read(fileId)) // new ref → snapshot changes → re-render
  if (next.has(id)) next.delete(id)
  else next.add(id)
  if (next.size === 0) cache.delete(fileId)
  else cache.set(fileId, next)
  listeners.forEach((l) => l())
  // Live: re-eval the playing file so the overlay (or its removal) is heard now.
  requestReeval(fileId)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ── the single eval-source transform, ref-counted to the mounted solo UIs ──
let refs = 0
let unregister: (() => void) | null = null

function acquireTransform(): void {
  if (refs++ === 0) {
    // Reads the CURRENT solo set for whichever file is being evaluated, so it
    // stays correct across edits and file switches. Identity when nothing is
    // soloed (applyMonitorOverlay short-circuits).
    unregister = registerEvalSourceTransform((fileId, raw) =>
      applyMonitorOverlay(raw, read(fileId)),
    )
  }
}

function releaseTransform(): void {
  if (--refs <= 0) {
    refs = 0
    unregister?.()
    unregister = null
  }
}

/** the active file id, tracked the same way the meters pin the bus. */
function useActiveFileId(): string | null {
  const [id, setId] = React.useState<string | null>(() => getActiveFileId())
  React.useEffect(() => {
    setId(getActiveFileId())
    return onActiveEditorChange(() => setId(getActiveFileId()))
  }, [])
  return id
}

/**
 * The soloed-strip set for the active file + a toggle. Mounting registers the
 * eval-source overlay (ref-counted); unmounting removes it (full playback). A
 * change re-renders the console and re-evals the playing file (live).
 */
export function useSoloStrips(): {
  soloed: ReadonlySet<string>
  toggle: (id: string) => void
} {
  const fileId = useActiveFileId()
  React.useEffect(() => {
    acquireTransform()
    return releaseTransform
  }, [])
  const soloed = React.useSyncExternalStore(
    subscribe,
    () => read(fileId),
    () => EMPTY,
  )
  const toggle = React.useCallback(
    (id: string) => {
      if (fileId) toggleSolo(fileId, id)
    },
    [fileId],
  )
  return { soloed, toggle }
}
