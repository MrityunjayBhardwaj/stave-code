---
phase: 20-18
title: Chain-root recognition — Strudel signal/builder family as Layer 1/2 Pattern IR
created: 2026-05-19T15:19:46Z
decisions: 4
issues: ["#155"]
related_backlog: ["#156", "#149", "#147", "#153"]
research_seed: .planning/phases/20-musician-timeline/20-17-OBSERVATIONS.md (Wave-E falsification trace + V-1 N=50 residual classification) + gh issue #155
exemplar: packages/app/tests/parity-corpus/bakery-runs/repro__LsnlgQ6osk.strudel (the `az2` declaration — vendored in 20-17 Wave 0)
upstream_pin_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
baseline_parity: "86.0% (43/50, N=50, 2026-05-19T13-24-45-538Z, sha f73b3956)"
target_parity: "≥90.0% (fresh PK17-step-6 re-measure; dual gate, NO bar-lowering)"
gate: dual (canonical `--LsnlgQ6osk` STRUCTURED in production AND fresh parity ≥90.0%)
prior_baseline_on_main: "editor 1603/1603, app 367/367 (parity-corpus 33 + loc-fidelity 33), main HEAD e3e6571 (20-17 merged PR #157)"
---

# Phase 20-18 Context — chain-root recognition for the Strudel signal/builder family

## What this phase is (corrected framing — Ground Truth grounded)

The Phase 20-17 V-1 N=50 fresh re-measure hit 86.0% structured. The
**dominant residual class (5/7 ≈ 71% of the fallbacks)** is
**opaque-by-SHAPE, not binding-blocked**: a chain whose ROOT is an
unbound Strudel free-function builder (`irand(12).struct(...)...`,
`perlin.range(...)...`, `sine.range(...)...`). D-01's matcher line
cannot reach this by design — there is no bound identifier to
substitute. The exemplar is `az2` in `repro__LsnlgQ6osk.strudel`
(20-17 Wave-E falsification trace; the case 20-17 had to RE-ANCHOR
D-03 crit-1 away from — 20-18 RECLAIMS it).

**Layer correction (the Ground Truth gate paid off during discuss):**
`irand`/`perlin`/`sine`/`saw`/`rand`/`run`/`chord` are
**`@strudel/core` `signal.mjs` pattern-level functions** — continuous
signals and pattern builders (`.lpf(sine.range(200,2000))`,
`irand(12)`, `run(8)`). These are **Layer 1/2 Pattern IR** concerns
and advance **substrate axis 1** ("parser models what users actually
type"). They are **NOT** Phase 24's Layer-3c `Synth`/`UGenGraph`
(SuperCollider-style DSP synthesis: `.s("saw")` → SynthDef → scsynth).
Strudel's `sine`-the-signal ≠ SuperCollider's `SinOsc`-the-UGen.
**20-18 is a distinct sibling substrate layer, NOT a Phase 24
precursor or re-scope.** Phase 24 (axis 5c) remains separate and
unchanged by this phase.

**Prior Ground Truth asset:** `packages/editor/src/ir/collect.ts`
ALREADY deeply traces `signal.mjs` for the RNG family
(`__timeToRandsPrime` signal.mjs:237-258, `randrun` :365-376,
`shuffle` :392-394, `degradeBy` :699-706). The signal-family
semantics 20-18 must model are partially pre-grounded there. RESEARCH
must extend this to the full builder set against the pinned upstream
SHA `f73b3956` and produce/extend a Ground Truth doc for `signal.mjs`.

## Locked Decisions

### D-01: Recognition policy — curated closed-set ships the gate; flagged general for measurement only

**Decision:** A hand-curated, upstream-SHA-pinned closed set of known
Strudel signal/builder roots is the gate-bearing fix (counted in the
D-03 dual gate). A general "any unrecognised `identifier(...)` chain
head → structured" fallback ships behind an **off-by-default flag**,
used for measurement/triage ONLY and **never counted in the parity
gate**.

**Rationale:** The curated set keeps parity honest (the exact
dishonesty D-03's dual gate exists to prevent — flipping
genuinely-broken code to "structured" inflates the number). Mirrors
the existing curated-list precedent (the G5 reserved-identifier set
at parseStrudel.ts:787; the 20-14 `aliases.ts` layer). The flagged
general path lets us *measure* the long-tail size without committing
to it — data-driven scoping for a future phase. Each curated-set
addition is a ~1-line + fixture (low marginal cost; the list grows
from real friction, the 20-14/20-16 method).

### D-02: IR shape — genuine semantic modelling (full signal/builder IR layer)

**Decision:** Recognised builders produce **genuinely-modelled IR
tags** for the signal/random/builder family — NOT the
structured-opaque `wrapAsOpaque` wrapper. 20-18 builds the **complete
Strudel signal/builder Layer 1/2 IR substrate** (the full
`irand`/`rand`/`brand`/`brandBy`/`perlin`/`sine`/`cosine`/`saw`/`tri`/
`square`/`isaw`/`run`/`binary`/`binaryN`/`chord`/... family), not just
the residual-driven minimum.

**Rationale (user decision — ambition is deliberate):** This is the
signal-IR substrate layer the broader closed-loop vision needs;
modelling it properly now (vs an opaque wrapper that would have to be
torn out later) is the substrate-honest choice. The matcher line is
NOT violated — these builders are PURE pattern generators with
deterministic structure; modelling their structure is term-level, not
evaluation. `collect.ts` already proves the family's semantics are
tractable (the RNG-chain modelling).

**Consequence flagged to user (vāda — surfaced, not silently
proceeded):** This is a multi-wave semantic-modelling phase, NOT a
~1-wave parity arm. The flagged-general fallback (D-01) is necessarily
structured-opaque (unknowns can't be modelled). Scope discipline (the
20-16 4×-cascade lesson) is load-bearing: the curated modelled set is
sized by the V-1 residual audit + the closed-loop signal taxonomy;
the long tail stays measured-not-modelled until a future phase.

### D-03: Pass gate — reclaim `--LsnlgQ6osk` + dual gate ≥90.0%, NO bar-lowering

**Decision:** 20-18 PASSES iff BOTH:
1. **`--LsnlgQ6osk` grounds STRUCTURED in production** —
   `parseStrudel(<verbatim repro>)` → the `az2` binding (the named
   chain-root blocker) resolves so the whole program is structured
   (`body.tag !== 'Code' || body.via !== undefined`). This is the
   exact case 20-17 RE-ANCHORED away from; 20-18 reclaims it — clean
   closure of the 20-17 falsification.
2. **Fresh PK17-step-6 `pnpm parity:bakery --n 50` ≥ 90.0%** structured
   (from the 86.0% baseline; this class ≈ 5/50 ≈ 10%; ≥90% is the
   conservative target — not all 5 residuals may fully close, some
   have secondary blockers, e.g. `az2` also has `.sometimesBy(arrow,…)`).

**No bar-lowering escape.** If crit-2 < 90.0%, the phase does NOT
pass; residual triaged into named classes → backlog (NEVER patched in
20-18 — the 4×-cascade lesson). The 20-17 dual-gate discipline +
PK18 cascade discipline carry forward verbatim.

### D-04: Phase relationship — distinct Layer 1/2 sibling, Phase 24 unchanged

**Decision:** 20-18 is the **Layer 1/2 signal/builder Pattern-IR
substrate** (axis 1). Phase 24 (`Synth`/`UGenGraph`, Layer 3c, axis
5c) is a **distinct, separate phase, unchanged and not re-scoped** by
20-18. The roadmap records 20-18 as advancing axis 1 (parser models
what users type), NOT axis 5.

**Rationale:** The discuss-phase Ground Truth check revealed the
orchestrator's initial "overlaps Phase 24" framing was inference, not
fact (P69-class). The two `sine`s are different abstraction layers.
Documenting the true relationship prevents a future
boundary-confusion bug and keeps the closed-loop-plan axis accounting
honest.

## Scope Boundary

**In:**
- Curated closed-set `recogniseChainRoot` arm in `parseRoot` (placed
  in the recognition-arm order — RESEARCH determines exact position
  vs the note/n/s/sound/mini/loose arms; precedent: the 20-17 G2
  bound-ident arm placement discipline).
- Genuine IR tag family for the Strudel signal/builder set (new
  Layer 1/2 tags; shapes derived from `signal.mjs` + the closed-loop
  IR taxonomy + `collect.ts` prior art).
- The flagged-general fallback (off-by-default, measurement-only,
  structured-opaque, NEVER gate-counted).
- Reclaim `--LsnlgQ6osk` as the D-03 crit-1 canonical anchor.
- A distilled permanent CI fixture (`bakery-141-irand-chain-root.strudel`
  or similar) once the mechanism lands (the 20-17 V-2 pattern).
- Ground Truth doc for `signal.mjs` (extend `collect.ts`'s partial
  trace) pinned to SHA `f73b3956`.
- Verification: fresh PK17 re-measure (≥90%), per-file loc-fidelity
  STOP gate, SUMMARY + catalogue updates, single non-stacked PR.

**Out:**
- Phase 24 `Synth`/`UGenGraph`/SynthDef/scsynth (Layer 3c, axis 5c) —
  explicitly a separate phase.
- The general long-tail recognition as a *gate-counted* fix (D-01:
  flagged, measured, not modelled, not counted).
- Semantic *evaluation* of signals (the matcher stays a matcher —
  model structure, never run the signal).
- #156 (1 uncategorised V-1 fallback), #149/#147/#153 — backlog
  unless the 7-sample audit proves one IS this class (then folded
  with explicit provenance, NOT scope-crept).
- Builders not in the V-1-residual-audit ∪ closed-loop-taxonomy
  curated set — measured via the flagged path, modelled in a future
  phase (data-driven).

## Codebase Context (verify before planning — re-grep; 20-17 shifted line numbers)

- `parseStrudel.ts` `parseRoot` recognition arms (ordered): G2
  bound-ident (pS:~1064, 20-17) → `noteMatch` (~1086) → `sMatch`
  (~1107) → `miniMatch` (~1126) → `looseMatch` (~1154) → backtick
  (~1277) → bareCode fallback. The new `recogniseChainRoot` arm slots
  into this order — RESEARCH determines where (a curated builder root
  can never match the strict note/s/mini regexes; placement before
  bareCode is necessary, exact slot per the 20-17 G2 discipline).
- `collect.ts` — the `signal.mjs` Ground Truth prior art (RNG chain;
  cite the existing `signal.mjs:NNN` references; extend for the
  builder family).
- `PatternIR.ts` — the IR tag union (where the new signal/builder
  tags are added; the `Code.via` discriminated-union + PV53 precedent
  for additive union widening; the D-1c consumer-audit obligation
  carries — every new tag needs the same grep-reproduced consumer
  audit as 20-17 D-1c, the phase's primary risk surface).
- `parseStrudel.ts:787` — the G5 reserved-identifier curated-list
  precedent (the closed-set idiom to mirror).
- The vendored oracle: `packages/app/tests/parity-corpus/_proto-d01.spec.ts`
  + `bakery-runs/repro__LsnlgQ6osk.strudel` (the `--LsnlgQ6osk` /
  `az2` regression oracle — reused as the 20-18 gate oracle).

## Pre-mortem (P70 — the catalogued lesson from THIS series)

**The dominant risk for this exact phase is mis-classifying WHY the
residual cases are bareCode** (P70, catalogued in 20-17). PLANNING
DIRECTIVE (not a user gray area): RESEARCH must RUN all 7 V-1 N=50
residual samples through the production parser and EMPIRICALLY confirm
which are unbound-chain-root vs a different class — do NOT infer the
5/7 from the single `az2` exemplar (that inference is exactly the P70
trap). The fresh `samples-2026-05-19T13-24-45-538Z.json` from 20-17
V-1 is the source of record for the 7.

## Operational (carried verbatim from 20-17 — proven discipline)

- AnviDev: branch-first (`feat/20-18-chain-root`); single non-stacked
  PR → main; Claude never merges. `.anvi/` + `.planning/` gitignored
  → `git add -f`. No Co-Authored-By.
- COMMIT_TEMPLATE single-quoted heredoc (`git commit -F - <<'MSG'`);
  NEVER `-m` with backticks/`$()` (zsh strip; recurred 2× in 20-16).
- P68 build hygiene: one-shot `pnpm --filter @stave/editor build` +
  grep a MINIFICATION-STABLE anchor (string/regex literal or named
  export, NOT a comment, NOT a param unless keepNames) > 0 before
  every editor-src commit.
- Per-file loc-fidelity STOP gate (per-wave + cross-wave): every
  parity-UNCHANGED corpus file's loc-fidelity diff EMPTY; parity-
  changed set ⊆ enumerated allow-list ({Wave-0} ∪ flagged fixtures);
  any other = silent drift = STOP.
- PK18 HARD-GATE cascade discipline: gate falsifies a premise → STOP,
  record verbatim in OBSERVATIONS, re-classify, re-pose the
  invalidated LOCKED decision to the user, reframe — NEVER push
  through, NEVER add a second workaround, NEVER lower the bar. New gap
  classes → backlog issues (issue-before-fix), NOT fixed this phase.
- Post-merge: verify the ARTIFACT not the badge (`git merge-base
  --is-ancestor <PR-head> origin/main` exit 0; HEAD==merge; new
  symbols grep-present on real main's `dist`; editor/app counts hold;
  manual-close any 2nd+ issue per GitHub's 1-keyword limit).
- Cognitive OS as needed; this phase is a P70 exemplar (the
  classification-honesty discipline is the spine).

## P70 R-1 FINDING (2026-05-19 — empirical, supersedes the issue's 5/7 premise)

RESEARCH R-1 ran all 7 V-1 N=50 Code-fallbacks through the PRODUCTION
parser (observation, not inference — `/tmp/r1-classify-output.txt`).
**The issue #155 "5/7 unbound-chain-root" is FALSE** — it came from a
shallow text-regex auto-classifier (`_bakery-classify.spec.ts:48-62`
binning on `/(let|const|var)\s+\w+=/` presence, not the real blocking
construct). P70 fired exactly as the pre-mortem warned. TRUE
distribution: **genuine chain-root/builder class ≈ 3/7** — #1
`--LsnlgQ6osk` (`az2`'s `irand`), #3 `-6c1hEXe8Agi`
(`chord(...).voicing()`), #7 `-KLGNJUtyyj1` (`arrange(...)`). The
other 4 are out-of-scope classes: #2 boot-stmt-then-expr, #4
guarded-boot (#143, filed), #5 multi-top-level-expr, #6 non-Strudel
Hydra mashup (= #156 — classified, NOT folded, correctly out of
scope). Realistic uplift ≈ 3/50 ≈ 6pp → ~92%.

**Orchestrator direct-observation correction (current main `300ca95`,
`pnpm test:proto`):** the RESEARCH R-1/R-5 "`--LsnlgQ6osk`
multi-blocker" framing is an ISOLATED-DESCRIPTOR-PROBE artifact
(`sound(rp1)` standalone, `rp1` unbound). In the WHOLE-PROGRAM
fixpoint (production path) the observed trace is
`post-fixpoint resolved=[rp1,beat,chords2,bass,harm2] pending=[2]` —
`beat`/`bass`/`harm2` ALL resolve; **the ONLY remaining blocker is
`az2` (the `irand` chain-root)**. `--LsnlgQ6osk` is a CLEAN
single-blocker reclaim once `irand`-chain-root is modelled — exactly
as the original D-03 intended. (The planner must use the
whole-program-fixpoint reality, NOT the isolated-probe pessimism.)

## D-03 AMENDMENT (2026-05-19 — user decision; supersedes the original D-03 gate, on EVIDENCE not bar-lowering)

The original D-03 `≥90.0%` crit-2 was LOCKED under the issue's
falsified `5/7 ≈ 10%` premise (see P70 R-1 FINDING above). With the
empirically-corrected ~3/50 closeable, `≥90%` is feasible but at
near-zero margin; under the LOCKED no-bar-lowering contract a single
sub-blocker (e.g. `az2`'s deep chain `irand(12).struct(...)
.sometimesBy(perlin.range(...),...)...` whose signal-valued ARGS may
themselves block) → multi-wave modelling work then NOT-PASS. Re-posed
to the user (PK18 + the CONTEXT P70 directive that exists to force
this surfacing). **User decision: Crit-1-primary, parity
informational.**

**Amended D-03 (LOCKED 2026-05-19):**
1. **HARD GATE (crit-1):** `--LsnlgQ6osk` grounds STRUCTURED in
   production (`parseStrudel(<verbatim repro>)` → `az2` resolves →
   whole program `body.tag !== 'Code' || body.via !== undefined`) —
   the clean single-blocker reclaim — **AND** permanent CI fixtures
   for #3 (`chord(...).voicing()`, `-6c1hEXe8Agi`) and #7
   (`arrange(...)`, `-KLGNJUtyyj1`) both ground STRUCTURED.
2. **INFORMATIONAL (NOT a hard ≥N threshold):** fresh PK17-step-6
   `pnpm parity:bakery --n 50` is RECORDED + tracked; it MUST NOT
   regress below the 86.0% baseline (a regression IS a STOP), but
   there is NO hard ≥90/≥88 pass threshold. The genuine-modelling
   deliverable is the signal/builder IR substrate (axis-1 honesty);
   the parity number is the honesty-check that the model is real and
   not over-fit, not the phase goal.
3. **No-bar-lowering still applies** to crit-1 and to the
   must-not-regress floor: if `--LsnlgQ6osk`/#3/#7 do not ground
   STRUCTURED, or parity regresses < 86.0%, the phase does NOT pass;
   residual → backlog → 20-19, NEVER patched in 20-18.

The original D-03 block (top of this file) is RETAINED for provenance
but is SUPERSEDED by this amendment. D-01/D-02/D-04 unchanged. The
distilled CI fixtures expand from one (`bakery-141-irand-chain-root`)
to three (irand/`--LsnlgQ6osk`-faithful + chord + arrange).
