/**
 * soundCollector — free the bytes of sounds no project uses (#1785, part of #1780).
 *
 * Sound bytes live once per content hash in `stave-assets` and are shared by
 * every project that holds a record naming that hash (`assetStore`). Nothing
 * used to remove bytes nobody names any more: deleting a project, or a sound
 * from one, left them on disk where they still counted toward the quota. This
 * module is a mark-and-sweep over those bytes.
 *
 * ## It deletes only what nothing can reach, and nothing when it cannot be sure
 *
 * A blob is deleted only when NO project's document names its hash. The marks
 * come from:
 *
 * - the open project's in-memory document, which also holds records the disk
 *   refused (#1778), and
 * - the saved document of EVERY project on disk, the open one included, since
 *   a session that fell back to memory has an empty doc over a full database.
 *
 * Each of these stops the collection before any delete and says why
 * ({@link CollectResult}): a saved document that cannot be read, another Stave
 * tab open (its memory may hold records the disk never got), or a browser
 * without the two APIs the checks need. "Could not check" is never folded into
 * "nothing to free".
 *
 * Snapshots and history are NOT references: restoring a snapshot copies files
 * only, and undo tracks files only, so neither can bring a sound record back.
 *
 * ## Reading another project writes nothing
 *
 * A saved document is read straight from y-indexeddb's `updates` store, in a
 * read-only transaction, into a throwaway `Y.Doc`. Opening it through
 * `IndexeddbPersistence` would write a compacted copy back on load, which a
 * full disk refuses (and which the open project's refusal listener would not
 * even hear).
 *
 * ## It cannot race a sound being added
 *
 * Adding a sound is two steps: `putAsset` stores the bytes, then
 * `addAssetRecord` writes the reference. Between them the bytes look unused.
 * Every door that adds a record runs both steps inside {@link withSoundRefsLock},
 * and a collection holds the same lock from its first mark to its last delete.
 */

import * as Y from 'yjs'

import { IdbMissingError, openIdbWithTimeout, requestResult } from '../idb'
import { listAssetRecords } from './assetDoc'
import type { AssetRecord } from './assetNaming'
import { deleteAsset, listAssets, type StoredAssetMeta } from './assetStore'
import { listProjects } from './projectRegistry'

/** What one collection did. */
export type CollectResult =
  | {
      readonly kind: 'freed'
      /** Bytes of the blobs deleted, from the store's own `size`. */
      readonly bytes: number
      /** How many blobs were deleted. */
      readonly count: number
    }
  | { readonly kind: 'nothing-unused' }
  | {
      readonly kind: 'could-not-check'
      readonly reason: CouldNotCheckReason
      /** The database that could not be read, for `unreadable-project`. */
      readonly detail?: string
    }

export type CouldNotCheckReason =
  /** Another Stave tab is open; its memory may name sounds the disk does not. */
  | 'other-tab'
  /** A project's saved document could not be opened or read. */
  | 'unreadable-project'
  /** The browser has no Web Locks, so neither tabs nor imports can be checked. */
  | 'no-locks'
  /** The browser cannot list its databases, so projects could be missed. */
  | 'no-database-list'

/** The Web Lock every open Stave tab holds, shared, for its whole life. */
export const TAB_LOCK = 'stave-tab'
/** The Web Lock around "store bytes, then write the record", and a collection. */
export const SOUND_REFS_LOCK = 'stave-sound-refs'

const PROJECT_DB_PREFIX = 'stave-'
/** y-indexeddb's store of document updates (`y-indexeddb.js` `updatesStoreName`). */
const UPDATES_STORE = 'updates'
/**
 * The version y-indexeddb creates its databases at: lib0's `openDB` opens with
 * no version, which creates version 1. Opening at a lower version than a
 * database has fails, so a future bump reads as unreadable (fail closed).
 */
const PROJECT_DB_VERSION = 1

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// ---------------------------------------------------------------------------
// Pure parts
// ---------------------------------------------------------------------------

/**
 * Which databases hold a project document.
 *
 * Every registry project that has a database, PLUS every `stave-<uuid>`
 * database the registry does not list: a document whose registry row is gone
 * (a delete interrupted between the two) still protects the sounds it names.
 * Other `stave-*` databases (`stave-assets`, `stave-projects`, …) are not
 * project documents and are never opened here.
 */
export function projectDocDbNames(
  existing: readonly string[],
  registryIds: readonly string[],
): string[] {
  const names = new Set<string>()
  const present = new Set(existing)
  for (const id of registryIds) {
    const name = PROJECT_DB_PREFIX + id
    if (present.has(name)) names.add(name)
  }
  for (const name of existing) {
    if (name.startsWith(PROJECT_DB_PREFIX) && UUID.test(name.slice(PROJECT_DB_PREFIX.length))) {
      names.add(name)
    }
  }
  return Array.from(names).sort()
}

/** The blob hashes a saved document's records name, from its raw updates. */
export function hashesInDocUpdates(updates: readonly Uint8Array[]): Set<string> {
  const doc = new Y.Doc()
  try {
    // One transaction, as y-indexeddb applies them on load.
    Y.transact(doc, () => {
      for (const update of updates) Y.applyUpdate(doc, update)
    })
    return hashesInRecords(Array.from((doc.getMap('assets') as Y.Map<AssetRecord>).values()))
  } finally {
    doc.destroy()
  }
}

/** The blob hashes a set of records names. */
export function hashesInRecords(records: readonly Pick<AssetRecord, 'blobHash'>[]): Set<string> {
  const hashes = new Set<string>()
  for (const record of records) {
    if (typeof record?.blobHash === 'string') hashes.add(record.blobHash)
  }
  return hashes
}

/** The stored blobs no mark names, and their total size. */
export function planSweep(
  blobs: readonly StoredAssetMeta[],
  marked: ReadonlySet<string>,
): { readonly unused: StoredAssetMeta[]; readonly bytes: number } {
  const unused = blobs.filter((b) => !marked.has(b.hash))
  return { unused, bytes: unused.reduce((n, b) => n + b.size, 0) }
}

/**
 * How many OTHER tabs hold the tab lock, from a lock snapshot taken while this
 * tab holds its own. Pending requests count too: a tab still starting up has
 * asked for the lock and will soon hold a document.
 */
export function otherTabCount(snapshot: LockManagerSnapshot): number {
  const holders = [...(snapshot.held ?? []), ...(snapshot.pending ?? [])].filter(
    (l) => l.name === TAB_LOCK,
  ).length
  return Math.max(0, holders - 1)
}

// ---------------------------------------------------------------------------
// Tab presence
// ---------------------------------------------------------------------------

let tabLockHeld: Promise<boolean> | null = null

/**
 * Hold this tab's shared {@link TAB_LOCK} until the page goes away, so another
 * tab's collection can see this one is open. Resolves true once granted;
 * false when the browser has no Web Locks. Idempotent.
 *
 * The app calls it at boot. A tab that never did would be invisible to a
 * collection in another tab, which could then delete a sound only this tab's
 * memory names.
 */
export function holdTabPresence(): Promise<boolean> {
  if (tabLockHeld) return tabLockHeld
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks) {
    tabLockHeld = Promise.resolve(false)
    return tabLockHeld
  }
  tabLockHeld = new Promise<boolean>((granted) => {
    // The callback's promise never settles, so the lock is held until the
    // page unloads, which releases it.
    void locks.request(TAB_LOCK, { mode: 'shared' }, () => {
      granted(true)
      return new Promise<never>(() => {})
    })
  })
  return tabLockHeld
}

// ---------------------------------------------------------------------------
// The lock around adding a sound
// ---------------------------------------------------------------------------

/**
 * Run "store the bytes, then write the record" so no collection can run in
 * between (see the header). Without Web Locks it just runs `fn`: collections
 * refuse to run there, so there is nothing to exclude.
 */
export async function withSoundRefsLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks) return fn()
  return locks.request(SOUND_REFS_LOCK, { mode: 'exclusive' }, fn) as Promise<T>
}

// ---------------------------------------------------------------------------
// Reading a saved document without writing to it
// ---------------------------------------------------------------------------

/**
 * The blob hashes a project's saved document names. A database deleted since
 * it was listed names nothing. Any other failure rejects.
 */
async function hashesInSavedDoc(dbName: string): Promise<Set<string>> {
  let db: IDBDatabase
  try {
    db = await openIdbWithTimeout(dbName, PROJECT_DB_VERSION, () => {}, { mustExist: true })
  } catch (err) {
    if (err instanceof IdbMissingError) return new Set()
    throw err
  }
  try {
    const updates = await requestResult<Uint8Array[]>(
      db.transaction(UPDATES_STORE, 'readonly').objectStore(UPDATES_STORE).getAll(),
    )
    return hashesInDocUpdates(updates)
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// The collection
// ---------------------------------------------------------------------------

/** Injectable edges, so a test can stand in for the browser. */
export interface CollectDeps {
  /** The open project's records, from memory. */
  readonly openRecords?: () => readonly AssetRecord[]
}

/**
 * Delete the stored bytes of every sound no project names. See the header for
 * what it marks and when it refuses.
 */
export async function collectUnusedSounds(deps: CollectDeps = {}): Promise<CollectResult> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks) return { kind: 'could-not-check', reason: 'no-locks' }
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
    return { kind: 'could-not-check', reason: 'no-database-list' }
  }
  // This tab's own lock must be held before counting, or "one holder" could be
  // another tab rather than this one.
  if (!(await holdTabPresence())) return { kind: 'could-not-check', reason: 'no-locks' }

  return locks.request(SOUND_REFS_LOCK, { mode: 'exclusive' }, async (): Promise<CollectResult> => {
    // Inside the lock: a tab that opens after this check cannot add a sound
    // before the collection ends, because adding one takes the same lock.
    if (otherTabCount(await locks.query()) > 0) {
      return { kind: 'could-not-check', reason: 'other-tab' }
    }

    const marked = hashesInRecords((deps.openRecords ?? listAssetRecords)())

    const existing = (await indexedDB.databases())
      .map((d) => d.name)
      .filter((n): n is string => typeof n === 'string')
    const registryIds = (await listProjects()).map((p) => p.id)
    for (const dbName of projectDocDbNames(existing, registryIds)) {
      let hashes: Set<string>
      try {
        hashes = await hashesInSavedDoc(dbName)
      } catch {
        return { kind: 'could-not-check', reason: 'unreadable-project', detail: dbName }
      }
      for (const h of hashes) marked.add(h)
    }

    const { unused, bytes } = planSweep(await listAssets(), marked)
    if (unused.length === 0) return { kind: 'nothing-unused' }
    for (const blob of unused) await deleteAsset(blob.hash)
    return { kind: 'freed', bytes, count: unused.length }
  })
}
