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
   * File id of the viz file pinned as this project's backdrop
   * (promote-to-backdrop, #38). Absent when no backdrop is set. Kept
   * on project metadata (not in the Y.Doc) because the backdrop is a
   * per-user view preference rather than authored content — shouldn't
   * sync across collaborators when multi-user arrives.
   */
  readonly backgroundFileId?: string
  /**
   * Per-project crop region for the pinned backdrop. All values 0–1
   * fractional of the viz's full viewport. Absent when the backdrop
   * should render full-rect (default). Same storage rationale as
   * `backgroundFileId` — per-user view preference.
   */
  readonly backgroundCrop?: {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
  }
}

// ── IDB helpers ──────────────────────────────────────────────────────

const DB_NAME = 'stave-projects'
const DB_VERSION = 1
const STORE_NAME = 'projects'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
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
 * Pin or clear this project's backdrop file id. `null` removes the
 * field (project has no backdrop). No-op when the project doesn't
 * exist — caller is expected to have resolved a real project id.
 * Clearing the backdrop also clears any stored crop (a crop is
 * meaningless without the file it's cropping).
 */
export async function setProjectBackgroundFileId(
  id: string,
  fileId: string | null,
): Promise<void> {
  const db = await openDb()
  const store = tx(db, 'readwrite')
  const existing = await wrap<ProjectMeta | undefined>(store.get(id))
  if (existing) {
    const { backgroundFileId: _unusedFile, backgroundCrop: _unusedCrop, ...rest } =
      existing
    const next: ProjectMeta =
      fileId == null
        ? (rest as ProjectMeta)
        : { ...rest, backgroundFileId: fileId }
    await wrap(store.put(next))
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
