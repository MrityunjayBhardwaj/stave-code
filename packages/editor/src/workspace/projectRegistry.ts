/**
 * ProjectRegistry — PM Phase 2.
 *
 * IDB-backed metadata store for the project list. Each project's actual
 * content lives in a separate y-indexeddb database (one Y.Doc per project).
 * This store only holds the lightweight metadata needed to populate the
 * sidebar without loading any Y.Doc.
 *
 * Follows the same raw IndexedDB pattern as VizPresetStore.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface ProjectMeta {
  readonly id: string
  readonly name: string
  readonly createdAt: number
  readonly lastOpenedAt: number
  /**
   * Per-project crop region for the pinned backdrop. All values 0–1
   * fractional of the viz's full viewport. Absent when the backdrop
   * should render full-rect (default). Kept on project metadata (not in
   * the Y.Doc) because the crop is a per-user view preference rather than
   * authored content — shouldn't sync across collaborators when
   * multi-user arrives. (The backdrop *file* is no longer stored here:
   * #347 made it per-tab in StrudelEditorClient, and #371 retired the
   * old project-global `backgroundFileId` slot.)
   */
  readonly backgroundCrop?: {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
  }
}

// ── IDB helpers ──────────────────────────────────────────────────────

import { openIdbWithTimeout } from '../idb'

const DB_NAME = 'stave-projects'
const DB_VERSION = 1
const STORE_NAME = 'projects'

function openDb(): Promise<IDBDatabase> {
  return openIdbWithTimeout(DB_NAME, DB_VERSION, (db) => {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
  })
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ── Public API ───────────────────────────────────────────────────────

/** List all projects, sorted by lastOpenedAt descending (most recent first). */
export async function listProjects(): Promise<ProjectMeta[]> {
  const db = await openDb()
  const all = await wrap<ProjectMeta[]>(tx(db, 'readonly').getAll())
  db.close()
  return all.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
}

/** Get a single project by id, or undefined if not found. */
export async function getProject(id: string): Promise<ProjectMeta | undefined> {
  const db = await openDb()
  const result = await wrap<ProjectMeta | undefined>(tx(db, 'readonly').get(id))
  db.close()
  return result
}

/** Get the most recently opened project, or undefined if none exist. */
export async function getLastOpenedProject(): Promise<ProjectMeta | undefined> {
  const list = await listProjects()
  return list[0]
}

/** Create a new project and return its metadata. */
export async function createProject(name: string): Promise<ProjectMeta> {
  const meta: ProjectMeta = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    lastOpenedAt: Date.now(),
  }
  const db = await openDb()
  await wrap(tx(db, 'readwrite').put(meta))
  db.close()
  return meta
}

/** Update the lastOpenedAt timestamp. Call when opening a project. */
export async function touchProject(id: string): Promise<void> {
  const db = await openDb()
  const store = tx(db, 'readwrite')
  const existing = await wrap<ProjectMeta | undefined>(store.get(id))
  if (existing) {
    await wrap(store.put({ ...existing, lastOpenedAt: Date.now() }))
  }
  db.close()
}

/**
 * Save or clear the backdrop crop region. `null` removes the field
 * (backdrop renders full-rect). No-op when the project doesn't
 * exist or has no backdrop file pinned.
 */
export async function setProjectBackgroundCrop(
  id: string,
  crop: { x: number; y: number; w: number; h: number } | null,
): Promise<void> {
  const db = await openDb()
  const store = tx(db, 'readwrite')
  const existing = await wrap<ProjectMeta | undefined>(store.get(id))
  if (existing) {
    const { backgroundCrop: _unused, ...rest } = existing
    const next: ProjectMeta =
      crop == null
        ? (rest as ProjectMeta)
        : { ...rest, backgroundCrop: crop }
    await wrap(store.put(next))
  }
  db.close()
}

/** Rename a project. */
export async function renameProject(id: string, name: string): Promise<void> {
  const db = await openDb()
  const store = tx(db, 'readwrite')
  const existing = await wrap<ProjectMeta | undefined>(store.get(id))
  if (existing) {
    await wrap(store.put({ ...existing, name }))
  }
  db.close()
}

/**
 * Delete a project's metadata. Also deletes the y-indexeddb database
 * for the project's Y.Doc content.
 */
export async function deleteProject(id: string): Promise<void> {
  // Delete metadata
  const db = await openDb()
  await wrap(tx(db, 'readwrite').delete(id))
  db.close()

  // Delete the y-indexeddb content database.
  // indexedDB.deleteDatabase is fire-and-forget (no await needed for
  // correctness, but we wrap it for clean error reporting).
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(`stave-${id}`)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    // onblocked fires if another tab has the DB open. In that case,
    // the delete is deferred until the other tab closes or releases.
    // For Phase 2 single-tab, this is fine.
    req.onblocked = () => resolve()
  })
}

/**
 * Duplicate a project. Creates a new metadata entry with a new id.
 * NOTE: does NOT duplicate the Y.Doc content — that requires loading
 * the source doc and creating a snapshot. For PM Phase 2, duplicate
 * creates an empty project with the same name + " (copy)". Full
 * content duplication is a Phase 3+ feature.
 */
export async function duplicateProject(id: string): Promise<ProjectMeta | undefined> {
  const source = await getProject(id)
  if (!source) return undefined
  return createProject(`${source.name} (copy)`)
}

// ── Ephemeral sessions (#688) ────────────────────────────────────────

/**
 * Id prefix for the in-memory ephemeral fallback session (boot dropped to
 * "Continue without saving"). Such a session has no registry entry and must
 * never persist one. The prefix is the tag that lets a later boot recognise
 * and prune any rows a background write left behind.
 */
export const EPHEMERAL_ID_PREFIX = 'ephemeral-'

export function isEphemeralProjectId(id: string): boolean {
  return id.startsWith(EPHEMERAL_ID_PREFIX)
}

/**
 * Delete any registry rows belonging to an ephemeral session. Used by the
 * boot-time prune (#688) to clear phantoms an ephemeral session may have left
 * if IDB recovered mid-session.
 */
export async function pruneEphemeralProjects(): Promise<void> {
  const db = await openDb()
  try {
    const keys = await wrap<IDBValidKey[]>(tx(db, 'readonly').getAllKeys())
    const ephemeral = keys.filter(
      (k): k is string => typeof k === 'string' && isEphemeralProjectId(k),
    )
    if (ephemeral.length) {
      // Issue every delete synchronously into one readwrite txn (before the
      // await) so the transaction stays active until they're all queued.
      const store = tx(db, 'readwrite')
      await Promise.all(ephemeral.map((k) => wrap(store.delete(k))))
    }
  } finally {
    db.close()
  }
}
