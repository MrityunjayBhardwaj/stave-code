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
let docReady = false

/**
 * Async init with IndexedDB persistence. Resolves after IDB sync
 * completes — all persisted files are in the Y.Doc when this returns.
 *
 * Must be called BEFORE any createWorkspaceFile / seedWorkspaceFile
 * calls to avoid the seed-vs-persisted race condition.
 */
export async function initProjectDoc(projectId: string): Promise<void> {
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

  // Dynamic import — avoids jsdom crash in tests
  const { IndexeddbPersistence } = await import('y-indexeddb')
  activeProvider = new IndexeddbPersistence(`stave-${projectId}`, activeDoc)

  await activeProvider.whenSynced
  docReady = true
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
  docReady = false
}
