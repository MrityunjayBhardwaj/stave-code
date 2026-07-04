/**
 * soloStore — which Mixer strips are soloed, PLUS the pre-solo mute snapshot.
 *
 * Solo now WRITES the `_` mute markers into the code (#735): soloing a track
 * mutes every other track in the SOURCE (visible + bidirectional, like mute), and
 * the engine silences them off the file's markers — there is no longer an
 * eval-time overlay. What the code can't carry lives here, per file, in memory:
 *
 *   1. `soloed` — which track(s) the user soloed, so the Mixer can HIGHLIGHT the
 *      solo button as distinct from a plain mute. Session-only, never persisted.
 *   2. `preSoloMutes` — a snapshot of the hand-set mutes taken when solo BEGAN
 *      (empty→non-empty), so CLEARING solo restores exactly those instead of
 *      wiping every `_`. This is the seam that keeps a mute you set by hand alive
 *      across a solo→un-solo round-trip.
 *
 * The actual `_` writes live in `soloMuteSync` (they need the editor); this file
 * is pure in-memory state + a `useSyncExternalStore` subscription.
 */
import * as React from 'react'

import { getActiveFileId, onActiveEditorChange } from '../../workspace/editorRegistry'

const EMPTY: ReadonlySet<string> = new Set<string>()

// Per-file solo sets, in-memory only (no localStorage — solo is session-
// ephemeral). The cached Set is returned by reference until a toggle replaces
// it, so `getSnapshot` stays stable.
const cache = new Map<string, Set<string>>()
// Per-file snapshot of the mutes present when solo BEGAN (absent = no solo
// active). Restored verbatim when solo clears, so hand-set mutes survive.
const snapshots = new Map<string, ReadonlySet<string>>()
const listeners = new Set<() => void>()

function read(fileId: string | null): ReadonlySet<string> {
  if (!fileId) return EMPTY
  return cache.get(fileId) ?? EMPTY
}

/**
 * Flip a strip's solo membership for a file (the in-memory HIGHLIGHT set only —
 * the `_` mute writes are done by the caller in `soloMuteSync`, which owns the
 * editor). New Set ref → snapshot changes → the Mixer re-renders the button.
 */
export function toggleSolo(fileId: string, id: string): void {
  const next = new Set(read(fileId))
  if (next.has(id)) next.delete(id)
  else next.add(id)
  if (next.size === 0) cache.delete(fileId)
  else cache.set(fileId, next)
  listeners.forEach((l) => l())
}

/** The pre-solo mute snapshot for a file, or null when no solo is active. */
export function getPreSoloMutes(fileId: string | null): ReadonlySet<string> | null {
  if (!fileId) return null
  return snapshots.get(fileId) ?? null
}

/** Record the pre-solo mute snapshot for a file (null clears it). */
export function setPreSoloMutes(
  fileId: string | null,
  snapshot: ReadonlySet<string> | null,
): void {
  if (!fileId) return
  if (snapshot === null) snapshots.delete(fileId)
  else snapshots.set(fileId, snapshot)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
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
 * The soloed-strip set for the active file + a toggle of the in-memory highlight
 * set. The audible/visible effect (the `_` markers) is written by `soloMuteSync`,
 * which wraps this; the Mixer reads `soloed` here to light the solo button.
 */
export function useSoloStrips(): {
  soloed: ReadonlySet<string>
  toggle: (id: string) => void
} {
  const fileId = useActiveFileId()
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
