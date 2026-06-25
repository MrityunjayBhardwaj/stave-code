/**
 * expandStore — which Mixer-tab strips are expanded, PER FILE (#550 / S4b).
 *
 * The per-strip expand drawer is EPHEMERAL UI state: which strips are open is
 * never written to the Strudel file (V-mixer-1 — the document stays a pure
 * source of truth; expand/solo/meter are the only non-document state). It IS
 * persisted across sessions in localStorage so reopening a project finds the
 * same strips open — but the file is byte-identical either way.
 *
 * Scope is PER FILE (`stave:mixer.expanded:<fileId>`), not global: strip ids
 * (`d1`, `$0`) are document-scoped, so a global key would show the same id as
 * expanded across unrelated files. The editor package has no project id, so a
 * per-file key (keyed on `getActiveFileId()`, the same handle the meters pin to)
 * is both the most correct scope and the only one reachable here.
 *
 * Backed by a tiny external store + SSR-safe localStorage, mirroring
 * `noteColor.ts`. A per-file in-memory cache makes `getSnapshot` referentially
 * stable (required by `useSyncExternalStore`): the cached Set is returned by
 * reference until a toggle replaces it.
 */
import * as React from 'react'

import { getActiveFileId, onActiveEditorChange } from '../../workspace/editorRegistry'

const KEY_PREFIX = 'stave:mixer.expanded:'
/** a single shared empty Set, so an unknown/SSR file always returns one ref */
const EMPTY: ReadonlySet<string> = new Set<string>()

function key(fileId: string): string {
  return KEY_PREFIX + fileId
}

/** SSR-safe Storage, or null (mirrors bottomPanel/persistence.ts). */
function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    if (typeof window.localStorage?.getItem !== 'function') return null
    return window.localStorage
  } catch {
    return null
  }
}

// Per-file in-memory cache. Holds the same Set instance until a toggle replaces
// it, so `useSyncExternalStore`'s snapshot stays stable between unrelated
// re-renders (a changing ref would loop / over-render).
const cache = new Map<string, Set<string>>()
const listeners = new Set<() => void>()

/**
 * Parse a persisted value into an expanded-id Set. Pure (no I/O), so it unit-
 * tests directly: tolerates null/missing, non-JSON, non-array, and non-string
 * elements — anything malformed degrades to an empty Set rather than throwing
 * (a corrupt key must never break the Mixer).
 */
export function parseExpanded(raw: string | null): Set<string> {
  if (!raw) return new Set()
  try {
    const arr: unknown = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function load(fileId: string): Set<string> {
  const ls = safeLocalStorage()
  if (!ls) return new Set()
  try {
    return parseExpanded(ls.getItem(key(fileId)))
  } catch {
    return new Set()
  }
}

/** the cached expanded-id Set for a file (loaded from localStorage on first read). */
function read(fileId: string | null): ReadonlySet<string> {
  if (!fileId) return EMPTY
  let set = cache.get(fileId)
  if (!set) {
    set = load(fileId)
    cache.set(fileId, set)
  }
  return set
}

function persist(fileId: string, set: Set<string>): void {
  const ls = safeLocalStorage()
  if (!ls) return
  try {
    ls.setItem(key(fileId), JSON.stringify([...set]))
  } catch {
    /* quota / private mode — keep the in-memory value */
  }
}

/** flip a strip's expanded state for a file, then notify subscribers. */
export function toggleExpanded(fileId: string, id: string): void {
  const next = new Set(read(fileId)) // copy → new ref → snapshot changes → re-render
  if (next.has(id)) next.delete(id)
  else next.add(id)
  cache.set(fileId, next)
  persist(fileId, next)
  listeners.forEach((l) => l())
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
 * The expanded-strip Set for the active file + a toggle. Re-renders the Mixer
 * console when a strip is expanded/collapsed (here or in another mounted copy)
 * and when the active file changes. Sticky (toggle only), multi (a Set), and
 * persisted — never touches the document.
 */
export function useExpandedStrips(): {
  expanded: ReadonlySet<string>
  toggle: (id: string) => void
} {
  const fileId = useActiveFileId()
  const expanded = React.useSyncExternalStore(
    subscribe,
    () => read(fileId),
    () => EMPTY,
  )
  const toggle = React.useCallback(
    (id: string) => {
      if (fileId) toggleExpanded(fileId, id)
    },
    [fileId],
  )
  return { expanded, toggle }
}
