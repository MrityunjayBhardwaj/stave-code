---
phase: 20-19
title: buildBindingMap shape-fence relaxation — `bindings*, sideEffect, finalExpr` (closes #158)
status: SHIPPED (PR open, awaiting user merge — Claude never merges)
verdict: D-04 DUAL GATE PASS — crit-1 (locked-STOP flipped + PASSING with `.toBe(true)`) + crit-2 (fresh 48/50 = 96.0%; +4pp from 92.0% baseline; +1 BONUS close)
branch: feat/20-19-shape-fence
v1_commit: c08b1f9
v3_commit: ebfffd7
v4_commit: (this commit)
baseline_pre_phase: editor 1627/1627, app 387/387 (parity-corpus 36 + loc-fidelity 36), main HEAD 00335d2 (ancestry 2f27485 — 20-18 PR #160 merged 2026-05-20T08:56Z)
baseline_post_phase: editor 1627/1627, app 409/409 (parity-corpus 47 + loc-fidelity 47)
bakery: 96.0% (48/50) fresh stamp 2026-05-20T13-22-13-320Z, UPSTREAM_SHA f73b3956 (unchanged)
must_not_regress_floor: 92.0% (HELD with +4pp headroom — beats the 94.0% target)
closes: ["#158"]
bonus_closes_observed: ["-1j62z5xjyCN (#147 / #141 / #140 — Wave-V-1 OBSERVATION: filter alone flips this row STRUCTURED; Wave-0 predicted #149 chain-arg ALSO needed but direct observation falsifies that)"]
backlog: ["#156 R-1 NOT-folded Hydra mashup (Wave-0 confirmed already structured on baseline)", "#159 multi-top-level/tokenizer-whitespace", "#149 .cpm(binding) chain-arg", "#147 (PARTIAL — its repro `-1j62z5xjyCN` bonus-closed by 20-19; the broader samples-capture side-channel concern remains)", "#153 multi-top-level (duplicate of #159 at the hash level)", "#143 guarded-boot (pre-existing baseline state — still in fresh fallbacks; not a 20-19 regression)"]
catalogue_updates:
  - .anvi/krama.md: PK16 addendum (new filter step in `buildBindingMap`'s preamble between `splitTopLevelStatements` and the binding loop; PK16 stage numbering unchanged) + PK17 addendum (20-19 measured 96.0%, +4pp from 92.0%, 0 PK18 re-poses) + PK18 addendum (first CLEAN-RUN phase in the 20-1x cadence; 0 re-poses; documents the milestone)
  - .anvi/hetvabhasa.md: P70 occurrence 8 (BONUS direction — Wave-0 cascade-classified `-1j62z5xjyCN` as F+SHAPE-FENCE-coupled predicting #149 chain-arg ALSO needed; direct observation in V-1 falsified the prediction — filter alone was sufficient. The cascade was WRONG but in the FAVORABLE direction. D-03 explicitly accepts non-A → A reclassification as bonus close.)
  - .anvi/vyapti.md: PV49 occurrence (20-19 array-filter on `splitTopLevelStatements` output — PV49 carries by construction, R-5 grounded; cross-wave V-3 STOP gate clean) + PV54 explicit NOT-triggered note (no new top-level PatternIR tag; the new code is purely parser-pipeline)
ground_truth: (existing) ~/.anvideck/projects/struCode/ref/GROUND_TRUTH_SIGNAL_MJS.md UNCHANGED — no new opaque boundary surfaced this phase; the 10 curated tokens were source-read in R-1 against `@strudel/core repl.mjs / signal.mjs`, `@strudel/tonal voicings.mjs`, `superdough sampler.mjs / superdough.mjs` at pin SHA `f73b3956`, but the citations are embedded in the in-source provenance block (`parseStrudel.ts:484-530`) — no separate Ground Truth doc was needed (the boundary was already covered structurally by the 20-15 `PRELUDE_CALL_RE` precedent's audit trail)
fixtures_added:
  - bakery-158-all-shape-fence.strudel (`all(x=>x.fast(2))` — the canonical exemplar token from #3)
  - bakery-158-samples-shape-fence.strudel
  - bakery-158-setcps-shape-fence.strudel
  - bakery-158-setCps-camel-shape-fence.strudel (`-camel` slug — APFS case-insensitive collision avoidance, per 20-15 V-3 precedent)
  - bakery-158-setcpm-shape-fence.strudel
  - bakery-158-setCpm-camel-shape-fence.strudel
  - bakery-158-useRNG-shape-fence.strudel
  - bakery-158-setVoicingRange-shape-fence.strudel
  - bakery-158-initAudio-shape-fence.strudel
  - bakery-158-aliasBank-shape-fence.strudel
  - bakery-158-NEGATIVE-no-sideeffect.strudel (negative-control proving the filter is the gate, not the bindings substrate)
---

# Phase 20-19 SUMMARY — `buildBindingMap` shape-fence relaxation on `bindings*, sideEffect, finalExpr`

## Verdict — D-04 DUAL GATE PASS

The LOCKED D-04 dual gate (CONTEXT lines 220-258) PASSED at V-1
(`c08b1f9`):

| Gate | Result |
|------|--------|
| **Crit-1 HARD** — `_waveC-grounding.spec.ts:155` PASSES with `.toBe(true)` (locked-STOP flipped) | **PASS** — #3 `-6c1hEXe8Agi`: `body.tag='Pick'`, deep-walk Builder/chord = 4 HITs, `hit[0].args = '"Am Am"'`, 2781-char bareCode body GONE. Companion lines 140-143 (#7 positive controls) GREEN unchanged. |
| **Crit-2 HARD** — fresh `pnpm parity:bakery --n 50` ≥ 94.0% AND ≥ 92.0% floor | **PASS** — fresh stamp `2026-05-20T13-22-13-320Z`, UPSTREAM_SHA `f73b3956` unchanged: **48 structured / 50 = 96.0%** (was 46/50 = 92.0% baseline; +4pp). Beats both thresholds. |
| **Bar-lowering check** — no bar-lowered premise; no second-workaround; no scope-expansion mid-phase | **CLEAN** — the bonus close of `-1j62z5xjyCN` was BY DIRECT OBSERVATION at V-1 (not a scope decision); D-03 strict was honoured (no Class-A reclassification predicted at Wave 0; the +1 was a bonus surfaced by the measurement). |

**No PK18 re-pose this phase — first CLEAN-RUN phase in the 20-1x cadence.**

The 20-18 V-4 AMENDMENT-2 backlog routing (#158 → 20-19) closed cleanly:
the chord recogniser arm grounded in 20-18 Wave C was already correct
(the 4 Wave-C observations stood); the only thing #3 needed was the
`buildBindingMap` shape-fence to admit `bindings*, sideEffect, finalExpr`
as a recognised program shape. The 20-19 filter does exactly that, by
construction (the side-effect intermediate is removed BEFORE
`buildBindingMap`'s loop sees it; the loop / fixpoint / occurs-check /
shape guard predicate at `pS:534` are byte-stable).

## Per-wave deltas

- **Wave 0** (`d2bf967`) — branch + baselines (editor 1627/1627, app
  387/387 GREEN; proto `__LsnlgQ6osk` post-fixpoint `resolved=[rp1,beat,
  az2,chords2,bass,harm2] pending=[]` UNCHANGED from 20-18) + re-grep
  of every `pS:` anchor (all stable, no drift since `2f27485`) + #3
  pre-fix RE-CONFIRMATION (`tag=Track structured=false`, Builder/chord
  MISS, locked-STOP at line 155 PASSES with `.toBe(false)`) + backlog
  classification probe for {#156, #159, #149, #147, #153} (no Class-A
  predictions — all 5 stay backlog per D-03 strict; #156 already
  structured on baseline; #159/#153 multi-top-level / tokenizer-
  whitespace; #149 chain-arg; #147 predicted F+SHAPE-FENCE-coupled
  needing #149) + FROZEN curated-set membership lock (R-1's 10 tokens
  verbatim; no extension required) + V-3 allow-list pre-allocation (11
  Wave-C fixtures + 0 backlog bonus + 0 #3-corpus).

- **Wave A** (`2e0ac44`) — `SIDE_EFFECT_CALL_RE` + `stripSideEffectStatements`
  helper landed at module scope (between `splitTopLevelStatements` close
  and `BINDING_RE`) with full provenance block (Codeberg SHA `f73b3956`
  pin + 10 per-token file:line citations from R-1) + one-line wire in
  `buildBindingMap`'s preamble. Deviation from PLAN action 3 (recorded):
  the regex must be MODULE-scoped to be callable from `buildBindingMap`,
  not local-to-`stripParserPrelude` like `PRELUDE_CALL_RE`/`GUARDED_BOOT_RE`.
  P68 build hygiene: 4 minification-stable literal-token greps on
  `dist/index.js` all > 0 (`stripSideEffectStatements`=3, `useRNG`=2,
  `setVoicingRange`=2, `aliasBank`=5). Wave-A throwaway probe GREEN
  (strict-widen 8/8 / false-positive 3/3 / #3 round-trip → 4 chord HITs
  with `args='"Am Am"'`). Locked-STOP at `_waveC-grounding.spec.ts:155`
  BREAKS LOUDLY as the crit-1 FLIP signal (`AssertionError: expected
  true to be false`). Companion lines 140-143 GREEN. Editor 1627/1627;
  app default 387/387; loc-fidelity STOP gate clean.

- **Wave B** (`f66134d`) — One-character flip at
  `_waveC-grounding.spec.ts:155`: `.toBe(false)` → `.toBe(true)` with
  updated diagnostic message + rewritten narrative comment block at
  lines 145-154 (preserves 20-18 Wave-C historical context; records the
  20-19 FLIP). Wave-C config: 388/388 GREEN. App default 387/387; editor
  1627/1627; loc-fidelity STOP gate clean.

- **Wave C** (`80952c1`) — 11 permanent CI fixtures vendored:
  10 token fixtures + 1 negative-control (canonical chord-rooted RHS +
  `stack(binding)` finalExpr template). Initial fixture design used a
  naive `'<0 1>'.pick([id,id])` finalExpr; direct observation showed
  BOTH side-effect-bearing AND negative-control parsed as bareCode (the
  `.pick(array)` finalExpr is not in the structured recogniser) — zero
  test signal. Reworked to the chord-rooted template (mirrors 20-18
  `bakery-chord-voicing-root.strudel`); all 11 fixtures now structure
  with `Code.via` cascade. BAKERY-FIXTURES.md updated with the 20-19
  section + per-fixture table. parity-refresh structural exclusion via
  the existing `parity-refresh.mjs:68-75` guard confirmed (0 missing
  for `bakery-158-*`). 22 new snapshots captured (11 fixtures × 2
  suites); zero pre-existing snapshots moved. App 387 → 409 GREEN.

- **V-1** (`c08b1f9`) — Fresh PK17 step-6 `pnpm parity:bakery --n 50`
  stamp `2026-05-20T13-22-13-320Z`, UPSTREAM_SHA `f73b3956` unchanged.
  Result: **48 / 50 = 96.0%** (+4pp from 92.0% baseline; +2pp over the
  94.0% target). Per-row diff: `-6c1hEXe8Agi` flipped code → structured
  ✓ (expected); `-1j62z5xjyCN` ALSO flipped code → structured (BONUS —
  Wave-0 prediction falsified; the FROZEN curated-set `samples` token
  stripped its `samples('github:yaxu/clean-breaks')` line; the rest of
  the shape `var cpm = 30; stack(...).cpm(cpm)` was structured by
  existing 20-17/20-18 machinery). The 46 baseline-structured rows ALL
  still structured; ZERO regressions. The 2 remaining fallbacks are
  `-7LU6zgzViSM` (#143 guarded-boot — pre-existing baseline state) and
  `-G2drHRNFueu` (#159 multi-top-level / tokenizer-whitespace — stays
  backlog per D-03). One-arg oracle invariant
  `_bakery-classify.spec.ts:77 parseStrudel(s.code)` STRUCTURALLY
  UNCHANGED. Crit-1 re-run on the same HEAD: wave-C config 410/410.

- **V-3** (`ebfffd7`) — Cross-wave full-corpus per-file loc-fidelity
  STOP gate CLEAN. `git diff HEAD~5..HEAD packages/app/tests/parity-corpus/`
  showed: 11 new `bakery-158-*.strudel` fixtures + BAKERY-FIXTURES.md +
  `_waveC-grounding.spec.ts` + two `__snapshots__/*.snap` (PURELY
  ADDITIVE — `grep -c '^-exports\[' = 0` on both). The PV49 substrate
  mechanically guarantees the array-filter operation cannot move any
  retained stmt's offset; the gate observation confirms it.

- **V-4** (this commit) — SUMMARY + catalogue addenda + PR.

## The 0 PK18 re-poses this phase (a 20-1x cadence first)

20-19 is the **first phase in the 20-1x cadence with zero PK18
re-poses.** Every Wave's exit criterion fired exactly as planned:

1. **Wave 0** — every `pS:` anchor stable; every baseline RE-OBSERVED;
   every backlog row classified by direct observation matched the
   pre-classification in RESEARCH §R-2; the FROZEN curated-set
   membership locked without extension.
2. **Wave A** — the strict-widen + false-positive + #3 round-trip
   probe all PASSED; the locked-STOP marker BROKE LOUDLY in the
   expected direction; P68 build hygiene clean; per-file loc-fidelity
   STOP gate clean.
3. **Wave B** — one-character flip; suite green; trivial.
4. **Wave C** — 11 fixtures vendored; auto-discovery picked them up;
   negative-control proves the filter is the gate (a fixture-design
   iteration was needed for the test SIGNAL — naive `'<0 1>'.pick([id,id])`
   gave zero discriminating signal — but this is documentation, not a
   PK18 re-pose; resolved within Wave C on direct observation).
5. **V-1** — dual gate held cleanly + 1 bonus close (favorable
   direction; D-03 explicitly accepts non-A → A reclassification).
6. **V-3** — every parity-UNCHANGED file's snapshot byte-stable;
   parity-CHANGED set exactly = enumerated allow-list; zero silent
   drift.

The single observation that didn't match prediction was the BONUS
close of `-1j62z5xjyCN` (Wave-0 predicted it would need #149 ALSO; V-1
observation showed the filter alone was sufficient). This is P70
occurrence 8 in the FAVORABLE direction — cataloged.

## Ground Truth disposition

No new Ground Truth doc was created this phase. The 10 curated tokens
were source-read in R-1 at exact `file:line` against the local
@strudel/core@1.2.6 / @strudel/tonal@1.2.6 / @strudel/webaudio@1.3.0 /
superdough@1.3.0 trees (the same trees the 20-15 `PRELUDE_CALL_RE`
provenance block at `parseStrudel.ts:167-194` already grounded). The
20-19 provenance block at `parseStrudel.ts:484-530` carries the per-
token file:line citations IN-SOURCE — the 10 grounded tokens were
folded into the existing 20-15 audit trail rather than spun out into a
separate Ground Truth doc. The 20-18 `GROUND_TRUTH_SIGNAL_MJS.md`
(chord/arrange grounding) is UNCHANGED — 20-19 does not touch any
chain-root recogniser.

## V-3 allow-list (frozen)

The parity-CHANGED set across the entire phase = exactly:

| File | Wave | Class |
|---|---|---|
| `bakery-158-all-shape-fence.strudel` | C | new token fixture (canonical exemplar) |
| `bakery-158-samples-shape-fence.strudel` | C | new token fixture |
| `bakery-158-setcps-shape-fence.strudel` | C | new token fixture |
| `bakery-158-setCps-camel-shape-fence.strudel` | C | new token fixture (camel, `-camel` slug per APFS-case) |
| `bakery-158-setcpm-shape-fence.strudel` | C | new token fixture |
| `bakery-158-setCpm-camel-shape-fence.strudel` | C | new token fixture |
| `bakery-158-useRNG-shape-fence.strudel` | C | new token fixture |
| `bakery-158-setVoicingRange-shape-fence.strudel` | C | new token fixture |
| `bakery-158-initAudio-shape-fence.strudel` | C | new token fixture |
| `bakery-158-aliasBank-shape-fence.strudel` | C | new token fixture |
| `bakery-158-NEGATIVE-no-sideeffect.strudel` | C | negative-control fixture |
| `parity.test.ts.snap` | C | PURELY ADDITIVE — 11 new entries (one per fixture); zero pre-existing entries removed |
| `loc-fidelity.test.ts.snap` | C | PURELY ADDITIVE — 11 new entries (one per fixture); zero pre-existing entries removed |

ANY other moved file would have been silent offset drift = STOP.
**None observed.** The PV49 substrate (R-5 grounded) carries by
construction (the array-filter mechanism guarantees byte-identical
offsets for every retained stmt). The allow-list was NOT defensively
extended (the 20-18 V-3 lesson — the PV49 mechanism is the proof, not
the allow-list).

## Deferred backlog (the phase-close audit trail)

- **#156** — `-HyFCSbuSlq5` Hydra mashup. Wave-0 observation confirmed
  this row is ALREADY STRUCTURED on the baseline (Hydra-injected
  `osc()_peterson` is in a line-1 comment; the rest is plain Strudel
  parsing cleanly). Stays backlog as already-handled / re-classify if
  it ever appears as a fallback again.
- **#159** — `-G2drHRNFueu` `sound ("hh hh hh hh")` tokenizer-
  whitespace fence. Still a fallback in the fresh measurement. Stays
  backlog (Class B/D — multi-top-level / tokenizer-whitespace fence
  upstream of `buildBindingMap`).
- **#149** — `-72eEl7NwK9e` `.cpm(cpm)` chain-arg outside stack. Still
  a fallback in the fresh measurement (Wave-0 prediction confirmed —
  this row needs the chain-arg fix, not the shape-fence filter). Stays
  backlog.
- **#147** — PARTIAL: its repro `-1j62z5xjyCN` was bonus-closed by
  20-19 (the `samples('github:yaxu/clean-breaks')` line stripped; the
  whole-program structured by existing machinery). The broader
  `samples()` SAMPLE-CAPTURE side-channel concern (the #147 issue
  body's actual scope — capture sample names into a side-channel for
  autocomplete/alias) is NOT addressed by 20-19 (which only STRIPS the
  side-effect; D-02 RATIONALE explicitly rejected the side-channel
  capture variant). Issue stays open for the side-channel half.
- **#153** — `-G2drHRNFueu` (same hash as #159) multi-top-level. Stays
  backlog as effectively a #159 duplicate.
- **#143** — `-7LU6zgzViSM` guarded-boot — pre-existing baseline state;
  not a 20-19 regression. The 20-15 `GUARDED_BOOT_RE` machinery is in
  place but this baseline row still falls back (likely the trailing
  comments in `setDefaultVoicings('legacy') // ...`); routes to
  20-15-followup, not 20-19.

## Operational discipline (the structural enforcement)

- **COMMIT_TEMPLATE single-quoted heredoc** — every commit this phase
  used `git -c commit.gpgsign=false commit -q -F - <<'MSG' ... MSG`.
  The zsh-`-m`-backtick trap (recurred 2× in 20-16) did NOT recur.
- **P68 MINIFICATION-STABLE anchors** — Wave A's editor-src commit
  verified 4 distinct literal-token greps on `dist/index.js` BEFORE
  commit: `stripSideEffectStatements` (the new symbol; tsup `keepNames`
  preserves), `useRNG` / `setVoicingRange` / `aliasBank` (curated-set
  tokens unique to 20-19, present as STRING LITERALS inside the regex
  source). All four counts > 0. Known `@strudel/mondo` TS7016 did NOT
  fire (already fixed in 20-15 #145).
- **Per-file loc-fidelity STOP gate** — fired per-wave (Wave A / B / C)
  AND cross-wave (V-3). The allow-list = exactly the enumerated 11
  fixtures + 2 snapshot files (both purely additive); ANY other move
  would have been silent drift = STOP. Zero defensive extension.
- **PK18 cascade discipline** — 0 occurrences this phase (a first in
  the 20-1x cadence). One BONUS observation (P70 occurrence 8 in the
  FAVORABLE direction) cataloged.
- **Manual-close discipline** — `closes #158` ONLY in PR body (GitHub
  honors ONE auto-close keyword, the 20-15/16 lesson). #156 / #159 /
  #149 / #147 / #153 / #143 left open per disposition table.
- **Post-merge artifact verification (RECORDED, for user-execute
  post-merge)** — recipe below; the EXACT 20-14 failure class
  (`feedback_stacked_pr_base_retarget.md`) is kept explicit even for a
  single non-stacked PR.

## Post-merge artifact verification recipe

After merging PR to `main`, execute the following on a fresh checkout:

```bash
git fetch origin
git checkout main
git pull
git merge-base --is-ancestor <PR-HEAD-SHA> origin/main && echo "ancestor: OK"
pnpm install
pnpm --filter @stave/editor build
grep -c "stripSideEffectStatements" packages/editor/dist/index.js   # > 0
grep -c "useRNG"                    packages/editor/dist/index.js   # > 0
grep -c "setVoicingRange"           packages/editor/dist/index.js   # > 0
grep -c "aliasBank"                 packages/editor/dist/index.js   # > 0
pnpm --filter @stave/editor test   # 1627/1627
pnpm --filter @stave/app test      # 409/409
pnpm parity:bakery --n 50          # ≥ 48/50 = ≥ 96.0%
```

If any grep returns 0, the merge race / squash mangled commits — file a
hotfix issue immediately (P70-class hetvabhasa entry; the 20-14
stacked-PR retarget feedback). If test counts regress on real `main`,
re-check the merge-base ancestry.

## Cognitive Discoveries
<!-- Internal — consumed by execute-phase orchestrator for catalogue updates -->

- hetvabhasa: P70 occurrence 8 (BONUS direction) — Wave-0 cascade-
  classified `-1j62z5xjyCN` (#147 / #141 / #140 exemplar) as F+SHAPE-
  FENCE-coupled, predicting #149's chain-arg fix would be ALSO needed
  in addition to 20-19's filter to flip this row STRUCTURED. V-1 direct
  observation falsified the prediction — the filter alone was
  sufficient. The cascade was WRONG but in the FAVORABLE direction
  (the row flipped to STRUCTURED as a bonus close). D-03 explicitly
  accepts non-A → A reclassification as bonus close, so no PK18
  re-pose required. Lesson: predictions about "this needs MULTIPLE
  fixes" are themselves cascade-classifications, subject to P70 — run
  the actual measurement, do not infer the necessary-condition
  conjunction from per-fix-class reasoning.

- vyapti: PV49 (definition-site loc-additivity) carries through the
  20-19 array-filter mechanism by construction. R-5 grounded: `filter()`
  removes items from the stmts array; the remaining items' `offset`
  fields are byte-unchanged; the source string is never mutated; every
  offset that flows out of `buildBindingMap` after the filter is
  byte-identical to what would flow if the user had hand-deleted the
  side-effect line. Verified: V-3 cross-wave full-corpus STOP gate
  CLEAN (`grep -c '^-exports\[' = 0` on both snap files; only additive
  exports).

- krama: PK16 stage 0.5 (the `splitTopLevelStatements` → `buildBindingMap`
  pipeline) acquires a new filter step inserted INSIDE `buildBindingMap`'s
  preamble between `splitTopLevelStatements` and the binding loop. PK16
  stage numbering UNCHANGED (the filter is atomic from the loop's
  perspective). The curated-list mechanism EXTENDS the existing
  `PRELUDE_CALL_RE` precedent at a DIFFERENT pipeline stage (stage 1 vs
  stage 1.5).

- hetvabhasa (general): a "clean-run" phase (0 PK18 re-poses) is itself
  catalogue-worthy in the 20-1x cadence. 20-19 is the first such
  phase. The mechanism: every premise of the PLAN was already
  source-read (R-1 audit + 20-18 Wave-C chord-arm grounding); the
  scope was strictly LOCKED (single mechanism class); the Wave 0
  observation tier was non-skippable; the per-wave gates were single
  observations. Pattern: when the prior-phase planning trail is rich
  AND the new mechanism is a single localized filter, the phase can
  run clean.
