import type { EngineComponents } from '../engine/LiveCodingEngine'

/**
 * A user-authored visualization saved to IndexedDB.
 * Compiled to a VizDescriptor at runtime for use with .viz("name").
 */
export interface VizPreset {
  id: string
  name: string
  renderer: 'hydra' | 'p5'
  code: string
  requires: (keyof EngineComponents)[]
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// IndexedDB Store
// ---------------------------------------------------------------------------

const DB_NAME = 'stave-viz-presets'
const DB_VERSION = 1
const STORE_NAME = 'presets'

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

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const VizPresetStore = {
  async getAll(): Promise<VizPreset[]> {
    const db = await openDb()
    return wrap<VizPreset[]>(tx(db, 'readonly').getAll())
  },

  async get(id: string): Promise<VizPreset | undefined> {
    const db = await openDb()
    return wrap<VizPreset | undefined>(tx(db, 'readonly').get(id))
  },

  async put(preset: VizPreset): Promise<void> {
    const db = await openDb()
    await wrap(tx(db, 'readwrite').put(preset))
  },

  async delete(id: string): Promise<void> {
    const db = await openDb()
    await wrap(tx(db, 'readwrite').delete(id))
  },
}
