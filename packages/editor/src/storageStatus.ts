/**
 * storageStatus — the one answer to "is my work on disk?" (#1778, E2E-6 #1704).
 *
 * A write the browser refuses for lack of room used to vanish: the stores
 * reported it saved (#1777) and the project document's writes, made by
 * y-indexeddb, are never awaited at all. This module is where every such
 * refusal lands, so the app can say so ONCE instead of each door inventing its
 * own sentence.
 *
 * ## Why "unsaved" clears only on a committed write of the whole document
 *
 * While storage is full, y-indexeddb drops each incremental update it fails to
 * write. A later small update that happens to fit does NOT bring those back —
 * the saved copy is still missing everything in between. Only a write of the
 * document's full state restores it, so that write committing is the only
 * thing allowed to say "saved" again (`retryDocSave` in `projectDoc`).
 */

export interface StorageStatus {
  /** When a write was first refused for space; null while nothing has been. */
  readonly fullSince: number | null
  /** Whether the open project holds edits its saved copy does not. */
  readonly documentUnsaved: boolean
}

const CLEAR: StorageStatus = { fullSince: null, documentUnsaved: false }

let status: StorageStatus = CLEAR
const listeners = new Set<() => void>()

function set(next: StorageStatus): void {
  if (next.fullSince === status.fullSince && next.documentUnsaved === status.documentUnsaved) return
  // A new object only on change, so `useSyncExternalStore` sees a stable
  // snapshot between changes.
  status = next
  for (const fn of listeners) fn()
}

/** The current status. Stable identity between changes. */
export function getStorageStatus(): StorageStatus {
  return status
}

/** Called on every change. Returns the unsubscribe. */
export function subscribeStorageStatus(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * A write was refused for space. `document` says the refused write was the
 * project document's, so its saved copy is now behind.
 */
export function noteStorageRefused(opts: { document?: boolean } = {}): void {
  set({
    fullSince: status.fullSince ?? Date.now(),
    documentUnsaved: status.documentUnsaved || Boolean(opts.document),
  })
}

/** The whole document state was written and COMMITTED: nothing is behind. */
export function noteDocumentSaved(): void {
  set(CLEAR)
}

/**
 * A different document is now open. Its saved copy is whatever loaded, so it
 * is not behind — but the disk is exactly as full as it was.
 */
export function noteDocumentReplaced(): void {
  set({ fullSince: status.fullSince, documentUnsaved: false })
}

/** Tests only. */
export function __resetStorageStatusForTests(): void {
  status = CLEAR
  listeners.clear()
}
