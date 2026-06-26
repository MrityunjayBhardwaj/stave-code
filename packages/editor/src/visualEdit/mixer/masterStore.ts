/**
 * masterStore — the MASTER output gain, PER FILE.
 *
 * The master fader sets a post-mix output gain (superdough's shared
 * `destinationGain`), NOT a per-track `.gain` and NOT anything written to the
 * file — it's monitoring/output state, like solo and the meters (V-mixer-5). So
 * it's never in the document; instead it's persisted per file in localStorage
 * (`stave:mixer.master:<fileId>`) so it survives reloads, and applied to the
 * engine live.
 *
 * PER FILE is the whole point: playback is exclusive (the playback coordinator
 * stops other sources when one starts), so the master that matters is the
 * PLAYING file's. A file you never touched stays at unity (1.0) — so adjusting
 * one file's master can't affect another file's sound. The live apply runs
 * through the `applyMasterGain` seam, which the app routes to a file's engine
 * only while that file is playing; the value here is the source of truth the UI
 * reads and the engine is re-seeded from on every play.
 *
 * Backed by the same tiny external-store + SSR-safe localStorage shape as
 * `expandStore`. A per-file in-memory cache keeps `getSnapshot` referentially
 * stable for `useSyncExternalStore`.
 */
import * as React from 'react'

import {
  getActiveFileId,
  onActiveEditorChange,
  applyMasterGain,
} from '../../workspace/editorRegistry'

const KEY_PREFIX = 'stave:mixer.master:'
/** unity gain — an untouched file plays at full level. */
export const DEFAULT_MASTER_GAIN = 1

function key(fileId: string): string {
  return KEY_PREFIX + fileId
}

/** SSR-safe Storage, or null (mirrors expandStore / bottomPanel/persistence). */
function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    if (typeof window.localStorage?.getItem !== 'function') return null
    return window.localStorage
  } catch {
    return null
  }
}

// Per-file in-memory cache (fileId → linear gain).
const cache = new Map<string, number>()
const listeners = new Set<() => void>()

/**
 * Parse a persisted master gain. Pure (no I/O), so it unit-tests directly:
 * tolerates null/missing, non-numeric, NaN, and negative → unity, so a corrupt
 * key can never silence or break playback.
 */
export function parseMasterGain(raw: string | null): number {
  if (raw == null) return DEFAULT_MASTER_GAIN
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MASTER_GAIN
  return n
}

function load(fileId: string): number {
  const ls = safeLocalStorage()
  if (!ls) return DEFAULT_MASTER_GAIN
  try {
    return parseMasterGain(ls.getItem(key(fileId)))
  } catch {
    return DEFAULT_MASTER_GAIN
  }
}

/** the per-file master gain (linear), loaded from localStorage on first read. */
export function getMasterGain(fileId: string | null): number {
  if (!fileId) return DEFAULT_MASTER_GAIN
  let g = cache.get(fileId)
  if (g === undefined) {
    g = load(fileId)
    cache.set(fileId, g)
  }
  return g
}

function persist(fileId: string, value: number): void {
  const ls = safeLocalStorage()
  if (!ls) return
  try {
    ls.setItem(key(fileId), String(value))
  } catch {
    /* quota / private mode — keep the in-memory value */
  }
}

/** set a file's master gain: cache, persist, apply live to its engine (no-op if
 *  that file isn't the one currently playing), then notify subscribers. */
export function setMasterGain(fileId: string, value: number): void {
  const v = value < 0 ? 0 : value
  cache.set(fileId, v)
  persist(fileId, v)
  applyMasterGain(fileId, v)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** the active file id, tracked the same way the meters / expand store pin it. */
function useActiveFileId(): string | null {
  const [id, setId] = React.useState<string | null>(() => getActiveFileId())
  React.useEffect(() => {
    setId(getActiveFileId())
    return onActiveEditorChange(() => setId(getActiveFileId()))
  }, [])
  return id
}

/**
 * The active file's master gain + a setter. Drives the Master strip fader:
 * shows the active file's master, and dragging persists + applies it live (only
 * audible if that file is the one playing). Re-renders on change here, in
 * another mounted copy, or when the active file changes — never touches the
 * document.
 */
export function useMasterGain(): { gain: number; setGain: (value: number) => void } {
  const fileId = useActiveFileId()
  const gain = React.useSyncExternalStore(
    subscribe,
    () => getMasterGain(fileId),
    () => DEFAULT_MASTER_GAIN,
  )
  const setGain = React.useCallback(
    (value: number) => {
      if (fileId) setMasterGain(fileId, value)
    },
    [fileId],
  )
  return { gain, setGain }
}
