---
phase: 20-20
title: Final-residual parity reclaim — `-G2drHRNFueu` (#159 tokenizer-whitespace + #153 multi-top-level)
created: 2026-05-21T07:33:08Z
decisions: 4
issues: ["#159", "#153"]
related_backlog: ["#156", "#149", "#147"]
research_seed: .planning/phases/20-musician-timeline/20-19-OBSERVATIONS.md §"Wave 0 — backlog classification probe" (rows for #159 + #153, both bound to hash `-G2drHRNFueu`) + gh issue #159 (the executed `parseStrudel('sound (...)') vs parseStrudel('sound(...)')` triage probe is unanswered — Wave 0 of THIS phase answers it) + gh issue #153 (multi-top-level sibling expressions)
exemplar: bakery row `-G2drHRNFueu` — `sound ("hh hh hh hh") ...` (note the SPACE between `sound` and `(`); the SAME hash is BOTH #159's whitespace-fence exemplar AND #153's multi-top-level exemplar (two co-occurring classes). The 20-19 Wave-0 probe flagged BOTH classes without factoring which is the dominant blocker.
upstream_pin_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
baseline_parity: "96.0% (48/50, N=50, 2026-05-20T13-22-13-320Z, sha f73b3956) — the must-not-regress floor"
target_parity: "≥98.0% (49/50; fresh PK17-step-6 re-measure; dual gate; closing `-G2drHRNFueu` alone moves residual from 2 → 1; no bar-lowering)"
gate: dual (`-G2drHRNFueu` STRUCTURED in production via a Wave-C-style locked-FLIP fixture + fresh parity ≥ 98.0% AND must-not-regress 96.0% floor)
prior_baseline_on_main: "editor 1627/1627, app 409/409 (parity-corpus 47 + loc-fidelity 47), main HEAD a150889 (20-19 merged PR #161 2026-05-20T23:06Z)"
---

# Phase 20-20 Context — Final-residual parity reclaim on `-G2drHRNFueu`

## What this phase is (corrected framing — Wave-0 will discharge the inference)

Phase 20-19 closed the `buildBindingMap` shape-fence on
`bindings*, sideEffect, finalExpr` and shipped a +1 BONUS close
(`-1j62z5xjyCN` via the FROZEN curated-set `samples` token). Fresh
N=50 measurement hit **96.0% (48/50)**, leaving exactly TWO residual
Code-fallbacks:

- `-7LU6zgzViSM` (#143 guarded-boot) — pre-existing baseline class;
  already recognised by the parser's prelude-strip + GUARDED_BOOT_RE
  mechanism but the specific exemplar's shape sits in a different
  arm; OUT of 20-20 scope.
- `-G2drHRNFueu` (the 20-20 target) — `sound ("hh hh hh hh")` with
  a SPACE between identifier and open-paren, AND two sibling
  `sound (...)` lines at the top level. The 20-19 Wave-0 probe
  flagged BOTH classes co-occurring on the same hash but did NOT
  factor which is the dominant gate-bearing blocker.

**The phase's first action (Wave 0) RUNs the surgical factoring
probe** per the P70 directive (observation before scope):

```
parseStrudel('sound ("hh hh hh hh")')         // single line, with space
parseStrudel('sound("hh hh hh hh")')          // single line, no space
parseStrudel('sound("a")\nsound("b")')        // two lines, no space
parseStrudel('sound ("a")\nsound ("b")')      // two lines, with space (the real exemplar)
```

The four outputs FACTOR the residual blocker into one or both classes.
Scope locks AFTER observation (D-01). The plan then targets exactly
the gate-bearing class (or both, if Wave 0 shows both are required to
flip `-G2drHRNFueu`).

**RESEARCH must run BEFORE planning to discharge the P69 grounding
debt for whichever class(es) Wave 0 surfaces:**

- For the tokenizer-whitespace class — READ `@strudel/core`'s parser/
  tokenizer at pin `f73b3956` to confirm whether upstream tolerates
  `sound ("...")` whitespace. If upstream TOLERATES, our parser must
  mirror (issue is a recogniser-narrowness gap). If upstream REJECTS,
  the program is genuinely malformed by Strudel semantics and our
  bareCode fallback is correct (issue closes as not-a-bug; #159 stays
  open as upstream-tracking).
- For the multi-top-level class — READ `@strudel/core`'s REPL
  execution model at pin `f73b3956` to determine whether sibling
  bare top-level pattern expressions are (a) overlaid as `stack`,
  (b) last-wins, (c) errors, or (d) something else. The IR shape
  we ship MUST match the observed semantics.

Both RESEARCH outputs become the EVIDENCE input to PLAN's fix-shape
selection. PLAN never picks a fix mechanism without RESEARCH having
grounded the upstream behaviour at `file:line`.

## Locked Decisions

### D-01: Scope and class strategy — Wave 0 RUNS the probe; scope locks by observation

**Decision:** Wave 0 is non-skippable and pre-implementation. It
runs four `parseStrudel(...)` invocations (the surgical factoring
probe above) on the canonical hash `-G2drHRNFueu`. The 4-cell
outcome matrix (structured / bareCode × with-space / without-space
× single-line / two-line) FACTORS the residual blocker into one or
both classes. The Wave-0 outcome PRECEDES and DETERMINES which class
gets a fix-shape decision in PLAN.

**Rationale:** P70 directive — observation before scope. Cascade
classification has been wrong about WHY in 7 prior occurrences;
this phase pre-empts the 8th by FACTORING before locking. The
20-19 Wave 0 record (in `20-19-OBSERVATIONS.md` lines 158, 161,
171, 174) flagged BOTH classes for the same hash without factoring,
which is correct given 20-19's strict D-03 scope (it stayed in the
shape-fence class) but INSUFFICIENT for 20-20's targeting. The
factoring probe is ~30s of observation; the cost of guessing the
wrong class is hours of misdirected planning + a PK18 STOP mid-
execution.

**Wave 0 disposition rules (the BRANCH POINTS):**

- **Outcome 1 (`sound (...)` alone bareCodes; `sound(...)` parses
  structured):** the tokenizer-whitespace fence IS the dominant
  blocker. Scope locks to #159 only; multi-top-level (#153) stays
  backlog. PLAN targets D-02 fix-shape.
- **Outcome 2 (`sound (...)` parses structured; `sound("a")\nsound("b")`
  bareCodes):** the multi-top-level class IS the dominant blocker.
  Scope locks to #153 only; tokenizer (#159) stays backlog. PLAN
  targets D-03 fix-shape.
- **Outcome 3 (BOTH classes block — `sound (...)` AND
  `sound("a")\nsound("b")` independently bareCode; only
  `sound("...")` single-line structures):** both classes are
  required to flip `-G2drHRNFueu`. Scope expands to BOTH within
  20-20 (the same-phase-two-classes case the PK18 cascade discipline
  contemplates — this is acceptable only because Wave 0 has factored
  the two classes BEFORE locking; it is NOT a 20-16-style mid-phase
  scope creep).
- **Outcome 4 (neither factors — both shapes bareCode for an
  ENTIRELY DIFFERENT reason):** PK18 STOP → re-pose D-01 to user
  with EVIDENCE → re-classify the residual.

**Rejected alternatives:**

- **B/C (pre-lock to one class)** — guesses without evidence; risks
  20-16-style 4×-cascade if the guess is wrong.
- **D (pre-lock to BOTH)** — over-scopes if Wave 0 shows only one is
  the blocker; wastes effort on a non-gate-bearing class.

### D-02: Tokenizer-whitespace fence fix mechanism — upstream-grounded first

**Decision:** Before any fix-shape decision, RESEARCH reads
`@strudel/core`'s parser/tokenizer at Codeberg pin `f73b3956` to
ground how upstream handles `sound ("...")` (the whitespace-between-
identifier-and-open-paren shape). The Ground Truth output then
constrains PLAN's fix-shape choice from {curated-regex-extension,
source-pre-process, depth-walker-tolerance} or — if upstream rejects
the shape — closes #159 as not-a-parser-bug (the user's source is
genuinely malformed by Strudel semantics).

**Rationale:** P69 Grounding Check. The 20-19 phase grounded all 10
curated-set tokens at `file:line` BEFORE encoding them in the regex;
the same discipline applies here. An inferred answer (e.g. "upstream
probably tolerates it because JS does") would be the exact P70
trap: we would build a fix on a guess about upstream behaviour, and
if the guess is wrong the fix matches our IMAGINED Strudel, not
real Strudel. The Ground Truth output IS the evidence input to
PLAN's mechanism choice; PLAN never picks A/B/C without it.

**Output of D-02 grounding (consumed by PLAN):**

- A `file:line` citation showing how upstream's parser handles
  whitespace between identifier and call-site `(`.
- A binary verdict: upstream-TOLERATES-whitespace OR
  upstream-REJECTS-whitespace.
- If TOLERATES: an additional `file:line` showing the upstream
  mechanism (regex tolerance vs lexer-state vs whitespace-token-
  consumed-elsewhere) — this constrains the fix-shape choice (we
  mirror the upstream mechanism class, not invent a parallel one).

**Rejected alternatives (the un-grounded fix shapes):**

- A standalone augment-the-regex fix without upstream evidence —
  we might widen the recogniser past where upstream tolerates
  (false-positives we don't see in the corpus).
- A source-pre-process normalising `ident (` → `ident(` — changes
  user-typed text and complicates loc-fidelity offsets. Only
  acceptable if upstream itself does the same normalisation
  (Ground Truth would prove this).

### D-03: Multi-top-level sibling fix mechanism — upstream-grounded first

**Decision:** Before any IR-shape decision, RESEARCH reads
`@strudel/core`'s REPL execution model at Codeberg pin `f73b3956`
to determine the actual semantics of `sound("a"); sound("b")` as
sibling top-level pattern expressions. The Ground Truth output then
constrains PLAN's IR-shape choice from {stack, last-wins,
user-facing-diagnostic}.

**Rationale:** P69 Grounding Check. The IR shape we ship MUST match
the observed upstream semantics — we are a parser-into-the-same-IR-
that-Strudel-evaluates, not a parser-into-our-imagined-Strudel.
Inferring semantics from JS evaluation order is the exact P70 trap:
JS evaluates each line as a statement, but the REPL's
`evalScope`-based bindings can override "last-wins" with side-
effects, and the actual audio routing depends on whether each
sibling pattern is `register`-ed, `silence()`-ed, or just discarded.

**Output of D-03 grounding (consumed by PLAN):**

- A `file:line` citation in `@strudel/core`'s repl.mjs (or wherever
  the multi-line evaluation is implemented) showing how sibling
  top-level pattern expressions are handled.
- A semantics verdict: STACK (overlay) / LAST-WINS / EACH-REGISTERS
  / ERROR / SOMETHING-ELSE.
- If STACK or LAST-WINS or EACH-REGISTERS: an additional `file:line`
  showing the upstream mechanism (the `register` call, the
  `silence` chaining, the eval-result assignment) — this constrains
  our IR shape (a `Stack` arm with multiple bodies vs a "final-expr-
  with-side-effect-statements" extension to `buildBindingMap` vs a
  new `Register` IR node — the mechanism class drives the choice).

**Rejected alternatives (the un-grounded IR shapes):**

- A standalone `stack`-wrap without upstream evidence — risks
  misrepresenting semantics if upstream is actually last-wins (we
  would play TWO audible patterns when upstream plays ONE).
- A last-wins shape without upstream evidence — risks the opposite
  failure mode.
- A user-facing diagnostic without upstream evidence — pre-judges
  the source as malformed when upstream may tolerate it.

### D-04: Pass gate — dual; `-G2drHRNFueu` STRUCTURED + parity ≥ 98.0% + must-not-regress 96.0% floor

**Decision:** The phase ships when BOTH of the following hold on the
SAME merge commit verified on real main `dist/index.js`:

- **crit-1 (HARD):** A Wave-C-style locked-FLIP fixture (vendored
  permanent CI fixture, plus optionally a one-off grounding spec
  mirroring 20-18 `_waveC-grounding.spec.ts` shape) shows
  `-G2drHRNFueu`'s code parses STRUCTURED (`body.tag !== 'Code'`)
  with the IR shape that matches the upstream semantics grounded by
  D-02/D-03 RESEARCH.
- **crit-2 (HARD):** Fresh `pnpm parity:bakery --n 50` (PK17 step-6
  cadence; new ISO stamp; same upstream pin
  `f73b395648645aabe699f91ba0989f35a6fd8a3c`) reports
  **≥ 49/50 (98.0%)** AND **must-not-regress** the 48/50 (96.0%)
  baseline. Closing `-G2drHRNFueu` alone is expected to move the
  residual set from `{#143-#7LU6zgzViSM, #159-#G2drHRNFueu}` →
  `{#143-#7LU6zgzViSM}` = 49/50 = 98.0%; gate fails if the fresh
  measurement comes in below 96.0% (regression).

**No bar-lowering. No second-workaround. No push-through.**
If crit-2 falsifies the 96.0% floor: PK18 STOP → classify the
regression → re-pose D-04 to user with EVIDENCE → never amend the
floor downward.

If a BONUS exemplar flips (the way `-1j62z5xjyCN` did in 20-19),
parity goes to 49+/50 = ≥98.0% with headroom. D-03's strict scope
rule applies: bonus closes are RECORDED (and the issue manually
closed per GitHub's 1-keyword limit), but the SCOPE of 20-20 stays
strict to `-G2drHRNFueu` + whatever classes Wave 0 surfaced.

**Rationale:** Exact 20-19 D-04 mechanism (proven discipline; the
dual gate with must-not-regress floor is the framing that delivered
0 PK18 re-poses in 20-19). The arithmetic: 48/50 → 49/50 is the
single-class expected improvement; gate at +2pp keeps honesty (no
inflation from un-related drift).

## Scope Boundary

**IN:**

- Wave 0 surgical factoring probe (D-01 mechanism); records the
  4-cell outcome matrix verbatim in `20-20-OBSERVATIONS.md`.
- RESEARCH grounded discharge of D-02 (tokenizer-whitespace
  upstream behaviour) AND/OR D-03 (multi-top-level upstream
  semantics) — only the class(es) Wave 0 surfaces get a research
  arm. If Wave 0 surfaces only #159, D-03 grounding is DEFERRED
  (the issue stays backlog with its triage notes); same for the
  reverse.
- The fix mechanism PLAN picks based on D-02/D-03 grounded
  evidence — could be regex extension, walker tolerance, IR shape
  extension, source-pre-process, or "close as not-a-bug" (if
  upstream's behaviour shows the user's source is genuinely
  malformed).
- A Wave-C-style permanent CI fixture for `-G2drHRNFueu` (or a
  reduced canonical form distilled from it per 20-18/20-19
  vendoring discipline). One fixture per scoped class; one
  negative-control fixture proving the bindings substrate works
  independently.
- D-04 dual gate on the same merge commit (fresh parity:bakery
  N=50 measurement + the locked-FLIP fixture).
- Cross-wave per-file loc-fidelity STOP gate (V-3 cadence).
- Single non-stacked PR `feat/20-20-final-residual` → main with
  `closes #159` (and `#153` if Wave 0 surfaces both classes and
  both get closed in this phase, per GitHub 1-keyword limit
  workaround).

**OUT:**

- Closing #143 (the other residual `-7LU6zgzViSM`) — different
  class (guarded-boot prelude variant); separate phase if pursued.
- Closing #156 (uncategorised triage placeholder), #149
  (template-literal root + `.cpm(binding)`), #147 (samples()
  side-channel capture — feature, not parity).
- Any new top-level PatternIR `tag` UNLESS Wave 0 + D-03 grounding
  show the multi-top-level class genuinely requires one (e.g. a
  `MultiPattern` or `Register` tag if upstream's eval semantics
  cannot be modelled with existing tags). If a new tag IS shipped,
  PV54 FLOOR-grep obligation TRIGGERS — every exhaustive
  `switch(.tag)` gets a guarded arm IN THE SAME WAVE.
- Any change to 20-19's `stripSideEffectStatements` helper, the
  `SIDE_EFFECT_CALL_RE` curated set, or the FROZEN curated-set
  membership.
- Any change to 20-18's `CHAIN_ROOT_RECOGNISER` curated Map or
  the chain-root recognition arms.

## Codebase Context (Chesterton scan — what exists before changing)

**The tokenizer / call-recogniser landscape (touched by D-02 IF in
scope):**

- `parseStrudel.ts` lines ~700-900 — `splitRootAndChain`,
  `applyChain`, the chain-root recogniser arms (the post-20-18
  curated `CHAIN_ROOT_RECOGNISER` map at the binding map call
  site). Whitespace handling in chain dotting is governed by
  `skipWhitespaceAndLineComments` (the PV49 primitive at
  pS:~?, located by Wave-0 re-grep).
- The PV49 inter-element whitespace tolerance precedent —
  "Strudel-source walkers must tolerate inter-element whitespace
  AND inline line-comments." Extending this to whitespace between
  identifier and call-site `(` is the natural PV49-spirit fix IF
  D-02 grounding shows upstream tolerates it.

**The top-level statement structure (touched by D-03 IF in scope):**

- `parseStrudel.ts:486-595` — `buildBindingMap`. Sibling
  top-level expressions currently trip the binding loop at pS:511-
  530 (the first non-binding stmt becomes finalIdx; trailing stmts
  trip the shape guard at pS:534; 20-19 relaxed this for
  side-effect calls but NOT for sibling pattern expressions).
- The 20-19 `stripSideEffectStatements` helper at pS:~492 — DOES
  NOT touch sibling pattern expressions (it filters only the
  FROZEN curated-set tokens: `all, samples, setcps, setCps, setcpm,
  setCpm, useRNG, setVoicingRange, initAudio, aliasBank`). A
  `sound("a"); sound("b")` shape would NOT be filtered — `sound`
  is NOT in the side-effect set (it returns a Pattern, not silence).
- IF D-03 grounding shows STACK semantics: the IR shape extension
  might widen `buildBindingMap` to return `{bindings, finalExprs:
  PatternIR[]}` (plural finalExprs) and the caller stacks them.
- IF D-03 grounding shows LAST-WINS semantics: the existing single-
  finalExpr return shape suffices; the binding loop's shape guard
  changes to accept multiple non-binding stmts and select the LAST.
- IF D-03 grounding shows EACH-REGISTERS (the `$:` case): a new IR
  shape (`MultiPattern`?) may be needed; PV54 triggers.

**Ground Truth assets to extend or create:**

- `~/.anvideck/projects/struCode/ref/GROUND_TRUTH_SIGNAL_MJS.md` —
  the 20-18 Ground Truth doc covering signal.mjs / controls.mjs /
  pattern.mjs. D-02/D-03 grounding may EXTEND this with new sections
  on the parser/tokenizer + the REPL execution model OR may create
  a sibling doc (e.g. `GROUND_TRUTH_REPL_MJS.md`) if the surface area
  is large enough.
- The Codeberg-SHA pin `f73b3956` is the SAME pin used in 20-15/
  20-18/20-19. No version bump; same anti-drift mechanism (per-class
  CI fixture + the SHA-pinned provenance block on any new
  recogniser code).

**Test baselines on main HEAD `a150889`:**

- `pnpm test` (editor): **1627/1627** ← must hold.
- `pnpm --filter @stave/app test`: **409/409** (parity-corpus
  **47/47** + loc-fidelity **47/47**) ← must hold.
- `pnpm parity:bakery --n 50` (sample
  `samples-2026-05-20T13-22-13-320Z.json`, upstream pin `f73b3956`):
  **96.0% (48/50)** ← must-not-regress floor.

**Catalogues to consult before/during planning:**

- **P70** (8-occurrence pattern — the spine) — RUN samples,
  classify by observation, NEVER push through on inference. Wave 0
  IS a P70-discharge by construction.
- **PK18** — HARD-GATE cascade discipline; if any premise
  falsifies, STOP / record verbatim / re-pose to user. 20-19 was
  the first 0-occurrence phase; 20-20's discipline aims to replicate.
- **P69** — Grounding Check; D-02 and D-03 BOTH route through
  this gate explicitly.
- **PV49** — definition-site loc-additivity; carries by
  construction for the regex/walker mechanisms; if D-03 expands the
  IR shape, PV49 must be RE-VERIFIED for the new path.
- **PV54** — additive-tag FLOOR-grep obligation; potentially
  triggers if D-03 lands a new top-level PatternIR `tag`.
- **PV50** — per-evaluate engine-owned accumulators; if any
  fix introduces state, it must reset at `evaluate()` entry.
- **P68** — editor watch unreliable; one-shot build + grep before
  every editor-src commit.
- **PK17** — friction-first cycle; fresh PK17 step-6 measurement.
- **PK16** — engine-init pipeline order (stage 1 prelude → stage
  1.5 sideEffect-strip + bindingMap → stage 2 chain-root) — any
  D-03 IR-shape extension that touches `buildBindingMap` re-derives
  stage 1.5.
- **feedback_commit_msg_heredoc** — `git commit -F -` heredoc;
  NEVER `-m` with backticks/`$()` under zsh.

## Open Questions Deferred to RESEARCH / PLAN

These are NOT user-blocking; RESEARCH/PLAN resolves them based on
Wave 0 observation + upstream Ground Truth:

- **Whether RESEARCH grounds D-02 AND D-03 or only one** — depends
  on Wave 0 factoring (D-01). If Outcome 1 → only D-02. If Outcome
  2 → only D-03. If Outcome 3 → both.
- **The exact fix mechanism for each scoped class** — RESEARCH
  outputs the upstream Ground Truth verdict; PLAN picks the
  matching mechanism class (regex / walker / IR-shape / pre-process
  / not-a-bug-close).
- **Whether to vendor `-G2drHRNFueu`'s code verbatim or distill to
  a minimal canonical form** — PLAN picks per the 20-18/20-19
  vendoring discipline (minimal distillation preferred; verbatim if
  the user's source is the gate-bearing observation surface).
- **Whether a Ground Truth doc EXTENSION (to GROUND_TRUTH_SIGNAL_MJS.md)
  or a NEW doc (GROUND_TRUTH_REPL_MJS.md) is the right artifact** —
  RESEARCH decides based on surface-area scope.

## Routing

Next: `/anvi:plan-phase 20-20` (research → planner → checker)
