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
import { collectUnusedSounds } from './soundCollector'

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
 * Delete a project: its document database first, then its registry row and
 * its history.
 *
 * The document goes FIRST because deleting a whole database is the one
 * removal Firefox still allows once storage is at its limit: it refuses every
 * read-write transaction, deletes included, and a registry row delete done
 * first was refused before anything was freed (#1792, measured in Firefox
 * 148). The database delete frees the room the two row deletes after it need.
 *
 * The row and the history are independent, so both are attempted even when
 * one fails; the first failure is then rethrown, so a caller is never told a
 * delete finished that did not.
 */
export async function deleteProject(id: string): Promise<void> {
  await deleteProjectDocDb(id)
  const results = await Promise.allSettled([
    deleteProjectMeta(id),
    deleteProjectHistory(id),
  ])
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed) throw failed.reason
  // The project's sounds are now named by nothing unless another project
  // names them. Not awaited: a collection reads every project's document, and
  // the delete is done whether or not it finds anything to free (#1785).
  void collectUnusedSounds().then(
    (result) => console.info('[stave] after deleting a project:', describeCollect(result)),
    (err) => console.warn('[stave] collecting unused sounds failed:', err),
  )
}

function describeCollect(result: Awaited<ReturnType<typeof collectUnusedSounds>>): string {
  switch (result.kind) {
    case 'freed':
      return `freed ${result.bytes} bytes (${result.count} unused sounds)`
    case 'nothing-unused':
      return 'no unused sounds'
    case 'refused':
      return `the browser refused to delete (freed ${result.bytes} bytes first)`
    case 'could-not-check':
      return `could not check (${result.reason}${result.detail ? `: ${result.detail}` : ''})`
  }
}
