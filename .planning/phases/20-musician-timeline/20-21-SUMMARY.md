---
phase: 20-21
title: parseStrudel two-site walker `//`-skip — chain-arg walker apostrophe-in-comment tolerance (closes #163; supersedes premature close of #143)
status: SHIPPED (PR open, awaiting user merge — Claude never merges)
verdict: D-04 DUAL GATE PASS — crit-1 (W3 production-exemplar `-7LU6zgzViSM` STRUCTURED at full-pipeline + Wave-B-A canonical-positive `bakery-143-apostrophe-in-chain-arg-comment` parity snapshot STRUCTURED + NEGATIVE-control STRUCTURED) + crit-2 (fresh 50/50 = 100.0%; +2pp from 98.0% baseline; meets must-not-regress 98.0% floor with +2pp headroom; SCOPE strict to gate-bearing class held end-to-end; 1 PK18 re-pose resolved within-plan on EVIDENCE)
branch: feat/20-21-comment-aware-walkers
wave0_commit: 485b6ae
waveA_commit: f8bffe7
waveA_tail_commit: 9acfc1e
waveB_A_commit: f86ad34
waveB_B_commit: bcc05f5
v1_commit: 35c6ecf
v3_commit: 359690a
v4_commit: (this commit)
baseline_pre_phase: editor 1627/1627, app 413/413 (parity-corpus 49 + loc-fidelity 49), main HEAD 5fbafe1 (ancestry — 20-20 PR #162 merged 2026-05-21T~)
baseline_post_phase: editor 1627/1627, app 417/417 (parity-corpus 51 + loc-fidelity 51)
bakery: 100.0% (50/50) fresh stamp 2026-05-21T18-47-02-200Z, UPSTREAM_SHA f73b3956 (unchanged)
must_not_regress_floor: 98.0% (HELD with +2pp headroom — beats the ≥98.0% target by 2pp; the 100.0% level is the dual-gate ceiling)
closes: ["#163"]
supersedes: ["#143 (annotated as superseded; stays closed; #163 tracks the correct class)"]
bonus_closes_observed:
  - meltingsubmarine STRUCTURED→STRUCTURED enrichment (same-mechanism-class incidental improvement; `body.tag` `Code-via{echoWith}` → `Slow`; V-3 allow-list extended on EVIDENCE; 20-19 `-1j62z5xjyCN` bonus-close precedent applied; SCOPE stayed strict to gate-bearing class)
  - `-1j62z5xjyCN` STRUCTURED in current sample (re-confirms 20-19's bonus close holds at this baseline)
  - `-72eEl7NwK9e` STRUCTURED in current sample (#149 audit closure on real main)
backlog_processed:
  - "#153 CLOSED-as-superseded (LAST-WINS Ground Truth §7.2 cite + 20-20 substrate)"
  - "#156 CLOSED-as-superseded (sole 20-17 residual = `-7LU6zgzViSM` = THIS phase's gate-bearing exemplar)"
  - "#149 CLOSED-as-superseded (both targets STRUCTURED via intervening 20-18/20-19/20-20 substrate)"
  - "#147 REFINED-with-product-note (feature placeholder; stays open as feature-deferred)"
catalogue_updates:
  - .anvi/krama.md: PK16 addendum (two-site walker `//`-skip at stage 2 — `findMatchingParen` + `splitArgsWithOffsets`; precedent at `splitTopLevelStatements:414-417` extended to chain-arg walkers; stage numbering unchanged) + PK17 addendum (20-21 measured 100.0%, +2pp from 98.0%, 1 PK18 re-pose resolved within-plan on EVIDENCE) + PK18 addendum (1 re-pose triggered + resolved on EVIDENCE = substrate works as designed; qualitatively SAME health signal as the 20-19/20-20 0-occurrence phases; the discipline held, the executor STOPPED, the user resolved on EVIDENCE)
  - .anvi/hetvabhasa.md: P70 occurrence-9 FULL ROW (the 20-16 cascade closed #143 framing the class as guarded-boot prelude; RESEARCH §R-1 9-wave bisect proved the actual class is chain-arg walker `//`-comment apostrophe handling; #163 tracks the correct class; lesson — bisect-then-pre/post-snippet observation pattern instead of issue-body re-reading)
  - .anvi/vyapti.md: PV49 occurrence-NEW (20-21 chain-arg walker `//`-skip at 2 NEW call sites — `findMatchingParen` + `splitArgsWithOffsets`; mirrors the existing `splitTopLevelStatements:414-417` skip; the PV49 substrate is now load-bearing across SEVEN call sites + the segmenter site) + PV54 explicit NOT-triggered note (no new top-level PatternIR tag this phase)
ground_truth: ~/.anvideck/projects/struCode/ref/GROUND_TRUTH_SIGNAL_MJS.md (used 20-20 §"Parser/Evaluator Pipeline" §7.2 LAST-WINS cite in #153 closure; no new sections added this phase — the fix is in OUR parser, not upstream)
fixtures_added:
  - bakery-143-apostrophe-in-chain-arg-comment.strudel (canonical positive — minimal R-5 distillation; `.layer(arrow1, arrow2)` with `// ma'am` line comment inside arrow2's body; asserts whole-program STRUCTURED via the two-site walker `//`-skip surgery)
  - bakery-143-NEGATIVE-no-apostrophe-comment.strudel (negative-control — same shape with `// maam` no apostrophe; STRUCTURED both pre + post; over-consumption canary; if the negative bareCodes post-fix the `//`-skip is consuming past the line)
---

# Phase 20-21 SUMMARY — parseStrudel two-site walker `//`-skip (chain-arg walker apostrophe-in-comment tolerance)

## Verdict — D-04 DUAL GATE PASS

The LOCKED D-04 dual gate (CONTEXT §"D-04") PASSED at V-1 (`35c6ecf`):

| Gate | Result |
|------|--------|
| **Crit-1 HARD** — W3 production-exemplar `-7LU6zgzViSM` STRUCTURED at full-pipeline + Wave-B-A canonical-positive `bakery-143-apostrophe-in-chain-arg-comment` parity snapshot STRUCTURED + NEGATIVE-control STRUCTURED (over-consumption canary) | **PASS** — `-7LU6zgzViSM` verdict `structured` in the fresh measurement artifact `result-2026-05-21T18-47-02-200Z.json` (the gate-bearing flip at full-pipeline level, not just the W3 isolated probe at Wave A); both Wave-B-A fixtures' auto-discovered snapshots STRUCTURED. |
| **Crit-2 HARD** — fresh `pnpm parity:bakery --n 50` ≥ 49/50 (98.0%) AND ≥ 98.0% must-not-regress floor | **PASS** — fresh stamp `2026-05-21T18-47-02-200Z`, UPSTREAM_SHA `f73b3956` unchanged: **50 structured / 50 = 100.0%** (was 49/50 = 98.0% baseline; +2pp). The 100.0% measurement is the dual-gate ceiling for N=50 sampling. |
| **Bar-lowering check** — no bar-lowered premise; no second-workaround; scope held strict to gate-bearing class | **CLEAN** — SCOPE held strict to #163 throughout; meltingsubmarine bonus-improvement explicitly classified as SAME-MECHANISM-CLASS (not a different class); V-3 allow-list extension EVIDENCE-grounded via Option A (PK18 cascade discipline); backlog audit was CLASSIFY-only (no fixes outside gate-bearing class); 1 PK18 re-pose triggered + resolved on EVIDENCE within-plan. |

**Per-row diff vs 98.0% baseline:**

```
FLIPPED code->structured: [ '-7LU6zgzViSM' ]   ← the +1 from the gate-bearing fix
REGRESSED structured->code: []                   ← zero regressions
baseline -7LU6zgzViSM: code -> fresh: structured
all other 48 baseline-structured rows: unchanged
```

**1 PK18 re-pose this phase — resolved within-plan on EVIDENCE.** This is qualitatively the SAME health signal as 20-19/20-20's 0-occurrence phases: the substrate (PK18 cascade discipline) CAUGHT the surface (the meltingsubmarine fixture moved outside the pre-allocated V-3 allow-list); the executor STOPPED + re-posed; the user resolved on EVIDENCE (Option A — extend V-3 allow-list to include meltingsubmarine as same-mechanism-class incidental enrichment; document as bonus-improvement; SCOPE stays strict). The 20-19 `-1j62z5xjyCN` bonus-close precedent applies.

## Per-wave deltas

- **Wave 0** (`485b6ae`) — branch (`feat/20-21-comment-aware-walkers` from `5fbafe1`); ancestry confirmed; editor 1627/1627 + app 413/413 baselines RE-OBSERVED; live anchor re-grep (every `pS:` anchor stable — no drift since the planning-doc-only commits); §R-1 9-wave bisect RE-CONFIRMED (W1 `// ma'am` single-arrow → bareCode; W3 V0-minus-apostrophe → STRUCTURED; A8 4-apostrophe even count → STRUCTURED — the apostrophe-in-`//`-comment chain-arg-walker class is the gate); RUN-classify backlog audit on real main against current Bakery sample (`samples-2026-05-21T12-51-24-407Z.json`) — #153 STRUCTURED (Seq via 20-20 substrate); #156 sole 20-17 residual = `-7LU6zgzViSM` = THIS phase's gate-bearing exemplar; #149 both targets STRUCTURED via intervening substrate; #147 feature placeholder (no probe; defer). Outcome lock: D-01 LOCKED → Outcome 1 (clean single-blocker — apostrophe-in-`//`-comment chain-arg walker class); D-02 INTERNAL class (no upstream RESEARCH; fix mirrors `splitTopLevelStatements:414-417`); D-03 STRETCH (gate-bearing fix + 4 backlog dispositions); D-04 dual gate 100% + must-not-regress 98%. PK18 STOP: NONE TRIGGERED.

- **Wave A** (`f8bffe7`) — Two-site walker `//`-skip surgical edit landed in `parseStrudel.ts`. Site 1 (`findMatchingParen` pS:2598-2628) — the `//`-skip branch inserted AFTER `if (inString)` and BEFORE the string-quote test (i increments inside the inner while; outer `for` `i++` lands on `\n`). Site 2 (`splitArgsWithOffsets` pS:2664-2747) — the `//`-skip branch inserted at the same position; comment chars appended to `current` to preserve the OFFSET CONTRACT at pS:2685-2693 (PV49-spirit byte-additive consumption; existing `skipWhitespaceAndLineComments` primitive at `pushCurrent` consumes leading `// comment\n` when an arg starts with one). 41 insertions / 0 deletions; purely additive. Wave-A probe (i) W1 minimal `Code → STRUCTURED-Code-via{cpm}` FLIP confirmed; (ii) **W3 verbatim `-7LU6zgzViSM` `Code → STRUCTURED-Code-via{cpm}` GATE-BEARING FLIP**; (iii-a/b/c) 3 false-positive guards UNCHANGED (apostrophe in double-quoted string + top-level `//` + block-comment between args); (iv) loc-fidelity offset preserved (two-arg `stack(arg1 // ma'am\n, arg2)` → STRUCTURED-Stack); (v) NEGATIVE-control (`// maam`) UNCHANGED. P68 build hygiene: 4 distinct minification-stable literal-token greps on `dist/index.js` — `findMatchingParen` 9 (= pre-fix; symbol intact); `splitArgsWithOffsets` 4 (= pre-fix; symbol intact); `splitTopLevelStatements` 3 (= pre-fix; defensive UNCHANGED — the reference walker stays byte-stable); `skipWhitespaceAndLineComments` 7 (= pre-fix; defensive UNCHANGED — the PV49 primitive stays byte-stable). Editor 1627/1627 GREEN; app 411/413 (the 2 failed are meltingsubmarine's parity + loc-fidelity snapshots) — PK18 STOP TRIGGERED.

- **Wave A tail** (`9acfc1e`) — PK18 STOP resolved via user-locked Option A. The meltingsubmarine snapshot diff classification (OBSERVATIONS Wave-A) showed STRUCTURED→STRUCTURED enrichment, NOT a regression: pre-fix `body.tag=Code-via{echoWith}` (trailing `.slow(3/2)` unreachable because `findMatchingParen` was failing inside `'sawtooth'`/`'lefthand'`/`'triangle'` chain args adjacent to `//` comments → outer `stack(...)` paren-close mis-attributed → chain truncated at `.echoWith(...)`); post-fix `body.tag=Slow` (entire chain captured + inner chain methods correctly named). Same-mechanism-class as the gate-bearing `-7LU6zgzViSM` flip. The 20-19 `-1j62z5xjyCN` bonus-close precedent applied: V-3 allow-list extended on EVIDENCE to `{bakery-143-apostrophe-in-chain-arg-comment, bakery-143-NEGATIVE-no-apostrophe-comment, meltingsubmarine}` = 3 parity-corpus fixtures + 3 loc-fidelity entries. Snapshots refreshed via `pnpm --filter @stave/app test -- -u` (exactly 2 snapshots updated, all 413 tests green). Editor 1627/1627 unchanged.

- **Wave B-A** (`f86ad34`) — 2 permanent CI fixtures vendored: `bakery-143-apostrophe-in-chain-arg-comment.strudel` (canonical positive — minimal R-5 distillation; `.layer(arrow1, arrow2)` with `// ma'am` line comment inside arrow2's body) + `bakery-143-NEGATIVE-no-apostrophe-comment.strudel` (negative-control — `// maam` no apostrophe; STRUCTURED both pre + post; over-consumption canary). BAKERY-FIXTURES.md updated with new section "bakery-143 — chain-arg walker `//`-comment apostrophe tolerance (#163; supersedes premature close of #143)" — provenance: P70 occurrence-9, 2 surgery sites (pS:2598 + pS:2664), reference pattern at `splitTopLevelStatements:414-417`, RESEARCH §R-1 9-wave bisect summary, meltingsubmarine bonus-improvement note, parity-refresh structural guard cite. App tests 417/417 GREEN (parity-corpus 51 + loc-fidelity 51 + other 315; +2 each via auto-discovery); editor 1627/1627 unchanged; `parity-refresh.mjs --dry-run` reports 0 missing for the 2 new fixtures.

- **Wave B-B** (`bcc05f5`) — 4 backlog dispositions applied via `gh issue comment` + `gh issue close`. #153 CLOSED-as-superseded (LAST-WINS Ground Truth §7.2 cite + 20-20 substrate). #156 CLOSED-as-superseded (sole 20-17 residual = `-7LU6zgzViSM` = THIS phase's gate-bearing exemplar — bonus-class coincidence; the issue that triaged the 20-17 measurement gets closed by the same fix that 20-21 RESEARCH bisect surfaced independently). #149 CLOSED-as-superseded (both targets STRUCTURED via intervening 20-18/20-19/20-20 substrate). #147 REFINED-with-product-note (feature placeholder; stays open as feature-deferred — no parser change pending). Additionally annotated #143 as superseded by #163. SCOPE stayed strict to gate-bearing class; backlog audit was CLASSIFY-only.

- **V-1** (`35c6ecf`) — Fresh PK17 step-6 measurement: `pnpm parity:bakery --n 50`; new ISO stamp `2026-05-21T18-47-02-200Z`; UPSTREAM_SHA `f73b3956` unchanged; structured = **50/50 = 100.0%**; 0× residual; `-7LU6zgzViSM` verdict `structured` at full-pipeline (the gate-bearing flip confirmed). Per-row diff: `-7LU6zgzViSM` FLIPPED code → structured (the +1 from the fix; SOLE flip — all other 49 rows stayed structured). Dual gate: crit-1 + crit-2 + no-bar-lowering ALL clean on the SAME head SHA.

- **V-3** (`359690a`) — Cross-wave per-file loc-fidelity STOP gate CLEAN. Full `pnpm --filter @stave/app test` 417/417 GREEN on merge-candidate head. Per-fixture body-level diff classifier (script at `/tmp/per-fixture-diff{,-loc}.mjs`) run against `main`: ADDED = {bakery-143-apostrophe-in-chain-arg-comment, bakery-143-NEGATIVE-no-apostrophe-comment} (Wave B-A); CHANGED = {meltingsubmarine} (Wave A tail); REMOVED = []. Identical on both `parity.test.ts.snap` and `loc-fidelity.test.ts.snap`. Changed-set = {3 fixtures + 6 snapshot entries} = EXACTLY the extended V-3 allow-list (no over- and no under-coverage). All 47 other pre-existing parity-corpus fixtures byte-unchanged on both snapshots across all wave commits.

## What's genuinely new in 20-21

- **The PV49 substrate now lives across SEVEN call sites + the segmenter.** Pre-20-21 the line-comment-skip pattern lived at `splitTopLevelStatements:414-417` (the segmenter); the inter-token-tolerance pattern via `skipWhitespaceAndLineComments` lived at 5 callers (post-20-20 — pS:463, 1560, 1714, 2521-2531, 2676). 20-21 adds the SAME line-comment-skip pattern (inline, not via the primitive) to two more sites — `findMatchingParen` (pS:2598-2628) and `splitArgsWithOffsets` (pS:2664-2747). The substrate's pattern is now load-bearing at:

| Site | Mechanism | Boundary class |
|---|---|---|
| `splitTopLevelStatements:414-417` (segmenter) | inline `if (ch === '/' && body[i+1] === '/') { while ... } continue` | top-level statement boundaries |
| `splitRootAndChain:2521-2531` | `skipWhitespaceAndLineComments` primitive | identifier-to-paren call-site boundary (20-20) |
| `applyChain:1714` | `skipWhitespaceAndLineComments` primitive | inter-method chain consume |
| `extractTracks:1560` | `skipWhitespaceAndLineComments` primitive | post-`$:` label scan |
| `splitTopLevelStatements:463` | `skipWhitespaceAndLineComments` primitive | leading-dot chain-continuation peek |
| `splitArgsWithOffsets:2676` | `skipWhitespaceAndLineComments` primitive | between-args (PV49 occurrence 3) |
| **`findMatchingParen:2598-2628` (NEW)** | inline `if (ch === '/' && str[i+1] === '/') { while ... } continue` | **chain-arg walker — root-boundary path** |
| **`splitArgsWithOffsets:2664-2747` (NEW)** | inline `//`-skip with `current += ...` to preserve OFFSET CONTRACT | **chain-arg walker — arg-comma path** |

The "growing surface area of PV49 callers" pattern continues; 20-21 grows it by 2 sites. The 8-site coverage in `parseStrudel.ts` is consistent with the dharana hypothesis that line-comment tolerance is a substrate-wide concern, not a one-off recogniser detail.

- **P70 occurrence-9 — cascade-misclassification of #143 by the 20-16 ship.** The 20-16 cascade closed #143 framing the residual `-7LU6zgzViSM` as a guarded-boot recognition gap and shipped `GUARDED_BOOT_RE` (parseStrudel.ts:228-229). That ship is CORRECT for the prelude-recognition surface — it closes the `typeof X !== 'undefined' && X(...)` idiom class — but does NOT close `-7LU6zgzViSM` because the actual blocker is 3 calls down the parser pipeline, inside the chain-arg walkers. The 20-21 RESEARCH bisect (9 progressive strip waves on the verbatim exemplar) surfaced the truth. Lesson: when an exemplar STILL bareCodes after a recognition extension ships, RUN the bisect on the exemplar BEFORE accepting the close — don't trust shape-matching alone. The bisect-then-pre/post-snippet observation pattern is the structural insurance against cascade-misclassification recurring.

- **The bonus-improvement allow-list extension precedent (20-19) replicates exactly.** Phase 20-19's `-1j62z5xjyCN` was bonus-closed via the same flow: gate-bearing fix surfaced a same-mechanism-class incidental improvement on a pre-existing fixture; recorded in V-4 SUMMARY as bonus-improvement; SCOPE stayed strict to gate-bearing class. The 20-21 meltingsubmarine extension applies the identical precedent. This is the SECOND occurrence of the cascade-discipline pattern delivering the right answer on a re-pose (the substrate works; the re-pose is the substrate's checksum).

- **20-21 is a "1 PK18 re-pose resolved within-plan on EVIDENCE" phase — qualitatively the SAME health signal as the 20-19/20-20 0-occurrence phases.** The substrate (PK18 cascade discipline) CAUGHT the surface, the executor STOPPED + re-posed, the user resolved on EVIDENCE within-plan (no bar-lowering, no scope-expansion). The previous "n PK18 re-poses" rows in PK17 cadence treated the re-pose count as a HEALTH metric where 0 is the target; the 20-21 evidence refines this — what matters is that re-poses surface real EVIDENCE and get resolved within-plan via EVIDENCE-grounded decisions, not that the count stays at 0 categorically. A 0-count phase + a 1-count-resolved-on-evidence phase are the SAME health signal; only an n-count-resolved-by-bar-lowering phase is the failure mode.

## Ground Truth doc disposition

NO new section added this phase. The fix is in OUR parser (`parseStrudel.ts`), not upstream — D-02 INTERNAL class per RESEARCH §R-3. The 20-20 `GROUND_TRUTH_SIGNAL_MJS.md` §"Parser/Evaluator Pipeline" §7.2 LAST-WINS citation was used in the #153 backlog closure comment as inheritance signal. The Ground Truth inventory in dharana §5 stays stable at 1 system (Strudel signal.mjs + parser/evaluator pipeline).

## V-3 allow-list (observationally confirmed via per-fixture body-level diff classifier)

```
Wave B-A fixtures (allow-list entries):
  packages/app/tests/parity-corpus/bakery-143-apostrophe-in-chain-arg-comment.strudel
  packages/app/tests/parity-corpus/bakery-143-NEGATIVE-no-apostrophe-comment.strudel

Wave A tail fixture (allow-list extension on EVIDENCE — Option A):
  packages/app/tests/parity-corpus/meltingsubmarine.strudel

Auto-captured + refreshed snapshot entries:
  packages/app/tests/parity-corpus/__snapshots__/parity.test.ts.snap          (2 ADDED + 1 CHANGED)
  packages/app/tests/parity-corpus/__snapshots__/loc-fidelity.test.ts.snap   (2 ADDED + 1 CHANGED)
```

Parity-CHANGED set = {3 fixtures + 6 snapshot entries} = extended V-3 allow-list. Zero other moved files. The byte-additivity invariant holds across all 47 unchanged pre-existing fixtures.

## Deferred backlog (post-phase inheritance graph)

- **#147 samples-capture side-channel** — REFINED-with-product-note; stays open as feature-deferred. The 20-16 D-03 strip-only ship intentionally deferred the capture half pending a future autocomplete/alias consumer to define the capture shape; no parser change pending.
- **#158** — already closed via 20-19's `stripSideEffectStatements` ship.
- All other backlog (#149, #153, #156) closed-as-superseded in Wave B-B.

## Cognitive Discoveries

- **P70 occurrence-9 (cascade-misclassification of #143):** the bisect-then-pre/post-snippet observation pattern (RUN, then DIFF SNIPPET, then ACT) is the structural insurance against cascade-misclassification recurring. Reading the issue body alone is INFERENCE; running the bisect on the verbatim exemplar source is OBSERVATION. When inference and observation disagree, observation wins. The 20-16 ship closed #143 on inference (the URL-comment-prelude shape pattern-matched); the 20-21 bisect proved on observation that the actual blocker was 3 calls down. Lesson generalises: "exemplar STILL bareCodes after a recognition extension ships" is itself a re-pose signal — re-RUN the bisect, don't re-close on shape-match.
- **The PK18 cascade discipline catches incidental enrichments correctly.** The substrate's job is to SURFACE every fixture move (even welcome ones) for explicit user disposition. The meltingsubmarine move was a WELCOME enrichment (STRUCTURED→STRUCTURED with richer chain capture); the substrate still SURFACED it, forced a re-pose, and resolved via EVIDENCE-grounded decision. This is the right behavior — silently extending the allow-list "because the fix is good" would be the failure mode (bar-lowering). The discipline holds.
- **The "n PK18 re-poses" cadence metric refines.** The 20-19 + 20-20 0-occurrence phases were strong signals of substrate-working. The 20-21 1-occurrence-resolved-within-plan-on-EVIDENCE phase is the SAME signal — the substrate did exactly what it was designed to do (catch, stop, resolve via evidence). What matters is the resolution PATTERN (evidence-grounded, within-plan, no scope-expansion), not the raw count. Future phases that surface n PK18 re-poses and resolve each on EVIDENCE without bar-lowering should be classified the same as 0-occurrence phases.

## Operational discipline recap

- **COMMIT_TEMPLATE** — every multi-line commit body via `git commit -F -` heredoc with single-quoted EOF (the `feedback_commit_msg_heredoc.md` zsh-substitution trap discipline; 0 occurrences of the trap this phase).
- **P68 build hygiene** — `tsup --watch` running throughout the phase; rebuilt dist committed alongside source at Wave A tail; 4 distinct minification-stable literal-token greps on `dist/index.js` — gate anchors `findMatchingParen` + `splitArgsWithOffsets` symbols INTACT (= pre-fix count = 9 + 4); defensive anchors `splitTopLevelStatements` + `skipWhitespaceAndLineComments` UNCHANGED (= 3 + 7, byte-stable).
- **Editor watch mode** — `pnpm --filter @stave/editor dev` (`tsup --watch`) running per `feedback_editor_watch_mode.md` to ensure workspace package `dist/` mirrors source edits.
- **Per-file loc-fidelity STOP gate** — per-wave (Wave A surfaced the meltingsubmarine PK18 STOP; Wave A tail resolved it on EVIDENCE; Wave B-A added 2 new fixtures via auto-discovery) + cross-wave (V-3 confirmed exactly the extended allow-list moved); enforced by per-fixture body-level diff classifier.
- **AnviDev** — issue (#163) → branch → fix → test → observe → PR → self-review → merge. Claude NEVER merges. No Co-Authored-By trailer. `.anvi/` + `.planning/` gitignored → `git add -f`.
- **`closes #163` only** — GitHub honours ONE auto-close keyword; #143 stays closed (annotated as superseded by #163); other backlog issues closed manually via `gh issue close`.

## Post-merge artifact verification recipe (for the user — Claude never merges)

```bash
git fetch origin
git merge-base --is-ancestor <PR-HEAD-SHA> origin/main && echo "ancestor: OK"
pnpm install
pnpm --filter @stave/editor build
grep -c "findMatchingParen"               packages/editor/dist/index.js   # ≥ 9 (symbol intact)
grep -c "splitArgsWithOffsets"            packages/editor/dist/index.js   # ≥ 4 (symbol intact)
grep -c "splitTopLevelStatements"         packages/editor/dist/index.js   # ≥ 3 (defensive UNCHANGED)
grep -c "skipWhitespaceAndLineComments"   packages/editor/dist/index.js   # ≥ 7 (defensive UNCHANGED)
pnpm --filter @stave/editor test                                            # 1627/1627
pnpm --filter @stave/app test                                               # 417/417
pnpm parity:bakery --n 50                                                   # ≥ 49/50 (≥ 98.0% floor; 100.0% on this head)
# Bonus probe (RUN, don't infer): verify -7LU6zgzViSM still STRUCTURED on real main
# grep -A2 -- '-7LU6zgzViSM' packages/app/tests/parity-corpus/.bakery-runs/result-*.json | grep -m1 verdict   # should be 'structured'
```

If any grep returns 0, any test count regresses, parity:bakery comes in below 98.0% on real main, or `-7LU6zgzViSM` reverts to bareCode — that is a P70-class hetvabhasa entry (the merge race / squash mangled commits). File a hotfix issue immediately; do NOT bar-lower; do NOT silent-rollback.
