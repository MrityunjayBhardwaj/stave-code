---
phase: 20-18
title: Chain-root recognition — Strudel signal/builder family as Layer 1/2 Pattern IR
status: SHIPPED (PR open, awaiting user merge — Claude never merges)
verdict: AMENDED-D-03 PASS — crit-1 BOTH anchors STRUCTURED + crit-2 92.0% (+6pp over 86% floor)
branch: feat/20-18-chain-root
v1_commit: fa229bc
v4_commit: (this commit)
baseline_pre_phase: editor 1603/1603, app 367/367, parity-corpus 33, loc-fidelity 33 (main HEAD e3e6571, 20-17 merged PR #157)
baseline_post_phase: editor 1627/1627, app 387/387, parity-corpus 36, loc-fidelity 36
bakery: 92.0% (46/50) fresh stamp 2026-05-19T20-17-24-486Z, UPSTREAM_SHA f73b3956 (unchanged)
must_not_regress_floor: 86.0% (HELD with +6pp headroom)
closes: ["#155"]
backlog: ["#158 chord shape-fence → 20-19", "#156 R-1 NOT-folded Hydra mashup", "#149 carried", "#147 carried", "#153 carried", "-G2drHRNFueu uncategorised (NEW V-4 to file)"]
catalogue_updates:
  - .anvi/vyapti.md: PV54 (Signal/Builder additive PatternIR tags; recogniseChainRoot placement; flagged-general off-by-default; additive-tag obligation FLOOR-grep 11 sites)
  - .anvi/krama.md: PK16 addendum (parseRoot arm placement AFTER-G2/BEFORE-noteMatch) + PK17 addendum (20-18 measured 92.0% + 4 PK18 re-poses)
  - .anvi/hetvabhasa.md: P70 occurrences 3-6 (Wave-A type-only / Wave-B allow-list-empty / Wave-C #3 chord-class / D-03 AMENDMENT-2 #3-drop)
ground_truth: ~/.anvideck/projects/struCode/ref/GROUND_TRUTH_SIGNAL_MJS.md (Wave C — chord controls.mjs:2130 + arrange pattern.mjs:1469-1473)
fixtures_added:
  - bakery-141-irand-chain-root.strudel (--LsnlgQ6osk distillation; AMENDMENT-2 crit-1 anchor #1)
  - bakery-arrange-root.strudel (-KLGNJUtyyj1 distillation; AMENDMENT-2 crit-1 anchor #2)
  - bakery-chord-voicing-root.strudel (-6c1hEXe8Agi POSITIVE-CONTROL stripped-#3 shape; #158 deferred)
---

# Phase 20-18 SUMMARY — chain-root recognition for the Strudel signal/builder family

## Verdict — AMENDED-D-03 PASS

The AMENDED-D-03 (LOCKED 2026-05-20 per CONTEXT AMENDMENT-2) dual gate
PASSED at V-1 (`fa229bc`):

| Gate | Result |
|------|--------|
| **Crit-1 HARD** — `--LsnlgQ6osk` STRUCTURED (body.tag=Stack; post-fixpoint pending=[]; az2 resolved) | **PASS** |
| **Crit-1 HARD** — #7 `-KLGNJUtyyj1` STRUCTURED (Wave-C deep-walk Builder/arrange HIT + bakery verdict=structured) | **PASS** |
| **Crit-1 INFORMATIONAL** — #3 `-6c1hEXe8Agi` verdict=code (EXPECTED non-flip per AMENDMENT-2; chord arm validated by 4 Wave-C observations; shape-fence → #158 → 20-19) | RECORDED (not gated) |
| **Crit-2 INFORMATIONAL** — fresh stamp `2026-05-19T20-17-24-486Z` ≠ 20-17 stamp; UPSTREAM_SHA `f73b3956` unchanged; structured **92.0%** (46/50); must-not-regress ≥86.0% | **PASS** (no regression; +6pp above floor) |
| **Bar-lowering check** — no premise was bar-lowered; no scope-expansion; no second-workaround | **CLEAN** |

The 20-17 falsification trace is cleanly closed: the `az2` `irand`
chain-root that 20-17 had to RE-ANCHOR away from is now resolved in
the whole-program fixpoint (`resolved=[rp1,beat,az2,chords2,bass,harm2]
pending=[]`). The signal/builder IR substrate is real and not over-fit
(the 92.0% honesty-check); the deliverable is the genuine modelling,
not the parity number.

## Per-wave deltas

- **Wave 0** — oracle re-baseline (proto `--LsnlgQ6osk | production=code`
  pre-phase) + R-1 classify-lock (all 7 V-1 N=50 fallbacks classified
  verbatim — `~3/7 genuine` distribution confirmed; R-1's call falsified
  ~5/7 was correct) + the Lokāyata az2 chain-arg prototype settled
  EMPIRICALLY: VERDICT (a) ROOT-RECOGNITION-SUFFICES (NOT b; NOT the
  b-recursive STOP). Frozen curated-set membership: 21 Signal kinds + 6
  initial Builder kinds, with chord/arrange OPAQUE-pending for Wave C
  grounding.

- **Wave A** — Option-3 closure: additive Signal/Builder PatternIR
  union tags + constructors + FULL guarded arms across all 11 FLOOR
  exhaustive switches (`toStrudel.ts:20, serialize.ts:81,
  collect.ts:257+431, IRInspectorChrome.ts:19+102, irProjection.ts:42+
  73+190+333+438`). PK18 occurrence-3: the "type-only premise" was
  empirically falsified by `TS2366` at 11 sites — re-sequenced to
  Option-3 within plan. P68 anchor `'irand'` literal grep-asserted in
  `dist/index.d.ts`.

- **Wave B** — `recogniseChainRoot` arm (the AFTER-G2 / BEFORE-noteMatch
  curated arm) + the FROZEN curated set (21 Signal + 6 Builder). PK18
  occurrence-4: the "allow-list-empty premise" was falsified by
  `amensister` moving bare-Code → structured — re-classified within
  plan as a corpus-wide chain-root flip (V-3 allow-list extension).
  Provisional `--LsnlgQ6osk` HIT (V-1 confirms).

- **Wave C** — `chord`/`arrange` grounded-then-modelled (P69 discharge:
  `~/.anvideck/projects/struCode/ref/GROUND_TRUTH_SIGNAL_MJS.md`
  created with `controls.mjs:2130` reify+withVal + `pattern.mjs:1469-1473`
  arrange-into-struct-machinery citations). #7 `-KLGNJUtyyj1` flips
  STRUCTURED (deep-walk Builder/arrange HIT); belldub/dinofunk/
  meltingsubmarine corpus chord-root flips. PK18 occurrence-5: #3
  `-6c1hEXe8Agi` partial falsification — chord arm correct (4 Wave-C
  observations) + #3 has SECOND blocker class (`buildBindingMap`
  shape-fence: `bindings*, sideEffect, finalExpr` fails `finalIdx !==
  stmts.length-1`). Backlog #158 filed → 20-19 seed.

- **D-03 AMENDMENT-2 (2026-05-20)** — PK18 occurrence-6 (user-approved
  evidence reframe): drop #3 from crit-1. The "chord-family = chain-root
  class" classification was partially-falsified by Wave C (chord arm
  fires correctly; the whole-program blocker is shape-fence, a different
  mechanism). Structurally identical to the 2026-05-19 AMENDMENT
  `--LsnlgQ6osk` re-anchor. Crit-1 becomes `--LsnlgQ6osk` + #7; #3
  deferred to #158. No bar-lowering on the new crit-1 + 86% floor.

- **Wave D** — verify-only consumer audit: FLOOR-grep completeness
  proof (all 11 switches present, all have Signal/Builder arms);
  new-tag deep-walker disposition (MINOR-1 sweep); 2 acceptance specs
  with 33 assertions GREEN; producer-precedence blind-spot recheck
  (20-17-OBSERVATIONS:~470 lesson); `collect.ts` COMPOSE-not-SUBSUME
  observation (`.degradeBy(perlin.range(0,1))` event-neutrality
  verified). Option-3 closure PROVEN.

- **Wave E** — flagged-general fallback (`recogniseGeneralChainRoots`)
  threaded as OFF-BY-DEFAULT optional stack param
  `parseStrudel→parseExpression→parseRoot` (PV50 idiom: NO module
  state — `git diff` proves it). Structurally never-gate-counted: the
  oracle call site `parseStrudel(s.code)` is one-arg (grep-asserted at
  `_bakery-classify.spec.ts:77`); the flag is unreachable from the
  gate path. editor 1622 → 1627 (5 new spec tests).

- **V-1** — AMENDED-D-03 dual-gate measurement: crit-1 PASS (both
  anchors STRUCTURED); crit-2 PASS (fresh 92.0% + must-not-regress
  86% HELD with +6pp). V-1 residual fallback enumeration: 4 cases
  classified (1 `#141→#140` carried, 1 `#158→20-19` deferred, 1 `#143`
  carried, 1 NEW `-G2drHRNFueu` uncategorised → V-4 filed).

- **V-2** — 3 permanent CI fixtures vendored VERBATIM-distilled:
  `bakery-141-irand-chain-root.strudel` (`--LsnlgQ6osk`-faithful
  irand chain-root), `bakery-arrange-root.strudel` (`-KLGNJUtyyj1`
  arrange root), `bakery-chord-voicing-root.strudel` (stripped-#3
  shape — POSITIVE control for chord ARM correctness; the full #3
  shape-fence blocker stays in #158 → 20-19 per AMENDMENT-2).
  parity-refresh.mjs auto-exclusion confirmed at lines 68-77.
  corpus 33 → 36. Snapshot diff shows ONLY 3 new fixture keys added
  (zero pre-existing keys moved); 72/72 GREEN.

- **V-3** — cross-wave full-corpus per-file loc-fidelity STOP gate
  PASSED. All 36 parity + 36 loc-fidelity GREEN against committed
  snapshots (no `-u` needed). The parity-CHANGED set across the entire
  phase = exactly 7 files: `amensister` (Wave B) + `belldub` +
  `dinofunk` + `meltingsubmarine` (Wave C) + 3 V-2 fixtures. ANY
  other moved file would have been silent offset drift = STOP — none
  observed. The allow-list is NOT defensively extended to "files
  containing recognised roots" (PV49 definition-site loc-safety, the
  20-17 Fix-4 mechanism).

- **V-4** — phase close (this commit): SUMMARY + catalogues + backlog
  + single non-stacked PR → main.

## The FROZEN curated set shipped

**Signal roots** (21 kinds; `{tag:'Signal', kind}`; leaf, event-neutral):
`sine`, `cosine`, `saw`, `isaw`, `tri`, `square`, `pulse`, `perlin`,
`berlin`, `time`, `rand`, `rand2`, `brand`, `sine2`, `cosine2`, `saw2`,
`isaw2`, `tri2`, `square2`, `mousex`, `mousey`.

**Builder roots** (8 kinds; `{tag:'Builder', kind, args}`; consumed by
existing struct machinery / event-producing): `run`, `irand`, `binary`,
`binaryN`, `binaryL`, `binaryNL`, **`chord`** (Wave C grounded:
`controls.mjs:2130` reify+withVal), **`arrange`** (Wave C grounded:
`pattern.mjs:1469-1473`).

`args` = SOURCE TEXT byte-verbatim; the parser NEVER evaluates a signal
/ runs `.range` / invokes a builder.

**Explicitly OUT of frozen set:** signal-expression-AS-ARG recognisers
(verdict (a) — not needed; existing `applyChain` carries chain-arg
signals opaquely); recursive signal-arg parsers (the named NEW-CLASS
STOP — not triggered, stays out); the 4 R-1 out-of-scope classes
(#2 boot-stmt, #4 guarded-boot #143, #5 multi-top-expr, #6 Hydra #156).

## The 4 PK18 re-poses this phase (all resolved within-plan on evidence)

P70 occurrences 3-6 — see `.anvi/hetvabhasa.md` for the full
verbatim trail. Summary:

1. **Wave A** — "type-only premise" falsified by 11 `TS2366` sites
   → Option-3 closure (full guarded arms) re-sequenced within plan.
2. **Wave B** — "allow-list-empty premise" falsified by `amensister`
   bare-Code → structured → V-3 allow-list extended after per-file
   audit.
3. **Wave C** — #3 "chord-family = chain-root class" partially
   falsified (chord arm fires; #3 has SECOND blocker = shape-fence)
   → #158 backlog → 20-19.
4. **D-03 AMENDMENT-2** — #3 dropped from crit-1 on evidence reframe
   → crit-1 = `--LsnlgQ6osk` + #7. Structurally identical to the
   2026-05-19 `--LsnlgQ6osk` re-anchor precedent.

D-01/D-02/D-04 untouched (LOCKED, no re-poses). D-03 amended twice on
evidence (2026-05-19 + 2026-05-20). NO bar-lowering on any criterion;
NO scope-expansion mid-wave; NO second-workaround.

## PV53 consumer-audit FLOOR result + 33 acceptance tests

Wave D's PV53 consumer audit (the primary risk wave per the 20-17
D-1c precedent): 11 FLOOR sites identified by live `grep` over
`switch(.tag)` exhaustive non-undefined-return patterns; every site
has the Signal+Builder guarded arms. 33 acceptance assertions across
2 new specs (FLOOR-grep completeness proof + collect.ts
COMPOSE-not-SUBSUME event-neutrality + producer-precedence
blind-spot recheck) GREEN. `collect.ts`'s existing RNG family
modelling (`__timeToRandsPrime`/`randrun`/`shuffle`/`degradeBy`
byte-unchanged) COMPOSES with the new tags — no existing line
removed; verified Wave D by direct observation of
`az2 .degradeBy(perlin.range(0,1))` event-stream parity.

## Ground Truth doc created

`~/.anvideck/projects/struCode/ref/GROUND_TRUTH_SIGNAL_MJS.md`
created Wave C (the Grounding Check discharge for the OPAQUE
`chord`/`arrange` boundary): traces the `@strudel/tonal` chord +
`@strudel/core` arrange pipelines against the pinned upstream SHA
`f73b3956`. Citations: `controls.mjs:2130` (chord reify+withVal
flow); `pattern.mjs:1469-1473` (arrange continuum into the existing
struct machinery). The R-2 RESEARCH seed table was extended in this
doc; the `@strudel/core@1.2.6` vs Codeberg-SHA `f73b3956` delta
documented (collect.ts citations corroborate 1.2.6).

## Allow-list / cross-wave STOP gate

V-3 frozen 7-file allow-list (the only files that moved across the
entire phase):

| File | Wave | Class |
|---|---|---|
| `amensister` | Wave B | corpus chain-root flip (per-wave-commit-body-flagged) |
| `belldub` | Wave C | chord-root flip + perlin chain inside cutoff |
| `dinofunk` | Wave C | chord-root flip |
| `meltingsubmarine` | Wave C | chord-root flip |
| `bakery-141-irand-chain-root` | V-2 | new fixture (irand) |
| `bakery-arrange-root` | V-2 | new fixture (arrange) |
| `bakery-chord-voicing-root` | V-2 | new fixture (chord — POSITIVE control) |

ANY other moved file = silent offset drift = STOP. None observed.
The PV49 definition-site loc-safety mechanism (the 20-17 Fix-4
finding) keeps the new arm's offsets loc-additive — a recognised root
is loc-safe by the same mechanism the 20-17 splice was. The
allow-list is NOT defensively extended.

## Deferred backlog (the phase-close audit trail)

- **#158** — `buildBindingMap` shape-fence (`bindings*, sideEffect,
  finalExpr` rejected by `finalIdx !== stmts.length-1`) — 20-19 seed
  per AMENDMENT-2. Chord arm validated by 4 Wave-C observations;
  the full #3 flip ships at 20-19/#158-close.
- **#156** — Hydra-mashup `-HyFCSbuSlq5` — R-1-classified NOT-folded
  (non-Strudel external system, correctly out of scope). LEFT OPEN
  with R-1 classification comment.
- **#149, #147, #153** — carried backlog (pre-existing, untouched
  this phase).
- **NEW: `-G2drHRNFueu` uncategorised** (V-1 N=50 4th Code-fallback;
  firstLine `sound ("hh hh hh hh")` — note space between `sound` and
  `(`; likely tokenizer/whitespace fence around free-function `sound`
  calls). V-4 filed as a new GitHub issue.

## Operational discipline (the structural enforcement, structural not memory)

- **COMMIT_TEMPLATE single-quoted heredoc** — every commit this phase
  used `git -c commit.gpgsign=false commit -q -F - <<'MSG' ... MSG`.
  The zsh-`-m`-backtick trap (recurred 2× in 20-16) did NOT recur.
- **P68 STRING-LITERAL anchors** — every editor-src commit verified a
  minification-stable string literal grep (`'irand'`, `'chord'`,
  `'arrange'`, `'recogniseGeneralChainRoots'`) in
  `dist/index.{js,d.ts}` BEFORE commit. The known `@strudel/mondo`
  TS7016 was distinguished from new errors at every build.
- **Per-file loc-fidelity STOP gate** — fired per-wave AND cross-wave
  (V-3). The allow-list = exactly the enumerated 7 files; ANY other
  move would have been silent drift = STOP. Zero defensive extension.
- **PK18 cascade discipline** — 4 occurrences this phase, all
  resolved within plan on EVIDENCE (NOT bar-lowered, NOT scope-
  expanded, NOT second-workaround). NEW gap classes → backlog issues
  → 20-19.
- **Manual-close discipline** — `closes #155` ONLY in PR body
  (GitHub honors ONE auto-close keyword, the 20-15/16 lesson). #156
  left open per R-1; #158 left open per AMENDMENT-2. The V-4
  uncategorised case filed as a new issue (not silently dropped).
- **Post-merge artifact verification (RECORDED, for user-execute
  post-merge)** — `git merge-base --is-ancestor <PR-head> origin/main`
  exit 0; `dist/index.js` string-literal grep present on real main;
  editor/app counts hold. The EXACT 20-14 failure class
  (`feedback_stacked_pr_base_retarget.md`) is kept explicit even for
  a single non-stacked PR.

## Cognitive Discoveries
<!-- Internal — consumed by execute-phase orchestrator for catalogue updates -->

- vyapti: PV54 — Signal/Builder additive PatternIR tags are
  root-recognition-only; chain ARGS carried by existing `applyChain`;
  flagged-general off-by-default stack-param; additive-tag obligation
  FLOOR-grep 11 sites (discovered Wave A + 0 + D).
- krama: PK16 addendum — `recogniseChainRoot` arm placement
  AFTER-G2/BEFORE-noteMatch (user-shadow precedence + strict widen)
  (discovered Wave B).
- krama: PK17 addendum — 20-18 cycle measured 92.0% (+6pp), 4 PK18
  re-poses all resolved on evidence (discovered V-1 + Waves A/B/C +
  AMENDMENT-2).
- hetvabhasa: P70 occurrences 3-6 — Wave-A type-only premise / Wave-B
  allow-list-empty premise / Wave-C #3 chord-class / D-03
  AMENDMENT-2 #3-drop. P70 promotes to a SEVEN-occurrence pattern.
