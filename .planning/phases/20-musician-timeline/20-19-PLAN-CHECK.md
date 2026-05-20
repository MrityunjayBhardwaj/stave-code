---
phase: 20-19
artifact: PLAN check (round 1)
checker: anvi-checker
date: 2026-05-20T18:00Z
verdict: NEEDS-REVISION
plan_path: .planning/phases/20-musician-timeline/20-19-PLAN.md
context_path: .planning/phases/20-musician-timeline/20-19-CONTEXT.md
research_path: .planning/phases/20-musician-timeline/20-19-RESEARCH.md
---

# Phase 20-19 PLAN check (round 1)

**Top-line verdict:** NEEDS-REVISION

The plan is materially correct: surgery site, curated-set, gate
arithmetic, locked-STOP line, dual-gate cadence, catalogue
alignment, and goal-backward chain all check out against real
source. Two BLOCKERs and one MAJOR are mechanical-path errors that
will trip the executor on the first command; everything else is
MINOR or already discharged.

## Standard Dimensions

### 1. Goal-backward achievability — PASS
PLAN.md lines 749-758 trace from D-04 dual gate backward through
V-4 → V-3 → V-1 → C-1 → B-1 → A-1 → 0-1; each step's exit criterion
is necessary and collectively sufficient. Closing check (lines
760-771) explicitly verifies each LOCKED decision (D-01..D-04) is
encoded in a specific wave.

### 2. Task decomposition — PASS (with MINOR m-1 below)
Each action block is enumerated with concrete commands, file paths,
single-observation verifies. Wave A action 8 names the exact probe
stmt list (i/ii/iii); Wave C lists all 11 fixture filenames and the
canonical 4-line template.

### 3. Dependency ordering — PASS
`0-1 → A-1 → B-1 → C-1 → V-1 → V-3 → V-4` strictly serial and
acyclic. Wave B (assertion flip) correctly depends on Wave A's
FLIP signal firing first (PLAN line 428 — "flipping first would
BREAK on a passing-pre-fix code").

### 4. Verification realism — PASS (with BLOCKER B-2 + MINOR below)
Gate commands runnable; assertion line (155) and assertion text
grep-verified live (matches PLAN line 120 + RESEARCH §R-6). Dual-
gate arithmetic correct: 46/50 = 92.0% floor; 47/50 = 94.0%
ceiling; V-1 action 4 enforces both `≥ 47` AND `≥ 46`.

### 5. Coverage of CONTEXT decisions — PASS
- **D-01:** curated set membership matches R-1's 10 tokens verbatim
  (PLAN line 310). Wave 0 action 7 FREEZES the set with a STOP-and-
  re-pose rule.
- **D-02:** filter is purely upstream — PLAN line 337 wires the
  helper at the existing `pS:492` callsite; loop/fixpoint/occurs-
  check/shape guard at `pS:534` stay byte-stable.
- **D-03:** Wave 0 actions 5-6 enumerate the 5 backlog rows
  individually; disposition rules explicit.
- **D-04:** V-1 action 4 enforces dual gate on the same HEAD SHA.

### 6. Risk surface / pre-mortems — PASS
All 5 R-8 pre-mortems mapped: PM 1 → Wave A action 8 (ii); PM 2 →
Wave 0 action 6; PM 3 → Wave A action 8 (iii); PM 4 → Wave A
action 10 + V-3 action 3; PM 5 → V-1 action 3. PK18 STOP-then-
re-pose protocol present in every wave.

### 7. Scope boundary — PASS
PLAN forbids scope expansion (line 218 "do NOT touch this phase";
line 793 "NEVER push through, NEVER add a second workaround,
NEVER lower the bar"). D-03 strict honored.

## Cognitive Dimensions

### A. PV alignment — PASS
- **PV49** loc-additivity: line 365 + Wave A action 10 + V-3 action 3.
- **PV50** module state: line 365 explicitly distinguishes
  module-const literal data from module state.
- **PV52**: no new `Code.via` arm; line 130 confirms helper produces
  no IR.
- **PV54**: lines 65-71 + 665-667 + 795 EXPLICITLY note PV54 NOT
  triggered (no new top-level PatternIR tag).

### B. PK correctness — PASS
- **PK16** stage 0.5 unchanged (line 368).
- **PK17** step-6 cadence: V-1 fresh stamp + new ISO.
- **PK18**: cascade discipline encoded in every `<pre_mortem>`.

### C. P resistance — PASS (with MAJOR M-1 below)
- **P70**: Wave 0 RUNS the classification probe; gate is executed
  observation.
- **P68**: 4 runtime string-literal greps (but see M-1 — grep flag
  ambiguity).
- **P69**: Codeberg SHA `f73b3956` + per-token file:line;
  provenance block mirrors `PRELUDE_CALL_RE` (lines 290-308).
- **P50**: STOP-then-re-pose; no second-workaround.

### D. Observation testability — PASS
Every exit criterion is a runnable observation: file paths cited
verbatim, concrete `pnpm` commands, concrete numeric thresholds
(`1627/1627`, `387/387`, `386/387`, `≥ 47/50`).

### E. Ownership clarity — PASS
Every artifact has explicit `<ownership>` block per task: the
curated regex (Wave A), helper symbol (Wave A), fixtures (Wave C),
locked-STOP marker assertion (Wave B), parity baseline JSON files
(V-1, gitignored), V-3 allow-list (pre-allocated Wave 0, executed
V-3).

### F. UX precedent — PASS (correctly framed as N/A)
PLAN does not make UX claims; structural-parity work. CONTEXT
scope (lines 261-296) is purely parser-pipeline.

## Required Revisions

### BLOCKER

**B-1. Wave 0 action 1 baseline-SHA assertion is stale.**
- **Dimension:** D (observation testability) + 4 (verification realism)
- **Evidence:** PLAN.md line 207 — `git rev-parse HEAD` confirm ==
  `2f27485`. PLAN front-matter line 7 same. Real main HEAD on this
  working tree is `b5fb170` (the CONTEXT doc-commit landed AFTER
  the 20-18 merge). Wave 0 action 1 WILL FAIL on a fresh pull.
- **Fix:** Edit PLAN line 207 to: "`git rev-parse HEAD` and
  `git merge-base HEAD 2f27485` — confirm the merge-base output ==
  `2f27485` (main contains the 20-18 merge in its ancestry).
  Planning-doc-only commits since `2f27485` (e.g. `b5fb170`
  CONTEXT) are acceptable; ANY production-src commit on main since
  `2f27485` triggers a re-grep of all `pS:` anchors per Wave 0
  action 2." Update front-matter `depends_on` (line 7) to match.

**B-2. `parity-refresh.mjs` path is wrong; line range is off.**
- **Dimension:** 4 (verification realism) + E (ownership clarity)
- **Evidence:** PLAN.md line 453 cites
  `parity-refresh.mjs:70-75`; line 458 cites `lines 68-77`. The
  real file is `packages/app/scripts/parity-refresh.mjs:68-75`,
  NOT `packages/app/tests/parity-corpus/parity-refresh.mjs`. Wave-C
  verify action 6 will fail with "file not found."
- **Fix:** Globally substitute
  `packages/app/tests/parity-corpus/parity-refresh.mjs` →
  `packages/app/scripts/parity-refresh.mjs` (3 sites: 453, 458,
  521). Update line cite to live `68-75` for the
  `TARGETS.some((t) => t.startsWith('bakery-'))` guard. Wave-C
  verify action 6 command becomes
  `node packages/app/scripts/parity-refresh.mjs --dry-run`.

### MAJOR

**M-1. `grep -c "all|samples"` is regex-mode-ambiguous.**
- **Dimension:** C (P resistance — P68 build hygiene)
- **Evidence:** PLAN.md lines 341, 343, 699 use
  `grep -c "all|samples" packages/editor/dist/index.js`. In basic
  grep, `|` is a literal — the grep searches for the literal
  substring `all|samples`. Because tsup emits the regex source
  intact, the literal IS present so the count is non-zero — but
  this only works ACCIDENTALLY. A future minifier that rewrites
  the regex character class breaks the grep silently.
- **Fix:** Replace the four greps in PLAN lines 341-345 and
  698-701 with four distinct LITERAL-token greps:
  ```
  grep -c "stripSideEffectStatements" packages/editor/dist/index.js
  grep -c "useRNG"          packages/editor/dist/index.js
  grep -c "setVoicingRange" packages/editor/dist/index.js
  grep -c "aliasBank"       packages/editor/dist/index.js
  ```
  Each is a literal substring uniquely tied to the 20-19 surgery;
  each is minification-stable inside the regex literal. EXECUTOR
  NOTES must state all four greps must be `> 0`.

### MINOR

**m-1.** PLAN line 419 says `pnpm --filter @stave/app test` "MUST
be 387/387 GREEN now" after Wave B. Wave A leaves the suite at
`386/387 with 1 expected failure`; Wave B flips that 1 failure →
`387/387 GREEN`. Add explicit math to Wave B `<done>`: "the 1
expected Wave A failure is now PASS, suite 386/387 → 387/387."

**m-2.** PLAN line 518 (Wave C verify 3) computes
`387 + 2×11 = 409`. Confirm via Wave 0 OBSERVATIONS that
loc-fidelity auto-discovers `.strudel` fixtures (not just snapshot
files); the 2× factor depends on this. If loc-fidelity does NOT
auto-discover, arithmetic is `387 + 11 = 398`.

**m-3.** V-1 commit gitmoji is `:bar_chart:`; V-3 uses
`:white_check_mark:`. Consistency with 20-18 V-1 (which used
`:white_check_mark:`) preferred. Discretionary.

**m-4.** R-1 §2.1 flags `each` as identical class to `all`. PLAN
correctly leaves it out (line 218). Add an explicit `each` to the
FROZEN-curated-set STOP-and-re-pose trigger list in Wave 0
action 7 so executor sees the recommended-but-not-included token
explicitly.

## Discharged Risks

Already addressed by PLAN — treat as intentional:

- Multi-line side-effect call shape (R-4) — Wave A action 8 (i)
  probes `samples({...})` and `all(x=>x.punchcard())`.
- False-positive guard for `let allFoo = …` — Wave A action 8 (ii)
  tests three binding-shape false-positives; regex stmt-head
  anchor + BINDING_RE precedence.
- Stmt is already trimmed — defensive `^[ \t]*` retained for
  PRELUDE_CALL_RE parity.
- Co-Authored-By trailer — V-4 pre_mortem + verify action 3 grep.
- GitHub single-closes-keyword limit — lines 692-693.
- `@strudel/mondo` TS7016 benign warning — distinguished in P68
  guidance (lines 346, 789).
- Per-file loc-fidelity STOP gate runs PER-WAVE + CROSS-WAVE —
  Wave A action 10 + Wave B action 5 + Wave C action 6 + V-3
  action 3.
- One-arg oracle invariant on `_bakery-classify.spec.ts:77` —
  V-1 action 1 grep re-confirms.
- D-02 matcher line preservation — EXECUTOR NOTES (line 792):
  "purely subtractive — REMOVES side-effect statements; does NOT
  evaluate, side-channel, recurse."
- Curated-set FROZEN before regex written — Wave 0 action 7
  STOPs the phase if any Class-A row needs a token outside R-1's
  10.
- Post-merge artifact verification recipe — V-4 action 7 records
  full recipe; Claude stops at PR-up (action 9).

## Verdict

NEEDS-REVISION. Patch B-1 + B-2 + M-1 into PLAN.md; address the
4 MINOR items at planner discretion. Once patched, plan is
materially correct and the executor has a clean punch list.

---

## Round 2 Verification (date 2026-05-20T18:30Z)

**Verdict:** PASS — executor unblocked.

### Patch acceptance

**B-1 (stale baseline-SHA assertion) — RESOLVED.**
PLAN line 207 now uses `git merge-base HEAD 2f27485` ancestry check; planning-doc-only commits `b5fb170` (CONTEXT) and `5fbafe1` (handoff) named explicitly as acceptable; production-src commit triggers `pS:` anchor re-grep. Front-matter line 7 mirrors the same ancestry-check semantics. Gate is still goal-backward correct — it gates on "main contains 20-18" not "main IS 20-18," which is the real precondition for the surgery to be additive over the merged 20-18 base.

**B-2 (parity-refresh.mjs path) — RESOLVED.**
Line 453 cites `parity-refresh.mjs:68-75` (live range); line 458 reads `packages/app/scripts/parity-refresh.mjs lines 68-75`; line 521 invokes `node packages/app/scripts/parity-refresh.mjs --dry-run`. All three sites now point to the real exclusion-guard location. The `bakery-158-*` slug coverage by the existing `bakery-*` prefix guard remains structurally guaranteed.

**M-1 (grep regex ambiguity) — RESOLVED.**
PLAN lines 341-345 (Wave A action 7), 378 (Wave A verify 2), and 698-701 (V-4 post-merge recipe) all show the four distinct literal-token greps: `stripSideEffectStatements` / `useRNG` / `setVoicingRange` / `aliasBank`. Line 346 explicitly notes the regex-mode-ambiguity rationale and that each token survives minification inside the regex literal. The four tokens still cover P68 hygiene because each is uniquely tied to 20-19 surgery (`stripSideEffectStatements` is the new symbol; the other three are tokens added to the curated set that did not previously exist in `dist/index.js`).

### Re-verified dimensions

- **Dim 4 (verification realism):** PASS — every command now runnable; ancestry check, path, and grep tokens all match real source.
- **Dim C (P resistance / P68):** PASS — four literal greps, minification-stable, no regex-mode ambiguity.
- **Dim D (observation testability):** PASS — every patched gate is a direct observation with verbatim expected output.
- **Dim E (ownership clarity):** PASS — `packages/app/scripts/parity-refresh.mjs` correctly attributed; Wave 0 still owns the FROZEN curated-set; Wave A owns the helper.

### Spot checks

- Goal-backward chain unchanged — patches are mechanical-path corrections, not semantic.
- m-1 patch (Wave B done math) explicit at line 419: "386/387 with 1 failure on Wave-A HEAD → 387/387 on Wave-B HEAD."
- m-2 (loc-fidelity 2× factor) confirmed by executor against `loc-fidelity.test.ts:42` (`.endsWith('.strudel')` auto-discovery) + `:92` (per-fixture `describe → it`); 387 + 2×11 = 409 stands.
- m-3 / m-4 discretionary, no PLAN-level risk.

### New findings

None. No new issues introduced by the patches; no regressions in previously-PASS dimensions.

**Executor is unblocked. Proceed to Wave 0.**
