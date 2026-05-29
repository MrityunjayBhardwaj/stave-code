/**
 * SnapshotStore — PM Phase 4 (version history, MVP).
 *
 * IDB-backed store for project Y.Doc snapshots. One shared database
 * keyed by `${projectId}:${snapshotId}` — each value is a serialized
 * Y.Doc update (Uint8Array) captured via Y.encodeStateAsUpdate.
 *
 * MVP scope: manual save only, no auto-snapshot. Restore replaces the
 * current doc state by constructing a fresh Y.Doc from the snapshot
 * bytes and transferring its file-map contents into the active doc.
 */

import * as Y from 'yjs'
import { getActiveDoc } from './projectDoc'
import { DB_VERSION, upgradeHistoryDb } from './history/historyStore'

const DB_NAME = 'stave-snapshots'
const STORE_NAME = 'snapshots'

export interface SnapshotMeta {
  readonly id: string
  readonly projectId: string
  readonly label: string
  readonly createdAt: number
  readonly kind?: 'manual' | 'auto'
}

/**
 * Marker prefix for labels of snapshots created by the auto-snapshot
 * debouncer. Matching by this prefix lets the UI distinguish them
 * from manual saves without a separate schema field on older rows.
 */
export const AUTO_SNAPSHOT_PREFIX = 'Auto — '

export interface StoredSnapshot extends SnapshotMeta {
  readonly bytes: Uint8Array
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    // Shared DB with the project commit store (history/historyStore). Use the
    // shared upgrade so whichever store opens first leaves both schemas intact.
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

/**
 * Capture the active Y.Doc as a snapshot tied to the given project.
 * Returns the saved metadata. When `kind` is 'auto', prunes older
 * auto-snapshots for the project down to `MAX_AUTO_SNAPSHOTS`.
 */
const MAX_AUTO_SNAPSHOTS = 10

export async function saveSnapshot(
  projectId: string,
  label: string,
  kind: 'manual' | 'auto' = 'manual',
): Promise<SnapshotMeta> {
  const doc = getActiveDoc()
  const bytes = Y.encodeStateAsUpdate(doc)
  const meta: SnapshotMeta = {
    id: crypto.randomUUID(),
    projectId,
    label: label.trim() || 'Untitled snapshot',
    createdAt: Date.now(),
    kind,
  }
  const record: StoredSnapshot = { ...meta, bytes }
  const db = await openDb()
  await wrap(
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record),
  )
  if (kind === 'auto') {
    // Find all auto-snapshots for this project, sorted newest-first.
    const index = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .index('byProject')
    const all = await wrap<StoredSnapshot[]>(index.getAll(projectId))
    const autos = all
      .filter(
        (r) => r.kind === 'auto' || r.label.startsWith(AUTO_SNAPSHOT_PREFIX),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
    const toDelete = autos.slice(MAX_AUTO_SNAPSHOTS)
    if (toDelete.length > 0) {
      const wstore = db
        .transaction(STORE_NAME, 'readwrite')
        .objectStore(STORE_NAME)
      for (const r of toDelete) await wrap(wstore.delete(r.id))
    }
  }
  db.close()
  return meta
}

/**
 * List all snapshots for a project, newest first. Bytes are omitted —
 * callers must call `loadSnapshot` to fetch the payload.
 */
export async function listSnapshots(projectId: string): Promise<SnapshotMeta[]> {
  const db = await openDb()
  const index = db
    .transaction(STORE_NAME, 'readonly')
    .objectStore(STORE_NAME)
    .index('byProject')
  const all = await wrap<StoredSnapshot[]>(index.getAll(projectId))
  db.close()
  return all
    .map(({ bytes: _bytes, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Delete a snapshot by id. No-op if the id doesn't exist.
 */
export async function deleteSnapshot(id: string): Promise<void> {
  const db = await openDb()
  await wrap(
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id),
  )
  db.close()
}

/**
 * Restore a snapshot into the currently active Y.Doc. The snapshot's
 * file set REPLACES the current file set. Implementation: rehydrate a
 * temporary Y.Doc from bytes, then in one transaction on the active
 * doc (a) delete all existing files and (b) recreate each file from
 * the snapshot.
 *
 * Callers must refresh UI state via `resetFileStore()` after this
 * returns so cached snapshots re-sync with the new doc contents.
 */
export async function restoreSnapshot(id: string): Promise<void> {
  const db = await openDb()
  const stored = await wrap<StoredSnapshot | undefined>(
    db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id),
  )
  db.close()
  if (!stored) throw new Error(`snapshot ${id} not found`)

  const snapDoc = new Y.Doc()
  Y.applyUpdate(snapDoc, stored.bytes)
  const snapFiles = snapDoc.getMap('files') as Y.Map<Y.Map<unknown>>
  const snapOrder = snapDoc.getMap('fileOrder') as Y.Map<Y.Array<string>>
  const snapSubOrder = snapDoc.getMap('subfolderOrder') as Y.Map<Y.Array<string>>

  const activeDoc = getActiveDoc()
  const activeFiles = activeDoc.getMap('files') as Y.Map<Y.Map<unknown>>
  const activeOrder = activeDoc.getMap('fileOrder') as Y.Map<Y.Array<string>>
  const activeSubOrder = activeDoc.getMap('subfolderOrder') as Y.Map<Y.Array<string>>

  activeDoc.transact(() => {
    // Clear existing files + order
    for (const key of Array.from(activeFiles.keys())) activeFiles.delete(key)
    for (const key of Array.from(activeOrder.keys())) activeOrder.delete(key)
    for (const key of Array.from(activeSubOrder.keys())) activeSubOrder.delete(key)

    // Copy files from snapshot
    for (const [fid, snapFile] of snapFiles.entries()) {
      const clone = new Y.Map<unknown>()
      clone.set('id', snapFile.get('id'))
      clone.set('path', snapFile.get('path'))
      clone.set('language', snapFile.get('language'))
      const meta = snapFile.get('meta')
      if (meta !== undefined) clone.set('meta', meta)
      const content = new Y.Text()
      const srcText = snapFile.get('content') as Y.Text
      content.insert(0, srcText.toString())
      clone.set('content', content)
      activeFiles.set(fid, clone)
    }

    // Copy order (files + subfolders)
    for (const [folder, arr] of snapOrder.entries()) {
      const next = new Y.Array<string>()
      next.push(arr.toArray())
      activeOrder.set(folder, next)
    }
    for (const [folder, arr] of snapSubOrder.entries()) {
      const next = new Y.Array<string>()
      next.push(arr.toArray())
      activeSubOrder.set(folder, next)
    }
  })

  snapDoc.destroy()
}
