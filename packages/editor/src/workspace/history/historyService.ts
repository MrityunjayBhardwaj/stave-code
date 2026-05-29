/**
 * historyService — stateful orchestration for the project commit store
 * (Phase F, #196, Task 6). Combines the pure graph, the workspace bridge, and
 * IDB persistence behind a small imperative API the driver (cadence) and the
 * app (eval trigger, History panel, branch UI) call.
 *
 * Holds the active project's `ProjectHistory` in memory (mirrors projectDoc's
 * single-active-doc model). All ids/timestamps are generated HERE (crypto /
 * Date) and handed to the pure graph, keeping the graph deterministic.
 */

import {
  type ProjectHistory,
  type CommitKind,
  type FileMeta,
  seedHistory,
  commitOnto,
  changedFiles,
  getFileContentAt,
  snapshotAt,
  headOf,
  createBranch,
  switchBranch,
} from './historyGraph'
import { prune } from './historyRetention'
import { isSignificant } from './significance'
import {
  readWorkspaceFiles,
  readWorkspaceFileMeta,
  readWorkspaceOrder,
  applySnapshot,
} from './historyWorkspace'
import { loadHistory, saveHistory } from './historyStore'

let current: ProjectHistory | null = null

const newId = (): string => crypto.randomUUID()
const now = (): number => Date.now()

/** The in-memory active history (null before init). For UI reads. */
export function getCurrentHistory(): ProjectHistory | null {
  return current
}

/**
 * Load (or, on first run, seed from the live workspace) the project's history.
 * Migration per RESEARCH Q3: legacy byte-snapshots are ignored — the live
 * workspace IS the newest state, so seed commit c0 from it.
 */
export async function initHistory(projectId: string): Promise<ProjectHistory> {
  let h = await loadHistory(projectId)
  if (!h) {
    h = seedHistory(
      projectId,
      readWorkspaceFiles(),
      readWorkspaceOrder(),
      newId(),
      now(),
      readWorkspaceFileMeta(),
    )
    await saveHistory(h)
  }
  current = h
  return h
}

/** Drop the in-memory state (project switch / teardown). */
export function resetHistoryState(): void {
  current = null
}

export interface CommitWorkspaceOpts {
  /** apply the significance floor (idle path); false for eval/manual/restore. */
  readonly gate?: boolean
  readonly label?: string
}

/**
 * Capture the current workspace state as a commit on the current branch.
 * Returns the new commit id, or null if nothing changed (or the change was
 * below the significance floor when gated). Auto-commits trigger pruning.
 */
export async function commitWorkspace(
  kind: CommitKind,
  opts: CommitWorkspaceOpts = {},
): Promise<string | null> {
  if (!current) return null
  const live = readWorkspaceFiles()
  const changed = changedFiles(current, live)
  const changedKeys = Object.keys(changed)
  if (changedKeys.length === 0) return null

  if (opts.gate) {
    const head = headOf(current)
    const pairs = changedKeys.map((f) => ({
      prev: (head && getFileContentAt(current!, f, head)) || '',
      next: changed[f],
    }))
    if (!isSignificant(pairs)) return null
  }

  // capture latest metadata for changed files (for restore-recreate)
  const allMeta = readWorkspaceFileMeta()
  const changedMeta: Record<string, FileMeta> = {}
  for (const f of changedKeys) if (allMeta[f]) changedMeta[f] = allMeta[f]

  const id = newId()
  current = commitOnto(current, changed, {
    kind,
    ...(opts.label !== undefined ? { label: opts.label } : {}),
    id,
    createdAt: now(),
    order: readWorkspaceOrder(),
    fileMeta: changedMeta,
  })
  if (kind === 'auto') current = prune(current, now())
  await saveHistory(current)
  return id
}

/**
 * Restore the whole project to `commitId`'s state, then record the restore as
 * a new commit on the current branch (non-destructive — the prior state stays
 * in history).
 */
export async function restoreProject(commitId: string): Promise<void> {
  if (!current) return
  const snap = snapshotAt(current, commitId)
  applySnapshot(snap.files, current.fileMeta, snap.order)
  await commitWorkspace('auto', { gate: false })
}

/**
 * Restore a single file to its content at `commitId` (or delete it if it did
 * not exist then), then record a new commit. The Phase B (#191) primitive.
 */
export async function restoreFileToCommit(
  fileId: string,
  commitId: string,
): Promise<string | null> {
  if (!current) return null
  const content = getFileContentAt(current, fileId, commitId)
  const meta = current.fileMeta[fileId]
  // single-file apply: keep all other files at live latest
  const live = readWorkspaceFiles()
  if (content === null) {
    delete live[fileId]
  } else {
    live[fileId] = content
  }
  applySnapshot(live, meta ? { ...current.fileMeta, [fileId]: meta } : current.fileMeta)
  return commitWorkspace('auto', { gate: false })
}

/** Create a branch at `fromCommit` (does not switch to it). */
export async function createBranchAt(name: string, fromCommit: string): Promise<void> {
  if (!current) return
  current = createBranch(current, name, fromCommit, now())
  await saveHistory(current)
}

/**
 * Switch the current branch and re-sync the workspace to that branch's HEAD
 * (the new runtime authority).
 */
export async function switchToBranch(name: string): Promise<void> {
  if (!current) return
  current = switchBranch(current, name)
  const head = headOf(current)
  if (head) {
    const snap = snapshotAt(current, head)
    applySnapshot(snap.files, current.fileMeta, snap.order)
  }
  await saveHistory(current)
}
