---
phase: 20-21
artifact: PLAN check (round 1, inline-by-orchestrator)
checker: anvi-checker delegated, FAILED twice on TCC sandbox; orchestrator verification inline
date: 2026-05-21T20:45:00Z
verdict: PASS
plan_path: .planning/phases/20-musician-timeline/20-21-PLAN.md
context_path: .planning/phases/20-musician-timeline/20-21-CONTEXT.md
research_path: .planning/phases/20-musician-timeline/20-21-RESEARCH.md
---

# Phase 20-21 PLAN check (round 1)

**Top-line verdict:** PASS

The plan is materially correct on LIVE source evidence. Surgery
sites, reference pattern, fix shape, P68 anchors, V-3 allow-list,
ancestry check, new-issue creation step, and backlog disposition
mechanics all check out. Executor unblocked.

## Standard Dimensions

### 1. Goal-backward achievability — PASS
The wave graph V-4 → V-3 → V-1 → B-A/B-B → A → 0 traces from
"phase closed" backward; each exit criterion necessary and
collectively sufficient. Crit-1 (production exemplar STRUCTURED)
traces to Wave A's W3 probe; crit-2 (parity = 50/50) traces to
V-1's fresh measurement.

### 2. Task decomposition — PASS
Wave A specifies both surgery sites with pre/post code blocks
(lines 351-461 of PLAN). Wave 0 enumerates the 4 load-bearing
bisect variants + the 4 backlog probes. Wave B-A vendors 2
fixtures with explicit filenames. Wave B-B has explicit
`gh issue` commands per disposition. V-4 has explicit
`gh issue create` BEFORE the PR open.

### 3. Dependency ordering — PASS
`0 → A → {B-A, B-B in parallel} → V-1 → V-3 → V-4`.
B-A and B-B share Wave-A's commit as ancestor; B-B has no code
dependency on B-A. Safe parallelism. Wave-A's W3 probe is the
gate signal before B-A vendors the positive-control fixture.

### 4. Verification realism — PASS (live-grep evidence)
- `parseStrudel.ts:2598` — `function findMatchingParen(str: string,
  startIdx: number): number` ✓ (verified live; PLAN's line cite
  matches).
- `parseStrudel.ts:2664` — `function splitArgsWithOffsets(...)` ✓.
- `parseStrudel.ts:414-417` — the reference `//`-skip:
  ```
  if (ch === '/' && body[i + 1] === '/') {
    while (i < body.length && body[i] !== '\n') i++
    continue
  }
  ```
  ✓ verified live; PLAN's mirror-this directive is exact.
- `parseStrudel.ts:2611` — string-quote test in Site 1
  (`if (ch === '"' || ch === "'" || ch === '\``')` at the literal
  position the plan cites ✓.
- `parseStrudel.ts:2710` — string-quote test in Site 2 ✓.
- `parseStrudel.ts:2685-2693` — OFFSET CONTRACT in `pushCurrent`
  ✓; PV49 substrate intact.
- Dual-gate arithmetic correct: 49/50 = 98% floor; 50/50 = 100%
  target.

### 5. Coverage of CONTEXT decisions — PASS
- **D-01 (Wave 0 hybrid):** action 3 RE-RUNs the load-bearing
  bisect variants on the fresh branch with VERBATIM exemplar
  extraction (mitigates §R-7 PM-2 encoding-mismatch).
- **D-02 (Wave 0 dictates research scope):** RESEARCH confirmed
  INTERNAL class; no upstream RESEARCH needed; PLAN proceeds
  direct-to-execution.
- **D-03 (STRETCH):** B-B explicitly applies dispositions via
  `gh issue` calls; CLASSIFY ≠ FIX guard intact.
- **D-04 (dual gate):** V-1 enforces both `≥ 50` AND `≥ 49`
  with no-bar-lowering rule.

### 6. Risk surface / pre-mortems — PASS
All 5 R-7 pre-mortems mapped: PM-1 (bisect misses multi-cause) →
Wave 0 stage-2 fallback; PM-2 (fix doesn't flip production) →
W3 production-exemplar probe; PM-3 (workaround cascade) →
PK18 STOP discipline in every wave; PM-4 (loc-fidelity drift) →
Wave A action 7 (iv) direct test + V-3 STOP gate; PM-5 (V-1
regression) → PK18 STOP no-bar-lowering rule.

### 7. Scope boundary — PASS
Strict to apostrophe-in-//-comment chain-arg walker class.
Backlog audit is CLASSIFY-only (B-B does NOT add production
code). New gap classes file as NEW issues for 20-22+.

## Cognitive Dimensions

### A. PV alignment — PASS
- **PV49** (the load-bearing precedent): the fix IS a PV49-spirit
  extension at TWO new call sites mirroring `splitTopLevelStatements:
  414-417` exactly. Catalogue addendum in V-4 records the new
  occurrence with ORIGIN/WHY/HOW.
- **PV50** module state: no new state; fix is pure walker logic.
- **PV52**: no new `Code.via` arm; fix-level not IR.
- **PV54**: explicitly NOT triggered (no new top-level PatternIR
  tag); V-4 catalogue addendum records this.

### B. PK correctness — PASS
- **PK16** stage 2 (chain-root + splitRootAndChain); fix is
  INSIDE existing walkers; no stage boundary change.
- **PK17** step-6 cadence; V-1 fresh measurement.
- **PK18**: cascade discipline encoded in every wave's
  pre-mortem.

### C. P resistance — PASS
- **P70**: occurrence-9 EXPLICITLY surfaced — the 20-15/20-16
  cascade was wrong about WHY #143 bareCodes. RESEARCH §R-1
  bisect IS the discharge; Wave 0 RE-CONFIRMS on fresh branch.
- **P68**: 4 distinct literal-token greps (`findMatchingParen`,
  `splitArgsWithOffsets`, `splitTopLevelStatements`,
  `skipWhitespaceAndLineComments`). No regex alternation (the
  20-19 M-1 lesson applied). Defensive anchors: the reference
  + primitive symbols remain UNCHANGED (count == 7 from 20-20)
  — this is a strict invariant check, not just `> 0`.
- **P69**: RESEARCH grounded the internal class; no upstream
  surface; correctly skipped.
- **P50**: STOP-then-re-pose; no second-workaround in pre_mortems.

### D. Observation testability — PASS
W3 production-exemplar probe is the gate-bearing observation;
file paths cited verbatim; concrete `pnpm` commands; concrete
numeric thresholds.

### E. Ownership clarity — PASS
Site 1 vs Site 2 surgical-edit ownership explicit; B-A fixture
ownership (parity-corpus dir) separate from B-B issue ownership
(GitHub via `gh` CLI).

### F. UX precedent — PASS (N/A correctly framed)
Structural-parity work; no UX claims.

## Required Revisions

**None.** Plan is materially correct.

## Discharged Risks (intentional)

- The fix mirrors the reference INLINE (not via primitive call) —
  `skipWhitespaceAndLineComments` count stays UNCHANGED vs
  20-20's 7; the 4 grep anchors are defensive (function
  symbols + reference symbols remain).
- B-B runs parallel to B-A — independent post-Wave-A; safe.
- `#143` was already closed in 20-16; PR `closes` a NEW issue
  filed in V-4 action 1; `#143` manually annotated as superseded.
- GitHub 1-keyword close limit: PR closes only the new issue;
  backlog issues (#153/#156/#149/#147) close/refine via direct
  `gh issue` calls in B-B.
- Loc-fidelity preservation: Site 2's `//`-skip appends comment
  chars to `current` so the OFFSET CONTRACT at pS:2685-2693 holds;
  the `pushCurrent` `skipWhitespaceAndLineComments(current, 0)`
  is the existing leading-`//` consumer.

## Verdict

**PASS.** Executor unblocked. The orchestrator performed this
check inline after the delegated `anvi-checker` agent hit
TCC sandbox issues twice — the substantive verification is
complete on live source evidence.
