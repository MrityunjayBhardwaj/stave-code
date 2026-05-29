# Phase F — Project Commit Store (PLAN)

**Milestone:** file-history · **Issue:** #196 · **Blocked by:** E (#195, research ✓)
**Unblocks:** B #191, D #193, G #197, H #198, I #199 · **Status:** DRAFT for review

Phase F is the **data layer** — it migrates the live snapshot system into a
git-style project commit store. No new UI shape (the existing Version History
panel is rewired to the new store; the rich graph is Phase G).

---

## 1. Goal (goal-backward)

> A project's edit history is captured as a chain of multi-file, atomic,
> branch-aware commits — created automatically on a tuned cadence, pruned by a
> tiered retention policy that never orphans a file's only copy, and queryable
> per-file. The current branch HEAD is the runtime authority.

**Success criteria (each must be observable, not inferred):**

| # | Criterion | Observation |
|---|---|---|
| S1 | Editing then idling 5s (with ≥significance) creates an auto-commit holding only the changed files | IDB inspection: new commit row, `files` = changed only |
| S2 | A successful eval creates a commit even below the significance floor | edit 1 char → eval → commit exists |
| S3 | `getFileContentAt(f, c)` returns f's content as of commit c via parent back-walk | unit test over a 3-commit chain where f changed in c0 and c2 |
| S4 | Retention keeps 24h-all / 30d-daily / older-monthly; manual+seed+fork survive forever | seeded-clock prune test |
| S5 | **keep-if-sole-writer**: pruning never deletes a commit holding a file's only reachable copy | prune test with a file last-written in an otherwise-prunable commit → commit pinned |
| S6 | Migration: existing `stave-snapshots` rows → newest becomes seed c0, older byte-snapshots discarded; no console errors on first load | load a project with legacy snapshots, observe c0 + clean console |
| S7 | Existing Version History panel still lists + restores (now backed by commits) | open panel, restore a commit, files revert |
| S8 | `createBranch`/`switchBranch` change the runtime authority; HEAD of current branch drives the workspace | fork → switch → workspace reflects fork HEAD |

---

## 2. Locked decisions (from E research, ratified 2026-05-29)

All 6 open questions resolved to their E-research leans (user reviewed E, "looks good"):

- **Q1 — per-eval bypasses significance floor:** YES. Eval = intentional checkpoint.
- **Q2 — significance unit:** changed-lines OR changed-chars (≥5 lines OR ≥200 chars) summed vs HEAD, on the idle path only.
- **Q3 — migration:** DISCARD legacy byte-snapshots; newest becomes seed `c0`. ⚠️ *Surfaced in §9 risks — this drops pre-feature history; confirm acceptable at review.*
- **Q4 — commit-on-unload:** YES (`visibilitychange`→hidden + `beforeunload`), significance-gated.
- **Q5 — B↔F sequencing:** B (#191) lands AFTER F as a thin query+write layer over this store. F exposes the primitives B needs.
- **Q6 — retire `MAX_AUTO_SNAPSHOTS` + `AUTO_SNAPSHOT_PREFIX`:** YES, once `kind` is authoritative.

---

## 3. Architecture — evolve, don't fork (domain-aligned)

The invariant span is **"project version history."** `snapshotStore.ts` already
owns it (manual + auto Y.Doc snapshots). The commit store owns the *same*
concern, richer. → **One module**, evolved in place — NOT a parallel
`commitStore.ts`. (Consolidation principle; "don't build parallel infra," #196.)

```
snapshotStore.ts  ──evolves into──▶  commit store
  keeps: openDb/wrap helpers, IDB plumbing, byProject index
  replaces: full-doc-bytes snapshot  →  only-changed-files commit
  adds: parent links, branches map, fileIndex, getFileContentAt back-walk
  adds: tiered retention + keep-if-sole-writer (replaces MAX_AUTO_SNAPSHOTS)
```

**Driver lives in the editor package, not the app.** The current 5×-too-slow
driver is in `StaveApp.tsx:368-400` (app layer). Move the cadence logic into a
testable editor-package module `historyDriver.ts` (subscribes via
`subscribeToDocUpdate`, owns the significance check + debounce), exposing
`startHistoryDriver(projectId)`. `StaveApp` calls it in one effect. (Lets us
unit-test cadence/significance without React; the app effect becomes a 3-liner.)

**Boundary owners (design lens):**

| Concern | Owner | Boundary risk (P78 — multi-writer) |
|---|---|---|
| Commit creation + storage | commit store (evolved snapshotStore) | — |
| When to commit (cadence/significance) | `historyDriver.ts` | over-commit / commit-storm if significance miscomputed |
| File content read/write | `WorkspaceFile.ts` (`setContent`, `listWorkspaceFiles`) | restore must go through `setContent` so the Y.Text observer + persistence fire |
| Runtime authority (which content renders) | current-branch HEAD → workspace Y.Doc | β override (Phase G) sits ABOVE this — out of scope here |

---

## 4. Data model (concrete)

```ts
type CommitKind = 'seed' | 'auto' | 'manual' | 'fork'

interface Commit {
  id: string                       // crypto.randomUUID()
  projectId: string
  parent: string | null            // null only for seed c0 (per branch root)
  branch: string                   // branch name this commit was made on
  kind: CommitKind
  createdAt: number
  label?: string                   // manual commits (Phase I); seed = 'Initial'
  files: Record<string, string>    // ONLY changed files vs parent; fileId → full content
  // file ORDER / structure: store fileOrder + subfolderOrder snapshots too
  order?: { fileOrder: Record<string,string[]>, subfolderOrder: Record<string,string[]> }
}

interface BranchRef { head: string; createdAt: number; createdFrom: string | null }

interface ProjectHistory {
  projectId: string                // keyPath
  commits: Record<string, Commit>
  branches: Record<string, BranchRef>
  currentBranch: string
  fileIndex: Record<string, string[]>  // fileId → commitIds that wrote it, in commit order
}
```

**IDB:** one row per project in store `history` (new store, `keyPath:'projectId'`)
inside DB `stave-snapshots`, `DB_VERSION: 2`. Whole `ProjectHistory` read/written
as one record (commit graphs are small; avoids cross-row transaction races —
P78 lesson: fewer writers, atomic write). Old `snapshots` store read once during
migration, then ignored.

> **Decision — order tracking:** commits also snapshot `fileOrder`/`subfolderOrder`
> (the current restore at `snapshotStore.ts:189-199` relies on them). Store on
> every commit (small) so restore is whole-state-correct.

---

## 5. Public API surface

```ts
// — writes —
commit(projectId, opts: {kind: CommitKind, label?: string}): Promise<string|null>
  // snapshots files changed vs current-branch HEAD; null if nothing changed
  // (idle path also gates on significance BEFORE calling commit)
createBranch(name: string, fromCommit: string): Promise<void>
switchBranch(name: string): Promise<void>     // updates currentBranch; caller re-syncs workspace to HEAD
restoreProject(commitId: string): Promise<void> // whole-project; writes files via WorkspaceFile, then commit(kind:'auto')
restoreFileToCommit(fileId, commitId): Promise<string>  // primitive for Phase B (#191); file-only + new commit

// — reads —
getCommit(commitId): Commit | undefined
listCommits(branch?: string): Commit[]          // newest-first; defaults to currentBranch lineage
listBranches(): BranchRef[]
getFileContentAt(fileId, commitId): string | null   // §6 back-walk
fileHistory(fileId): Commit[]                    // fileIndex projection, newest-first (Phase B/D)
getCurrentBranch(): string

// — driver (historyDriver.ts) —
startHistoryDriver(projectId): () => void        // wires idle+eval+unload; returns teardown
```

Back-compat shims (retire in G): `listSnapshots`→`listCommits` mapped to
`SnapshotMeta`; `restoreSnapshot`→`restoreProject`; `saveSnapshot(label)`→
`commit({kind:'manual',label})`. Keeps `StaveApp` Version-History panel working (S7).

---

## 6. `getFileContentAt` — parent back-walk (no replay chain)

```
walk = commitId
while walk != null:
  c = commits[walk]
  if fileId in c.files: return c.files[fileId]   // nearest writer
  walk = c.parent
return null   // file didn't exist at/before this commit
```

`fileIndex[fileId]` lets `fileHistory` skip the walk for listing. Significance
(idle path) diffs live `listWorkspaceFiles()` content vs `getFileContentAt(f, HEAD)`.

---

## 7. Auto-commit driver (`historyDriver.ts`)

Replaces `StaveApp.tsx:368-400`. Three triggers, all funnel through `maybeCommit`:

```
idle:   subscribeToDocUpdate(localOnly:true) → debounce 5s → maybeCommit('auto', {gate:true})
eval:   onEvaluateSuccess  → maybeCommit('auto', {gate:false})   // Q1 bypass
unload: visibilitychange(hidden)/beforeunload → maybeCommit('auto', {gate:true}) (sync-best-effort)

maybeCommit(kind, {gate}):
  changed = files where live content != getFileContentAt(f, HEAD)
  if changed.empty: return
  if gate AND significance(changed) < (5 lines OR 200 chars): return
  commit(projectId, {kind})   // store snapshots `changed` only
```

- Idle ms override via `localStorage["stave:autosnapIdleMs"]` (preserve test hook, `StaveApp.tsx:376`).
- Significance: sum over changed files of `max(lineDelta, 0)`; char delta = `abs(len - prevLen)` as cheap proxy (Q2). Helper `isSignificant(changed)` — unit-tested.
- Pending debounce still dropped on hard reload (acceptable); unload trigger narrows the loss window (Q4).

---

## 8. Retention + keep-if-sole-writer

Runs after each `commit(kind:'auto')` (same hook point as `snapshotStore.ts:87`).

```
prune(history):
  pinned = ∅
  // keep-if-sole-writer (S5): pin any commit that holds a file's only reachable copy
  for each branch B, for each fileId f reachable from B.head:
     soleWriter = the latest commit on B's lineage with f in .files
     pinned += soleWriter
  candidates = commits where kind=='auto' AND not in pinned
  // tier: bucket by local-date
  keep:  ≤24h → all ;  ≤30d → latest per day ;  >30d → latest per month
  delete = candidates − keep − pinned
  // never delete seed/manual/fork (kind check) or any branch head
  remove delete from commits + fileIndex
```

→ candidate **PV61** (keep-if-sole-writer). Assert in driver tests (S5); Phase I
proves manual/seed survival.

---

## 9. Migration (DB_VERSION 1→2)

`onupgradeneeded` adds the `history` store. On first `loadHistory(projectId)` with
no `history` row but existing `snapshots` rows:

```
legacy = listSnapshots(projectId) newest-first   // existing byte-snapshots
seedDoc = decode newest legacy snapshot's bytes → files map
c0 = {kind:'seed', parent:null, branch:'main', files: <all files from seedDoc>, label:'Initial'}
history = { commits:{c0}, branches:{main:{head:c0,...}}, currentBranch:'main', fileIndex: allFiles→[c0] }
// older legacy snapshots: DISCARDED (Q3)
```

If NO legacy snapshots either → seed c0 from current `listWorkspaceFiles()`.

> ⚠️ **RISK (Q3):** discarding old byte-snapshots drops any pre-feature manual
> saves a user made. Mitigation options at review: (a) accept (no graph existed,
> low expectation); (b) import each legacy *manual* snapshot as an isolated
> labelled commit (no parent chain). **Recommend (a)**; flag for user ratify.

---

## 10. Task breakdown (atomic commits, ordered)

1. **Schema + IDB v2** — types, `history` store, `openDb` v2 upgrade, `loadHistory`/`saveHistory` (whole-row). Unit: round-trip.
2. **Core commit ops** — `commit` (changed-vs-HEAD diff + fileIndex update), `getCommit`/`listCommits`, `getFileContentAt` back-walk. Unit: 3-commit chain (S3).
3. **Branches** — `createBranch`/`switchBranch`/`listBranches`/`getCurrentBranch`; HEAD authority. Unit: fork/switch (S8).
4. **Restore** — `restoreProject` (via `WorkspaceFile.setContent` + order) + `restoreFileToCommit`. Integration: edit→commit→edit→restore (S7).
5. **Retention + keep-if-sole-writer** — `prune`. Unit: tiered + sole-writer pin (S4, S5) → PV61.
6. **Driver** — `historyDriver.ts` (idle+eval+unload, significance). Unit: significance gate; integration: idle creates commit (S1), eval bypasses (S2).
7. **Migration** — v1→v2, seed c0, discard old (S6). Integration: load legacy project.
8. **Rewire app** — `StaveApp` uses `startHistoryDriver` + back-compat shims so Version History panel still works (S7). Retire `MAX_AUTO_SNAPSHOTS`/`AUTO_SNAPSHOT_PREFIX` (Q6).

Each step = one atomic commit. Steps 1-5 are pure editor-package logic (fast TDD);
6-8 touch the app boundary.

---

## 11. Test plan

- **Unit (vitest, editor pkg):** schema round-trip, commit diff, back-walk, branches, significance, prune (tiered + sole-writer). No React.
- **Integration:** migration from legacy; restore choreography; driver-creates-commit.
- **PV60 gate (mandatory):** every regression test stash-verified to fail without the fix; oscillation in commit body.
- **P78 awareness:** restore/commit touch the Yjs↔Monaco↔WorkspaceFile choreography that bit #189. Tests assert **post-choreography** state (after `setContent` observer + persistence settle), not mid-write. Probe the store AND the workspace file.
- **P72 deploy gate:** `pnpm --filter @stave/app build` before any PR (tsc + BUILD_ID), never trust vitest alone.
- **P66 watch:** `pnpm --filter @stave/editor dev` running before editing `packages/editor/src/`; grep-gate new symbols in `dist/index.js` pre-commit.

---

## 12. Pre-mortem (what makes this fail)

1. **Commit storm** — significance miscompute → commit per keystroke. *Guard:* unit-test `isSignificant` boundaries; observe IDB row count after a 60s typing session.
2. **fileIndex drift after prune** — delete a commit, forget to update fileIndex → `getFileContentAt` returns stale/null. *Guard:* S5 test + invariant assert that every fileIndex entry points to a live commit.
3. **Restore doesn't render** — wrote store but not through `WorkspaceFile.setContent`, so Y.Text observer/persistence/Monaco don't update (the #189 shape). *Guard:* restore goes through `setContent`; integration asserts workspace file + rendered editor.
4. **Migration data loss surprise** — user had manual saves pre-feature, Q3 discards them silently. *Guard:* §9 risk flagged for ratify; `log()` discarded count.
5. **Whole-row write contention** — two commits race on the single `ProjectHistory` row. *Guard:* serialize writes (driver is single-source; commit() awaits load→mutate→save in one IDB txn).

---

## 13. Out of scope (later phases)

- Commit graph SVG, scope toggle, branch selector UI, View/Restore/Fork buttons → **G (#197)**
- β viewing-override in `namedVizRegistry` → **G**
- Diff viewer → **H (#198)**
- Manual-commit UI + labels → **I (#199)** (F exposes `commit({kind:'manual',label})`; I builds the surface)
- Per-file restore *UI* → **B (#191)** (F exposes `restoreFileToCommit`)
- Branch merge → **L (deferred)**

---

## 14. As-built — Tasks 1–5 (pure data layer, committed; checkpoint)

Branch `feat/phase-F-history`. 35 history unit tests; full editor suite 1697 green.

**Module structure (deviation from "evolve snapshotStore in place"):** built a
new `workspace/history/` set because the project does NOT fake IndexedDB in
vitest — so the graph logic had to be PURE (plain-object testable) and split
from IDB I/O. This is layering, not parallel infra: `snapshotStore.ts` is
untouched and gets superseded/rewired at Task 8 (end state = one system).
- `historyGraph.ts` — pure model + ops (seed/commit/back-walk/branches/diff). `5787d3b`
- `significance.ts` — cheap diff-magnitude gate. `bba7b1d`
- `historyRetention.ts` — tiered prune + keep-if-sole-writer. `bba7b1d`
- `historyWorkspace.ts` — impure bridge (read workspace / applySnapshot restore). `fbdb5e6`

**Other deviations (all on EVIDENCE):**
1. **`pinned` display/storage split** (not in the plan's prune sketch): only-
   changed-files makes deleting a nearest-writer corrupt downstream views, so
   pruning keeps such commits `pinned` — on the back-walk chain, hidden from
   `listCommits`/`fileHistory`. → candidate **PV61**.
2. **`fileMeta` sidecar on ProjectHistory**: commits are content-only, so
   restore-recreate of a deleted file needs path/language/meta. Stored at
   history level (latest-wins). Limitation: uses latest meta, not as-of-commit
   (historical-path restore is a later refinement).
3. **Restore orchestration deferred to Task 6+**: `restoreProject`/
   `restoreFileToCommit` (applySnapshot + commitOnto + persist) need IDB +
   id/timestamp generation, so they live in the driver/service layer. Task 4
   delivered the testable load-bearing part (`applySnapshot`, the #189/P78
   write path through `setContent`).

**Remaining (Tasks 6–8, app boundary — observation-gated):**
- `historyStore.ts` — IDB v2 whole-row load/save + migration (newest legacy
  snapshot → seed c0, discard older; Q3 ratified discard).
- `historyDriver.ts` — idle-5s + per-eval(`onEvaluateSuccess`) + unload
  cadence, significance gate; calls commitOnto → persist → prune.
- restore orchestration + branch switch re-sync to workspace.
- `StaveApp` rewire: `startHistoryDriver`, back-compat shims so the existing
  Version History panel keeps working, retire `MAX_AUTO_SNAPSHOTS` /
  `AUTO_SNAPSHOT_PREFIX`.
- PV61 catalogue entry; Playwright observation (S1/S2/S6/S7/S8).
