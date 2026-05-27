# Phase 20-22 — PLAN CHECK

**Verdict: PASS (with MINOR revisions advised)**

Checked against the REFRAMED goal (D-02 occurs-check widen as the verdict lever +
D-01 raw-RHS round-trip fidelity, NOT a parity-% target). All cited line numbers
were grepped against `packages/editor/src/ir/parseStrudel.ts` and verify exactly.
No BLOCKER or MAJOR findings. Five MINOR findings, all advisory.

---

## Goal-backward verdict

The plan achieves the reframed goal. The three goal clauses trace cleanly:

1. **D-02 verdict flip** — Wave A widens `classifyLiteralRhs` (verified at
   parseStrudel.ts:119-128; the `via.raw` arm at :127; the F3 grammar matches
   RESEARCH F3 verbatim). The occurs-check terminal `if (pending.size > 0) return null`
   is real at :653, reached via the fixpoint at :612-645. Widening recognition
   clears `pending` — mechanism is correct. The acceptance proof uses the
   UNREFERENCED case (`let bpm=172/4; stack(s("bd"))`), which is the deliberate
   proof it is the occurs-check terminal, not a ref-site fix (RESEARCH Obs 4). GOAL-1 met.

2. **D-01 round-trip fidelity, arg-positions ONLY** — Wave B's `substituteBoundIdentInArg`
   reads `via.raw` off the existing literal arm (F1 option iii — no new map shape,
   PV52 not newly triggered). Fenced to F2 positions (1) numeric-arm value operands
   (verified: `slow`/`fast` do `parseFloat(args.trim())` at :1779/:1785, loc comes
   from `callSiteRange`) and (2) opaque `via.args` round-trip text (verified:
   `wrapAsOpaque` loc = `callSiteRange`, computed at :1730-1734 independent of
   `args`, :83). Position (3) re-parse-into-loc-leaves is explicitly FORBIDDEN.
   GOAL-2 met.

3. **D-03 AMENDED gate** — V.1 gates on crit-1 (three RUN assertions: arith exemplar
   flip + unreferenced flip + args="4") and crit-2 (must-not-regress per-slice only,
   aggregate NOT gated). Matches the amended D-03 in CONTEXT exactly. GOAL-3 met.

---

## Cognitive dimensions (A–F)

- **A. Vyapti** — PASS. PV49 F2 fence is sufficient AS DESIGNED: substituted text
  in positions (1)+(2) never becomes a loc anchor (confirmed against source). No task
  routes a mutated string into a loc-bearing re-parse. PV50 honored (`bindings` stays
  a trailing optional param — verified at :1775). PV52 not newly triggered (reuses
  existing `{literal:true; raw}` arm; the ONE new `bindings.get()` reader guards
  `'literal' in via`). PV53 holds (D-02 inside the existing fixpoint, no new recursion).
- **B. Krama** — PASS. PK16 ordering correct: D-02 at recognition (inside fixpoint),
  D-01 at arg-consume (after map built). Wave 0.2 RUN-baseline is gated BEFORE any
  code edit (P71/PK18). D-02 is correctly independent of D-01.
- **C. Hetvabhasa** — PASS. P70/#140 γ-4: grammar is provably closed (number tokens +
  exactly `/ * + -`, no recursion); negative controls `foo(2)`/`bpm/2`/`(1+2)/3`/`2**3`
  present in BOTH the A.1 boundary table and the V.2 spec; STOP→pure-literal escape
  hatch explicit. P68: one-shot build + dist/ grep before every editor-src commit,
  with keepNames-aware fallback. P71/PV55: gate is a 3-slice sweep, not the dead
  offset=0 window.
- **D. Observation testability** — PASS. Every acceptance is a concrete RUN
  (boundary table, fixture-through-parseStrudel + isCodeFallback, loc-fidelity
  empty-diff). The unreferenced-case proof is present (V.1 crit-1).
- **E. Ownership** — PASS. Unambiguous: `classifyLiteralRhs` produces `via.raw`;
  `substituteBoundIdentInArg` READS `bindings` + `via.raw` and TRANSFORMS the args
  string; the arm CONSUMES it. The primitive only reads, never evaluates.
- **F. UX precedent** — N/A (parser-internal). Confirmed matcher-not-interpreter:
  substitutes raw text Strudel itself evaluates (`172/4`), never computes `43`.

---

## Standard dimensions (1–7)

Task atomicity, ordering/deps (acyclic: 0.1→{0.2,0.3}→A→B→V), acceptance concreteness,
scope boundary (OUT residuals flagged not chased), commit/PR discipline (heredoc,
no co-author, non-stacked PR, Claude never merges), requirements coverage, no orphans
— ALL satisfied.

---

## Findings (all MINOR — advisory, none blocking)

### MINOR-1 — Baseline SHA / test-count drift (tasks: header, 0.1, 0.2)
The plan pins `baseline_sha: 7ebcef7` and states `app 417/417 (parity-corpus 49 +
loc-fidelity 49 + other 319)`. Observed on disk: current main HEAD is `2cdcaae`
(7ebcef7 is an ancestor; the 3 intervening commits are docs/planning ONLY — no
source or fixture diff, verified via `git diff --stat 7ebcef7..HEAD` on
`parity-corpus/` + `ir/` = empty). So 7ebcef7 is code-identical for this surface —
benign. BUT there are **50 `.strudel` fixtures (50 parity snapshot entries), not 49**,
so the per-category split and the `417` total are likely stale by at least the fixture
delta. Wave 0.2 must record the TRUE current counts. Suggestion: branch from current
`main` HEAD (not a detached `7ebcef7` checkout, which would orphan the uncommitted
planning docs), and treat the `417` / `49` numbers as to-be-confirmed in 0.2, not as
hard pre-conditions.

### MINOR-2 — V.2 "increments past 417" is mis-stated; the fixtures ALREADY auto-run (tasks: 0.3, V.2)
This is the load-bearing structural correction. Both `parity.test.ts` AND
`loc-fidelity.test.ts` auto-discover EVERY `.strudel` file via
`readdirSync().filter(f => f.endsWith('.strudel'))` (verified: parity.test.ts:44-48,
:60-70 `toMatchSnapshot`; loc-fidelity.test.ts:41-42). The instant Wave 0.3 drops the
3 new fixtures into `parity-corpus/`, they become 3 new parity snapshot `it()` blocks
+ 3 new loc-fidelity `it()` blocks — in the DEFAULT `.test.{ts,tsx}` gate (vitest
include = `tests/parity-corpus/**/*.test.{ts,tsx}`). So the app count rises by ~6 from
fixture vendoring ALONE, independent of V.2's new spec. Two consequences the plan does
not call out:
  (a) The Wave 0.3 fixtures will produce FAILING parity snapshots on first run (no
      stored snapshot) — expected, but A.1/B.2 must regenerate them (`vitest -u`)
      deliberately, and the parity.test.ts drift policy (the snapshot diff "IS the
      news") means the PR body must call out the new snapshots. The plan's A.1/B.2
      acceptance probes RUN parseStrudel directly (good) but do not mention the
      snapshot regen step.
  (b) The 3 new fixtures ALSO get loc-fidelity coverage automatically — which is
      actually a bonus (free loc assertion on the new arith/arg-text shapes), but B.3's
      "empty-diff vs 7ebcef7 baseline" framing must account for the fact that the
      3 new fixtures have NO 7ebcef7 baseline (they did not exist then). The empty-diff
      gate is over the PRE-EXISTING 50, not the new 3.
Suggestion: reword V.2's verify from "count increments beyond 417" to "the 3 fixtures
land as parity+loc snapshot blocks (≈+6) AND the V.2 verdict spec adds its own count";
add an explicit `vitest -u` snapshot-regen + PR-callout step to A.1/B.2; scope B.3's
empty-diff to the pre-existing fixtures.

### MINOR-3 — V.2 spec MUST be named `*.test.ts`, not `*.spec.ts` (task: V.2)
V.2 says "NOT env-gated like `_bakery-classify`" — correct intent, but the gating
mechanism is NOT (only) env. The vitest include glob is `**/*.test.{ts,tsx}`;
`.spec.ts` files are NOT matched at all (and the `_`-prefixed specs like
`_proto-d01.spec.ts`, `_waveB-strict-widen.spec.ts` are dormant scaffolding). If the
executor names the new spec `bakery-141.spec.ts` it will SILENTLY not run — the exact
"inert wall" the task's own pre-mortem warns against. Suggestion: name it
`tests/parity-corpus/binding-arith.test.ts` (`.test.ts`, no leading underscore) and
add a verify step that asserts the spec's `it` count actually appears in the run output.

### MINOR-4 — V.2 negative controls partially redundant with auto-snapshots (task: V.2)
The negative-control assertions (`foo(2)`/`bpm/2`/`(1+2)/3` stay bareCode) are valuable
as an explicit IN/OUT wall. But note the A.1 boundary table already RUNs the
`classifyLiteralRhs`-level IN/OUT, and any negative-control `.strudel` fixture dropped
in parity-corpus would also auto-snapshot. No change required — just avoid
double-vendoring the same shape as both a `.strudel` fixture AND an inline spec string
(pick one home per case to prevent drift). Suggestion: keep negative controls as inline
strings in the `.test.ts` spec (not as `.strudel` fixtures) so they do not inflate the
auto-discovered corpus with deliberate-bareCode rows that would muddy parity %.

### MINOR-5 — D-01 "opaque via.args" acceptance lacks a permanent fixture home (tasks: B.2, V.2)
B.2 verifies the opaque-wrap round-trip (`.cpm(bpm)` with `let bpm=172/4` →
`via.args === "172/4"`) as a one-off RUN, but V.2's permanent wall only locks the
numeric-arm `args="4"` case (`bakery-141-binding-arg-text`). The opaque-`via.args`
round-trip (F2 position 2) has no permanent regression fixture. Since position (2) is
half the D-01 fence, a regression there would go uncaught after the phase. Suggestion:
add one permanent assertion for the opaque-wrap `via.args` raw round-trip to the V.2
`.test.ts` spec.

---

## V.2 judgment call — always-on CI wall vs maintainer-gated

**Verdict: an always-on default-gate spec is APPROPRIATE here — but the plan's
rationale for WHY it differs from `_bakery-classify` is wrong, and that matters.**

`_bakery-classify.spec.ts` is maintainer-gated for a sound reason: it pulls LIVE data
from Supabase (`BAKERY_SAMPLES`/`BAKERY_RESULT` env), so it is non-deterministic and
network-dependent — correctly excluded from CI. The new V.2 assertions are the
OPPOSITE: fixed vendored `.strudel` fixtures, pure `parseStrudel`, fully deterministic,
no network. Deterministic parser-verdict assertions BELONG in the default gate — they
are exactly the kind of permanent regression wall the parity corpus already is. So:
keep it always-on. **Correction to the plan's framing:** the distinction is NOT
"env-gated vs not" as a stylistic choice — it is "non-deterministic network pull
(gate it) vs deterministic fixed-fixture verdict (run it always)." And per MINOR-3,
the actual run/skip lever is the `.test.ts` vs `.spec.ts` filename, not the env guard.
Net: appropriate as a permanent wall, provided it is named `.test.ts` and the bump in
app count is expected and recorded (not treated as a regression).
