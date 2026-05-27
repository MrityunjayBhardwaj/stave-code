---
phase: 20-22
title: "Binding-ref arithmetic widen (D-02 occurs-check fix) + raw-RHS round-trip fidelity (D-01)"
status: COMPLETE (awaiting PR merge — Claude never merges)
branch: feat/20-22-binding-arithmetic
base: main (df24c1e)
upstream_pin: f73b395648645aabe699f91ba0989f35a6fd8a3c
target_issues: [141, 140]
tracking_issue: 167
decisions_honored: [D-01, D-02, D-03-amended]
commits:
  - "648b439 — Wave A (D-02 arithmetic widen)"
  - "ebedc0a — Wave B (D-01 substituteBoundIdentInArg)"
duration: ~1 session
---

# Phase 20-22 — SUMMARY

## What shipped (two surgical, additive edits to `parseStrudel.ts`)

1. **D-02 — the verdict lever (occurs-check terminal fix).** Widened
   `classifyLiteralRhs` with a STRICT enumerated-arithmetic grammar
   (`ARITH_RHS` = number tokens joined by exactly `/ * + -`, optional
   inter-token spaces; F3 verbatim). Reuses the existing `{literal:true;
   raw}` node shape — no new union arm, no PV52 ripple. `raw` is the source
   VERBATIM (matcher-not-interpreter: `172/4` stays the string, never `43`).

2. **D-01 — round-trip fidelity.** Added `substituteBoundIdentInArg(args,
   bindings)` (F1 option iii — reads `via.raw` off the existing literal arm,
   no new binding-map value shape). Wired into `applyMethod` at the two
   loc-safe F2 positions ONLY: numeric value parses (`parseFloat`/`parseInt`)
   and the `wrapAsOpaque` round-trip `via.args` string. PV52-guarded
   (`'literal' in via`); PV50-safe (trailing optional `bindings` param).

## The FALSIFIED-PREMISE note (P70/PK18) — carried verbatim

The stale #165 "binding-ref class = 24 (50%) → ~95.2%" premise is **FALSE on
current main**. Re-measured at phase start: binding-class is **8, not 24**;
all 4 CONTEXT-named repros already structure. The realistic aggregate parity
gain is **<1pp, within multi-slice noise** — and the observed result matches
exactly (+1 row of 150, see below). The phase value is the two
correctness/fidelity wins, NOT a parity-% target. D-01's ~0 verdict-flipping
delta is CORRECT per RESEARCH F4 (those programs already structure; D-01 is a
round-trip/code-invariance improvement, not a Code-fallback fix).

## D-03 dual gate — RESULT

**crit-1 (HARD — deterministic anchors, all RUN-observed, locked in
`binding-arithmetic.test.ts`):**
- `bakery-141-arith-rhs` (`let bpm=172/4`, referenced) → bareCode flips
  TRUE → FALSE (structured). ✓
- `bakery-141-arith-unreferenced` (`let bpm=172/4`, UNREFERENCED) → flips
  TRUE → FALSE. This is the proof it is the OCCURS-CHECK TERMINAL fix
  (pS:653), not a ref-site fix (RESEARCH Obs 4). ✓
- `bakery-141-binding-arg-text` (`.slow(n)`, `var n=4`) → structures as
  `Slow{factor:4}`, arg resolves to `4` (was `args="n"`). ✓
- opaque `.cpm(bpm)` (`let bpm=172/4`) → `via.args="172/4"` (was `"bpm"`,
  never `"43"`). ✓ (locks F2 position 2)

**crit-2 (must-not-regress ONLY — blended-150 sweep, pin f73b3956):**

| slice | PRE (baseline) | POST (post-fix) | Δ |
|---|---|---|---|
| offset 0 (N=50) | 50/50 = 100.0% | 50/50 = 100.0% | flat |
| offset 100 (N=50) | 46/50 = 92.0% | 46/50 = 92.0% | flat |
| offset 250 (N=50) | 42/50 = 84.0% | **43/50 = 86.0%** | **+1** |
| **blended-150** | **138/150 = 92.0%** | **139/150 = 92.7%** | **+0.7pp** |

- **ZERO per-slice regression.** Two slices flat, one UP. The single flip in
  offset-250 is `1APcTv7DyEkW` (`let bpm = 172/4`) code → structured —
  verified by a per-sample verdict diff (exactly one flip, no
  structured→code regression anywhere). The +0.7pp is exactly the "<1pp,
  within multi-slice noise" the CONTEXT predicted (one arithmetic row).
- Sampling method: 3 non-overlapping hash-ascending windows (offset 0/100/
  250), N=50 each, pin `f73b3956`. Artifacts in `.bakery-runs/` (gitignored).
  (PV55/P71 — N + sampling method cited; sweep, not fixed window.)

## Test counts (the INTENDED bump — not a regression)

- **Editor: 1627 → 1640** (+13). The +13 is the updated
  `parseStrudel.literalRhs.test.ts` contract spec: `4 + 1` / `4+1` / `1 - 1`
  / `172/4` etc. moved from negative → positive (the new arithmetic arm), and
  new closed-grammar negatives (`bpm/2`, `(1+2)/3`, `2**3`, `10%3`, leading/
  trailing op) were added to pin the boundary. The OLD negatives encoded the
  pre-D-02 contract; D-02 (LOCKED) deliberately moves that boundary.
- **App: 417 → 430** (+13): +6 from the 3 auto-discovered fixtures
  (`readdirSync` in BOTH parity.test.ts + loc-fidelity.test.ts → 3 parity it
  + 3 loc-fidelity it) + 7 from `binding-arithmetic.test.ts` (2 D-02 + 2 D-01
  + 3 negative controls). The new parity/loc-fidelity snapshots are INTENDED
  (the bareCode→structured flips ARE the D-02 proof — "the diff IS the news").

## F2 STOP gate (the primary risk, PV49) — held

The loc-fidelity snapshot over all **50 pre-existing fixtures** showed ZERO
`"text"` field changes — only tag-name changes (`Code`→`Slow`). Every
`src.slice(loc.start, loc.end)` still byte-matches the original source. No
loc anchor moved; the textual substitution did NOT leak into a loc-bearing
leaf. Three fixtures' parity snapshots changed shape — all expected:
`bakery-141-arith-rhs` + `bakery-141-binding-arg-text` (the targets) +
`bakery-140-binding-transitive` (`.slow(numChords)` / `numChords=4`, a free
fidelity win on a real corpus tune). No collateral drift on the other 49.

## D-02 STOP boundary (P70 / #140 γ-4) — held, NOT widened

The F3 boundary table RAN 11/11: all IN cases (`172/4`, `121.9/60/4`, `2*3`,
`1 + 1`, `120 / 4`) non-null with verbatim raw; all OUT cases (`foo(2)`,
`bpm/2`, `(1+2)/3`, `2**3`) null → graceful bareCode. The grammar stayed
CLOSED — no temptation to admit operand-idents or parens surfaced. Negative
controls in `binding-arithmetic.test.ts` lock the closure permanently.

## Out-of-scope residuals (flagged, NOT chased — P70 scope discipline)

These remain in the offset-100/250 fallback sets and are deliberately not
addressed (different mechanism classes, separate phases):
- Mixed-mechanism builder-root rows `19iySfKDfQK5` / `-fCGl4WEIQJD` (bail on
  `cat`/`arrange`/`transpose` builder-root RHS — #156/builder territory).
- Standalone-setter shape-fence `1fsSfbWlzbJo` (`cpm(120/4)` →
  `buildBindingMap` shape-fence; same class as 20-18 #158/#3).
- #142 samples-obj-lit; #143 guarded-boot; top-level `function` decls;
  comment-only / `//`-header rows; deliberate-correct arrow-fn bareCode.

## Catalogue

- **PV49/PV53 addendum (CANDIDATE)** appended to `.anvi/vyapti.md`: "textual
  raw-RHS substitution may target ONLY value-operands + round-trip `via.args`,
  NEVER a loc-bearing re-parse at the use site." Single occurrence → carried
  as candidate + memory; promote to a full PV on recurrence (dharana-spec).
- No new hetvabhasa occurrence: the F2 fence and the D-02 closure were
  ANTICIPATED in RESEARCH, not rediscovered through failed fixes (a clean
  cascade run; no PK18 re-pose).

## Cognitive Discoveries
<!-- Internal — consumed by execute-phase orchestrator for catalogue updates -->

- vyapti (candidate): textual-substitution loc-fence — F2 positions 1+2 only,
  position 3 forbidden — confirmed by the empty-`"text"`-diff over 50 fixtures.
  Discovered/validated in Wave B.
- krama (confirmed): the occurs-check terminal (pS:653) sinks the WHOLE binding
  map on ANY single unresolvable RHS, regardless of reference. Widening
  `classifyLiteralRhs` recognition is the lever — confirmed by the
  UNREFERENCED `let bpm=172/4` flipping. Wave A.
