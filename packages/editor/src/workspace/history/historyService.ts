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
  seedCommitId,
  isFileModifiedAt,
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

/**
 * Serialize all mutating ops. `current` mutation is synchronous, but the
 * `await saveHistory` is not — two concurrent triggers (idle debounce +
 * per-eval) open separate IDB transactions whose completion order isn't
 * guaranteed, so the shorter chain could land last and drop a commit (#201).
 * The lock makes each op's read-mutate-persist atomic w.r.t. the others.
 */
let opLock: Promise<unknown> = Promise.resolve()
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = opLock.then(fn, fn)
  opLock = run.then(notifyIfChanged, notifyIfChanged)
  return run
}

// ── reactivity ──────────────────────────────────────────────────────────
type Listener = () => void
const listeners = new Set<Listener>()
let lastNotified: ProjectHistory | null = null

function notifyIfChanged(): void {
  if (current === lastNotified) return // no-op commit / unchanged → skip
  lastNotified = current
  for (const l of listeners) {
    try {
      l()
    } catch {
      /* a listener error must not break others */
    }
  }
}

/** Subscribe to history changes (commit/restore/branch/switch/active-file). Returns unsubscribe. */
export function subscribeToHistory(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function notifyAll(): void {
  for (const l of listeners) {
    try {
      l()
    } catch {
      /* isolate listener errors */
    }
  }
}

// ── active file (for the History panel's File scope) ──────────────────────
let activeFileId: string | null = null

/** The app sets this on tab focus so File-scope history targets the right file. */
export function setActiveHistoryFile(fileId: string | null): void {
  if (fileId === activeFileId) return
  activeFileId = fileId
  notifyAll()
}

export function getActiveHistoryFile(): string | null {
  return activeFileId
}

// ── File History focus (the "File History" action, not a panel toggle) ─────
// When set, the History panel shows just this file's commit history with a
// "back to project" affordance. Set by the file-tree context menu action.
let fileHistoryTarget: string | null = null

/** Focus the History panel on one file's history (null = project graph). */
export function setFileHistoryTarget(fileId: string | null): void {
  if (fileId === fileHistoryTarget) return
  fileHistoryTarget = fileId
  notifyAll()
}

export function getFileHistoryTarget(): string | null {
  return fileHistoryTarget
}

/** The in-memory active history (null before init). For UI reads. */
export function getCurrentHistory(): ProjectHistory | null {
  return current
}

/**
 * Load (or, on first run, seed from the live workspace) the project's history.
 * Migration per RESEARCH Q3: legacy byte-snapshots are ignored — the live
 * workspace IS the newest state, so seed commit c0 from it.
 */
export function initHistory(projectId: string): Promise<ProjectHistory> {
  return withLock(async () => {
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
  })
}

/** Drop the in-memory state (project switch / teardown) and notify. */
export function resetHistoryState(): void {
  current = null
  notifyIfChanged()
}

export interface CommitWorkspaceOpts {
  /** apply the significance floor (idle path); false for eval/manual/restore. */
  readonly gate?: boolean
  readonly label?: string
  /**
   * Commit even when nothing changed since HEAD (label-only anchor). Used by
   * manual checkpoints (#199) so a user can name the current exact state; the
   * auto/eval paths leave this off and keep their no-op-when-unchanged return.
   */
  readonly allowEmpty?: boolean
  /**
   * Selective-file commit (#211, Tier 1.2 — the index-free analogue of git
   * staging): commit ONLY these file ids, leaving the rest of the working
   * changes uncommitted (captured by a later auto/eval commit). Filters the
   * computed diff to the subset before the empty-check. Absent = today's full
   * working-tree snapshot (auto/eval/restore stay byte-identical).
   */
  readonly only?: ReadonlySet<string>
}

/**
 * Capture the current workspace state as a commit on the current branch.
 * Returns the new commit id, or null if nothing changed (or the change was
 * below the significance floor when gated). Auto-commits trigger pruning.
 */
/** Locked: capture the workspace as a commit. See {@link commitWorkspace}. */
export function commitWorkspace(
  kind: CommitKind,
  opts: CommitWorkspaceOpts = {},
): Promise<string | null> {
  return withLock(() => _commit(kind, opts))
}

/** Unlocked commit body — call only from within `withLock`. */
async function _commit(
  kind: CommitKind,
  opts: CommitWorkspaceOpts = {},
): Promise<string | null> {
  if (!current) return null
  const live = readWorkspaceFiles()
  let changed = changedFiles(current, live)
  if (opts.only) {
    // selective commit (#211): keep only the chosen subset of the working
    // diff; the rest stays dirty for a later commit. Empty `only` → empty
    // diff (still allowed through when allowEmpty, e.g. a label anchor).
    const only = opts.only
    const subset: Record<string, string> = {}
    for (const f of Object.keys(changed)) if (only.has(f)) subset[f] = changed[f]
    changed = subset
  }
  const changedKeys = Object.keys(changed)
  if (changedKeys.length === 0 && !opts.allowEmpty) return null

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
    ...(opts.allowEmpty ? { allowEmpty: true } : {}),
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
export function restoreProject(commitId: string): Promise<void> {
  return withLock(async () => {
    if (!current) return
    const snap = snapshotAt(current, commitId)
    applySnapshot(snap.files, current.fileMeta, snap.order)
    await _commit('auto', { gate: false })
  })
}

/**
 * Restore a single file to its content at `commitId` (or delete it if it did
 * not exist then), then record a new commit. The Phase B (#191) primitive.
 */
export function restoreFileToCommit(
  fileId: string,
  commitId: string,
): Promise<string | null> {
  return withLock(() => _restoreFileToCommit(fileId, commitId))
}

/** Unlocked file-restore body — call only from within `withLock`. */
async function _restoreFileToCommit(
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
  return _commit('auto', { gate: false })
}

/**
 * Restore a file to its seed (commit 0) content — the universal "reset to
 * default" (#191): "revert to default" === restore to the seed commit. No-op
 * (null) if there's no active history or no seed. Computes the seed id INSIDE
 * the lock so a project switch can't cross the read/restore boundary.
 */
export function revertFileToSeed(fileId: string): Promise<string | null> {
  return withLock(async () => {
    if (!current) return null
    const seed = seedCommitId(current)
    if (!seed) return null
    return _restoreFileToCommit(fileId, seed)
  })
}

/**
 * Discard a file's uncommitted working changes (#211, Tier 1.1) — write its
 * live Y.Text back to its current-branch HEAD content (or remove the file if
 * it did not exist at HEAD). **Creates NO commit** — this is the crucial
 * distinction from {@link restoreFileToCommit}/{@link revertFileToSeed}, which
 * record an `auto` commit. Discard just throws away unsaved work, like
 * `git checkout -- <file>`. No-op when there's no history or no HEAD.
 *
 * Gated at the UI by `isViewing()` (PV62) alongside Restore/Fork; the panel is
 * the sanctioned write-gate while time-travelling.
 */
export function discardFileChanges(fileId: string): Promise<void> {
  return withLock(async () => {
    if (!current) return
    const head = headOf(current)
    if (!head) return
    const content = getFileContentAt(current, fileId, head)
    const live = readWorkspaceFiles()
    if (content === null) {
      delete live[fileId] // absent at HEAD → discarding means removing it
    } else {
      live[fileId] = content
    }
    const meta = current.fileMeta[fileId]
    applySnapshot(
      live,
      meta ? { ...current.fileMeta, [fileId]: meta } : current.fileMeta,
    )
    // No _commit: discard restores the working tree to HEAD without recording
    // a new commit (Discard ≠ Restore). `current` is unchanged, so the lock's
    // notifyIfChanged is a no-op — listeners that need the live-dirty refresh
    // (the panel's uncommitted section) ride subscribeToDocUpdate instead.
  })
}

/**
 * True if `fileId`'s live workspace content differs from current-branch HEAD.
 * A synchronous read (no mutation/persist → no lock needed) for the Phase D
 * file-tree badge and File-scope restore-button gating (#193). False when
 * there's no history or no HEAD yet.
 */
export function isFileModifiedSinceHead(fileId: string): boolean {
  if (!current) return false
  const head = headOf(current)
  if (!head) return false
  const live = readWorkspaceFiles()
  const liveContent = Object.prototype.hasOwnProperty.call(live, fileId)
    ? live[fileId]
    : null
  return isFileModifiedAt(current, fileId, head, liveContent)
}

/**
 * Live workspace content of `fileId` (null if absent) — the "current" side of
 * the diff viewer (#198). A plain synchronous read; no lock needed.
 */
export function getLiveFileContent(fileId: string): string | null {
  const live = readWorkspaceFiles()
  return Object.prototype.hasOwnProperty.call(live, fileId) ? live[fileId] : null
}

/**
 * The set of file ids whose live content differs from current-branch HEAD —
 * the whole dirty set in ONE pass (one workspace read + one `changedFiles`),
 * for the file-tree badge (#193). Prefer this over calling
 * `isFileModifiedSinceHead` per file, which re-reads the workspace each call
 * (O(N²) over the tree). Empty when there's no history or no HEAD.
 */
export function getModifiedFileIdsSinceHead(): ReadonlySet<string> {
  if (!current) return new Set()
  const head = headOf(current)
  if (!head) return new Set()
  return new Set(Object.keys(changedFiles(current, readWorkspaceFiles(), head)))
}

/** Create a branch at `fromCommit` (does not switch to it). */
export function createBranchAt(name: string, fromCommit: string): Promise<void> {
  return withLock(async () => {
    if (!current) return
    current = createBranch(current, name, fromCommit, now())
    await saveHistory(current)
  })
}

/**
 * "Fork to edit here" (#204 Decision E): branch from `commitId` into a fresh,
 * uniquely-named branch and switch to it, making that commit's snapshot the
 * live, editable HEAD. The caller exits the read-only time-travel view after
 * this resolves. Atomic in one lock (unique-name + create + switch + re-sync)
 * so a concurrent op can't collide on the generated name. Returns the new
 * branch name (or null if there's no active history).
 */
export function forkToEditFromCommit(commitId: string): Promise<string | null> {
  return withLock(async () => {
    if (!current) return null
    const existing = new Set(Object.keys(current.branches))
    const base = `edit-${commitId.slice(0, 6)}`
    let name = base
    let n = 2
    while (existing.has(name)) name = `${base}-${n++}`
    current = createBranch(current, name, commitId, now())
    current = switchBranch(current, name)
    const head = headOf(current)
    if (head) {
      const snap = snapshotAt(current, head)
      applySnapshot(snap.files, current.fileMeta, snap.order)
    }
    await saveHistory(current)
    return name
  })
}

/**
 * Switch the current branch and re-sync the workspace to that branch's HEAD
 * (the new runtime authority).
 */
export function switchToBranch(name: string): Promise<void> {
  return withLock(async () => {
    if (!current) return
    current = switchBranch(current, name)
    const head = headOf(current)
    if (head) {
      const snap = snapshotAt(current, head)
      applySnapshot(snap.files, current.fileMeta, snap.order)
    }
    await saveHistory(current)
  })
}
