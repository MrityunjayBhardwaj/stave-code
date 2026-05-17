---
phase: 20-15
verdict: ACHIEVED-WITH-CAVEATS
verified_by: anvi-verifier
created: 2026-05-16T05:10:00Z
branch: feat/20-15-parity-hardening
head: 2ca97d3
base: 5323975
---

# Phase 20-15 Verification — Strudel.cc parity hardening

**Verdict: GOAL ACHIEVED — WITH ONE DOCUMENTATION DISCREPANCY AND ONE BUILD-HYGIENE CAVEAT.**

The phase goal is met by direct observation: all 6 gap classes parse
structured, real-world parity independently reproduced at 72.0% (vs 40%
baseline), D-01 named-label wiring is genuinely end-to-end through the
same mechanism `$:` uses, D-02/D-04 boundaries hold, the pre-mortem did
not occur, scope discipline is clean. Two issues found — neither blocks
the GOAL, one should be fixed before the PR.

---

## Per-criterion results (every row backed by a command I ran)

### 1. The 72% claim — PASS (independently reproduced)

- `packages/app/scripts/parity-bakery.mjs` exists; methodology is sound:
  real Supabase fetch, body column + anon key resolved at runtime from
  upstream `util.mjs` at pinned SHA `f73b3956` (R5), raw samples persisted
  to `.bakery-runs/` BEFORE classification, classified through the SAME
  pure `parseStrudel` the CI specs import.
- Recorded artifact exists and is dated/SHA'd:
  `result-2026-05-15T23-13-07-584Z.json` → total 50, structured 36, 72.0%.
- **I re-ran the classifier on the persisted fresh sample with the current
  HEAD parser**:
  `BAKERY_SAMPLES=…samples-2026-05-15T23-13-07-584Z.json … vitest run --config vitest.bakery.config.ts`
  → `total 50 structured 36 pct 72.0`. **Reproduced exactly.**
- Classifier is NOT lenient: it unwraps the synthetic `Track('d1')` then
  applies the canonical P67 rule `body.tag==='Code' && body.via===undefined`
  → a `Code`-with-`via` wrapper correctly counts as structured; `${}`/arrow
  correctly counts as D-04 fallback. 72% > 40% is a real +32pt material
  rise, not a sampling/classifier artifact.

### 2. D-01 full wiring (highest scrutiny) — PASS (traced in source + observed end-to-end)

- Source trace: `parseStrudel.ts:488/507` builds the labelled Track via
  `IR.track(label, body, {loc:[{start:t.dollarStart,end:t.end}]})` — the
  IDENTICAL constructor `$:` uses (label `'$'` keeps `d{N}`). NOT a
  parallel path.
- `collect.ts:447-450` `case 'Track'` sets `dollarPos = ctx.dollarPos ??
  ir.loc?.[0]?.start` (OUTER-WINS) — one code path for both `$:` and named
  labels.
- `MusicalTimeline.tsx:227-258` `collectTopLevelSlots` derives
  `slotKey = "$"+dollarPos` from that same `dollarPos`.
- **Observed end-to-end** (temp vitest probe, since removed):
  `parseStrudel('p1: s("bd")\np2: s("hh")')` → `Stack[Track(p1),Track(p2)]`;
  `collect` → events `{trackId:'p1',dollarPos:0}`, `{trackId:'p2',dollarPos:12}`
  — DISTINCT, equal to label-line starts. `$:` legacy still emits `d1/d2`
  (no regression). Mixed `$:`+`name:` both physical orders preserve source
  order. Deferred trackMeta-by-slotKey re-keying was NOT reopened
  (`MusicalTimeline.tsx` slot map still keyed by slotKey, D-01 scope guard
  held).

### 3. D-02 boundary (G1 matcher-not-interpreter) — PASS (each case run)

Temp probe (`parseStrudel` on each, asserting no throw):
- reassignment, use-before-def, shadowing-const, arrow-fn-rhs,
  destructuring → ALL returned `Track(d1, Code{ via absent, code = verbatim
  source })`, `threw=false`. Never crashed, never partial-eval, topology
  preserving (single Code node). Matcher-not-interpreter line held.

### 4. D-04 `${}` — PASS

- `parseStrudel('s(`bd ${x}`)')` → `Track(d1, Code)`, NO `Play`/`Seq`
  synthesized, source `${x}` preserved verbatim, no throw.
- `note(`${chord}`)` likewise → bare Code. Never evaled. By design.

### 5. Pre-mortem (silent offset drift) — PASS

- `loc-fidelity.test.ts` is a REAL detector: for each `*.strudel` it
  parses, walks every node carrying `loc`, slices `src.slice(start,end)`
  out of the ORIGINAL source, asserts in-bounds (`bad` invariant) AND
  snapshots the per-file loc→token text map. An offset that consumes the
  right tokens but returns a wrong absolute index changes a sliced
  substring → snapshot breaks. It genuinely would catch drift.
- I ran it: `pnpm --filter @stave/app test -- --run parity-corpus` →
  loc-fidelity 25/25 + parity 25/25 = **50/50 green**. The 25 includes the
  16 originals byte-unchanged in their loc maps (their loc snapshot blocks
  did not regress) plus the 9 added fixtures.

### 6. P67 across new producers — PASS

- Source: γ-3 binding map (`:388-389`), β-2 #132 loose arm (`:461`),
  γ/β-3 (`:968`) ALL discriminate `tag==='Code' && via===undefined`, never
  `tag==='Code'` alone — mirrors the canonical `:806` chokepoint.
- Observed: `bakery-132-recursive-args` produced `Code`-with-`via` over a
  genuinely structured `Fast/Seq/Play` inner tree (not Code-all-the-way),
  confirming the wrapper discipline.

### 7. Regression — PASS

- `pnpm --filter @stave/editor test` → **1564/1564** (86 files).
- `pnpm --filter @stave/app test -- --run parity-corpus` → **50/50**.
- `skipWhitespaceAndLineComments` unit → **13/13** (incl. regex-equivalence
  + `${` no-consume rows). The PV49 shared primitive is exported and
  consumed at 3 inter-token sites (applyChain, arg-splitter, +1) — R1
  design honoured (prelude line-classifier deliberately NOT migrated).

### 8. Scope discipline — PASS

- `gh issue list`: #140-#144 ALL OPEN. No fix commits reference them (only
  `9c1d6df` records the γ-4 *drop* decision — no code change). γ-4
  genuinely dropped.

### 9. V-2 sound-alias fix — PASS (real in committed dist)

- `grep '(?:s|sound)' packages/editor/dist/index.js` → present (3 hits).
  The in-phase gap the verbatim `sound(`…`)` fixture caught is fixed in the
  RUNTIME build, not just source. Observed: `sound("bd hh")` and
  `sound(`bd hh`)` both parse structured; `s("bd hh")` did not regress.

---

## Gaps between SUMMARY claims and what I observed

### DISCREPANCY-1 (documentation accuracy — NOT a GOAL failure)

SUMMARY claims: *"16 originals byte-for-byte unchanged"* and *"0 non-bakery
content hunks across V-2/V-3 snapshot regens — PASS"*.

**Observed (exact per-snapshot-block diff of `parity.test.ts.snap`,
5323975 vs HEAD): 5 of the 16 original tunes CHANGED** — `amensister`,
`arpoon`, `belldub`, `flatrave`, `randomBells`. (11 are byte-identical:
barryHarris, bassFuge, chop, delay, dinofunk, echoPiano, holyflute,
juxUndTollerei, meltingsubmarine, orbit, sampleDrums.)

**However, every one of the 5 changed in the GOAL-PERMITTED direction**:
previously a bare `Code` (opaque whole-expression string) → now a deeply
structured tree. Structure proxy (Play/Seq/via counts) rose for every one
(e.g. arpoon 0→9 Play; randomBells 0→5 Play; none regressed
structured→Code). loc-fidelity 25/25 green proves no offset drift caused
it. These are the #132 / G-class fixes biting positively on the originals
— exactly the GOAL's explicit carve-out: *"byte-for-byte unchanged,
EXCEPT explained structural improvements (e.g. arpoon #132)"* (PLAN
§2 / drift policy line 22-23).

**Net:** the OUTCOME is within GOAL scope and is a positive. The SUMMARY's
verification table row is **factually wrong as written** (it should read
"11 unchanged, 5 improved bare-Code→structured via the #132/G-class
fixes — all explained, loc-fidelity confirms no drift"). This is a
SUMMARY-honesty defect, not a phase-goal defect. It echoes the phase's
own V-2 lesson (a paraphrased check masked reality) — here a too-strong
"byte-for-byte" claim masks a benign-but-real diff.

### CAVEAT-1 (build hygiene — should fix before PR)

`git status` shows `packages/editor/dist/index.d.cts` and `index.d.ts`
DELETED in the working tree (not on disk, uncommitted). This is precisely
the P68 pattern the SUMMARY itself documents (`tsup --watch` dies entirely
on a DTS-build failure). The runtime `dist/index.js` IS current and
correct (sound-alias `(?:s|sound)` verified present), so **no parser
behaviour or test is affected** (1564 + 50 green). But the TypeScript
declaration outputs are missing — downstream consumer typechecking would
break. Regenerate with `pnpm --filter @stave/editor build` and commit the
dist before opening the PR.

---

## PR gate

**Should block / fix before PR:**
1. CAVEAT-1: regenerate + commit `packages/editor/dist/*.d.ts` /
   `*.d.cts` (currently deleted in worktree — P68). One command, no risk.
2. DISCREPANCY-1: correct the SUMMARY's "16 originals byte-for-byte
   unchanged" / "0 non-bakery hunks" rows to the truthful "11 unchanged,
   5 improved (explained #132/G-class, loc-fidelity confirms no drift)".
   Documentation fix only.

**Documented-acceptable caveats (no action needed):**
- 72% will vary run-to-run (fresh live rows) — the 6+2 vendored fixtures
  are the stable CI floor; this is the explicit D-03 design.
- `.anvi/` catalogue updates (PV49/PV51/PK16/P68) not independently
  verifiable from this checkout (force-added/gitignored per project
  convention) — SUMMARY records them; not GOAL-critical.
- #140-#144 deferred to backlog by design (D-03).
- The 5 improved originals are a net positive, fully GOAL-permitted.

---

## Goal-backward verdict

| GOAL element | Verdict | Basis |
|---|---|---|
| 6 gap classes → structured | PASS | 8/8 fixtures structured, independently re-run |
| Real-world parity materially > 4/10 | PASS | 36/50 = 72.0% independently reproduced |
| PV49 shared substrate extracted | PASS | exported, 3 inter-token consumers, 13/13 unit |
| D-01 named-label fully wired | PASS | source-traced + observed end-to-end, same `$:` path |
| ≥9/10 known set, `${}` Code by design | PASS | 8/8 structured; `${}` bare Code observed |
| D-03 re-measure ~50 fresh | PASS | N=50, dated/SHA'd artifact, reproduced |
| 16 corpus + loc-fidelity + editor unchanged | PASS* | 1564 + 50 green; 5 originals IMPROVED (explained, GOAL-permitted) — *SUMMARY mis-states this as "unchanged" |
| New friction → backlog not scope creep | PASS | #140-#144 OPEN, no fix commits, γ-4 dropped |

**GOAL ACHIEVED.** The phase did what it promised, verified by observation
not task-completion. Two defects found: one SUMMARY honesty error
(benign-but-real snapshot diff mis-stated as "unchanged"; the diff is a
GOAL-permitted improvement), one build-hygiene gap (missing committed
`.d.ts`). Both are pre-PR cleanups, neither undermines the parity GOAL.
