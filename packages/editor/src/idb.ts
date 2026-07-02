/**
 * Shared bounded IndexedDB open (#687).
 *
 * A raw `indexedDB.open(...)` can hang forever: it never fires `success` or
 * `error` when the database is blocked by another tab's older-version
 * connection, rejected in private mode, or corrupted. That was the "keeps on
 * loading" boot hang (#685) — but the same unbounded pattern lived at every
 * store that opens IDB (`stave-projects`, `stave-viz-presets`,
 * `stave-snapshots`, the shared history DB). The boot was guarded per #685/#686,
 * but non-boot crossings (listing projects, switching, auto-commit) were not.
 *
 * The invariant "IDB never hangs the app" spans all those modules, so the
 * fix is one shared helper rather than per-site guards: every raw open routes
 * through `openIdbWithTimeout`, which settles within `timeoutMs` no matter what
 * the browser does, and wires `onblocked` so a version-upgrade stalled behind
 * another tab rejects instead of waiting silently. Callers catch the rejection
 * and degrade gracefully (empty list / no-op) — see each store's public API.
 */

/** Default open budget. Matches `projectDoc`'s `IDB_SYNC_TIMEOUT_MS`. */
export const IDB_OPEN_TIMEOUT_MS = 8_000

export interface OpenIdbOptions {
  /** Override the open budget in ms. */
  readonly timeoutMs?: number
}

/**
 * Open an IndexedDB database, bounded so it can never hang.
 *
 * Resolves with the open connection, or rejects on timeout / `error` /
 * `blocked`. Exactly one outcome settles the promise; a `success` that fires
 * AFTER a timeout/blocked rejection closes the late connection so it doesn't
 * leak (and doesn't hold a lock that would block a later upgrade).
 *
 * @param name    database name
 * @param version schema version
 * @param upgrade runs on `upgradeneeded` — create/migrate object stores here
 */
export function openIdbWithTimeout(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
  opts: OpenIdbOptions = {},
): Promise<IDBDatabase> {
  const timeoutMs = opts.timeoutMs ?? IDB_OPEN_TIMEOUT_MS
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false
    const req = indexedDB.open(name, version)

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      // Don't cancel the open (not possible); just make sure a late success
      // doesn't leak an open connection holding a lock.
      req.onsuccess = () => {
        try {
          req.result.close()
        } catch {
          /* already gone */
        }
      }
      reject(new Error(`idb-open-timeout:${name}`))
    }, timeoutMs)

    req.onupgradeneeded = () => upgrade(req.result)

    req.onsuccess = () => {
      if (settled) {
        try {
          req.result.close()
        } catch {
          /* already gone */
        }
        return
      }
      settled = true
      clearTimeout(timer)
      resolve(req.result)
    }

    req.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(req.error ?? new Error(`idb-open-error:${name}`))
    }

    // Fires when a version upgrade is held up by another tab's open connection.
    // Waiting for it to clear is the exact hang we're bounding — reject now so
    // the caller degrades. (For our v1 stores this only fires on a real schema
    // bump with a stale tab open.)
    req.onblocked = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`idb-open-blocked:${name}`))
    }
  })
}
