---
phase: 20-21
title: Final-residual parity reclaim — `-7LU6zgzViSM` (guarded-boot edge case) + backlog audit sweep
created: 2026-05-21T14:14:31Z
decisions: 4
issues_gate_bearing: ["#143 (the residual exemplar — 20-16 closed prematurely; this phase re-closes after factoring)"]
issues_backlog_audit: ["#156", "#153", "#149", "#147"]
research_seed: gh issue #143 body (20-15 V-1 record) + parseStrudel.ts:228-229 (GUARDED_BOOT_RE; the 20-16 V-2 ship) + parseStrudel.ts:163-331 (stripParserPrelude depth-walker) + the canonical exemplar `-7LU6zgzViSM` source (Bakery row "Doubly-Linked Liszt") + the 20-19/20-20 Wave-0 backlog probe records
exemplar: bakery row `-7LU6zgzViSM` — "Doubly-Linked Liszt", opens with `typeof setDefaultVoicings !== 'undefined' && setDefaultVoicings('legacy') // https://github.com/tidalcycles/strudel/pull/967` followed by `// @title …`, `// @license …`, blank line, then `stack(stack(...).bank(...).room(...).color(...), stack(chord(...)…))).cpm(28)` with a trailing `// @version 1.0`. The 20-16 GUARDED_BOOT_RE regex (`parseStrudel.ts:228`) SHOULD match the first line by shape, but the row STILL bareCodes on real main `fa09cfe` — a likely P70 occurrence-9 candidate (cascade classification was wrong about WHY 20-16 closed #143).
upstream_pin_sha: f73b395648645aabe699f91ba0989f35a6fd8a3c
baseline_parity: "98.0% (49/50, N=50, 2026-05-21T12-51-24-407Z, sha f73b3956) — the must-not-regress floor"
target_parity: "100.0% (50/50; fresh PK17-step-6 re-measure; dual gate; closing `-7LU6zgzViSM` moves the residual to 0; no bar-lowering)"
gate: dual (`-7LU6zgzViSM` STRUCTURED in production via a Wave-C-style canonical-positive fixture + fresh parity = 50/50 (100.0%) AND must-not-regress 49/50 (98.0%) floor)
prior_baseline_on_main: "editor 1627/1627, app 413/413 (parity-corpus 48 + loc-fidelity 48), main HEAD fa09cfe (20-20 merged PR #162 2026-05-21T13:36Z)"
---

# Phase 20-21 Context — final-residual `-7LU6zgzViSM` + backlog audit sweep

## What this phase is (corrected framing — Wave 0 will discharge the inference)

Phase 20-20 closed `#159` (tokenizer-whitespace fence via PV49
extension) and shipped parity at **98.0% (49/50)**. The single
remaining residual is `-7LU6zgzViSM` (the 20-15 V-1 "Doubly-Linked
Liszt" exemplar). Closing it moves parity to **100.0% (50/50)** on
the current sample.

**P70 occurrence-9 candidate warning.** Issue `#143` was filed in
20-15 V-1 for this exemplar's specific shape (`typeof X !==
'undefined' && X(...)` guarded-boot idiom). 20-16 V-2 shipped
`GUARDED_BOOT_RE` at `parseStrudel.ts:228-229` and CLOSED `#143`.
Yet `-7LU6zgzViSM` STILL bareCodes on real main `fa09cfe` — i.e. the
20-15/20-16 cascade classification "GUARDED_BOOT_RE handles this
idiom" is potentially WRONG about WHY this specific exemplar bails.
This is the canonical P70 pattern: a cascade classification missing
the actual blocker. Wave 0 must RUN the surgical probe to factor
the real cause BEFORE locking the fix.

**Top candidate blockers (NOT YET observed — to be factored by
Wave 0):**

1. The trailing `// https://...` comment on the FIRST line, after
   the closing `)`. The walker at `parseStrudel.ts:300-307` consumes
   only ` `/`\t`/`;` then expects `\n` — a `/` immediately stops
   walker consumption with `j` placed at the `/`. The outer
   prelude-scan loop then re-reads from that `/` as if it were a
   new line start; the comment branch at `pS:246` is supposed to
   handle it. But the position-handling may have an off-by-one or
   newline-state issue that escapes the walker's intended flow.
2. The blank line between `// @license` and `stack(` is fine on
   the surface but might interact with the depth-walker's exit
   condition.
3. The trailing `// @version 1.0` AFTER the final `).cpm(28)` may
   confuse the stage-2 chain-root recogniser or the parser's
   expectation of where the program ends.
4. Some other class entirely (the 20-18 `stack(stack(...))`
   nested-builder shape interacts with chain methods like
   `.dict("ireal").layer(x => ..., x => ...)` in an unexpected way).

**This phase serves TWO purposes (user-locked at D-03 = STRETCH):**

- **Gate-bearing close:** fix the actual blocker for `-7LU6zgzViSM`
  to hit 100% N=50.
- **Backlog audit sweep:** RUN-classify the remaining open backlog
  issues (#156, #153, #149, #147) via Wave-0 style probes; for each,
  either CLOSE-as-superseded/duplicate/not-a-bug, REFINE the issue
  with the executed observation, OR file a NEW issue with the
  refined class. **Do NOT FIX any backlog item unless Wave 0 shows
  it is the SAME class as the gate-bearing fix** (e.g. if the
  GUARDED_BOOT_RE fix incidentally also closes one of the others —
  bonus-close per PK17 friction-first; otherwise stays backlog
  for 20-22+).

## Locked Decisions

### D-01: Wave 0 probe strategy — hybrid bisect → stage-trace fallback

**Decision:** Wave 0's factoring probe runs in two stages:

**Stage 1 (cheap, default):** progressive source-stripping bisect.
Start with the full `-7LU6zgzViSM` source; run `parseStrudel(...)`;
record verdict. Then remove the top line (the guarded-boot statement
with its trailing URL comment); re-run; record. Continue removing
chunks (the `// @title`, `// @license`, the blank line, the trailing
`// @version`, then SECTIONS of the body like the inner
`chord(...)` arm or the `.layer(...)` chain) one at a time until
the program flips from bareCode → STRUCTURED. The FIRST removal
that flips is the gate-bearing blocker.

**Stage 2 (fallback):** if bisect surfaces multi-cause interaction
(e.g. removing the URL comment partially helps but doesn't flip;
removing the `// @version` partially helps but doesn't flip;
removing BOTH flips) — instrument each PK16 stage with `console.log`
(or via a one-off vite-node script that calls each stage in
isolation: `stripParserPrelude(code)` → inspect output; if the
prelude-strip succeeded, then `buildBindingMap(stripped.body,
stripped.offset)` → inspect output; etc.) and identify where the
bail-to-bareCode happens. Capture the verbatim outputs.

**Rationale:** P70 directive (RUN before scope). The bisect is the
cheapest factoring tool that worked in 20-18 (Wave-C stripped-#3),
20-19 (Wave-0 factoring), 20-20 (Wave-0 5-cell). Stage-trace is
the more invasive fallback for multi-cause interactions; the
20-16 cascade was exactly a multi-cause case (the segmenter +
the binding-substitution + the chain-root recognition were
intertwined). The hybrid sequence ensures cheap-first;
escalation-on-evidence.

**Wave 0 disposition rules (the BRANCH POINTS):**

- **Outcome 1 (clean single-blocker — bisect cleanly isolates ONE
  removal that flips):** scope locks to that mechanism class.
  PLAN targets a surgical fix in that class.
- **Outcome 2 (multi-cause — bisect surfaces interaction; stage-
  trace confirms multiple bail points):** scope locks to ALL
  identified classes (P70 occurrence-9 confirmed — the original
  cascade classification was wrong about WHICH layer fails). PLAN
  sequences a wave per class with strict ordering.
- **Outcome 3 (the source IS genuinely malformed by Strudel
  semantics — upstream rejects this exemplar):** close `-7LU6zgzViSM`
  as not-a-parser-bug; investigate whether the Bakery row's
  CONTENT is the bug (e.g. `setDefaultVoicings` is a Strudel
  function but `'legacy'` is not a valid arg); re-pose D-04 (the
  gate may not be achievable to 100% on this sample without an
  upstream-rejected fix).
- **Outcome 4 (neither bisect nor stage-trace factors):** PK18
  STOP → re-pose D-01 to user with the new outcome matrix.

### D-02: Fix-mechanism conviction — Wave 0 dictates research scope

**Decision:** Wave 0's outcome (D-01) classifies the blocker class.
PLAN's research-vs-no-research decision then follows:

- **Internal class (e.g. an edge case in `GUARDED_BOOT_RE`'s
  depth-walker handling of trailing `// comment` after `)`; or a
  segmenter walker bug; or a chain-root recogniser gap on
  multi-`// @` comment prelude):** proceed directly to PLAN; NO
  upstream RESEARCH needed. The fix is local to our parser.
- **External-semantics class (e.g. Strudel's actual behaviour on
  the guarded-boot idiom diverges from our parsing; or the
  `.dict("ireal").layer(x=>..., x=>...)` chain-arg signature needs
  upstream grounding):** RESEARCH grounds the relevant upstream
  source at Codeberg pin `f73b3956` BEFORE planning. P69 mandatory.
- **Mixed:** RESEARCH for the external part; direct-to-plan for
  the internal part.

**Rationale:** Mirrors the 20-20 cadence (the most-recently-proven
discipline). Avoids the 20-15/20-16 trap of "every parser bug
needs upstream grounding" (high cost when the bug is purely
internal) AND the trap of "trust local-looking diagnosis without
upstream verification" (the 20-15 `bakery-152-block-comment`
falsification — see P69). Wave 0's executed observation is the
arbiter.

### D-03: Scope — STRETCH (close `-7LU6zgzViSM` + RUN-classify ALL open backlog)

**Decision:** The phase has TWO parallel deliverables:

1. **Gate-bearing fix:** close the actual blocker(s) for
   `-7LU6zgzViSM` per Wave 0 outcome (D-01). Single-class fix
   preferred; multi-class fix allowed ONLY if Wave 0 shows ALL
   identified classes are required to flip this single exemplar
   (the 20-19/20-20 D-03 strict-on-mechanism-class discipline
   applied here means: the SCOPE is "everything `-7LU6zgzViSM`
   needs to flip," not "everything that incidentally looks
   similar").

2. **Backlog audit sweep:** RUN-classify the four remaining open
   backlog issues `{#156, #153, #149, #147}` via Wave-0 style
   probes. For each, capture the executed observation VERBATIM
   in `20-21-OBSERVATIONS.md` and apply ONE of these dispositions:

   - **CLOSE-as-superseded:** issue was filed in an earlier phase
     but 20-18/20-19/20-20 work has incidentally closed it. The
     20-20 backlog notes already record LAST-WINS upstream
     semantics for `#153` (the multi-top-level case); Wave 0 of
     this phase RE-CONFIRMS that `sound("a")\nsound("b")`
     parseStrudel-structures on real main, and CLOSES `#153` as
     superseded if confirmed.
   - **CLOSE-as-duplicate:** issue's exemplar matches another
     open issue's mechanism class (e.g. `#156` "uncategorised
     Code-fallback" may classify as one of the now-known classes).
   - **CLOSE-as-not-a-bug:** the parser correctly bareCodes per
     upstream semantics (the Strudel program is genuinely malformed
     or relies on an unsupported feature).
   - **REFINE the issue body:** add the executed observation,
     the precise file:line of the bail, and the proposed fix shape
     for a future maintainer.
   - **FILE A NEW REFINED ISSUE:** if the executed observation
     reveals a NEW gap class distinct from the existing issue's
     framing, file a new issue + close the old.

   **NO FIX action on any backlog item EXCEPT** if Wave 0 shows the
   item is the SAME class as the gate-bearing `-7LU6zgzViSM` fix
   (incidental same-mechanism close — bonus per PK17 friction-first
   cycle; recorded as a bonus-close in V-1).

**Rationale:** The user's intent is "100% N=50 + clean the backlog
before pivot." STRETCH is the explicit choice; the discipline guard
is that CLASSIFY ≠ FIX. The backlog audit is a half-day of
observation + issue-comment activity; it does NOT widen the code
surface of the phase. If Wave 0 surfaces multi-class fixes that
would expand the code surface, those classes file as NEW issues
and stay for 20-22+ — the gate-bearing fix is the SOLE code surface
in scope.

**Rejected alternatives:**

- **A (strict to `-7LU6zgzViSM`)** — leaves the backlog dangling;
  the user wants cleanup before pivot.
- **B (wider opportunistic)** — without the "CLASSIFY ≠ FIX"
  discipline, this drifts into 20-16-style 4×-cascade. The
  STRETCH-with-discipline framing is the safer wide scope.

### D-04: Pass gate — dual; `-7LU6zgzViSM` STRUCTURED + parity = 100.0% + must-not-regress 98.0% floor

**Decision:** The phase ships when BOTH of the following hold on
the SAME merge commit verified on real main `dist/index.js`:

- **crit-1 (HARD):** A Wave-C-style canonical-positive fixture
  (`bakery-143-guarded-boot-with-trailing-comment.strudel` or
  similar name reflecting the precise blocker class Wave 0
  isolates) shows `-7LU6zgzViSM`'s code parses STRUCTURED
  (`body.tag !== 'Code'` AND the deep-walk surfaces the expected
  IR shape per the upstream-grounded semantics, e.g. the outer
  `Stack` with two child stacks for drums + chords).
- **crit-2 (HARD):** Fresh `pnpm parity:bakery --n 50` (PK17
  step-6 cadence; new ISO stamp; same upstream pin
  `f73b395648645aabe699f91ba0989f35a6fd8a3c`) reports
  **= 50/50 (100.0%)** AND **must-not-regress** the 49/50
  (98.0%) baseline. Closing `-7LU6zgzViSM` alone is expected to
  move the residual to ZERO; gate fails if the fresh measurement
  shows ≤ 48/50 (a regression even with the target flipped means
  something else broke — STOP, classify, never amend floor
  downward).

**No bar-lowering. No second-workaround. No push-through.**
If crit-2 falsifies the 98.0% floor: PK18 STOP → classify the
regression → re-pose D-04 to user with EVIDENCE → never amend the
floor downward.

If the gate-bearing fix INCIDENTALLY closes a backlog item AND
that bonus-close moves crit-2 above 49/50 (which would only happen
if the backlog item was a duplicate of `-7LU6zgzViSM`'s class,
which by construction it can't be — `-7LU6zgzViSM` is the SOLE
N=50 fallback): record as bonus.

**Rationale:** Exact 20-19/20-20 D-04 mechanism (proven discipline;
0 PK18 re-poses across both phases). The arithmetic: 49/50 → 50/50
is the single-class expected improvement; gate at 100% keeps the
"final residual closed" outcome honest. The 98% floor is the proven
must-not-regress invariant.

## Scope Boundary

**IN:**

- Wave 0 hybrid factoring probe (D-01 mechanism); 4-cell outcome
  matrix recorded verbatim in `20-21-OBSERVATIONS.md`.
- The fix(es) for `-7LU6zgzViSM`'s gate-bearing blocker(s),
  whether internal-walker-edge-case or external-semantics-grounded
  per D-02.
- Permanent CI fixture(s) for the closed class (one positive +
  optional negative-control per 20-19/20-20 cadence).
- D-04 dual gate on the same merge commit (fresh parity:bakery
  N=50 + the locked-FLIP fixture).
- Cross-wave per-file loc-fidelity STOP gate (V-3 cadence).
- **Backlog audit sweep:** Wave-0-style RUN-classify probes for
  `{#156, #153, #149, #147}`; per-issue dispositions (close /
  refine / file-new) recorded in OBSERVATIONS and applied via
  `gh issue comment` + `gh issue close` calls.
- Catalogue addenda (PK16/PK17/PK18 cadence rows; P70 occurrence-9
  IF Wave 0 confirms the cascade-mis-classification; PV49/PV52/PV54
  occurrence notes as applicable).
- Optional Ground Truth doc extension IF D-02 surfaces an external
  class.
- Single non-stacked PR `feat/20-21-final-residual` → main with
  `closes` referencing whichever issues actually closed (the
  gate-bearing `#143` re-close manually if the original close was
  premature; other backlog issues via `gh issue close` outside the
  PR per the GitHub 1-keyword limit).

**OUT:**

- FIXING any backlog item beyond what's incidentally same-class
  as the gate-bearing fix. The audit is CLASSIFY, not FIX.
- Closing the original `#143` issue programmatically via PR
  `closes #N` IF the actual fix lives in a different class than
  the original issue framed (in that case, file a NEW issue
  reflecting the actual class; close `#143` manually as
  "superseded by new finding"; close the new issue via PR).
- Any new top-level PatternIR `tag` UNLESS Wave 0 + D-02 grounding
  show one is required (likely NOT — the most-likely blocker is
  a depth-walker edge case in `stripParserPrelude`, which is
  purely string-position handling, no IR shape change). If a new
  tag IS shipped, PV54 FLOOR-grep obligation triggers.
- Any change to 20-19's `stripSideEffectStatements`, 20-20's
  `splitRootAndChain` PV49 extension, or any 20-18 chain-root
  recognition surface.

## Codebase Context (Chesterton scan — what exists before changing)

**The most-likely-affected surfaces:**

- `parseStrudel.ts:228-229` — `GUARDED_BOOT_RE` (the 20-16 V-2
  ship). Matches `typeof X !== 'undefined' && X(` shape.
- `parseStrudel.ts:163-331` — `stripParserPrelude`. Walker logic
  at `pS:256-323` is the depth-walker that consumes the
  recognised line. Critical exit condition at `pS:300-307`:
  ```
  if (depth === 0 && sawOpenParen) {
    while (j < code.length && (code[j] === ' ' || code[j] === '\t' || code[j] === ';')) j++
    if (j < code.length && code[j] === '\n') j++
    break
  }
  ```
  This exit condition does NOT tolerate a `/` (start of a `//`
  comment) immediately after `)`. The most-likely fix shape is
  to extend the post-`)` consumption to also tolerate `// comment`
  to EOL (analogous to PV49 inter-element comment-tolerance, but
  applied to the post-call-site walker exit).
- `parseStrudel.ts:246` — the whole-line comment branch of the
  prelude scan. If the depth-walker exits with `i = j` at the `/`
  of the trailing comment, the next iteration SHOULD trigger this
  branch — but the boundary handling between "depth-walker exit"
  and "next-line whole-line-comment recognition" may have an
  off-by-one or state-mismatch.
- `parseStrudel.ts:486-595` — `buildBindingMap`. If the prelude-
  strip succeeds, the remaining body `stack(...).cpm(28)\n//
  @version 1.0\n` would be passed in. The shape guard at pS:534
  rejects multiple non-binding statements; the trailing `//
  @version 1.0` line is whitespace-only after `splitTopLevelStatements`
  strips it (per the 20-19 pre-mortem audit), so it should NOT
  contribute a phantom stmt. Confirm by Wave-0 stage-trace.
- The chain-root recogniser arms for `stack(...).cpm(...)` — 20-18
  curated `CHAIN_ROOT_RECOGNISER` includes `stack`. The
  `.dict("ireal").layer(x => ..., x => ...)` chain may exercise
  arrow-function args inside `.layer()`. Wave-0 stage-trace should
  surface this if it's the cause.

**Test baselines on main HEAD `fa09cfe`:**

- `pnpm test` (editor): **1627/1627** ← must hold.
- `pnpm --filter @stave/app test`: **413/413** (parity-corpus
  **48/48** + loc-fidelity **48/48**) ← must hold.
- `pnpm parity:bakery --n 50` (sample
  `samples-2026-05-21T12-51-24-407Z.json`, upstream pin `f73b3956`):
  **98.0% (49/50)** ← must-not-regress floor.

**Catalogues to consult:**

- **P70** (8-occurrence; this phase may become occurrence-9 if
  Wave 0 confirms cascade-misclassification of `#143`). Read
  the full pattern before Wave 0.
- **PK18** — HARD-GATE cascade discipline.
- **P69** — Grounding Check IF D-02 routes to external research.
- **PV49** — inter-element whitespace + line-comment tolerance.
  The proposed fix (extend depth-walker exit to tolerate
  trailing `// comment`) is a PV49-spirit extension to a different
  call site (the walker exit condition rather than the inter-
  element scan).
- **PV54** — FLOOR-grep obligation IF a new top-level PatternIR
  `tag` ships (unlikely this phase).
- **PK16** — pipeline stages (stage 1 prelude → 1.5 sideEffect-
  strip + bindingMap → 2 chain-root); any fix re-derives stage 1
  if it touches `stripParserPrelude`.
- **PK17** — friction-first cycle; the audit sweep is a PK17
  classification activity (CLASSIFY ≠ FIX).
- **feedback_commit_msg_heredoc** — `git commit -F -` heredoc.

## Open Questions Deferred to RESEARCH / PLAN

These are NOT user-blocking; RESEARCH/PLAN resolves them based on
Wave 0 observation:

- **Whether RESEARCH spawns at all** — depends on D-02 outcome.
  Internal class → no RESEARCH; external class → RESEARCH grounds
  the relevant upstream surface; mixed → RESEARCH for the
  external part only.
- **The exact fix mechanism** — Wave 0 + RESEARCH (if applicable)
  output the upstream-grounded verdict; PLAN picks the matching
  mechanism class.
- **The fixture name(s)** — depends on the gate-bearing class. If
  internal walker-edge-case, `bakery-143-guarded-boot-with-
  trailing-comment.strudel` (or similar). If multi-class,
  one fixture per class.
- **The backlog audit dispositions** — each of `{#156, #153,
  #149, #147}` gets a Wave-0 probe; PLAN does NOT pre-decide;
  EXECUTOR records observations + applies dispositions.

## Routing

Next: `/anvi:plan-phase 20-21` (RESEARCH conditional on D-02; planner → checker)
