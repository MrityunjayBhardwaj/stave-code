# New session resume prompt — Phase 20-19

Copy-paste the block below into a fresh Claude Code conversation.

---

Continuing struCode (Stave). **Phase 20-18 MERGED PR #160 (merge `2f27485`,
2026-05-20, artifact-verified on real main).** Signal/Builder Layer-1/2
IR substrate shipped: 21 Signal + 8 Builder kinds modelled (incl.
chord/arrange grounded via P69 at `controls.mjs:2130` +
`pattern.mjs:1469-1473`); `--LsnlgQ6osk` RECLAIMED in production (the
20-17 falsification cleanly closed); fresh Bakery **92.0%** (46/50,
+6pp over the 86.0% must-not-regress floor). Six PK18 re-poses across
20-17+20-18, all resolved within-plan on EVIDENCE, zero bar-lowering.

**THIS SESSION: discuss → plan → execute Phase 20-19 — issue #158**
(`buildBindingMap` shape-fence on `bindings*, sideEffect, finalExpr` —
the AMENDMENT-2-deferred class from 20-18). Canonical exemplar: #3
`-6c1hEXe8Agi` (chord arm proven correct in 20-18 Wave C; the residual
blocker is this shape-fence, not chain-root).

## PRE-FLIGHT (read first, in this order)

- `~/.claude/projects/-Users-mrityunjaybhardwaj-Documents-projects-struCode/memory/project_phase_20_musician_timeline.md`
  — THE load-bearing handoff. The "Phase 20-18 MERGED" block has
  the 4 PK18 re-poses + the LOCKED D-01/D-02/D-04 + the AMENDED-D-03
  + the catalogue promotions. Read in full.
- `~/.claude/projects/-Users-mrityunjaybhardwaj-Documents-projects-struCode/memory/project_pattern_ir_status.md`
  — the "2026-05-20" block details what 20-17 + 20-18 added to
  PatternIR (Code.via literal arm, Signal/Builder additive tags,
  recogniseChainRoot arm, flagged-general opts, PV54 FLOOR-grep
  obligation). Critical background for any 20-19 work that touches
  buildBindingMap, parseStrudel pipeline, or PatternIR consumers.
- `.anvi/` catalogues — NEW from 20-18:
  - **PV54** (vyapti) — Signal/Builder additive PatternIR tags;
    `recogniseChainRoot` placement; **the new-top-level-tag FLOOR-grep
    obligation** (EVERY new top-level tag requires guarded arms in
    EVERY exhaustive `switch(.tag)`, live grep is source of truth, 11
    sites enumerated). collect.ts COMPOSES-not-SUBSUMES the RNG prior
    art.
  - **PK16 + PK17 addenda (20-18)** — new arm-placement discipline;
    92.0% N=50 measured + 4 PK18 re-poses recorded.
  - **P70 NOW SEVEN-OCCURRENCE PATTERN** (20-16/20-17/20-18). Cascade
    classification can be wrong about WHY a case is bareCode. The
    governing pre-mortem of every parity/parser phase. Right fix:
    STOP / record verbatim / re-pose / re-anchor on evidence — NEVER
    push through / NEVER bar-lower / NEVER second-workaround. Read
    the full P70 entry — it's the seven-occurrence backbone.
  - Also relevant: **PV53** (20-17 pervasive optional-arg threading
    + bounded least-fixpoint), **P69** (grounded-LOOKING inference —
    `file:line` is not observation unless grepped/executed; the
    Grounding Check Wave-C discharges), **P67** (Code tri-state),
    **P68** (editor watch unreliable; one-shot build + grep), **PK18**
    (HARD-GATE cascade discipline).
- `~/.claude/projects/-Users-mrityunjaybhardwaj-Documents-projects-struCode/memory/feedback_commit_msg_heredoc.md`
  — ALL multi-line commit bodies via `git commit -F - <<'MSG' … MSG`
  heredoc. NEVER `-m` with backticks/`$()` under zsh (it executes +
  strips them; recurred 2× in 20-16; the COMMIT_TEMPLATE in
  EXECUTOR NOTES is the structural fix).
- **Phase 20-18 artifacts on main** (read selectively, as needed):
  - `.planning/phases/20-musician-timeline/20-18-SUMMARY.md` — the
    phase-close audit.
  - `.planning/phases/20-musician-timeline/20-18-OBSERVATIONS.md` —
    the full Wave 0→V audit trail incl. the chord-arm-correctness
    proof (the 4 independent Wave-C observations + stripped-#3 probe
    showing whole-program STRUCTURED + `deep-walk Builder/chord = HIT,
    args="Am Am"`). The exemplar evidence 20-19 needs.
  - `~/.anvideck/projects/struCode/ref/GROUND_TRUTH_SIGNAL_MJS.md` —
    the Ground Truth doc seeded by 20-18 (R-2 signal.mjs table; chord
    at `controls.mjs:2130`; arrange at `pattern.mjs:1469-1473`).

## STATE

- main HEAD `2f27485`. 20-18 PR #160 merged 2026-05-20T08:56Z.
- Baseline gates on main: editor **1627/1627**, app **387/387**
  (parity-corpus **36/36** + loc-fidelity **36/36**), real-world
  Bakery **92.0%** (46/50, N=50, fresh stamp
  `2026-05-19T20-17-24-486Z`, upstream pin
  `f73b395648645aabe699f91ba0989f35a6fd8a3c`).
- Wave anchors verified grep-present on real main `dist/index.js`:
  `"irand"`=1, `"sine"`=11, `"chord"`=5, `"arrange"`=1,
  `recogniseGeneralChainRoots`=1, `Builder`=25, `CHAIN_ROOT_RECOGNISER`=5
  (curated-Map keys; esbuild double-quotes post-minify; keepNames
  preserves the symbol).
- **V-3 allow-list (7 files, frozen)**: amensister/belldub/dinofunk/
  meltingsubmarine (Wave-B/C corpus-scale (a)-verdict flags) +
  bakery-141-irand-chain-root + bakery-arrange-root +
  bakery-chord-voicing-root (3 V-2 fixtures). All proven loc-safe by
  the PV49 definition-site mechanism; not defensively extended.
- **Open backlog**: **#158** (the 20-19 seed — `buildBindingMap`
  shape-fence on `bindings*, sideEffect, finalExpr`; canonical
  exemplar #3 `-6c1hEXe8Agi`), **#156** (Hydra mashup, R-1
  classified NOT-folded), **#159 NEW** (V-1 N=50 `-G2drHRNFueu`
  uncategorised — likely tokenizer/whitespace fence around
  free-function `sound (` with space), **#149/#147/#153** carried.
  Closed by 20-18: **#155** (auto). No open feature branches.

## TODAY — first action

`/anvi:discuss-phase 20-19`

Expected gray areas to surface (planning notes — these become D-*
locked decisions after the user picks; do NOT pre-decide):

- **Shape of the shape-fence relaxation.** The current fence
  (`buildBindingMap` ~pS:534; the `finalIdx !== stmts.length - 1`
  check) rejects ANY program where a non-binding statement sits before
  the final expression. #3's `all(x=>x.punchcard())` is the canonical
  side-effect-statement shape. Options span: (a) recognise
  side-effect statements (specific call shapes like `all(...)`,
  `setcpm(...)`, `samples(...)`) and skip-but-preserve them; (b)
  generalise: any statement matching `expr-statement` (vs `binding` vs
  `final-expr`) is side-effect-tolerable; (c) narrow to a curated
  closed set of known side-effect builders (the 20-18 D-01 pattern).
  P70 + P69 — RUN samples to classify what's actually out there
  before locking the recognition policy.

- **Composition with 20-18 chain-root recognition.** Does the
  shape-fence relaxation interact with the `recogniseChainRoot` arm?
  Most side-effect statements are `identifier(...)` chain heads — the
  20-18 flagged-general fallback could in principle handle them but
  is structurally never-gate-counted. Pre-empt the
  scope-question: is the new mechanism additive to 20-18 (a separate
  shape-fence relaxation in buildBindingMap) or composed with it
  (extend the curated set / flagged-general path to recognise
  side-effects too)?

- **Pass gate (D-03 analogue).** Reclaim #3 `-6c1hEXe8Agi`
  STRUCTURED in production (clean closure of the 20-18 AMENDMENT-2
  deferral) + must-not-regress 92.0% floor + classify #156 / #159 /
  the carried #149/#147/#153 — does any of them ALSO fall into this
  class (the P70 directive: RUN them, don't infer). If so, scope
  expands within-plan; if not, they stay backlog.

- **Whether to also address #156/#159.** Both are "currently
  uncategorised" — Wave-0 may classify them into the shape-fence
  class (then they're in-scope) or confirm they're different classes
  (then they stay backlog).

## OPERATIONAL (carried verbatim from 20-17 + 20-18 — proven discipline)

- AnviDev: issue→branch (`feat/20-19-shape-fence` likely; never code
  on main)→fix→test→observe→PR→self-review→merge. Single non-stacked
  PR → main. Claude NEVER merges. `.anvi/` + `.planning/` gitignored
  → `git add -f`. No Co-Authored-By.
- COMMIT_TEMPLATE single-quoted heredoc (`git -c commit.gpgsign=false
  commit -q -F - <<'MSG' … MSG`); NEVER `-m` with backticks/`$()`
  (zsh strip; recurred 2× in 20-16; structural fix is the heredoc).
- **P68 build hygiene per editor-src commit**: one-shot
  `pnpm --filter @stave/editor build` + `grep -c <minification-stable
  STRING/REGEX LITERAL anchor> packages/editor/dist/index.js` > 0
  before EVERY editor-src commit. **Anchor on a STRING LITERAL**
  (curated-set key, kind-union literal, named export) — NOT a comment
  (stripped), NOT a parameter name (renamed unless keepNames — and
  even then, prefer a runtime literal; the 20-18 Wave-A Lokāyata
  lesson: TS type-union string literals are erased at JS emit; verify
  on a RUNTIME literal or accept `.d.ts > 0` + consumers-compile +
  build-exit-0 as evidence-stronger).
- **Per-file loc-fidelity STOP gate** (per-wave + cross-wave): every
  parity-UNCHANGED corpus file's loc-fidelity diff MUST be EMPTY;
  parity-CHANGED set ⊆ enumerated allow-list (the V-3 7-file list +
  any per-wave commit-body-flagged additions); ANY other moved file =
  silent drift = STOP. The allow-list is NOT defensively extended
  (the loc-fidelity test slices from the single parsed string at the
  definition-site offset; PV49 definition-site-additivity makes new
  arms loc-safe by construction — the 20-17 Fix-4 / 20-18 corpus-scale
  corroboration).
- **PK18 HARD-GATE cascade discipline (P70 spine — the seven-occurrence
  pattern, the most-recurring entry in the catalogue):** if ANY gate
  falsifies a premise → STOP, record VERBATIM in
  `.planning/phases/20-musician-timeline/20-19-OBSERVATIONS.md`,
  re-classify, re-pose the invalidated LOCKED decision to the user,
  reframe — NEVER push through, NEVER add a second workaround, NEVER
  lower the bar (the AMENDED-D-03-style must-not-regress floor +
  no-bar-lowering carry forward). New gap classes → backlog
  (issue-before-fix) → 20-20+, NOT fixed this phase (the 20-16
  4×-cascade / 20-18 scope-discipline lesson).
- **Grounding Check (P69)**: if the shape-fence relaxation depends on
  understanding any external lib's behaviour at a particular call
  site, READ the real source FIRST (or mark OPAQUE + handle
  args-RAW-only); update `GROUND_TRUTH_SIGNAL_MJS.md` (or create a
  new Ground Truth doc) before modelling. An inferred taxonomy is a
  wrong foundation the whole phase + every consumer builds on (the
  20-18 Wave-C lesson).
- **PV54 additive-tag FLOOR-grep obligation** — if 20-19 introduces
  ANY new top-level PatternIR `tag` (likely NOT — shape-fence
  relaxation is parser-pipeline, not tag-family), it MUST include
  guarded arms in EVERY exhaustive `switch(.tag)` IN THE SAME WAVE
  (the 20-18 Wave-A re-sequencing lesson; the 11-FLOOR-site live grep
  is the template).
- **Post-merge artifact verification (NOT the badge)**: `git
  merge-base --is-ancestor <PR-head-sha> origin/main` exit 0;
  HEAD == merge commit; new symbol grep-present on real main's
  `dist/index.js` (use double-quoted forms — esbuild minifies single
  → double; the 20-18 verification lesson); editor 1627 + app 387 +
  parity 36 + loc 36 baselines hold. Manually close any 2nd+ issue
  per GitHub's 1-keyword limit.
- Absolute dates from the system clock; cognitive OS as needed.
  This phase will likely be a P70 occurrence-8 candidate if any
  inferred premise gets falsified — anticipate, surface, re-pose.
