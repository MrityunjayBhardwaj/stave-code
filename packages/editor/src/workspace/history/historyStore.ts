/**
 * historyStore — IndexedDB persistence for the project commit store (Phase F,
 * #196, Task 7).
 *
 * One row per project (keyPath `projectId`) holding the whole `ProjectHistory`
 * graph. Whole-row read/write keeps each commit operation a single atomic IDB
 * transaction — fewer writers, no cross-row races (the P78 lesson applied to
 * storage). Commit graphs are small (only-changed-files + tiered pruning), so
 * the whole-row cost is negligible.
 *
 * Shares the `stave-snapshots` database with the legacy `snapshotStore`. Both
 * open it at DB_VERSION 2 and create BOTH stores in `onupgradeneeded`
 * (idempotent), so whichever opens first leaves a consistent schema. The
 * legacy `snapshots` store is left untouched — migration seeds `c0` from the
 * live workspace (the newest state), per RESEARCH Q3 (discard old byte-
 * snapshots). `snapshotStore` is retired when StaveApp is rewired (Task 8).
 */

import type { ProjectHistory } from './historyGraph'

export const DB_NAME = 'stave-snapshots'
export const DB_VERSION = 2
export const HISTORY_STORE = 'history'
const LEGACY_STORE = 'snapshots'

/** Create both stores if absent. Shared upgrade logic (see module note). */
export function upgradeHistoryDb(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(LEGACY_STORE)) {
    const legacy = db.createObjectStore(LEGACY_STORE, { keyPath: 'id' })
    legacy.createIndex('byProject', 'projectId', { unique: false })
  }
  if (!db.objectStoreNames.contains(HISTORY_STORE)) {
    db.createObjectStore(HISTORY_STORE, { keyPath: 'projectId' })
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => upgradeHistoryDb(req.result)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Load a project's history, or null if none has been persisted yet. */
export async function loadHistory(projectId: string): Promise<ProjectHistory | null> {
  const db = await openDb()
  const row = await wrap<ProjectHistory | undefined>(
    db.transaction(HISTORY_STORE, 'readonly').objectStore(HISTORY_STORE).get(projectId),
  )
  db.close()
  return row ?? null
}

/** Persist a project's history (whole-row put). */
export async function saveHistory(h: ProjectHistory): Promise<void> {
  const db = await openDb()
  await wrap(
    db.transaction(HISTORY_STORE, 'readwrite').objectStore(HISTORY_STORE).put(h),
  )
  db.close()
}

/** Delete a project's history (used by tests / project deletion). */
export async function deleteHistory(projectId: string): Promise<void> {
  const db = await openDb()
  await wrap(
    db.transaction(HISTORY_STORE, 'readwrite').objectStore(HISTORY_STORE).delete(projectId),
  )
  db.close()
}
