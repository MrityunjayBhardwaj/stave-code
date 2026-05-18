---
phase: 20-16
created: 2026-05-18
revised: 2026-05-18 (Task-1 gate finding — resequenced segmenter-first)
decisions: 3
closes: ["#140", "#141", "#142", "#143", "#144"]
new_predecessor: ["#148"]
spun_out: ["#147", "#149"]
upstream_pin_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
baseline_parity: "72.0% (36/50, N=50, 2026-05-15T23-13-07Z, sha f73b3956)"
gate: verification-wave-passed
---

# Phase 20-16 Context — close the next Bakery parser-gap classes (#140–#144)

## GATE FINDING (2026-05-18, locked fact — corrects the dominant-blocker framing)

The Task-1 Lokāyata HARD GATE ran the D-01 prototype against the 6
measured #141 repros (commit `f54bb6b`, verbatim output in
`20-16-OBSERVATIONS.md`) and **falsified the original framing by direct
observation**: the dominant 6/14 #141 class does NOT bail at the
opaque-RHS fence on transitive bindings. It bails UPSTREAM —
`splitTopLevelStatements` (`parseStrudel.ts:346`) flushes on every
depth-0 `\n`, so a leading-dot multi-line chain continuation
(`const beat=sound(rp1)\n .gain(...)`) becomes a phantom statement and
`buildBindingMap`'s shape fence (pS:395-398) bails the whole program
**before the binding loop runs**. 4/6 repros never reach D-01.

**Consequence — resequence, NOT redesign. D-01/D-02/D-03 are UNCHANGED.**
- **Wave A is now #148** (NEW issue): make `splitTopLevelStatements`
  ASI/line-continuation aware — at a depth-0 `\n`, peek past
  whitespace + `//` via the existing PV49 `skipWhitespaceAndLineComments`
  primitive (pS:730 — do NOT hand-roll, per PV49); if the next non-ws
  token is `.`, it is a chain continuation, do NOT flush. Recognition
  only, stays a matcher. Orthogonal to bindings, testable in isolation.
- **Wave B is now D-01** (#140/#141, the design below, UNCHANGED) —
  re-gated: re-run the preserved prototype (`/tmp/proto-d01-fixpoint.spec.ts`)
  AFTER #148 lands to OBSERVE whether the 4 then reach + pass the
  fixpoint. D-01's payoff is only measurable post-#148.
- **Wave C / Verification** unchanged (#142/#143 strip, #144 root).
- **#149** (NEW, backlog, D-03 discipline): `note(\`template\`)` root +
  `.cpm(binding)` for `-72eEl7NwK9e`/`-1j62z5xjyCN` — measure frequency
  AFTER #148+D-01 (PK17: no circular re-measure on stale samples).

This phase is a **PK17 instance** (friction-first parity-hardening cycle:
measure real-world → classify → fix highest-frequency → re-measure →
vendor fixtures). It builds directly on the 20-15 substrate
(`buildBindingMap` stage-0.5, `parity-bakery.mjs` sampler, loc-fidelity
harness, 50-file corpus) and lives in the PK16(b) no-`$:` parse pipeline.

The pattern reader (`parseStrudel`) is the front door of the whole IR
pipeline (`propagation.ts:73-87` → `patternIR` → `collect` → `irEvents`
→ MusicalTimeline + IR Inspector + `toStrudel` round-trip). A
silently-wrong tree poisons all four consumers at once — this is why the
matcher-not-interpreter line is load-bearing, not aesthetic.

## Locked Decisions

### D-01: Binding-map generalization = least-fixpoint substitution (Datalog discipline)

**Decision:** Generalize `buildBindingMap` substitution beyond γ-3's
"bare ident inside `stack()` args" (#140) to the full #141 dominant class
(refs anywhere in the final expr; binding whose RHS references another
binding), implemented as a **monotone least-fixpoint over a substitution
lattice, stratified by an occurs-check** — NOT an imperative evaluator,
NOT a fenced heuristic. We do not need a Datalog *engine*; we need the
Datalog *discipline*.

**The matcher line, redefined (new invariant — catalogue as vyapti):**
*We compute the least fixpoint of binding **substitution** (decidable,
PTIME, pure term-rewriting). We never **evaluate** a term.*
`const b = a.fast(2)` → splice `a`'s parsed tree into the hole →
`n("0").fast(2)`; `.fast` is never run.

**Guarantees by construction (these replace stipulated fences):**
- **Total** — the fixpoint terminates. No halting problem (not
  Turing-complete by construction). Replaces "fence on infinite expansion".
- **Cycle handling** — `a→b, b→a` is non-stratifiable / occurs-check
  fails → graceful Code bail. The textbook answer, not a special case.
- **Order-independent** — forward references resolve *correctly* for
  `let`/`const`/`var` alike (it is term-splicing, not evaluation; no TDZ
  to model). This is what dissolves D-02.
- **PTIME** — N bindings → ≤ N fixpoint iterations, each polynomial in
  tree size. Bounded cost.

**The one fence Datalog does NOT remove — KEPT exactly as γ-3:** an RHS
that itself parses to bare Code (`const x = makeBass()`) is opaque → the
whole program falls to graceful Code (existing gate
`buildBindingMap` lines 388–392). Datalog removes the halting/ordering
fences, not the "RHS is not a pattern" fence. Also kept: D-02 matcher
boundary for destructuring / arrow-fn / `${}` RHS (correct Code-fallback,
not gaps).

**Rationale:** "Full imperative resolution" was dangerous because the
obvious implementation is Turing-complete (halting problem; failure mode
flips from honest "skipped" to silently-wrong structured IR — the P67
trap, poisoning timeline + Inspector + round-trip). The Datalog
discipline converts every stipulated fence into a *derived* property,
keeps us provably on the matcher side, and is consistent with the
project's existing ECS-propagation Datalog idiom. Chosen over my "fence"
recommendation because it is principled-by-construction, not heuristic.

**HARD GATE (Lokāyata, plan-phase task 1, before any impl):** a ~30-line
prototype over the 6 measured #141 repros (`--LsnlgQ6osk`, `-1j62z5xjyCN`,
`-72eEl7NwK9e`, `-CyO42BOyp5a`, `-L13nBhrqGR_`, `-LHtBlF8peGC`) + 1
synthetic cyclic repro. Confirm: (a) the 6 ground to correct structured
trees, (b) the cyclic repro bails to graceful Code via occurs-check,
(c) the dup-key (redeclaration) check fires. If the prototype fails the
core assumption is wrong → redesign before implementing.

### D-02: `var` semantics — dissolved by D-01

**Decision:** No hoisting model. Order-independence falls out of D-01's
fixpoint for free and *correctly* (substitution has no notion of textual
order; nothing is evaluated, so no TDZ). `let`/`const`/`var` resolve
identically. The only `var`-specific residue: **redeclaration** (`var x`
twice) → two facts for one key → the binding relation is not a function
→ graceful Code bail (principled via the functional-dependency /
stratification check, not a stipulated special case).

**Rationale:** Modeling `var` hoisting would be interpreter surface with
no measured Bakery demand. Under D-01 the question is moot — keeping it
moot (vs. adding a hoisting branch) is what contains D-01's blast radius.

### D-03: `samples({...})` boot calls — strip-only; capture deferred to #147

**Decision:** Extend the multi-line boot-call depth walker to
brace-balance object-literal args and recognise the
`samples('github:…')` / `samples('https://…')` string forms, then
**skip the whole call as prelude** (contributes nothing to IR — same
treatment as existing single-line `samples(...)`). #142 closed by
strip-only. **Do NOT** capture the registered sample keys.

The deferred half (shallow-parse → capture sample names into a
side-channel for a future autocomplete/alias consumer) is filed as
**#147** (AnviDev issue-before-fix; build only when a real consumer is
defined — honours P67 append-only / PV50 per-evaluate-accumulator
discipline at that time).

**Rationale:** Capture has zero parity-% payoff (the phase's only
verification gate) and widens the pure `parseStrudel` contract into
stateful territory (PV50 class) against an unknown future consumer —
speculative substrate that would drift. Strip-only closes the gap;
recording #147 keeps the idea without building it.

## Scope Boundary

**In:** #140 + #141 (D-01 Datalog substitution — Wave A, highest payoff);
#142 strip-only + #143 guarded `typeof X !== 'undefined' && X(...)` boot
expr (Wave B — same PK16(b) stage-1 `stripParserPrelude` surface as
#135/G2, R2 anti-drift: hand-maintained skip set + upstream-file comment +
SHA pin + per-shape CI fixture); #144 parenthesized-root `("…")` mini-root
+ leading-dot chain continuation (Wave C — `splitRootAndChain`/`parseRoot`
recognition gap, narrow: only `( <string-literal> )`, not arbitrary
parenthesized JS).

**Verification (PK17 step 6):** fresh ~50-sample `pnpm parity:bakery`
re-measure (target materially > 72.0%; cite N + date + upstream SHA);
vendor #140–#144 repros as permanent `bakery-*.strudel` fixtures;
loc-fidelity full-corpus empty-diff is THE pre-mortem gate (any
loc-fidelity-only diff = offset drift = STOP). NEW fallback classes
surfaced at re-measure → backlog issues, **NOT fixed** (D-03 scope
discipline).

**Out:** capture of `samples()` keys (#147); template-literal `${}`
interpolation eval; function/arrow-fn bindings; destructuring binds;
full binding *evaluation* (D-01 is substitution only); a full JS parser.
The structural matcher stays a matcher.

## Codebase Context

- `packages/editor/src/ir/parseStrudel.ts` — `buildBindingMap`
  (line 359, the stage-0.5 to generalize), `stripParserPrelude`
  (line 126, #142/#143 surface), `splitRootAndChain` (line 1855,
  #144 surface), `parseExpression`/`parseRoot`, `splitArgsWithOffsets`,
  `skipWhitespaceAndLineComments` (line 730 — PV49 realized shared
  primitive; route any new scanning through it).
- Existing D-02 fences to PRESERVE: `buildBindingMap` lines 382–398
  (reassignment/shadowing/opaque-RHS/shape).
- Build hygiene (P68/PV48): editor watch UNRELIABLE — one-shot
  `pnpm --filter @stave/editor build` + `grep -c <newSymbol> dist/index.js`
  before each editor-src commit.
- Catalogue updates expected: vyapti (new — "binding resolution is
  least-fixpoint substitution, not evaluation"; PV49 span addendum if a
  new walker is added), krama PK16(b) stage-0.5 amendment, PK17 (this
  cycle's measured numbers).

## Operational

AnviDev (issue→branch→fix→test→observe→PR→self-review→merge). Claude
never merges. Branch first (never code on main). Single non-stacked PR →
main. `.anvi/` + `.planning/` gitignored — `git add -f`. No
Co-Authored-By. Post-merge: verify the artifact (HEAD==merge + 0/0
divergence + code grep + test count), not the badge.

## REFRAME (2026-05-18, locked — after Wave A-0 investigation)

The Task-1 gate fired 4 times; Wave A-0 proved D-01 = a pervasive-context
parser refactor (G1 chain-arg / G2 root-ident / G3 literal-RHS / G4
applyChain threading), NOT the "minimal bounded fixpoint" CONTEXT D-01
assumed. User decision: **(B) reframe.**

**20-16 final scope (REFRAMED):**
- Wave 0 (#148+#150+#151+#152 segmenter) — SHIPPED (commit ff93c65).
- Wave B (#142 strip-only + #143 guarded-boot) — D-01-independent.
- Wave C (#144 paren-string root) — D-01-independent.
- Verification (PK17 step 6): fresh `pnpm parity:bakery` re-measure;
  vendor #148/#150/#151/#152/#142/#143/#144 fixtures; per-file
  loc-fidelity STOP gate; SUMMARY + catalogues.
- **D-01 (#140/#141) is REMOVED from 20-16** → dedicated **Phase 20-17**
  with pervasive-bindings-threading as the EXPLICIT design premise (its
  own discuss→research→plan→check). #149 stays backlog.

CONTEXT D-01 decision (least-fixpoint substitution / Datalog discipline)
remains VALID as 20-17's north star — only its host phase + the
"primitive already built" scoping premise changed. The Wave A-0
OBSERVATIONS section (the 4-gap map) is 20-17's RESEARCH seed.
