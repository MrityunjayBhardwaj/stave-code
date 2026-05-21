---
phase: 20-20
checker: anvi-plan-checker
created: 2026-05-21T09:30:00Z
verdict: PASS
inputs_verified:
  - .planning/phases/20-musician-timeline/20-20-PLAN.md (770 lines, end-to-end)
  - .planning/phases/20-musician-timeline/20-20-CONTEXT.md (D-01..D-04 LOCKED)
  - .planning/phases/20-musician-timeline/20-20-RESEARCH.md (§§2-9, §R-8 5 pre-mortems)
  - packages/editor/src/ir/parseStrudel.ts:2489-2538 (the surgery site — LIVE-VERIFIED)
  - packages/editor/src/ir/parseStrudel.ts:1075-1094 (skipWhitespaceAndLineComments — LIVE-VERIFIED)
  - packages/app/scripts/parity-refresh.mjs:60-75 (bakery-* exclusion guard — LIVE-VERIFIED)
---

# Phase 20-20 PLAN — Verification (PASS)

## Top-line verdict

**PASS.** The plan correctly encodes the LOCKED D-01..D-04, the surgery site
matches live source byte-for-byte, the 4 P68 grep anchors are literal/
minification-stable, the Wave-B fixture slugs are correctly excluded by
`parity-refresh.mjs:68-75`, the dual gate arithmetic is correct, the 5
pre-mortems are fully mapped, and Wave-B's dependency on Wave-A handles the
"fixture passes only post-fix" ordering correctly. RESEARCH did the heavy
lifting; the plan is a faithful, tight encoding of it.

## Standard Dimensions (1-7)

### 1. Goal-backward achievability — PASS
Chain V-4 ← V-3 ← V-1 ← B-1 ← A-1 ← 0-1 is acyclic, strictly serial, each
step's exit gate is necessary for the next. Goal anchor (D-04 dual gate) is
re-derived in §"DOES THIS PLAN ACHIEVE THE GOAL?" with 10 numbered ties to
specific actions. No phantom links.

### 2. Task decomposition — PASS
Wave-A surgical edit shows pre-code (verbatim from current `parseStrudel.ts`)
and post-code as full code blocks. Line numbers cited (pS:2521-2531) match
live source (verified — line 2521 opens with `} else {`; line 2523 is the
identifier scan; line 2526 is the `(` check; line 2527 is `findMatchingParen`).
The `skipWhitespaceAndLineComments(expr, i)` call uses the verified pS:1075
signature `(src: string, pos: number): number`.

### 3. Dependency ordering — PASS
B-1 `depends_on="A-1"` correctly orders the permanent fixture AFTER the fix.
Snapshot capture in B-1 step 7 (`pnpm --filter @stave/app test` with no `-u`
flag) auto-captures the new fixture's snapshot on first run; the assertion
`body.tag !== 'Code'` will PASS because Wave A already landed the fix. No
"fixture passes pre-fix" hazard.

### 4. Verification realism — PASS
All gate commands are runnable: `pnpm --filter @stave/editor test`,
`pnpm --filter @stave/app test`, `pnpm parity:bakery --n 50`. Arithmetic
correct (48/50 = 96.0%, 49/50 = 98.0%). File paths LIVE-VERIFIED. V-1 action
2 hedges canonical parity:bakery invocation by reading `package.json` (good
defensive move — does not assume root-vs-app filter).

### 5. Coverage of CONTEXT decisions — PASS
- D-01: Wave 0 RE-RUNS the §2.2 5-cell probe on the fresh branch (P70
  directive, not RESEARCH-inferred). Outcome 1 lock encoded.
- D-02: RESEARCH §3 TOLERATES verdict cited verbatim in BAKERY-FIXTURES.md
  provenance note (B-1 action 5) and PR body (V-4 action 7); no re-derivation.
- D-03: DEFERRED per Outcome 1 with §4 LAST-WINS evidence recorded in
  OBSERVATIONS + SUMMARY (V-4 action 1) for inheritance.
- D-04: Dual gate with must-not-regress 96.0% floor; V-1 actions 5-7 enforce.

### 6. Risk surface / pre-mortems — PASS
All 5 RESEARCH §R-8 pre-mortems mapped to specific wave actions:
- PM-1 (Wave 0 divergence) → 0-1 action 5 STOP rule + verify-3.
- PM-2 (upstream verdict wrong) → A-1 pre-mortem #2 + V-1 action 7.
- PM-3 (false-positives over-widening) → A-1 action 6 (ii) 5-case false-
  positive probe + the `i = afterIdent` restore-arm + V-3 STOP gate.
- PM-4 (parity regression < 96.0%) → V-1 action 6 PK18 HARD STOP.
- PM-5 (B flips but E doesn't) → A-1 action 6 (iii) exemplar round-trip
  on verbatim E source extracted via `node -e ... .find(s=>s.hash==='-G2drHRNFueu')`.

### 7. Scope boundary — PASS
#159 IN; #153 deferred backlog with LAST-WINS evidence recorded for the
NEXT phase to inherit (R-3 grounding). #143/#156/#149/#147 untouched. Single
non-stacked PR with `closes #159` only — GitHub 1-keyword limit respected.

## Cognitive Dimensions (A-F)

### A. PV alignment — PASS
- PV49: explicitly cited as the load-bearing precedent; the fix IS a 5th
  caller of the substrate (existing 4 at pS:463, 1560, 1714, 2676). The new
  boundary class ("identifier-to-paren", vs prior 4 "inter-token within
  chain/args") is acknowledged. V-4 PV49 addendum has full ORIGIN/WHY/HOW.
- PV50: explicitly "no new module state" (R-5 §6.3).
- PV52: explicitly "fence predicate UNCHANGED" (§6.4).
- PV54: explicitly "NOT triggered" (3 callouts: GOAL section, R-5 §6.2,
  V-4 action 4 catalogue note).

### B. PK correctness — PASS
- PK16: stage 2 (chain-root) — no stage change.
- PK17: fresh step-6 measurement at V-1.
- PK18: cascade discipline in every wave's pre_mortem.

### C. P resistance — PASS
- P70: Wave 0 RE-RUNS, never inferred from RESEARCH §2.2 stdout.
- P68: ONE-shot build before commit; 4 distinct literal-string anchors
  (`splitRootAndChain`, `skipWhitespaceAndLineComments`, `findMatchingParen`,
  `afterIdent` — informational). NO regex alternation (the 20-19 M-1 lesson).
  Anchor 2 explicitly INCREASE-by-1 (not just `> 0` — the 20-17 plan-checker
  MAJOR class).
- P69: GROUNDED in RESEARCH §3 (acorn + Function-eval `file:line`) + §4
  (LAST-WINS for #153); cited in plan, not re-grounded.
- P50: no second-workaround; fix is pure-additive.

### D. Observation testability — PASS
Every gate is a concrete runnable observation with numeric threshold and
file path. Wave 0 captures stdout verbatim; Wave A captures probe stdout +
test counts + grep counts; V-1 captures fresh ISO stamp + structured count;
V-3 captures `git diff --name-only HEAD~4..HEAD packages/app/tests/parity-
corpus/__snapshots__/`.

### E. Ownership clarity — PASS
Every artifact has explicit wave ownership:
- The PV49-extension edit → A-1 ownership block.
- The 2 Wave-B fixtures + BAKERY-FIXTURES.md update → B-1 ownership.
- The V-3 allow-list enforcement → V-3 ownership.
- SUMMARY + catalogues + Ground Truth extension + PR → V-4 ownership.

### F. UX precedent — PASS
The fix is framed as structural-parity with upstream (mirrors `acorn.parse`
+ `Function(body)()` whitespace tolerance), not UX divergence. PR body, V-4
catalogue addendum, and BAKERY-FIXTURES.md provenance note all encode this.

## Specific Checks (1-8)

1. **Surgery site lines** — LIVE-VERIFIED at `parseStrudel.ts:2489-2538`.
   The `} else {` at 2521; identifier scan at 2523; `(` check at 2526;
   `findMatchingParen` at 2527. Plan's `pS:2521-2531` is correct. **PASS.**

2. **`skipWhitespaceAndLineComments` signature** — LIVE-VERIFIED at
   `parseStrudel.ts:1075`: `export function skipWhitespaceAndLineComments(
   src: string, pos: number): number`. Plan calls it as
   `i = skipWhitespaceAndLineComments(expr, i)` with `expr: string` and
   `i: number` → correct positional binding (`src=expr`, `pos=i`). **PASS.**

3. **Four P68 grep anchors** — all literal substrings: `splitRootAndChain`,
   `skipWhitespaceAndLineComments`, `findMatchingParen`, `afterIdent`. NO
   regex alternation. Anchor 2 INCREASE-by-1. Anchor 4 explicitly
   informational. **PASS.**

4. **Fixture filenames** — both `bakery-159-tokenizer-whitespace.strudel`
   and `bakery-159-NEGATIVE-no-whitespace.strudel` start with `bakery-`, so
   the `parity-refresh.mjs:68-75` `if (TARGETS.some((t) => t.startsWith(
   'bakery-')))` guard would catch any accidental TARGETS leak. Slugs are
   NOT added to TARGETS, so they're excluded by construction. **PASS.**

5. **V-3 allow-list** — V-3 action 2 explicitly enumerates "EXACTLY 2 (the
   2 Wave-B fixtures' snapshots)". NOT "expected to be empty". **PASS.**

6. **Ancestry check** — Wave 0 action 1 uses `git merge-base HEAD a150889`
   (correct ancestry semantics). PR test plan in V-4 action 7 uses
   `git merge-base --is-ancestor <PR-HEAD-SHA> origin/main` (correct
   post-merge ancestry semantics). The 20-19 round-1 B-1 mechanical-path
   lesson is applied. **PASS.**

7. **`parity-refresh.mjs` path** — V-4 / B-1 references it at
   `packages/app/scripts/parity-refresh.mjs:68-75`. LIVE-VERIFIED: the
   guard is exactly at lines 68-75. The 20-19 round-1 B-2 lesson is
   applied. **PASS.**

8. **PR title + body + `closes #159`** — V-4 action 7 has the verbatim PR
   title (`feat(20-20): splitRootAndChain PV49-extension on identifier-to-
   paren whitespace (#159)`) + body via HEREDOC + exactly one `closes #159`
   line. No `closes #153`. **PASS.**

## Discharged risks (intentional, not gaps)

- **PV54 dormancy** — explicitly stated 3× and verified at R-5 §6.2 (no new
  top-level tag). The FLOOR-grep audit ritual is correctly SKIPPED.
- **#153 multi-top-level deferral** — RESEARCH §4 GROUNDED the LAST-WINS
  upstream verdict for inheritance, with explicit "RE-POSE NOT REQUIRED"
  in RESEARCH §10. The plan records this in OBSERVATIONS + SUMMARY + the
  Ground Truth doc extension. Future #153 phase inherits without
  re-grounding.
- **Wave-A `_waveA-whitespace-probe.spec.ts` disposition** — gitignored per
  the 20-19 `_wave0-classify.spec.ts` precedent; the OBSERVATIONS record
  IS the source of truth. NOT a permanent regression spec (that role goes
  to the Wave-B `bakery-159-*.strudel` fixtures).
- **Optional `_wave159-grounding.spec.ts` SKIP default** — B-1 action 8
  defaults to SKIP unless Wave-A round-trip stdout shows ambiguity. The
  auto-discovered parity oracle already locks the fence. Sane default.

## Required revisions

None. Cosmetic only:

- MINOR (informational, no blocker): the `parity-refresh.mjs` exclusion
  guard at line 70 reads `if (TARGETS.some((t) => t.startsWith('bakery-')))
  throw new Error(...)`. It's a FAIL-LOUDLY guard, not a silent exclusion;
  the exclusion is by NOT being in TARGETS at all. The plan's wording
  ("structural exclusion guard") is correct in spirit; the actual mechanism
  is "TARGETS lists upstream tunes only; bakery-* slugs are excluded by
  construction (not by filtering)". B-1 action 6's `--dry-run` confirmation
  is the right verification regardless.

## Closing verdict

This is a TIGHT plan that faithfully encodes a TIGHT research. RESEARCH did
the heavy classification (D-02 grounded, D-03 deferred with evidence) and
the executor-side risk is genuinely small (single function, ~10 LoC
additive, strictly permissive). The 5 R-8 pre-mortems cover the realistic
failure modes. The 4 P68 anchors cleanly avoid the 20-17 / 20-19 anchor
traps. The dual gate arithmetic is correct.

**Verdict: PASS.** Plan is ready for execution.
