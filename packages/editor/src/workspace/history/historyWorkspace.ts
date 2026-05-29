/**
 * historyWorkspace — the impure bridge between the pure commit graph and the
 * live workspace Y.Doc (Phase F, #196, Task 4).
 *
 * Reads current workspace state into the plain shapes the graph commits, and
 * applies a reconstructed snapshot back onto the workspace. ALL writes go
 * through the `WorkspaceFile` public API (`setContent`/`createWorkspaceFile`/
 * `deleteWorkspaceFile`) so the Y.Text observers, y-indexeddb persistence, and
 * Monaco bindings all fire — this is the load-bearing path that #189/P78
 * showed must not be bypassed (writing the store directly skips the
 * choreography and the edit silently fails to render/persist).
 */

import {
  listWorkspaceFiles,
  setContent,
  createWorkspaceFile,
  deleteWorkspaceFile,
  getFolderOrder,
  setFolderOrder,
  getSubfolderOrder,
  setSubfolderOrder,
} from '../WorkspaceFile'
import type { OrderSnapshot, FileMeta } from './historyGraph'

/** Current content of every workspace file, keyed by id. */
export function readWorkspaceFiles(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of listWorkspaceFiles()) out[f.id] = f.content
  return out
}

/** Current structural metadata of every workspace file (for restore-recreate). */
export function readWorkspaceFileMeta(): Record<string, FileMeta> {
  const out: Record<string, FileMeta> = {}
  for (const f of listWorkspaceFiles()) {
    out[f.id] = {
      path: f.path,
      language: f.language,
      ...(f.meta !== undefined ? { meta: { ...f.meta } } : {}),
    }
  }
  return out
}

/**
 * Read folder/subfolder order for the folders that currently contain files.
 * Derives folders from file paths (the order API is keyed by folder path).
 */
export function readWorkspaceOrder(): OrderSnapshot {
  const folders = new Set<string>(['/'])
  for (const f of listWorkspaceFiles()) {
    const slash = f.path.lastIndexOf('/')
    folders.add(slash <= 0 ? '/' : f.path.slice(0, slash))
  }
  const fileOrder: Record<string, string[]> = {}
  const subfolderOrder: Record<string, string[]> = {}
  for (const folder of folders) {
    const fo = getFolderOrder(folder)
    if (fo.length > 0) fileOrder[folder] = [...fo]
    const so = getSubfolderOrder(folder)
    if (so.length > 0) subfolderOrder[folder] = [...so]
  }
  return { fileOrder, subfolderOrder }
}

/**
 * Make the workspace match `files` (id → content): revert content of existing
 * files, recreate files present in the snapshot but missing from the workspace
 * (using `fileMeta` for path/language/meta), and delete workspace files absent
 * from the snapshot. Best-effort restores `order` for the snapshot's folders.
 *
 * Returns the ids that could not be recreated (no metadata) so the caller can
 * surface a warning rather than silently dropping them.
 */
export function applySnapshot(
  files: Record<string, string>,
  fileMeta: Record<string, FileMeta>,
  order?: OrderSnapshot,
): { recreatedMissing: string[]; skippedNoMeta: string[] } {
  const current = listWorkspaceFiles()
  const currentIds = new Set(current.map((f) => f.id))
  const wantIds = new Set(Object.keys(files))

  // delete files no longer present in the snapshot
  for (const f of current) {
    if (!wantIds.has(f.id)) deleteWorkspaceFile(f.id)
  }

  const recreatedMissing: string[] = []
  const skippedNoMeta: string[] = []
  for (const [id, content] of Object.entries(files)) {
    if (currentIds.has(id)) {
      setContent(id, content) // revert content via the observed path
    } else {
      const m = fileMeta[id]
      if (m) {
        createWorkspaceFile(
          id,
          m.path,
          content,
          m.language,
          m.meta ? { ...m.meta } : undefined,
        )
        recreatedMissing.push(id)
      } else {
        skippedNoMeta.push(id)
      }
    }
  }

  if (order) {
    for (const [folder, ids] of Object.entries(order.fileOrder)) {
      setFolderOrder(folder, [...ids])
    }
    for (const [parent, names] of Object.entries(order.subfolderOrder)) {
      setSubfolderOrder(parent, [...names])
    }
  }

  return { recreatedMissing, skippedNoMeta }
}
