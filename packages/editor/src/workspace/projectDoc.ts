/**
 * projectDoc — PM Phase 1 (local persistence).
 *
 * Manages the active Yjs document that backs the WorkspaceFile store.
 * Each project is a single Y.Doc persisted to IndexedDB via y-indexeddb.
 *
 * Two init paths:
 * - `initProjectDoc(id)` — async, wires y-indexeddb, awaits IDB sync.
 *   Used by the real app. Files loaded from IDB are available after resolve.
 * - `initProjectDocSync()` — sync, in-memory only, no IDB.
 *   Used by tests and as a lazy fallback if no explicit init was called.
 *
 * The store (WorkspaceFile.ts) calls `ensureDoc()` which lazy-inits
 * in-memory if no explicit init happened — making tests work without
 * any async ceremony while the real app gets persistence.
 */

import * as Y from 'yjs'

// Dynamic import for y-indexeddb so tests in jsdom (no IDB) don't crash
// at import time. The import is only executed inside initProjectDoc().
type IndexeddbPersistenceType = import('y-indexeddb').IndexeddbPersistence

let activeDoc: Y.Doc | null = null
let activeProvider: IndexeddbPersistenceType | null = null
let activeProjectId: string | null = null
let docReady = false

/** Default budget for the IndexedDB initial sync before we degrade to memory. */
export const IDB_SYNC_TIMEOUT_MS = 8000

/**
 * Outcome of {@link initProjectDoc}. `persisted` is true when the Y.Doc was
 * hydrated from IndexedDB; false when we fell back to an in-memory doc because
 * the IDB open timed out or failed. The app uses this to decide whether to
 * warn the user that their edits won't persist this session.
 */
export interface ProjectDocInitResult {
  persisted: boolean
  reason?: 'timeout' | 'error'
}

/**
 * Async init with IndexedDB persistence. Resolves after IDB sync
 * completes — all persisted files are in the Y.Doc when this returns.
 *
 * Must be called BEFORE any createWorkspaceFile / seedWorkspaceFile
 * calls to avoid the seed-vs-persisted race condition.
 *
 * Bounded by `timeoutMs`: y-indexeddb's `whenSynced` only resolves on a
 * SUCCESSFUL open and never settles when `indexedDB.open` is blocked (another
 * tab holding an older DB version), rejected (private-browsing), or corrupted
 * — there is no `.catch` on the open inside y-indexeddb. Without a guard that
 * stuck open hangs the entire app boot forever (the "keeps on loading" bug).
 * On timeout/failure we abandon the dead provider and keep the fresh in-memory
 * Y.Doc so the app boots degraded (no persistence) instead of never at all.
 */
export async function initProjectDoc(
  projectId: string,
  opts: { timeoutMs?: number } = {},
): Promise<ProjectDocInitResult> {
  const timeoutMs = opts.timeoutMs ?? IDB_SYNC_TIMEOUT_MS

  // Clean up previous doc if switching projects
  if (activeProvider) {
    activeProvider.destroy()
    activeProvider = null
  }
  if (activeDoc) {
    activeDoc.destroy()
  }

  activeDoc = new Y.Doc()
  docReady = false

  // Abandon the (possibly mid-open) provider and keep the empty in-memory
  // doc. destroy() sets the provider's `_destroyed` flag, so even if its
  // open resolves later it won't mutate our doc — no late race.
  const degradeToMemory = (reason: 'timeout' | 'error'): ProjectDocInitResult => {
    if (activeProvider) {
      try {
        activeProvider.destroy()
      } catch {
        /* provider may be mid-open; ignore */
      }
      activeProvider = null
    }
    activeProjectId = projectId
    docReady = true
    return { persisted: false, reason }
  }

  try {
    // Dynamic import — avoids jsdom crash in tests
    const { IndexeddbPersistence } = await import('y-indexeddb')
    activeProvider = new IndexeddbPersistence(`stave-${projectId}`, activeDoc)
  } catch {
    // No IndexedDB at all (import failed or constructor threw).
    return degradeToMemory('error')
  }

  const provider = activeProvider
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      provider.whenSynced,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('idb-timeout')), timeoutMs)
      }),
    ])
  } catch (err) {
    return degradeToMemory(
      err instanceof Error && err.message === 'idb-timeout' ? 'timeout' : 'error',
    )
  } finally {
    if (timer) clearTimeout(timer)
  }

  activeProjectId = projectId
  docReady = true
  return { persisted: true }
}

/**
 * Sync init without persistence. Used by tests and as a lazy fallback.
 * The Y.Doc lives only in memory — lost on refresh.
 */
export function initProjectDocSync(): void {
  if (activeProvider) {
    activeProvider.destroy()
    activeProvider = null
  }
  if (activeDoc) {
    activeDoc.destroy()
  }

  activeDoc = new Y.Doc()
  docReady = true
}

/**
 * Ensure a Y.Doc exists. If none was explicitly initialized, creates
 * an in-memory doc (sync path). This lets tests call store functions
 * without any init ceremony.
 */
export function ensureDoc(): Y.Doc {
  if (!activeDoc) {
    initProjectDocSync()
  }
  return activeDoc!
}

/** Returns the active Y.Doc. Throws if none initialized. */
export function getActiveDoc(): Y.Doc {
  return ensureDoc()
}

/** Returns the files Y.Map from the active doc. */
export function getFilesMap(): Y.Map<Y.Map<unknown>> {
  return ensureDoc().getMap('files')
}

/** Whether the doc has finished loading from IDB (always true for sync init). */
export function isDocReady(): boolean {
  return docReady
}

/** Returns the active project id, or null if none initialized. */
export function getActiveProjectId(): string | null {
  return activeProjectId
}

/**
 * Switch to a different project. Destroys the current doc + provider,
 * creates a new Y.Doc for the target project, and awaits IDB sync.
 *
 * Callers MUST also call resetFileStore() (from WorkspaceFile.ts) to
 * clear cached snapshots and re-wire observers before any store reads.
 * initProjectDoc already handles the doc-level cleanup; this function
 * is a convenience alias that also updates the active project id.
 */
export async function switchProject(projectId: string): Promise<ProjectDocInitResult> {
  return initProjectDoc(projectId)
}

/**
 * Subscribe to ANY update on the active Y.Doc (file content typing,
 * structural file-list changes, folder-order changes, etc). Used by
 * the app's auto-snapshot debouncer. Returns an unsubscribe function.
 *
 * Note: the subscription is bound to whatever Y.Doc is active at
 * registration time. Callers should re-register when the project
 * switches (the old doc gets destroyed).
 */
export function subscribeToDocUpdate(
  cb: () => void,
  options?: { localOnly?: boolean },
): () => void {
  const doc = ensureDoc()
  const localOnly = options?.localOnly ?? false
  const handler = (
    _update: Uint8Array,
    _origin: unknown,
    _doc: Y.Doc,
    tr: Y.Transaction,
  ) => {
    // When localOnly is set, skip transactions that aren't from a local
    // user edit — y-indexeddb replays on project load have tr.local=false.
    if (localOnly && !tr.local) return
    cb()
  }
  doc.on('update', handler)
  return () => {
    doc.off('update', handler)
  }
}

/**
 * Destroy the active doc and provider. Used by tests and project switching.
 */
export function destroyProjectDoc(): void {
  if (activeProvider) {
    activeProvider.destroy()
    activeProvider = null
  }
  if (activeDoc) {
    activeDoc.destroy()
    activeDoc = null
  }
  activeProjectId = null
  docReady = false
}
