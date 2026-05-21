---
phase: 20-20
title: splitRootAndChain PV49-extension on identifier-to-paren whitespace (closes #159)
status: SHIPPED (PR open, awaiting user merge — Claude never merges)
verdict: D-04 DUAL GATE PASS — crit-1 (Wave-B canonical-positive parity snapshot body.tag='Seq' STRUCTURED + negative-control STRUCTURED) + crit-2 (fresh 49/50 = 98.0%; +2pp from 96.0% baseline; 0 BONUS exemplars; SCOPE strict to #159 held)
branch: feat/20-20-tokenizer-whitespace
wave0_commit: 8df9454
waveA_commit: 292a27f
waveB_commit: a70130b
v1_commit: 23bf78a
v3_commit: a014ba1
v4_commit: (this commit)
baseline_pre_phase: editor 1627/1627, app 409/409 (parity-corpus 47 + loc-fidelity 47), main HEAD a150889 (ancestry — 20-19 PR #161 merged 2026-05-20T23:06Z)
baseline_post_phase: editor 1627/1627, app 413/413 (parity-corpus 49 + loc-fidelity 49)
bakery: 98.0% (49/50) fresh stamp 2026-05-21T12-51-24-407Z, UPSTREAM_SHA f73b3956 (unchanged)
must_not_regress_floor: 96.0% (HELD with +2pp headroom — meets the ≥98.0% target exactly)
closes: ["#159"]
bonus_closes_observed: []
backlog: ["#143 guarded-boot (pre-existing baseline residual — still in fresh fallbacks; not a 20-20 regression)", "#153 multi-top-level (DEFERRED with RESEARCH §4 LAST-WINS upstream verdict recorded for any future #153 phase to inherit)", "#156 R-1 NOT-folded Hydra mashup (already structured on baseline — untouched)", "#158-other-residuals (Wave-0 Outcome 1 explicitly leaves untouched)", "#149 .cpm(binding) chain-arg (untouched)", "#147 samples-capture side-channel (untouched)"]
catalogue_updates:
  - .anvi/krama.md: PK16 addendum (PV49-extension at stage 2 — splitRootAndChain identifier-then-paren branch; PK16 stage numbering unchanged; the new caller extends the PV49 substrate at a different boundary class — identifier-to-paren vs the prior 4 inter-token-within-chain/args callers) + PK17 addendum (20-20 measured 98.0%, +2pp from 96.0%, 0 PK18 re-poses) + PK18 addendum (SECOND consecutive clean-run phase after 20-19; substrate-works hypothesis strengthens)
  - .anvi/hetvabhasa.md: P70 cadence row (20-20 ran clean; Wave-0 5-cell probe stdout matched RESEARCH §2.2 verbatim; Wave-A strict-widen + false-positive + exemplar round-trip all behaved as predicted; no occurrence 9 surfaced — P70 stays at 8)
  - .anvi/vyapti.md: PV49 occurrence-NEW (20-20 identifier-to-paren boundary at splitRootAndChain — a NEW boundary class for the substrate, with ORIGIN/WHY/HOW provenance per RESEARCH §6.1) + PV54 explicit NOT-triggered note (no new top-level PatternIR tag this phase; consumer-audit obligation dormant)
ground_truth: ~/.anvideck/projects/struCode/ref/GROUND_TRUTH_SIGNAL_MJS.md EXTENDED with a new "Parser/Evaluator Pipeline" section per RESEARCH §12 (7 file:line citations across @strudel/core repl.mjs + evaluate.mjs + @strudel/transpiler transpiler.mjs at pin f73b3956)
fixtures_added:
  - bakery-159-tokenizer-whitespace.strudel (canonical positive — minimal distillation of -G2drHRNFueu with the whitespace fence + 2 sound() siblings; asserts whole-program STRUCTURED via PV49-extended splitRootAndChain; body.tag='Seq')
  - bakery-159-NEGATIVE-no-whitespace.strudel (negative control — same shape minus whitespace; STRUCTURED both pre and post fix via the inherited sound("…") recogniser arm; proves the whitespace-tolerance is the gate, not the bindings substrate)
---

# Phase 20-20 SUMMARY — `splitRootAndChain` PV49-extension on identifier-to-paren whitespace

## Verdict — D-04 DUAL GATE PASS

The LOCKED D-04 dual gate (CONTEXT §"D-04") PASSED at V-1 (`23bf78a`):

| Gate | Result |
|------|--------|
| **Crit-1 HARD** — Wave-B `bakery-159-tokenizer-whitespace.strudel` parity snapshot asserts whole-program STRUCTURED (`body.tag !== 'Code'`) | **PASS** — body.tag="Seq" (the `"hh hh hh hh"` multi-token mini-pattern expanded into Play children); negative-control fixture also STRUCTURED. Inner shape Seq (not Play as RESEARCH §5.2 predicted) — the multi-token body routes through the inherited `miniMatch`/`looseMatch` regex arms rather than the single-token `sMatch` arm. Both arms produce structured IR; both PASS the parity oracle fence. The auto-discovered parity oracle locks both fixtures' snapshots. |
| **Crit-2 HARD** — fresh `pnpm parity:bakery --n 50` ≥ 49/50 (98.0%) AND ≥ 48/50 (96.0% must-not-regress floor) | **PASS** — fresh stamp `2026-05-21T12-51-24-407Z`, UPSTREAM_SHA `f73b3956` unchanged: **49 structured / 50 = 98.0%** (was 48/50 = 96.0% baseline; +2pp). Meets the ≥98.0% target exactly; beats the 96.0% floor with +2pp headroom. |
| **Bar-lowering check** — no bar-lowered premise; no second-workaround; no scope-expansion mid-phase | **CLEAN** — SCOPE held strict to #159 throughout; #153 deferred backlog with LAST-WINS evidence; 0 BONUS exemplars flipped (no 20-19 `-1j62z5xjyCN`-style surprise); 0 PK18 re-poses. |

**Per-row diff vs 96.0% baseline:**

```
FLIPPED code->structured: [ '-G2drHRNFueu' ]   ← the +1 from the fix
REGRESSED structured->code: []                  ← zero regressions
baseline -G2drHRNFueu: code -> fresh: structured
baseline -7LU6zgzViSM: code -> fresh: code      ← unchanged (out-of-scope per D-04)
```

**No PK18 re-pose this phase — SECOND consecutive CLEAN-RUN phase in the 20-1x cadence after 20-19.** The substrate-works hypothesis (RESEARCH + locked D-01..D-04 + PK18 cascade discipline + P70 spine) strengthens: 20-19 was the first 0-occurrence phase; 20-20 replicates it.

## Per-wave deltas

- **Wave 0** (`8df9454`) — branch (`feat/20-20-tokenizer-whitespace` from `a150889`); ancestry confirmed (`git merge-base HEAD a150889` = `a150889`); editor 1627/1627 + app 409/409 baselines RE-OBSERVED; live anchor re-grep (every `pS:` anchor stable — no drift since the planning-doc-only commits `fb53e68` + `afc918e`); the §2.2 5-cell factoring probe RE-RAN on the fresh branch with stdout matching RESEARCH §2.2 byte-for-byte (A/C STRUCTURED inner.bare=false; B/D/E bareCode inner.tag=Code inner.bare=true); D-01 Outcome 1 RE-CONFIRMED → scope LOCKED to #159 only; #153 stays backlog with RESEARCH §4 LAST-WINS verdict recorded (`@strudel/transpiler@1.2.6 transpiler.mjs:198-204` + `@strudel/core@1.2.6 evaluate.mjs:37-38` + `repl.mjs:237`); V-3 allow-list pre-allocated = {2 Wave-B fixtures + their snapshot entries}; pre-fix P68 dist anchor baselines captured (`splitRootAndChain`=4, `skipWhitespaceAndLineComments`=6, `findMatchingParen`=9, `afterIdent`=0).

- **Wave A** (`292a27f`) — `splitRootAndChain` PV49-extension landed at `parseStrudel.ts:2521-2531` (the `} else {` identifier-then-paren branch). The additive surgical edit: `const afterIdent = i` + `i = skipWhitespaceAndLineComments(expr, i)` between identifier-scan and `(` check + new `} else { i = afterIdent }` restore arm when no `(` follows the whitespace. 14-line provenance comment block citing `@strudel/transpiler@1.2.6 transpiler.mjs:25-30` (acorn.parse ecmaVersion 2022) + `@strudel/core@1.2.6 evaluate.mjs:29-39` (Function(body)()) at Codeberg pin `f73b3956`. P68 build hygiene: 4 minification-stable literal-token greps on shipped `dist/index.js` — `skipWhitespaceAndLineComments` INCREASED 6 → **7** (the 5th caller in the shipped bundle; the gate-bearing anchor); `splitRootAndChain` 4 (unchanged, > 0); `findMatchingParen` 9 (unchanged, defensive); `afterIdent` 0 → 2 (the local survived minification; informational). Wave-A throwaway probe GREEN: (i) strict-widen 4/4 flipped (i.1 `sound ("hh")` → inner.tag=Play / i.2 multi → Seq / i.3 `s ("bd sd")` → Seq / i.4 `note ("c d")` → Seq); (ii) false-positive guards 4/4 preserved disposition (ii.1 `let allBindings = "x"; sound("y")` unchanged Play / ii.2 `let x = sine` bare-ident Code/true via the `i = afterIdent` restore arm / ii.3 `sine .range(0,1)` chain dotting unchanged / ii.4 `let x = sine // comment\n.range(0,1)` unchanged); (iii) **exemplar -G2drHRNFueu verbatim → inner.tag=Seq inner.bare=false** (the gate-bearing observation: post-fix STRUCTURED in production); ctrl `sound("hh")` unchanged (no regression on no-whitespace case). Editor 1627/1627 + app 409/409 GREEN; per-file loc-fidelity STOP gate clean (no fixtures vendored this wave).

- **Wave B** (`a70130b`) — 2 permanent CI fixtures vendored: `bakery-159-tokenizer-whitespace.strudel` (canonical positive — minimal distillation of -G2drHRNFueu: 2 `sound (…)` siblings; trailing blank lines + `// @version 1.0` dropped per V-2 minimal-distillation discipline; keeps both siblings to lock today's FIRST-WINS multi-line disposition for cross-issue inheritance signalling) + `bakery-159-NEGATIVE-no-whitespace.strudel` (negative control — same shape minus whitespace; STRUCTURED both pre and post fix). BAKERY-FIXTURES.md updated with a Phase 20-20 section: upstream-grounded provenance note + cross-issue inheritance note for #153 LAST-WINS. parity-refresh.mjs structural exclusion verified via `--dry-run` (0 missing for new slugs). 4 snapshots auto-captured (2 fixtures × {parity, loc-fidelity}); app 409 → 413; parity-corpus 47 → 49; loc-fidelity 47 → 49. The canonical positive's parity snapshot confirms `body.tag: "Seq"` with Play children (`hh hh hh hh` mini expanded). Snapshot diff: 154 insertions / **0 removals** across both snapshot files (pure-addition; zero pre-existing fixture moved).

- **V-1** (`23bf78a`) — Fresh PK17 step-6 measurement: `pnpm parity:bakery --n 50`; new ISO stamp `2026-05-21T12-51-24-407Z`; UPSTREAM_SHA `f73b3956` unchanged; structured = **49/50 = 98.0%**; 1× residual `BACKLOG #143` (`-7LU6zgzViSM`). Per-row diff: `-G2drHRNFueu` FLIPPED code → structured (the +1 from the fix; SOLE flip — 0 BONUS exemplars); 0 regressions across the 48 baseline-structured rows; `-7LU6zgzViSM` (#143) unchanged. One-arg oracle invariant verified at `_bakery-classify.spec.ts:77` (`parseStrudel(s.code)` — exactly one arg). Dual gate: crit-1 (Wave-B fixture body.tag='Seq' STRUCTURED + negative-control STRUCTURED) + crit-2 (98.0% ≥ floor) + no-bar-lowering ALL clean on the SAME head SHA.

- **V-3** (`a014ba1`) — Cross-wave per-file loc-fidelity STOP gate CLEAN. Full `pnpm --filter @stave/app test` 413/413 GREEN on merge-candidate head. Phase-wide parity-corpus + snapshot diff: exactly the 2 new Wave-B fixtures + their entries in `parity.test.ts.snap` + `loc-fidelity.test.ts.snap`. Parity-CHANGED set ⊆ V-3 allow-list pre-allocated in Wave 0. Snapshot diff: 154 insertions / 0 removals; zero silent drift; PV49 byte-additive substrate observationally CONFIRMED.

## What's genuinely new in 20-20

- **The PV49-extension at a new boundary class.** The 4 prior `skipWhitespaceAndLineComments` callers (pS:463, 1560, 1714, 2676) all operated at INTER-TOKEN-WITHIN-CHAIN-OR-ARGS boundaries. The new 5th caller at `splitRootAndChain` operates at the CALL-SITE BOUNDARY ITSELF — the canonical idiomatic shape `ident WS (`. This is a structural extension of PV49's domain, captured in the V-4 PV49 occurrence-NEW with ORIGIN/WHY/HOW provenance.
- **The `i = afterIdent` restore arm** — the §5.6 Chesterton scan's structural mitigation. When no `(` follows the whitespace, `i` rolls back to the identifier boundary, preserving today's disposition for bare-identifier roots (`let x = sine`, `if (x) { … }`-style malformed roots, etc.). Wave-A action 6 (ii) confirmed all 4 false-positive cases preserved disposition.
- **The Ground Truth doc extension** — `GROUND_TRUTH_SIGNAL_MJS.md` now has a "Parser/Evaluator Pipeline" section covering acorn.parse + AST walk + addReturn + safeEval + repl.mjs's evaluate flow. This is the substrate for any future phase that touches the same surface — most notably #153 (LAST-WINS sibling top-level expressions, GROUNDED in RESEARCH §4).
- **20-20 is the SECOND consecutive clean-run phase** (0 PK18 re-poses; the substrate-works hypothesis strengthens). 20-19 was the first; 20-20 replicates with a TIGHTER plan (single-arm surgery; 2 fixtures vs 11; ~10 LOC additive vs the 20-19 helper + curated regex).

## Ground Truth doc disposition

EXTENDED `~/.anvideck/projects/struCode/ref/GROUND_TRUTH_SIGNAL_MJS.md` with a new "Parser/Evaluator Pipeline" section per RESEARCH §12. Citations:

- `@strudel/core@1.2.6 repl.mjs:222-282` — the `evaluate` flow (transpiler → safeEval → eachTransform → setPattern)
- `@strudel/core@1.2.6 evaluate.mjs:29-39` — `safeEval` wraps as `Function(body)()`
- `@strudel/core@1.2.6 evaluate.mjs:41-53` — top-level `evaluate` wires transpiler + safeEval
- `@strudel/transpiler@1.2.6 transpiler.mjs:25-30` — `acorn.parse(input, {ecmaVersion: 2022, …})`
- `@strudel/transpiler@1.2.6 transpiler.mjs:21-213` — AST walk (no whitespace normalisation; selective node rewrites)
- `@strudel/transpiler@1.2.6 transpiler.mjs:198-204` — `addReturn` rewrites ONLY `body[body.length-1]` (the LAST-WINS mechanism — D-03 inheritance for #153)
- `@strudel/transpiler@1.2.6 transpiler.mjs:464-491` — `labelToP` (LabeledStatement `$: …` / `name: …` → `.p(name)`; only fires on labels, NOT on bare expressions)

The new section adds REFs from the PV49 occurrence-NEW (the addendum in `.anvi/vyapti.md`) and from the deferred-#153-backlog row in OBSERVATIONS for a future maintainer who picks up #153 to inherit the grounding without re-doing P69's Grounding Check discharge.

## V-3 allow-list (observationally confirmed)

```
Wave-B fixtures (allow-list entries):
  packages/app/tests/parity-corpus/bakery-159-tokenizer-whitespace.strudel
  packages/app/tests/parity-corpus/bakery-159-NEGATIVE-no-whitespace.strudel

Auto-captured snapshot entries:
  packages/app/tests/parity-corpus/__snapshots__/parity.test.ts.snap          (+104 lines)
  packages/app/tests/parity-corpus/__snapshots__/loc-fidelity.test.ts.snap   (+50 lines)
```

Parity-CHANGED set = {2 fixtures} ⊆ allow-list. Zero other moved files. Snapshot diff is **pure-addition (154/0)**.

## Deferred backlog (inheritance graph for future phases)

- **#143 guarded-boot** (`-7LU6zgzViSM`) — pre-existing baseline residual; the `typeof X !== 'undefined' && X(…)` shape is a separate class. Stays the SOLE fallback in the fresh 98.0% measurement. Out of 20-20 scope per D-04; separate phase if pursued.
- **#153 multi-top-level** (`sound("a")\nsound("b")` and siblings) — DEFERRED per D-01 Outcome 1. RESEARCH §4 GROUNDED the upstream LAST-WINS verdict at:
  - `@strudel/transpiler@1.2.6 transpiler.mjs:198-204` — `addReturn` rewrites ONLY `body[body.length-1]` (non-last bodies remain ExpressionStatement whose value is discarded by JS)
  - `@strudel/core@1.2.6 evaluate.mjs:37-38` — `Function(body)()` returns the last ReturnStatement's value
  - `@strudel/core@1.2.6 repl.mjs:237, 238, 258, 259-260, 272` — `pattern` flows to `setPattern` as the last value; `pPatterns` is empty for bare expressions; the `stack`-wrap branch is NOT entered
  - `@strudel/transpiler@1.2.6 transpiler.mjs:464-491` — `labelToP` only fires on LabeledStatement (`$: …` / `name: …`), not bare expressions
  Our parser today is FIRST-WINS (case C `sound("a")\nsound("b")` emits `body.tag=Play` of the FIRST `sound`). The semantic mismatch is NOT a parity blocker (case C STRUCTURES — fence is `body.tag !== 'Code'`); a future #153 phase that adopts LAST-WINS will inherit the §4 grounding without re-doing P69 Grounding Check. The canonical-positive Wave-B fixture's snapshot will need updating in that phase — that's the cross-issue interaction signal.
- **#156** (R-1 NOT-folded Hydra mashup) — already structured on baseline; untouched.
- **#158-other-residuals** — Outcome 1 explicitly leaves untouched.
- **#149** (.cpm(binding) chain-arg) — untouched.
- **#147** (samples-capture side-channel) — untouched.

## Cognitive Discoveries

- **PV49 has a new boundary class:** identifier-to-paren. The substrate now serves 5 callers across 5 distinct boundary classes within the parser: split-top-level-statements (pS:463), extractTracks-label-scan (pS:1560), applyChain-inter-method (pS:1714), splitArgsWithOffsets (pS:2676), and the NEW splitRootAndChain identifier-to-paren (pS:2521-2531). The growing surface area of PV49 callers is itself a substrate-strength indicator — each phase that adds a 5th, 6th, Nth caller is implicit evidence that the abstraction is correctly factored.
- **Acorn's whitespace tolerance is the upstream-grounded mechanism class.** The fix doesn't ADD a new mechanism; it MIRRORS upstream's pure-JS-eval pass-through. Future parser-narrowness gaps where upstream evaluates valid JS without complaint will follow this same pattern: read the upstream source (acorn.parse + native Function eval), find where our parser is stricter, extend the relevant walker arm via PV49. This is the deductive direction: the upstream IS the grammar; our parser SHOULD match.
- **The 20-19 + 20-20 cadence (2 consecutive clean-run phases)** suggests the post-20-17 cognitive substrate (LOCKED D-01..D-04 + RESEARCH pre-discharge + PK18 cascade + P70 spine + per-file loc-fidelity STOP) genuinely closes the cascade hazard. The pattern should continue holding into 20-21+ if the framework is sound.

## Operational discipline recap

- **COMMIT_TEMPLATE** — every multi-line commit body via `git -c commit.gpgsign=false commit -q -F - <<'MSG' … MSG` single-quoted heredoc (the `feedback_commit_msg_heredoc.md` zsh-substitution trap discipline; 0 occurrences of the trap this phase).
- **P68 build hygiene** — one-shot `pnpm --filter @stave/editor build` before the Wave-A commit; 4 distinct minification-stable literal-token greps on `dist/index.js`; the gate anchor `skipWhitespaceAndLineComments` INCREASED-by-1 (6 → 7), confirming the new caller is in the shipped bundle (not just in source).
- **Per-file loc-fidelity STOP gate** — per-wave (Wave A, Wave B) + cross-wave (V-3); enforced by direct observation of the snapshot diff (pure-addition, 154/0).
- **AnviDev** — issue → branch → fix → test → observe → PR → self-review → merge. Claude NEVER merges. No Co-Authored-By trailer. `.anvi/` + `.planning/` gitignored → `git add -f`.
- **`closes #159` only** — GitHub honours ONE auto-close keyword; #153 stays backlog with the LAST-WINS evidence (RESEARCH §4 grounded) recorded for inheritance.

## Post-merge artifact verification recipe (for the user — Claude never merges)

```bash
git fetch origin
git merge-base --is-ancestor <PR-HEAD-SHA> origin/main && echo "ancestor: OK"
pnpm install
pnpm --filter @stave/editor build
grep -c "splitRootAndChain"          packages/editor/dist/index.js          # > 0
grep -c "skipWhitespaceAndLineComments" packages/editor/dist/index.js          # ≥ 7 (the new 5th caller — must be INCREASED-by-1 vs pre-merge baseline)
grep -c "findMatchingParen"          packages/editor/dist/index.js          # unchanged
pnpm --filter @stave/editor test                                             # 1627/1627
pnpm --filter @stave/app test                                                # 413/413
pnpm parity:bakery --n 50                                                    # ≥ 49/50 (≥ 98.0%), pin SHA f73b395648645aabe699f91ba0989f35a6fd8a3c
```

If any grep returns 0, any test count regresses, or parity:bakery comes in below 96.0% on real main — that is a P70-class hetvabhasa entry (the merge race / squash mangled commits). File a hotfix issue immediately; do NOT bar-lower; do NOT silent-rollback.
