/**
 * historyGraph — PURE commit-graph logic for the project file-history store
 * (Phase F, #196).
 *
 * No IndexedDB, no Y.Doc, no Date.now/randomUUID. Every mutating function is
 * pure: it takes a `ProjectHistory`, plus any externally-generated `id` /
 * `createdAt`, and returns a NEW `ProjectHistory`. This keeps the graph logic
 * fully unit-testable with plain objects (the project does not fake IndexedDB
 * in vitest — IDB I/O lives in `historyStore.ts` and is verified by
 * observation; the driver that supplies ids/timestamps lives in
 * `historyDriver.ts`).
 *
 * Model: git-style. Commits store ONLY the files that changed vs their parent
 * (full content per changed file — NOT Yjs deltas, so reconstruction is a
 * parent back-walk with no replay chain). `fileIndex` maps each file to the
 * commits that wrote it, for O(1)-ish per-file history. The current branch's
 * HEAD is the runtime authority.
 *
 * See `.planning/phase-F-history/PLAN.md` and RESEARCH.md for the locked
 * decisions (cadence, retention, commit form).
 */

export type CommitKind = 'seed' | 'auto' | 'manual' | 'fork'

export const MAIN_BRANCH = 'main'

export interface OrderSnapshot {
  /** folderPath → ordered child file ids */
  readonly fileOrder: Record<string, readonly string[]>
  /** parentPath → ordered subfolder names */
  readonly subfolderOrder: Record<string, readonly string[]>
}

export interface Commit {
  readonly id: string
  /** null only for a seed commit (a branch root). */
  readonly parent: string | null
  /** the branch this commit was created on. */
  readonly branch: string
  readonly kind: CommitKind
  readonly createdAt: number
  /** present on manual commits (Phase I) and the seed ('Initial'). */
  readonly label?: string
  /** ONLY files changed vs parent. fileId → full content. */
  readonly files: Readonly<Record<string, string>>
  /** structural order as of this commit (whole-project restore needs it). */
  readonly order?: OrderSnapshot
  /**
   * Set by retention pruning: this commit fell outside its display tier but
   * holds the nearest-writer copy of a file some retained commit still reads,
   * so it is kept on the STORAGE chain (back-walk traverses it) but HIDDEN
   * from the display lineage (`listCommits`/`fileHistory` skip it). This is
   * what lets only-changed-files pruning stay correct without a squash pass.
   * See historyRetention.ts + PV61.
   */
  readonly pinned?: boolean
}

export interface BranchRef {
  readonly head: string
  readonly createdAt: number
  /** commit this branch forked from; null for the root branch. */
  readonly createdFrom: string | null
}

export interface ProjectHistory {
  readonly projectId: string
  readonly commits: Readonly<Record<string, Commit>>
  readonly branches: Readonly<Record<string, BranchRef>>
  readonly currentBranch: string
  /** fileId → commit ids that wrote it, oldest-first. */
  readonly fileIndex: Readonly<Record<string, readonly string[]>>
}

// ── construction ──────────────────────────────────────────────────────────

/**
 * Create a fresh history with a single seed commit holding the full file set.
 * `files` is the complete current content of every file; `order` the current
 * structural order.
 */
export function seedHistory(
  projectId: string,
  files: Record<string, string>,
  order: OrderSnapshot | undefined,
  id: string,
  createdAt: number,
): ProjectHistory {
  const seed: Commit = {
    id,
    parent: null,
    branch: MAIN_BRANCH,
    kind: 'seed',
    createdAt,
    label: 'Initial',
    files: { ...files },
    order,
  }
  const fileIndex: Record<string, string[]> = {}
  for (const f of Object.keys(files)) fileIndex[f] = [id]
  return {
    projectId,
    commits: { [id]: seed },
    branches: { [MAIN_BRANCH]: { head: id, createdAt, createdFrom: null } },
    currentBranch: MAIN_BRANCH,
    fileIndex,
  }
}

// ── reads ───────────────────────────────────────────────────────────────

export function getCommit(h: ProjectHistory, commitId: string): Commit | undefined {
  return h.commits[commitId]
}

export function getCurrentBranch(h: ProjectHistory): string {
  return h.currentBranch
}

export function headOf(h: ProjectHistory, branch = h.currentBranch): string | null {
  return h.branches[branch]?.head ?? null
}

/**
 * Content of `fileId` as of `commitId` — the nearest writer at-or-before the
 * commit, found by walking parent links. Returns null if the file did not
 * exist at/before that commit. No replay chain.
 */
export function getFileContentAt(
  h: ProjectHistory,
  fileId: string,
  commitId: string,
): string | null {
  let walk: string | null = commitId
  while (walk !== null) {
    const c: Commit | undefined = h.commits[walk]
    if (!c) break
    if (Object.prototype.hasOwnProperty.call(c.files, fileId)) {
      return c.files[fileId]
    }
    walk = c.parent
  }
  return null
}

/**
 * The full file set (fileId → content) as of `commitId`, by back-walking and
 * taking the nearest writer of each file seen along the way.
 */
export function snapshotAt(
  h: ProjectHistory,
  commitId: string,
): { files: Record<string, string>; order?: OrderSnapshot } {
  const files: Record<string, string> = {}
  let order: OrderSnapshot | undefined
  let walk: string | null = commitId
  while (walk !== null) {
    const c: Commit | undefined = h.commits[walk]
    if (!c) break
    for (const f of Object.keys(c.files)) {
      if (!Object.prototype.hasOwnProperty.call(files, f)) files[f] = c.files[f]
    }
    // nearest order snapshot wins (closest to the target commit)
    if (order === undefined && c.order !== undefined) order = c.order
    walk = c.parent
  }
  return { files, order }
}

/**
 * Display lineage of a branch (HEAD → root via parent links), newest-first.
 * Skips `pinned` commits — they exist only to hold content for the back-walk
 * (see Commit.pinned), not for display.
 */
export function listCommits(h: ProjectHistory, branch = h.currentBranch): Commit[] {
  const head = h.branches[branch]?.head
  if (!head) return []
  const out: Commit[] = []
  let walk: string | null = head
  while (walk !== null) {
    const c: Commit | undefined = h.commits[walk]
    if (!c) break
    if (!c.pinned) out.push(c)
    walk = c.parent
  }
  return out
}

export function listBranches(h: ProjectHistory): Array<{ name: string } & BranchRef> {
  return Object.entries(h.branches).map(([name, ref]) => ({ name, ...ref }))
}

/**
 * Commits that wrote `fileId`, newest-first (fileIndex projection). Skips
 * `pinned` commits for display consistency with `listCommits`.
 */
export function fileHistory(h: ProjectHistory, fileId: string): Commit[] {
  const ids = h.fileIndex[fileId] ?? []
  const out: Commit[] = []
  for (let i = ids.length - 1; i >= 0; i--) {
    const c = h.commits[ids[i]]
    if (c && !c.pinned) out.push(c)
  }
  return out
}

/** Walk from `fromCommit` to the nearest commit (inclusive) that wrote `fileId`. */
export function nearestWriter(
  h: ProjectHistory,
  fromCommit: string,
  fileId: string,
): string | null {
  let walk: string | null = fromCommit
  while (walk !== null) {
    const c: Commit | undefined = h.commits[walk]
    if (!c) break
    if (Object.prototype.hasOwnProperty.call(c.files, fileId)) return walk
    walk = c.parent
  }
  return null
}

/** All files that exist (have a writer) at-or-before `commitId`. */
export function filesAliveAt(h: ProjectHistory, commitId: string): Set<string> {
  const alive = new Set<string>()
  let walk: string | null = commitId
  while (walk !== null) {
    const c: Commit | undefined = h.commits[walk]
    if (!c) break
    for (const f of Object.keys(c.files)) alive.add(f)
    walk = c.parent
  }
  return alive
}

// ── diffing ─────────────────────────────────────────────────────────────

/**
 * Subset of `liveFiles` whose content differs from its content at the given
 * commit (defaults to current-branch HEAD). Files absent at the commit count
 * as changed (new files). This is what a commit should store.
 */
export function changedFiles(
  h: ProjectHistory,
  liveFiles: Record<string, string>,
  baseCommit: string | null = headOf(h),
): Record<string, string> {
  const changed: Record<string, string> = {}
  for (const [f, content] of Object.entries(liveFiles)) {
    const at = baseCommit ? getFileContentAt(h, f, baseCommit) : null
    if (at !== content) changed[f] = content
  }
  return changed
}

// ── commit ────────────────────────────────────────────────────────────────

export interface CommitOpts {
  readonly kind: CommitKind
  readonly label?: string
  readonly id: string
  readonly createdAt: number
  readonly order?: OrderSnapshot
}

/**
 * Append a commit holding `changed` (already the changed-files subset) onto the
 * current branch's HEAD. Advances the branch head and updates fileIndex.
 * Returns the same history unchanged if `changed` is empty (nothing to commit).
 */
export function commitOnto(
  h: ProjectHistory,
  changed: Record<string, string>,
  opts: CommitOpts,
): ProjectHistory {
  if (Object.keys(changed).length === 0) return h
  const branch = h.currentBranch
  const parent = h.branches[branch]?.head ?? null
  const commit: Commit = {
    id: opts.id,
    parent,
    branch,
    kind: opts.kind,
    createdAt: opts.createdAt,
    ...(opts.label !== undefined ? { label: opts.label } : {}),
    files: { ...changed },
    ...(opts.order !== undefined ? { order: opts.order } : {}),
  }
  const fileIndex: Record<string, string[]> = {}
  for (const [f, ids] of Object.entries(h.fileIndex)) fileIndex[f] = [...ids]
  for (const f of Object.keys(changed)) {
    ;(fileIndex[f] ??= []).push(opts.id)
  }
  return {
    ...h,
    commits: { ...h.commits, [opts.id]: commit },
    branches: {
      ...h.branches,
      [branch]: { ...h.branches[branch], head: opts.id },
    },
    fileIndex,
  }
}

// ── branches ──────────────────────────────────────────────────────────────

/** Create a new branch whose head starts at `fromCommit`. */
export function createBranch(
  h: ProjectHistory,
  name: string,
  fromCommit: string,
  createdAt: number,
): ProjectHistory {
  if (h.branches[name]) throw new Error(`branch '${name}' already exists`)
  if (!h.commits[fromCommit]) throw new Error(`commit '${fromCommit}' not found`)
  return {
    ...h,
    branches: {
      ...h.branches,
      [name]: { head: fromCommit, createdAt, createdFrom: fromCommit },
    },
  }
}

/** Switch the current branch (changes the runtime authority). */
export function switchBranch(h: ProjectHistory, name: string): ProjectHistory {
  if (!h.branches[name]) throw new Error(`branch '${name}' not found`)
  if (name === h.currentBranch) return h
  return { ...h, currentBranch: name }
}
