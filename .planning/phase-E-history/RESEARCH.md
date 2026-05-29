# Phase E — RESEARCH: auto-commit cadence, retention, significance

**Milestone:** file-history (plan locked 2026-05-29)
**Issue:** #195 · **Blocks:** Phase F (#196) · **Status:** DRAFT for review

This phase locks the *policy* knobs before Phase F builds the commit store.
It is grounded in the **existing** snapshot system — Phase F is a migration of
a running mechanism, not greenfield.

---

## 0. Grounded baseline — what exists TODAY

A snapshot/version-history system is already shipped and live. Every decision
below is a *change to* this, not an invention.

| Aspect | Current behaviour | Citation |
|---|---|---|
| **Cadence** | Idle-debounced **60s**, fired by `subscribeToDocUpdate({localOnly:true})`. No per-save, no significance gate. Pending save **dropped** on reload / project-switch. | `StaveApp.tsx:368-400` (`IDLE_MS = 60_000` line 380) |
| **Test override** | Idle ms shortened via `localStorage["stave:autosnapIdleMs"]` | `StaveApp.tsx:376-380` |
| **Storage form** | **Full Y.Doc bytes** per snapshot (`Y.encodeStateAsUpdate(doc)`) — every snapshot is a complete copy of the whole project doc, NOT per-file. | `snapshotStore.ts:74` |
| **Schema** | Flat list, keyed by `id`. Fields: `{id, projectId, label, createdAt, kind, bytes}`. **No `parent`, no `branch`, no `fileIndex`.** IDB `stave-snapshots` / store `snapshots` / index `byProject`. `DB_VERSION = 1`. | `snapshotStore.ts:16-52` |
| **Retention** | `kind:'auto'` pruned to **MAX_AUTO_SNAPSHOTS = 10**, newest-first. Flat count cap, no time-bucketing. `kind:'manual'` never pruned (already effectively exempt). | `snapshotStore.ts:66, 87-106` |
| **Restore** | Replace-ALL-files: rehydrate temp Y.Doc, clear active `files`/`fileOrder`/`subfolderOrder`, recopy. | `snapshotStore.ts:149-203` |
| **UI** | "Version History" panel; `listSnapshots` refresh on panel open; manual save / delete / restore handlers. | `StaveApp.tsx:330-361` |

**Implication:** the file-history milestone *replaces* this storage form
(full-doc-bytes → only-changed-files), *re-shapes* the schema (flat → commit
graph with branches + fileIndex), and *re-tunes* the cadence and retention.
Phase F owns the migration; Phase E specs what it migrates **to**.

---

## 1. Knob — Auto-commit cadence

**LOCKED:** Three triggers, OR'd, all gated by a significance check.

| Trigger | Spec | Rationale |
|---|---|---|
| **Idle-debounced** | 5s after last doc mutation (down from 60s) | 60s loses fine-grained history in a live-coding flow where meaningful state changes every few seconds. 5s + significance gate keeps it cheap. |
| **Per-evaluation** | Commit on `onEvaluateSuccess` (the live-coding "save" — the moment a pattern produces sound) | Stave has **no save action**; files persist continuously via Yjs. The semantic checkpoint a musician cares about is "the state that produced *this* sound." `onEvaluateSuccess` exists: `LiveCodingRuntime.ts:619`, wired `StrudelEditorClient.tsx:411`. |
| **Significance** | Gate on BOTH idle and eval triggers: only commit when, vs current branch HEAD, **≥5 changed lines OR ≥200 changed chars** (summed across all changed files) | Prevents a commit-per-keystroke at 5s idle and a commit-storm on bulk paste. The eval trigger may bypass the floor (see open question Q1). |

**"Per-save" → "per-evaluation" is a reinterpretation.** The locked plan said
"per-save"; Stave has no save, so the faithful translation is per-eval. Flagged
for ratification (Q1).

**Pending-save-on-reload (`StaveApp.tsx:371-372`):** current code drops the
pending debounce on reload. For auto-commits this is acceptable (next edit
re-arms). Phase F should additionally **commit-on-unload** (`beforeunload` /
`visibilitychange`) so the last few seconds of work aren't lost — cheap, and
the significance gate keeps it from spamming. (Q4.)

**Significance computation:** requires a per-file diff vs HEAD. With the
only-changed-files form (§3) + `fileIndex`, this is `getFileContentAt(fileId,
head)` vs live Y.Text per file. Char/line delta is the cheap default; structural
(AST) diff is rejected for v1 (over-engineered, and a 1-char param change in a
`.viz` *should* be catchable — see Q2).

---

## 2. Knob — Retention

**LOCKED:** Tiered time-bucketed retention, replacing the flat MAX=10 cap.

```
Auto-commits:
  ≤ 24h old   → keep ALL
  ≤ 30d old   → keep one per DAY (the latest auto-commit in each day bucket)
  > 30d old   → keep one per MONTH (the latest auto-commit in each month bucket)

Exempt from ALL pruning:
  kind:'manual'  (named checkpoints — Phase I)
  kind:'seed'    (commit 0 — the "factory default" anchor; restore-to-default target)
  kind:'fork'    (branch points — pruning these would orphan branch lineage)
```

### keep-if-sole-writer — the integrity invariant (NEW vyapti candidate)

Because commits store **only changed files** (§3), a file's content at HEAD may
physically live in an *old* auto-commit (the last one that changed it). Time-
bucket pruning must NOT delete a commit if doing so would orphan any file's only
reachable copy along a live branch's history.

```
A commit C is prunable ONLY IF, for every file f in C.files,
  there exists another retained commit C' reachable from some branch HEAD
  with f ∈ C'.files and C' at-or-after C on that lineage.
Otherwise C is pinned (retained regardless of time bucket).
```

This is the **keep-if-sole-writer** rule. Without it, pruning a stale auto-commit
silently corrupts `getFileContentAt` for any file whose last write was in that
commit. → Candidate **PV61**. Phase F's prune driver must assert it; Phase I's
test must prove manual/seed survive a prune sweep.

**Pruning algorithm:** bucketed (hour-irrelevant; day/month buckets keyed by
local-date string), run after each auto-commit (same hook point as current
`snapshotStore.ts:87`). Walk auto-commits oldest→newest, drop those outside
their tier's keep-one-per-bucket rule, **skip any pinned by keep-if-sole-writer**.

---

## 3. Knob — Commit content form

**LOCKED:** Only-changed-files snapshot. NOT Yjs deltas. NOT full-doc-bytes.

```
commit Cn = { files: { [fileId]: '<full current content of changed file>' },
              parent, branch, kind, createdAt, label? }
```

- **vs current full-doc-bytes (`snapshotStore.ts:74`):** full-doc per commit at
  5s cadence would bloat IDB fast (every commit = whole project). Only-changed
  keeps each commit proportional to the edit.
- **vs Yjs deltas:** deltas need a replay chain (apply c0..cn to reconstruct) —
  fragile, order-dependent, and a single corrupt link breaks everything after.
  Full-content-of-changed-files means `getFileContentAt(f, cn)` = walk `parent`
  links back to the nearest commit with `f ∈ files` and return it verbatim. No
  replay, no chain fragility. `fileIndex[f]` makes the walk O(1)-ish.
- **Storage cost:** a changed file is stored whole, so a 1-char edit to a 5KB
  file costs 5KB. Acceptable: significance gate caps commit frequency, tiered
  retention caps commit count, and 5KB×bounded-N is negligible vs the current
  full-doc-bytes-×-N baseline.

**Migration from full-doc-bytes:** Phase F bumps `DB_VERSION` and, on upgrade,
treats the newest existing snapshot as **seed commit c0** (decode its `files`
map into the new per-file form) and discards older opaque byte-snapshots (they
predate the history feature; no user expectation of a graph over them). Simpler
than reconstructing a synthetic graph from flat snapshots. (Q3 — confirm we can
drop pre-migration snapshots vs. importing each as an isolated c0-sibling.)

---

## 4. Open questions for /anvi:discuss-phase (Phase F)

| # | Question | Lean |
|---|---|---|
| **Q1** | Does the **per-eval** trigger bypass the significance floor? (commit every successful eval even if <5 lines changed?) | **Yes, bypass** — an eval is an intentional checkpoint; the musician asked for it. Idle trigger keeps the floor. |
| **Q2** | Significance unit: changed-lines/chars vs touched-files-count? Does a 1-char `.viz` param change deserve an auto-commit on idle? | Lines/chars OR'd; accept that a tiny but evaluated change commits via the per-eval path, not the idle path. |
| **Q3** | Migration: discard pre-history flat snapshots, or import each as an isolated commit? | **Discard, keep newest as c0** — no graph existed; users have no lineage expectation. Cheaper, no synthetic parents. |
| **Q4** | Add commit-on-unload (`beforeunload`/`visibilitychange`) to stop losing the last debounce window? | **Yes** — cheap, significance-gated. |
| **Q5** | **B↔F coupling** (carried from plan): does Phase B (#191) per-file restore land a minimal seed-snapshot early, or sequence entirely after F's commit store? | Sequence B after F; F's `getFileContentAt` + `restoreProject` make B a thin query+file-write layer. Revisit if "revert to default" is wanted before the full graph ships. |
| **Q6** | `MAX_AUTO_SNAPSHOTS` constant + `AUTO_SNAPSHOT_PREFIX` label-sniffing — delete outright once tiered retention + `kind` field land? | Yes — `kind` is authoritative in the new schema; prefix-sniffing (`snapshotStore.ts:96`) was a back-compat shim for rows without `kind`. |

---

## 5. Outputs handed to Phase F (#196)

1. **Cadence:** idle-5s + per-eval(`onEvaluateSuccess`) + commit-on-unload, all significance-gated (≥5 lines OR ≥200 chars vs HEAD); per-eval bypasses the floor (pending Q1).
2. **Retention:** 24h-all / 30d-daily / older-monthly; `manual`+`seed`+`fork` exempt; **keep-if-sole-writer** pins any commit holding a file's only reachable copy.
3. **Commit form:** only-changed-files, full content per changed file, `parent`-linked; `getFileContentAt` = back-walk via `fileIndex`. No deltas.
4. **Migration:** bump `DB_VERSION`; newest legacy snapshot → seed c0; drop older byte-snapshots (pending Q3).
5. **New invariant candidate PV61** — keep-if-sole-writer (Phase F prune driver asserts; Phase I test proves manual/seed survival).
6. **Cleanups:** retire `MAX_AUTO_SNAPSHOTS` + `AUTO_SNAPSHOT_PREFIX` sniffing once `kind` is authoritative (Q6).

---

## 6. Source references (three-layer grounding)

- `packages/editor/src/workspace/snapshotStore.ts` — current store (extend, don't fork)
- `packages/app/src/components/StaveApp.tsx:368-400` — current 60s idle auto-snapshot driver
- `packages/editor/src/workspace/runtime/LiveCodingRuntime.ts:619` — `onEvaluateSuccess` (per-eval anchor)
- `packages/editor/src/workspace/WorkspaceFile.ts:234,274` — `seedWorkspaceFile` (idempotent), `setContent` (restore write path)
- `packages/editor/src/visualizers/namedVizRegistry.ts` — β viewing-override hook (Phase G, not E)
- `packages/editor/src/workspace/projectDoc.ts` — `getActiveDoc()`, Y.Doc structure (`files`/`fileOrder`/`subfolderOrder` maps)
