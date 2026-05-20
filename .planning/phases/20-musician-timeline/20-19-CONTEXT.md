---
phase: 20-19
title: buildBindingMap shape-fence — `bindings*, sideEffect, finalExpr` (20-18 AMENDMENT-2 deferred class)
created: 2026-05-20T10:29:30Z
decisions: 4
issues: ["#158"]
related_backlog: ["#156", "#159", "#149", "#147", "#153"]
research_seed: .planning/phases/20-musician-timeline/20-18-OBSERVATIONS.md §"Wave C — `chord`/`arrange` grounded modelling + #7 PASS + #3 PK18 STOP" (lines 967-1180) + gh issue #158 + 20-18 PLAN.md pre-mortem 2 (line 380)
exemplar: packages/app/tests/parity-corpus/.bakery-runs/samples-2026-05-19T20-17-24-486Z.json row `-6c1hEXe8Agi` (Wave-C stripped-#3 probe is the load-bearing evidence: same source minus the `all(x=>x.punchcard())` line parses STRUCTURED `Track/body.tag=Pick`, deep Builder/chord HIT, args="\"Am Am\"")
upstream_pin_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
baseline_parity: "92.0% (46/50, N=50, 2026-05-19T20-17-24-486Z, sha f73b3956) — the must-not-regress floor"
target_parity: "≥94.0% (fresh PK17-step-6 re-measure; dual gate; closing #158 alone moves #3 from the 4 residuals → 47/50; no bar-lowering)"
gate: dual (#3 `-6c1hEXe8Agi` STRUCTURED in production — `_waveC-grounding.spec.ts` locked-STOP marker flips from `false` to `true` — AND fresh parity ≥94.0% AND must-not-regress 92.0% floor)
prior_baseline_on_main: "editor 1627/1627, app 387/387 (parity-corpus 36 + loc-fidelity 36), main HEAD 2f27485 (20-18 merged PR #160 2026-05-20T08:56Z)"
---

# Phase 20-19 Context — `buildBindingMap` shape-fence on `bindings*, sideEffect, finalExpr`

## What this phase is (corrected framing — load-bearing handoff)

Phase 20-18 closed the chain-root recognition gap (`closes #155`) and
shipped the Strudel signal/builder Layer-1/2 IR substrate (21 Signal +
6 Builder kinds modelled, including chord/arrange grounded at
`controls.mjs:2130` + `pattern.mjs:1469-1473` via the P69
Ground-first discharge). Wave-V crit-2 hit **92.0% N=50** (46/50,
+6pp over the 86% floor; D-03 AMENDED dual gate met).

**One residual blocker on the canonical #3 `-6c1hEXe8Agi`** was
recorded as a NEW-class PK18 STOP and routed to backlog
(`#158`) — the AMENDMENT-2 dropped #3 from 20-18 crit-1 on
EVIDENCE (the chord arm is correct; 4 independent Wave-C observations
proved this: stripped-#3 probe HITs Builder/chord; belldub/dinofunk/
meltingsubmarine corpus peers all flip with chord recognition; #7
`-KLGNJUtyyj1` peer is structured). **#3's actual blocker is a
DIFFERENT MECHANISM CLASS** — `buildBindingMap` rejects the
program-level shape `bindings*, sideEffect, finalExpr`.

**The mechanism (grep-grounded on real main `parseStrudel.ts:486-595`):**

- `splitTopLevelStatements` (pS:364-481) splits #3's source into N+2
  stmts: `let intro=…; let core1=…; … ; let outro=…;` (N bindings),
  then `all(x=>x.punchcard())` (a side-effect call statement), then
  `"< 0!8 1!12 2!4 3!4 4!4 5!4>".pick([intro,core1,…])` (the
  finalExpr pattern).
- The loop at pS:511-530 sets `finalIdx` at the FIRST non-binding
  stmt — which is the `all(...)` side-effect call.
- The shape guard at **pS:534** (`finalIdx !== stmts.length - 1`)
  trips because one more stmt (the real `.pick(...)` finalExpr) sits
  AFTER the side-effect → `buildBindingMap` returns `null` → whole
  program falls back to bareCode (the `all` line, the bindings, AND
  the structured `.pick(...)` chain are all flattened to 2781 chars
  of `body.code`).

**Direct evidence** (Wave-C `_waveC-diagnose.spec.ts` "proves chord
works" probe, captured in `/tmp/waveC-grounding-output.txt`,
referenced in 20-18-OBSERVATIONS.md:1076-1101):

```
stripped-#3 (without `all(x=>x.punchcard())` line):
  parseStrudel → Track/body.tag=Pick, deep-walk Builder/chord = HIT,
  args="\"Am Am\""

#3 unchanged:
  parseStrudel → Track/body.tag=Code bare=true (2781-char fallback)
```

The chord recogniser arm is correct. The program-shape rejection
blocks the whole-program flip. **This phase relaxes the shape-fence
narrowly + by-curated-list to recognise side-effect-only intermediate
statements, restoring the structured projection for #3 without
widening past observation.**

## Locked Decisions

### D-01: Recognition policy — curated closed-set of side-effect call tokens

**Decision:** A hand-curated, upstream-SHA-pinned closed set of
known side-effect-only call tokens (returns discarded; no value
flows downstream) is the recognition mechanism. Initial set seeded
from the canonical exemplar + the issue #158 candidate list:

```
all, samples, setcps, setcpm, setCps, setCpm, useRNG,
setVoicingRange, initAudio, aliasBank
```

Anything not on the list still falls through to bareCode (#3 only
needs `all`; the others enable mid-body recognition for the cases
where these tokens appear between bindings and the finalExpr rather
than at the prelude).

**Rationale:** Mirrors the proven 20-15 G2 / 20-14 `aliases.ts` /
20-18 D-01 curated-list precedent. Every entry is a ~1-line regex
extension + one CI fixture, with Codeberg-SHA-pinned provenance
(same anti-drift mechanism as `PRELUDE_CALL_RE` at pS:195-196 and
`GUARDED_BOOT_RE` at pS:228-229). Conservative by construction:
unrecognised intermediates still trip the shape-fence and fall
through to bareCode (matches today's behaviour exactly for any
stmt not on the list). Honors the P70 directive: classify by
observation what's actually out there before locking the
recognition policy; the curated list grows from real friction
(20-14/20-16/20-18 method), never from inference.

**Rejected alternatives:**

- **B (generalised shape walk)** — walking back from
  `stmts.length-1` and accepting ANY intermediate non-binding stmt
  as side-effect-tolerable would silently drop pattern statements
  the user intended as the finalExpr (e.g. a 2-line program where
  the user typed two bare pattern statements, the latter being the
  finalExpr). Wider blast radius; loses the "list grows from
  observation" discipline; conflates "this is not a binding" with
  "this is a discardable side-effect."
- **C (compose with 20-18 `CHAIN_ROOT_RECOGNISER`)** — the curated
  Map at 20-18 is for structured-pattern roots (chord, arrange,
  irand, sine, …), not side-effect-only roots. `all(...)` is a
  pattern transform applied to all currently-active patterns
  (zero-pattern return), `samples(...)` is an async sample-loader
  side effect, `setcpm(...)` is a tempo mutation — distinct classes
  from "this is a continuous signal." Conflating them would muddy
  the 20-18 substrate.

### D-02: Pipeline site — pre-process strip from `splitTopLevelStatements` output

**Decision:** The recognition logic lives as a NEW helper applied
AFTER `splitTopLevelStatements` and BEFORE `buildBindingMap`
consumes the array. Concretely, a `stripSideEffectStatements`
function (or inline filter step inside `buildBindingMap`'s
preamble) filters recognised side-effect statements out of the
stmts array; what remains is exactly the `bindings*, finalExpr`
shape the existing guard at pS:534 already accepts. **No code path
in `buildBindingMap`'s loop, fixpoint, or shape guard moves; the
filter happens upstream of all of them.**

**Rationale:** Same code idiom as `stripParserPrelude`
(pS:163-331) and the prelude-strip → buildBindingMap pipeline that
already exists (pS:643-662). Zero IR-shape change — side-effect
stmts vanish from the IR projection (they have no musical effect
on the pattern; the user's intent is satisfied by them executing
in the JS eval-time pass, NOT by them being modelled in
PatternIR). PV49 loc-additivity preserved by construction: the
remaining stmts keep their original `offset` fields (we filter
the array, not the text); `finalOffset` still points at the
genuine finalExpr in the original source. No change to the shape
guard's predicate (`finalIdx !== stmts.length - 1`) — its semantics
are unchanged; it just sees a shorter array.

**Rejected alternatives:**

- **B (relax `buildBindingMap`'s shape walker in-place)** —
  modifying the loop to walk backward (stmts[-1]=finalExpr,
  intermediates classified) co-locates recognition with binding
  classification but invasively changes the shape guard's
  semantics, requires re-verification of every binding-loop
  invariant (the bounded least-fixpoint, the occurs-check
  terminal, the def-site offset arithmetic — all are byte-stable
  today and survive a refactor only by accident). Higher
  blast radius for the same outcome.
- **C (two-stage with IR side-channel for #147)** — emitting
  recognised side-effects into a side-channel as a precursor to
  `#147 samples()-capture` widens scope beyond the gate. Side-
  effect annotations in PatternIR are a Layer-2/3 concern that
  needs its own discuss-phase (no consumer plan exists for them
  in 20-19's scope). 20-19 ships only the shape-fence relaxation;
  #147 stays backlog and gets its own phase when scoped.

### D-03: Scope — strict (#158 only; classify others by observation, never reclassify)

**Decision:** This phase fixes exactly `#158` (the
`buildBindingMap` shape-fence on `bindings*, sideEffect,
finalExpr`). Wave 0 RUNS each of the carried/open backlog items
through `parseStrudel` on a vendored fixture set and classifies by
DIRECT OBSERVATION (the P70 directive — RUN samples, do not infer
class membership). Specifically:

- **#159** — `-G2drHRNFueu` `sound ("hh hh hh hh")` (whitespace
  between identifier and open-paren). Wave-0 vendors fixture
  + runs `parseStrudel('sound (...)') vs parseStrudel('sound(...)')`.
  If only delta is whitespace AND the bug is upstream of
  `buildBindingMap` (tokenizer / chain-root identification) →
  class = tokenizer-fence, OUT of 20-19 scope → stays backlog
  for 20-20+. If the cleaned form bareCodes too → class =
  multi-top-level-expr (= #153) → duplicate-close #159, stays
  backlog.
- **#156** — Phase 20-17 V-1 single uncategorised Code-fallback.
  Wave-0 RE-RUNS the row through `parseStrudel`. If it falls into
  the shape-fence class, it's in-scope as a bonus close;
  otherwise stays backlog.
- **#149/#147/#153** — already documented as different classes
  (template-literal root + `.cpm(binding)` / side-channel
  registration / multi-top-level-expr). Wave-0 spot-checks each
  to CONFIRM the class is not actually shape-fence; if
  observation agrees with the existing classification, they stay
  backlog.

**Rationale:** Mirrors 20-18 D-03's mechanism-class discipline:
scope tied to ONE mechanism class (the shape-fence). New gap
classes surfaced during execution → backlog → 20-20+, NEVER
scope-expanded into the current phase (the 20-16 4×-cascade /
20-18 scope-discipline lesson; PK18 HARD-GATE cascade discipline
is the framing). The classification gate is **executed
observation**, not inference (P70 occurrences 1-7; every
class-by-inference in this phase family has been falsified at
least once).

**Rejected alternatives:**

- **B (wider — fix #158 + opportunistic close of any
  shape-fence-class items from {#156, #159})** — formally
  identical to A if Wave-0 classification puts any in-class,
  but pre-committing to "opportunistic close" risks
  scope-creep when Wave-0 finds NOT-in-class evidence (the
  20-16 cascade pattern: a "wider" scope decision is a
  prior-art bias toward including, not toward classifying).
- **C (stretch — fix #149/#147/#153 regardless of class)** —
  rejected outright. Three distinct mechanism classes in one
  phase is the exact pattern P70 catalogues as the dominant
  multi-attempt-fix failure mode.

### D-04: Pass gate — dual; #3 STRUCTURED + parity ≥94.0% + must-not-regress 92.0% floor

**Decision:** The phase ships when BOTH of the following hold on
the SAME merge commit verified on real main `dist/index.js`:

- **crit-1 (HARD):** `_waveC-grounding.spec.ts` (the maintainer
  harness vendored in 20-18 Wave C, hard-coded
  `expect(struct3 …).toBe(false)` locked-STOP marker at line ~?? —
  the locked-STOP marker LOUDLY breaks when #3 flips to STRUCTURED;
  Wave V flips it from `false` → `true` as part of the close)
  passes with #3's whole-program parse showing:
  - `body.tag === 'Pick'` (the pick-pattern root)
  - deep-walk for `tag === 'Builder' && kind === 'chord'` returns
    AT LEAST ONE HIT with `args === '"Am Am"'` (the chord recogniser
    arm — already proven correct in 20-18 Wave C)
  - the original 2781-char bareCode body NO LONGER appears.
- **crit-2 (HARD):** Fresh `pnpm parity:bakery --n 50` (PK17
  step-6 cadence; new ISO stamp; same upstream pin SHA
  `f73b395648645aabe699f91ba0989f35a6fd8a3c`) reports
  **≥ 94.0% (47/50)** AND **must-not-regress** the 92.0% (46/50)
  baseline. Closing #158 alone is expected to move the #3 row
  from the 4 residuals → 47/50 = 94.0%; gate fails if the fresh
  measurement comes in below 92.0% (a regression even with
  #3 flipped means a regression elsewhere — STOP, classify, report).

**No bar-lowering. No second-workaround. No push-through.**
If crit-1 passes but crit-2 falsifies the 92.0% floor:
PK18 STOP → classify the regression → re-pose D-04 to the user
with EVIDENCE → never amend the floor downward (the 20-17
`--LsnlgQ6osk` and 20-18 AMENDMENT-2 precedent: amend the SCOPE
to remove a non-target case from the gate ON EVIDENCE; never
amend the FLOOR or the must-not-regress invariant).

**Rationale:** Exact 20-18 AMENDED D-03 mechanism (the proven
discipline; 86%→92% floor was met on first fresh measurement
without bar-lowering). The arithmetic: 46/50 → 47/50 is the
single-class expected improvement; gate at +2pp keeps honesty
(no inflation from un-related drift). Mirrors PK17's
"must-not-regress floor" pattern.

## Scope Boundary

**IN:**
- `splitTopLevelStatements` output filter (new helper) recognising
  the curated side-effect-call closed set (D-01).
- One-line + provenance comment per side-effect token (Codeberg-SHA
  pin, same anti-drift mechanism as `PRELUDE_CALL_RE`).
- `parseStrudel.ts` integration at the `buildBindingMap` callsite
  (pS:660; D-02 pre-process site).
- Wave-V flip of the 20-18 `_waveC-grounding.spec.ts` locked-STOP
  marker from `toBe(false)` to `toBe(true)` on the #3 path
  (Wave-C's "record-the-STOP" assertion becomes "record-the-FLIP" —
  the same test file; the breaking assertion IS the gate signal).
- One CI fixture per side-effect token added to the list (the
  20-14 V-3 / 20-18 V-2 cadence; vendored under
  `packages/app/tests/parity-corpus/`).
- Cross-wave per-file loc-fidelity STOP gate (V-3; 20-17/20-18
  cadence; PV49 definition-site additivity carries by
  construction).
- Wave-0 classification probe for backlog items (D-03), recorded
  verbatim in 20-19-OBSERVATIONS.md.

**OUT:**
- Side-channel capture of recognised side-effects into PatternIR
  (the C-option from D-02) — that's #147's job and needs its own
  discuss-phase.
- Any NEW top-level PatternIR `tag` — shape-fence relaxation is
  parser-pipeline, not tag-family. (PV54 FLOOR-grep obligation
  does NOT apply; this phase is not tag-additive.)
- #149/#147/#153/#159/#156 fixes — backlog only (D-03 strict).
- Any change to `buildBindingMap`'s loop, fixpoint, occurs-check
  terminal, or def-site offset arithmetic (D-02 mandates the
  filter is upstream of the loop entirely).
- Any change to the 20-18 `CHAIN_ROOT_RECOGNISER` curated Map or
  the flagged-general off-by-default opts (PV54; side-effect
  recognition is a SEPARATE concern from chain-root recognition).

## Codebase Context (Chesterton scan — what exists before changing)

**Two precedent curated-list mechanisms already in `parseStrudel.ts`
that D-01 mirrors:**

- `PRELUDE_CALL_RE` (pS:195-196) — `^[ \t]*(?:samples|useRNG|setcps|
  setCps|setcpm|setCpm|setVoicingRange|initAudio|aliasBank)\s*\(/` —
  whole-line classifier for prelude (top-of-program) side-effect
  calls, multi-line depth-walker consumes through depth-0 close
  paren (pS:256-323). Codeberg-SHA-pinned provenance block at
  pS:167-194; HAND-MAINTAINED list with the anti-drift mechanism
  (one CI fixture per token).
- `GUARDED_BOOT_RE` (pS:228-229) — second-line classifier for the
  `typeof X !== 'undefined' && X(...)` defensive idiom; routes
  through the SAME unchanged multi-line walker (recognition widens,
  consume mechanism does not). Provenance block at pS:211-227.

**The shape-fence in `buildBindingMap`:**

- `buildBindingMap` (pS:486-595) — current loop sets `finalIdx` at
  the first non-binding stmt (pS:511-520), then guards at pS:534
  (`finalIdx !== stmts.length - 1`). The bounded least-fixpoint
  (20-17 E-1 mechanism, pS:551-582) and occurs-check terminal
  (pS:590) operate on the bindings array AFTER the shape guard
  passes — 20-19 leaves these byte-stable by pre-processing
  upstream.
- Callsite `parseStrudel.ts:660` (`const bound = buildBindingMap(
  stripped.body, stripped.offset)`) — the integration point;
  20-19 either adds a filter step before this call or makes
  `buildBindingMap` apply the filter internally as its first
  step. Decision deferred to PLAN (D-02 mandates the filter is
  upstream of the loop, not which exact line).

**Wave-C harnesses already vendored on main (20-18 V-2):**

- `bakery-chord-voicing-root.strudel` — the chord NEGATIVE-CONTROL
  fixture. Once 20-19 lands, this same fixture serves as a
  POSITIVE-CONTROL (chord recogniser + shape-fence relaxation
  together flip #3 to STRUCTURED).
- `_waveC-grounding.spec.ts` and `_waveC-diagnose.spec.ts` — Wave-C
  maintainer harnesses; the hard-coded `toBe(false)` assertion on
  #3 is the locked-STOP marker that 20-19 flips. (Exact path to
  be confirmed in PLAN's Wave-0 audit; 20-18 V-2 vendored them as
  permanent CI fixtures.)

**Test baselines on main HEAD `2f27485`:**

- `pnpm test` (editor): **1627/1627** ← must hold.
- `pnpm --filter @stave/app test`: **387/387** (parity-corpus
  **36/36** + loc-fidelity **36/36**) ← must hold.
- `pnpm parity:bakery --n 50` (sample `samples-2026-05-19T20-17-24-486Z.json`,
  upstream pin `f73b3956`): **92.0% (46/50)** ← must-not-regress floor.

**Catalogues to consult before/during planning:**

- **P70** (seven-occurrence pattern — the spine) — RUN samples,
  classify by observation, NEVER push through on inference.
- **PK18** — HARD-GATE cascade discipline; if any premise
  falsifies, STOP / record verbatim / re-pose to user.
- **P69** — Grounding Check: file:line citations are not
  observation until grepped/executed.
- **PV54** — additive-tag FLOOR-grep obligation; not triggered
  this phase (no new tag) but the meta-principle applies if any
  NEW top-level PatternIR shape ships (which it should NOT).
- **PV49** — definition-site loc-additivity; carries by
  construction (we filter the stmts array, not the source text).
- **P68** — editor watch unreliable; one-shot build + grep
  before every editor-src commit.
- **feedback_commit_msg_heredoc** — `git commit -F -` with
  `<<'MSG'` heredoc; NEVER `-m` with backticks/`$()` under zsh.

## Open Questions Deferred to PLAN

These are NOT user-blocking; PLAN/RESEARCH resolves them:

- **Exact closed-set initial members.** D-01 lists ~10 candidate
  tokens; PLAN/RESEARCH audits the upstream Codeberg source
  (`@strudel/core` `repl.mjs` + `pattern.mjs`) at pin
  `f73b3956` to confirm which are genuinely pure-side-effect
  (return discarded; no value flows downstream). `all` MUST be
  in the set (the canonical exemplar). Anything that returns
  a Pattern (not silence/undefined/Promise) does NOT belong.
- **Inline vs new helper.** Whether D-02's filter step is a
  function call in `buildBindingMap`'s preamble or an inline
  filter at the callsite (pS:660). PLAN picks based on test
  isolation needs.
- **The locked-STOP marker flip wave placement.** Wave V
  (verification) is the most-natural site (the gate signal
  for crit-1). PLAN confirms.

## Routing

Next: `/anvi:plan-phase 20-19`
