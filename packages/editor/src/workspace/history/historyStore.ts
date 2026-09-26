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
import {
  committed,
  openIdbWithTimeout,
  requestResult as wrap,
  transactionDone,
} from '../../idb'
import { isEphemeralProjectId } from '../projectRegistry'

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
  return openIdbWithTimeout(DB_NAME, DB_VERSION, (db) => upgradeHistoryDb(db))
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
  await committed(
    db.transaction(HISTORY_STORE, 'readwrite').objectStore(HISTORY_STORE).put(h),
  )
  db.close()
}

/**
 * Delete a project's commit history row only. Deleting a whole project uses
 * {@link deleteProjectHistory}, which also clears its snapshots.
 */
export async function deleteHistory(projectId: string): Promise<void> {
  const db = await openDb()
  await committed(
    db.transaction(HISTORY_STORE, 'readwrite').objectStore(HISTORY_STORE).delete(projectId),
  )
  db.close()
}

/**
 * Delete everything a project left in this database: its commit history and
 * any snapshots from the older snapshot store (#1784).
 *
 * Deleting a project used to drop its registry row and its document but leave
 * this row behind, where nothing could open it again and it still counted
 * toward the quota. Both stores are cleared in ONE transaction, awaited to
 * commit, so a refusal is heard rather than reported as done, and a project
 * is never left with its history gone but its snapshots kept.
 *
 * The older store has no writer left in the app; its rows exist only in
 * profiles from before the commit store. They are keyed by snapshot id, so
 * the project's rows are found through the `byProject` index.
 */
export async function deleteProjectHistory(projectId: string): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction([HISTORY_STORE, LEGACY_STORE], 'readwrite')
    // Listening before any request, so the transaction cannot finish unheard;
    // the catch only keeps a rejection from going unhandled if a read below
    // throws first.
    const done = transactionDone(tx)
    done.catch(() => {})
    tx.objectStore(HISTORY_STORE).delete(projectId)
    const snapshots = tx.objectStore(LEGACY_STORE)
    const keys = await wrap<IDBValidKey[]>(
      snapshots.index('byProject').getAllKeys(IDBKeyRange.only(projectId)),
    )
    for (const key of keys) snapshots.delete(key)
    await done
  } finally {
    db.close()
  }
}

/**
 * Delete history rows for ephemeral sessions (#688). History is keyed by
 * projectId, so ephemeral rows are those whose key carries the prefix.
 */
export async function pruneEphemeralHistory(): Promise<void> {
  const db = await openDb()
  try {
    const keys = await wrap<IDBValidKey[]>(
      db.transaction(HISTORY_STORE, 'readonly').objectStore(HISTORY_STORE).getAllKeys(),
    )
    const ephemeral = keys.filter(
      (k): k is string => typeof k === 'string' && isEphemeralProjectId(k),
    )
    if (ephemeral.length) {
      const store = db
        .transaction(HISTORY_STORE, 'readwrite')
        .objectStore(HISTORY_STORE)
      await Promise.all([
        ...ephemeral.map((k) => wrap(store.delete(k))),
        transactionDone(store.transaction),
      ])
    }
  } finally {
    db.close()
  }
}
