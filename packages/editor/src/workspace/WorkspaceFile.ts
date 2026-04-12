/**
 * WorkspaceFile store — Yjs-backed (PM Phase 1).
 *
 * Replaces the Phase 10.2 in-memory Map with a Yjs Y.Doc backing.
 * The public API is IDENTICAL to the original:
 *
 *   createWorkspaceFile, getFile, setContent, subscribe
 *
 * plus a new `seedWorkspaceFile` for persistence-aware create-or-load.
 *
 * ## How persistence works
 *
 * Each file is a Y.Map inside the doc's top-level "files" Y.Map.
 * Content is stored as Y.Text (ready for Phase 3 multiplayer).
 * A cached `WorkspaceFile` snapshot is maintained per file for
 * reference-stability (required by useSyncExternalStore).
 *
 * Two init modes:
 * - Real app: call `initProjectDoc(id)` (async, IDB-backed) BEFORE
 *   mounting components. Files loaded from IDB are available after.
 * - Tests: no init needed — the store lazy-inits an in-memory Y.Doc
 *   on first access via `ensureDoc()`.
 *
 * ## Snapshot identity contract (unchanged from Phase 10.2)
 *
 * `getFile(id) === getFile(id)` — unless content changed in between.
 * Achieved by caching snapshots and only rebuilding on Y.Text changes.
 */

import * as Y from 'yjs'
import { ensureDoc, getFilesMap, destroyProjectDoc } from './projectDoc'
import type { WorkspaceFile, WorkspaceLanguage } from './types'

type Subscriber = () => void

// ── Cache layer ──────────────────────────────────────────────────────
// Cached WorkspaceFile snapshots for reference stability.
const cachedSnapshots = new Map<string, WorkspaceFile>()

// Per-file subscriber sets (same pattern as Phase 10.2).
const subscribersByFile = new Map<string, Set<Subscriber>>()

// Track Y.Text observers so we can clean up on reset/project switch.
const textObservers = new Map<string, { ytext: Y.Text; handler: () => void }>()

// ── Snapshot rebuild ─────────────────────────────────────────────────

function rebuildSnapshot(id: string): void {
  const filesMap = getFilesMap()
  const fileMap = filesMap.get(id) as Y.Map<unknown> | undefined
  if (!fileMap) {
    cachedSnapshots.delete(id)
    return
  }
  const ytext = fileMap.get('content') as Y.Text
  cachedSnapshots.set(id, {
    id: fileMap.get('id') as string,
    path: fileMap.get('path') as string,
    content: ytext.toString(),
    language: fileMap.get('language') as WorkspaceLanguage,
    meta: fileMap.get('meta') as Readonly<Record<string, unknown>> | undefined,
  })
}

// ── Y.Text observer wiring ──────────────────────────────────────────

function wireTextObserver(id: string, ytext: Y.Text): void {
  // Remove existing observer if any (idempotent)
  unwireTextObserver(id)

  const handler = () => {
    rebuildSnapshot(id)
    notify(id)
  }
  ytext.observe(handler)
  textObservers.set(id, { ytext, handler })
}

function unwireTextObserver(id: string): void {
  const entry = textObservers.get(id)
  if (entry) {
    entry.ytext.unobserve(entry.handler)
    textObservers.delete(id)
  }
}

// ── Y.Map observer (structural: file added/removed) ─────────────────

let filesMapObserverWired = false

function ensureFilesMapObserver(): void {
  if (filesMapObserverWired) return
  const filesMap = getFilesMap()
  filesMap.observe((event) => {
    for (const [key, change] of event.changes.keys) {
      if (change.action === 'add' || change.action === 'update') {
        const fileMap = filesMap.get(key) as Y.Map<unknown>
        const ytext = fileMap.get('content') as Y.Text
        rebuildSnapshot(key)
        wireTextObserver(key, ytext)
        notify(key)
      } else if (change.action === 'delete') {
        unwireTextObserver(key)
        cachedSnapshots.delete(key)
        notify(key)
      }
    }
  })
  filesMapObserverWired = true
}

// ── Public API (unchanged signatures) ────────────────────────────────

/**
 * Create a new WorkspaceFile. Always overwrites if the file already exists.
 * Safe to call multiple times for the same id.
 *
 * For persistence-aware "create only if not in IDB" semantics, use
 * `seedWorkspaceFile` instead (LiveCodingEditor uses that).
 */
export function createWorkspaceFile(
  id: string,
  path: string,
  content: string,
  language: WorkspaceLanguage,
  meta?: Record<string, unknown>,
): WorkspaceFile {
  ensureDoc()
  ensureFilesMapObserver()
  const filesMap = getFilesMap()
  const doc = ensureDoc()

  doc.transact(() => {
    const fileMap = new Y.Map<unknown>()
    fileMap.set('id', id)
    fileMap.set('path', path)
    fileMap.set('language', language)
    if (meta !== undefined) fileMap.set('meta', meta)
    const ytext = new Y.Text()
    ytext.insert(0, content)
    fileMap.set('content', ytext)
    // Setting on filesMap triggers the Y.Map observer which wires
    // the Y.Text observer, rebuilds the snapshot, and notifies.
    filesMap.set(id, fileMap)
  })

  return cachedSnapshots.get(id) ?? { id, path, content, language, meta }
}

/**
 * Persistence-aware create-or-load. If the file already exists in the
 * Y.Doc (loaded from IDB), returns the persisted version without
 * overwriting. If the file does not exist, creates it with the given
 * seed content.
 *
 * Use this from components that seed files on mount (LiveCodingEditor,
 * WorkspaceShell) to avoid overwriting persisted user work on refresh.
 */
export function seedWorkspaceFile(
  id: string,
  path: string,
  content: string,
  language: WorkspaceLanguage,
  meta?: Record<string, unknown>,
): WorkspaceFile {
  ensureDoc()
  ensureFilesMapObserver()
  const filesMap = getFilesMap()
  const existing = filesMap.get(id) as Y.Map<unknown> | undefined

  if (existing) {
    // File already in Y.Doc — persisted from previous session.
    // Ensure snapshot cache is populated and observer is wired.
    if (!cachedSnapshots.has(id)) {
      rebuildSnapshot(id)
    }
    const ytext = existing.get('content') as Y.Text
    if (!textObservers.has(id)) {
      wireTextObserver(id, ytext)
    }
    return cachedSnapshots.get(id)!
  }

  // File not in Y.Doc — create with seed content.
  return createWorkspaceFile(id, path, content, language, meta)
}

/**
 * Return the current snapshot for a file id, or `undefined` if the id
 * is not registered. Reference-stable across calls.
 */
export function getFile(id: string): WorkspaceFile | undefined {
  return cachedSnapshots.get(id)
}

/**
 * Replace the content of a file. Writing to an unknown id is a no-op.
 */
export function setContent(id: string, newContent: string): void {
  const filesMap = getFilesMap()
  const fileMap = filesMap.get(id) as Y.Map<unknown> | undefined
  if (!fileMap) return

  const ytext = fileMap.get('content') as Y.Text
  const currentContent = ytext.toString()
  if (currentContent === newContent) return // no-op, preserve identity

  const doc = ensureDoc()
  doc.transact(() => {
    ytext.delete(0, ytext.length)
    ytext.insert(0, newContent)
  })
  // Y.Text observer fires → rebuildSnapshot → notify
}

/**
 * Register a subscriber for a specific file id. Returns unsubscribe fn.
 */
export function subscribe(id: string, cb: Subscriber): () => void {
  let set = subscribersByFile.get(id)
  if (!set) {
    set = new Set()
    subscribersByFile.set(id, set)
  }
  set.add(cb)
  return () => {
    const current = subscribersByFile.get(id)
    if (!current) return
    current.delete(cb)
    if (current.size === 0) {
      subscribersByFile.delete(id)
    }
  }
}

// ── Internal helpers ─────────────────────────────────────────────────

function notify(id: string): void {
  const set = subscribersByFile.get(id)
  if (!set) return
  const snapshot = Array.from(set)
  for (const cb of snapshot) cb()
}

/**
 * TESTING ONLY — reset the entire store. Destroys the Y.Doc and clears
 * all caches and observers. The next store access lazy-inits a fresh
 * in-memory doc.
 */
export function __resetWorkspaceFilesForTests(): void {
  // Unwire all Y.Text observers
  for (const [id] of textObservers) {
    unwireTextObserver(id)
  }
  textObservers.clear()
  cachedSnapshots.clear()
  subscribersByFile.clear()
  filesMapObserverWired = false
  destroyProjectDoc()
}
