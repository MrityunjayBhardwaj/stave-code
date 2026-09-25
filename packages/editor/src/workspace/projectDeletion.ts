/**
 * projectDeletion — everything a project leaves on disk goes when it does
 * (#1784, part of #1780).
 *
 * A project lives in several places: its registry row (`stave-projects`), its
 * document (`stave-<id>`, written by y-indexeddb), and its history
 * (`stave-snapshots`). Deleting it used to drop the first two and leave the
 * history, which nothing could open again and which still counted toward the
 * quota. Like the ephemeral prune, the set is listed in ONE place, so a store
 * added later is added here once rather than at every caller.
 */

import { deleteProjectMeta } from './projectRegistry'
import { deleteProjectHistory } from './history/historyStore'

/** Delete y-indexeddb's database for a project's document. */
function deleteProjectDocDb(id: string): Promise<void> {
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
 * Delete a project: its registry row first, so it leaves every list at once,
 * then its document and its history.
 *
 * The last two are independent, so both are attempted even when one fails;
 * the first failure is then rethrown, so a caller is never told a delete
 * finished that did not.
 */
export async function deleteProject(id: string): Promise<void> {
  await deleteProjectMeta(id)
  const results = await Promise.allSettled([
    deleteProjectDocDb(id),
    deleteProjectHistory(id),
  ])
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed) throw failed.reason
}
