---
phase: 20-21
artifact: OBSERVATIONS — the verbatim per-wave record
---

# Phase 20-21 — OBSERVATIONS

## Wave 0 — RE-CONFIRM §R-1 bisect + RUN-classify backlog

### Branch + ancestry

```
git rev-parse HEAD (on main)       → 2352e69ff59a4ce263cf3035c0159af6f1c8c38c
git merge-base HEAD fa09cfe        → fa09cfe9e369eb7aa6c32a825e945e699b9bc7ae
git checkout -b feat/20-21-comment-aware-walkers
git rev-parse --abbrev-ref HEAD    → feat/20-21-comment-aware-walkers
```

Ancestry check PASSES: main HEAD `2352e69` contains `fa09cfe` (the 20-20 merge). The two commits ahead of origin/main are planning-doc-only (CONTEXT, RESEARCH+PLAN+PLAN-CHECK).

### Live anchor table (re-grep against branch HEAD)

| Anchor | Plan-cited line | Live line | Status |
|---|---|---|---|
| `function findMatchingParen` | pS:2598 | 2598 | ✓ match |
| string-quote test in `findMatchingParen` | pS:2611 | 2611 | ✓ match |
| `function splitArgsWithOffsets` | pS:2664 | 2664 | ✓ match |
| `pushCurrent` body / OFFSET CONTRACT | pS:2685-2693 | 2685-2693 | ✓ match |
| `if (inString)` in `splitArgsWithOffsets` | pS:2704-2708 | 2704-2708 | ✓ match |
| string-quote test in `splitArgsWithOffsets` | pS:2710 | 2710 | ✓ match |
| reference `//`-skip in `splitTopLevelStatements` | pS:414-417 | 414-417 | ✓ match |
| `function splitTopLevelStatements` head | n/a | 364 | (informational; the `//`-skip body is at 414-417) |
| `function skipWhitespaceAndLineComments` | pS:1075 | 1075 | ✓ match |

ZERO drift — every line citation in PLAN/RESEARCH holds on the fresh branch.

### Baseline test counts (Lokayata observation)

```
pnpm --filter @stave/editor test  → Test Files  91 passed (91)
                                    Tests  1627 passed (1627)
pnpm --filter @stave/app test     → Test Files  18 passed (18)
                                    Tests  413 passed (413)
                                    (parity-corpus 49 + loc-fidelity 49 + 315 other)
```

Counts MATCH the documented baseline. No prior regression on main.

### Pre-fix P68 dist anchor baselines (after `pnpm --filter @stave/editor build` on Wave-0 HEAD)

```
grep -c "findMatchingParen"               packages/editor/dist/index.js → 9
grep -c "splitArgsWithOffsets"            packages/editor/dist/index.js → 4
grep -c "splitTopLevelStatements"         packages/editor/dist/index.js → 3
grep -c "skipWhitespaceAndLineComments"   packages/editor/dist/index.js → 7
```

Defensive baselines (Wave-A must preserve N3=3 and N4=7; surgery sites N1≥9 and N2≥4).

### `-7LU6zgzViSM` verbatim source (extracted from samples-2026-05-21T12-51-24-407Z.json)

```
typeof setDefaultVoicings !== 'undefined' && setDefaultVoicings('legacy') // https://github.com/tidalcycles/strudel/pull/967
// @title Doubly-Linked Liszt
// @license CC BY-NC-SA

stack(
    stack( // drums
    sound("[hh [hh hh]]!4").gain("[.25 .25 .5]*4"),
   sound("bd*4"),
   sound("[~ cp]*2").gain(0.5),
  ).bank("RolandTR707").room(.2).color("yellow"),
  stack( // chords
    chord("<G#m D# G#m D# G#m D# G#m D# B F# B D#m D# D#m F# C#>/2").dict("ireal").layer(
      // bass
      x=>n("< <~ [0 0 0]>*8 <~ [-2 -2 -2]>*8>").set(x).mode("root:c2")
        .voicing().s("gm_electric_guitar_jazz").gain(2)
        .color("cyan"),
      // Linked Liszt
      x=>n(run(4).rev()).set(x)
        // This is a green piece ma'am, we offset everything here o_0
        // .off("1/32", x=>x.add(2))
        // .off(1/16, x=>x.add(5))
        .off(1/8, x=>x.add(7))
        .off(1/4, x=>x.add(24))
        .mode("root:c4").voicing().s("kawai")
        // .adsr(".05:.1:.1:.2").lpf(sine.range(700,1200).slow(8)).lpq(sine.range(0,30).slow(8))
        // .fast("<0.125 0.25 0.5 0.75 1 1.25 1.5 1.75 2 2.25 2.5 2.75 3 3.25 3.5 3.75 4 3.75 3.5 3.25 3 2.75 2.5 2.25 2 1.75 1.5 1.25 1 0.75 0.5 0.25 0.125>")
        .fast(sine.range(4,0.25).slow(256))
        .gain(0.8)
        .color("magenta")
        .jux(rev),
    )
  )
).cpm(28)

// @version 1.0
```

Apostrophe-comment lines isolated by grep:
- `"typeof setDefaultVoicings !== 'undefined' && setDefaultVoicings('legacy') // https://github.com/tidalcycles/strudel/pull/967"` apostrophes=4 (EVEN, inside string literals — not the trigger)
- `"        // This is a green piece ma'am, we offset everything here o_0"` apostrophes=**1** (ODD — THE TRIGGER, inside `//` comment in second `.layer()` arrow body)

### Wave 0 — §R-1 bisect RE-CONFIRMATION on `feat/20-21-comment-aware-walkers` from `fa09cfe`

Probe spec: `_wave0-classify-20-21.spec.ts` (created, run, deleted; OBSERVATIONS is source of truth). Each variant calls the production `parseStrudel` and stdout-prints `verdict + body.tag + via`.

```
[V0 (full verbatim)]            verdict=CODE       body.tag=Code via=undefined   ← gate-bearing baseline
[V0-arrow2-simple]              verdict=STRUCTURED body.tag=Code via=cpm         ← falsifier (second arrow's ma'am IS the trigger)
[W1 (minimal)]                  verdict=CODE       body.tag=Code via=undefined   ← minimal repro of the class
[W3 (V0 minus apostrophe line)] verdict=STRUCTURED body.tag=Code via=cpm         ← removing apostrophe-comment flips it
[A8 (V0 with EVEN apostrophes)] verdict=STRUCTURED body.tag=Code via=cpm         ← EVEN-count apostrophes don't trigger
```

**OUTCOMES MATCH §R-1 PREDICTION EXACTLY.** D-01 LOCKED → Outcome 1 (clean single-blocker — apostrophe-in-`//`-comment chain-arg walker class). Scope locks to the two-site walker `//`-skip.

### Wave 0 — backlog audit RUN-classify

Probe spec: `_wave0-backlog-audit-20-21.spec.ts` (created, run, deleted; OBSERVATIONS is source of truth).

#### #153 — multi-top-level siblings

```
parseStrudel('sound("hh hh hh hh")\nsound("[bd bd][sd bd] bd sd")\n\n// @version 1.0')
[#153] {"verdict":"STRUCTURED","tag":"Seq","via":"undefined"}
```

STRUCTURED (Seq) on real main. Per RESEARCH §R-4 decision tree → **CLOSE-as-superseded** by the 20-20 substrate work.

#### #156 — re-run 20-17 artifact through current parser

```
[#156] re-run 20-17 artifact through current parser: CODE=1 STRUCTURED=49 total=50
[#156] residual bareCode hashes: [ '-7LU6zgzViSM' ]
```

The single residual bareCode hash IS `-7LU6zgzViSM` — i.e. the uncategorised 20-17 hash IS the gate-bearing exemplar for THIS phase. Per RESEARCH §R-4 decision tree → **CLOSE-as-superseded** (the gate-bearing fix in 20-21 closes the only residual from the 20-17 artifact too; bonus-class coincidence — same class as the gate-bearing fix).

#### #149 — template-literal root + .cpm(binding)

```
[#149] -72eEl7NwK9e {"verdict":"STRUCTURED","tag":"Code","via":"cpm"}
[#149] -1j62z5xjyCN {"verdict":"STRUCTURED","tag":"Code","via":"cpm"}
```

Both hashes present in current sample + STRUCTURED. Per RESEARCH §R-4 decision tree → **CLOSE-as-superseded** by intervening 20-18/20-19/20-20 substrate work.

#### #147 — samples() side-channel feature placeholder

No probe (feature, not parser bug). Per RESEARCH §R-4 default → **REFINE-with-product-note**; do NOT close without user sign-off.

### Wave 0 — locked backlog dispositions

| Issue | Disposition | Rationale |
|---|---|---|
| #153 | CLOSE-as-superseded | STRUCTURED on real main via 20-20 substrate |
| #156 | CLOSE-as-superseded (bonus — same class as gate-bearing) | sole 20-17 residual = `-7LU6zgzViSM` = THIS phase's gate-bearing exemplar |
| #149 | CLOSE-as-superseded | both targets STRUCTURED on real main via intervening substrate |
| #147 | REFINE-with-product-note | feature placeholder; deferred per 20-16 D-03 |

Comment-body text drafted in Wave B-B action below (skipping repetition here).

### Pre-allocated V-3 allow-list

- 2 new Wave-B-A fixtures: `bakery-143-apostrophe-in-chain-arg-comment.strudel` + `bakery-143-NEGATIVE-no-apostrophe-comment.strudel`
- their auto-captured snapshot entries in `parity.test.ts.snap` + `loc-fidelity.test.ts.snap`

Expected V-3 allow-list size = EXACTLY 2 fixtures (+ 2 snapshot entries). ANY other moved file = silent drift = STOP.

### Outcome lock

- D-01: LOCKED → Outcome 1 (clean single-blocker; apostrophe-in-`//`-comment chain-arg walker class).
- D-02: INTERNAL class (no upstream RESEARCH; the fix mirrors `splitTopLevelStatements:414-417` inline).
- D-03: STRETCH (gate-bearing fix + 4 backlog dispositions, all CLOSE-as-superseded except #147 REFINE).
- D-04: dual gate 100% + must-not-regress 98% floor.

PK18 STOP: NONE TRIGGERED.

---

## Wave A — Two-site walker `//`-skip surgical edit (PK18 STOP TRIGGERED at action 8)

### Live anchor RE-GREP (mandatory)

All anchors confirmed unchanged from Wave 0 table (parseStrudel.ts:2598 / 2611 / 2664 / 2685-2693 / 2704-2708 / 2710 / 414-417).

### tsup watch start

`pnpm --filter @stave/editor dev` running in background. Build success on initial pass (only known `@strudel/mondo` TS7016 warning; benign).

### Surgical edits

**Site 1 — `findMatchingParen` (pS:2598-2628):** inserted the `//`-skip branch immediately AFTER the `if (inString)` block and BEFORE the string-quote test. Branch:
```ts
if (ch === '/' && str[i + 1] === '/') {
  while (i < str.length && str[i] !== '\n') i++
  continue
}
```
Mirrors `splitTopLevelStatements:414-417` exactly.

**Site 2 — `splitArgsWithOffsets` (pS:2664-2747):** inserted the `//`-skip branch immediately AFTER the `if (inString)` block at pS:2704-2708 and BEFORE the string-quote test at pS:2710. Branch appends comment chars to `current` (OFFSET CONTRACT preservation).

`git diff --stat` confirms PURELY ADDITIVE — 41 insertions, 0 deletions, only the two new branches.

### Post-fix P68 dist anchor counts

```
grep -c "findMatchingParen"               packages/editor/dist/index.js → 9  (= pre-fix; symbol intact)
grep -c "splitArgsWithOffsets"            packages/editor/dist/index.js → 4  (= pre-fix; symbol intact)
grep -c "splitTopLevelStatements"         packages/editor/dist/index.js → 3  (= pre-fix; UNCHANGED — defensive ✓)
grep -c "skipWhitespaceAndLineComments"   packages/editor/dist/index.js → 7  (= pre-fix; UNCHANGED — defensive ✓)
```

All 4 defensive anchors hold.

### Wave-A probe (i)..(v) verbatim stdout

```
(i)   W1 minimal post-fix:                          {"v":"STRUCTURED","tag":"Code","via":"cpm"}   ← FLIPPED (was CODE pre-fix)
(ii)  W3 -7LU6zgzViSM verbatim post-fix:            {"v":"STRUCTURED","tag":"Code","via":"cpm"}   ← THE GATE-BEARING FLIP
(iii-a) apostrophe in double-quoted string:         {"v":"STRUCTURED","tag":"Seq","via":"undefined"}  ← unchanged (gated by inString first)
(iii-b) top-level // outside chain args:            {"v":"STRUCTURED","tag":"Play","via":"undefined"} ← unchanged
(iii-c) block comment between args:                 {"v":"STRUCTURED","tag":"Stack","via":"undefined"} ← unchanged
(iv)   two-arg stack with // ma'am between args:    {"v":"STRUCTURED","tag":"Stack","via":"undefined"} ← loc-fidelity holds
(v)    NEGATIVE-control (// maam):                  {"v":"STRUCTURED","tag":"Code","via":"cpm"}   ← unchanged
```

ALL POST-FIX PROBES PASS — gate-bearing observation (ii) shows `-7LU6zgzViSM` flips STRUCTURED. Wave-A SUCCEEDS on its own action 7 expectations.

### Test gate observations

```
pnpm --filter @stave/editor test  → 1627/1627 GREEN (unchanged ✓)
pnpm --filter @stave/app test     → 411 passed | 2 FAILED  ← PK18 TRIGGER
```

### PK18 STOP — `meltingsubmarine` fixture moved outside V-3 allow-list

**Observation:** `meltingsubmarine` (pre-existing parity-corpus fixture, NOT in the pre-allocated V-3 allow-list) failed BOTH its parity snapshot AND its loc-fidelity snapshot. This is the SOLE fixture moved — every other pre-existing parity-corpus fixture (48 of 49) remains snapshot-byte-unchanged.

**Verbatim snapshot diff classification (parity.test.ts.snap):**

Pre-fix top-level body:
```
"tag": "Code",
"via": {
  "args": "4,.125,(x,n)=>x.gain(.15*1/(n+1))",
  "inner": { "tag": "Stack", "tracks": [...] }
}
```
(i.e. Code-via{echoWith} — the outer `.echoWith(...)` was the deepest recognised chain method)

Post-fix top-level body:
```
"body": { "tag": "Stack", ... }
```
(wrapped under what loc-fidelity diff shows as the new outer `.slow(3/2)` Slow tag — the trailing `.slow(3/2)` AFTER the outer `stack(...))` was previously unreachable because `findMatchingParen` was failing on the apostrophes inside `'sawtooth'`/`'lefthand'`/`'triangle'` interacting with adjacent `//` comments in chain args)

**Loc-fidelity diff (pre→post):** previously the top entry was `Code: ".echoWith(4,.125,(x,n)=>x.gain(.15*1/(n+1)))"`; post-fix the top entry is `Slow: ".slow(3/2)"` (i.e. the previously-missed outer modifier IS now captured), and many additional inner chain-method entries are now correctly named (`.echoWith`, `.degradeBy`, `.s('triangle')`, `.attack(1)`, `.cutoff(500)`, `.s('sawtooth')`, etc.) — the IR is structurally RICHER + more complete.

**Direct classify probe (one-off spec, stdout):**
```
meltingsubmarine top-level body.tag= Slow via= undefined
full top-level: {"irTag":"Track","bTag":"Slow"}
```
Post-fix the top-level body is `Slow` (STRUCTURED, NOT Code-fallback). The whole-program parity classifier (`isCodeFallback = body.tag === 'Code' && body.via === undefined`) PASSES on the post-fix IR.

**Classification:** this is NOT a `splitArgsWithOffsets` false-positive (offsets preserved per Wave-A action 7 (iv)). This is a **legitimate IR-correctness IMPROVEMENT** — pre-fix the walker was silently mis-depth'ing inside chain args containing single-quoted `'sawtooth'`-style synth names ADJACENT to `//` comments, truncating the recognised chain. Post-fix the entire chain is captured correctly.

The same class of fix that makes `-7LU6zgzViSM` flip ALSO improves `meltingsubmarine`. The IR change is welcome on its merits; the question is purely scope-boundary.

### PK18 trigger — the falsified premise

PLAN's "byte-additive by construction → no pre-existing fixture moves" assumption (V-3 STOP gate rationale, plan line 872) was about per-arg OFFSET CONTRACT preservation. That HOLDS (Wave-A action 7 (iv) confirms). What the plan did NOT anticipate: **other pre-existing fixtures' IRs were ALSO incomplete pre-fix** for the same root cause (apostrophe-in-`//`-comment walker confusion). The fix correctly enriches them.

The plan's V-3 STOP gate language conflicts:
- (a) "Do NOT extend the allow-list defensively" (line 872) — RULE
- (b) "if traceable to a `splitArgsWithOffsets` false-positive, the fix is broken — re-pose D-02 to user" — CLASSIFICATION RULE; THIS CASE is NOT a false-positive.

### RE-POSE TO USER (per PK18 cascade discipline; recorded VERBATIM for D-03 evidence)

A LOCKED-decision premise IS falsified: the V-3 allow-list was pre-allocated as {2 Wave-B-A fixtures} on the assumption no pre-existing fixture would move. Observation: exactly 1 pre-existing fixture (`meltingsubmarine`) does move, with verdict that the post-fix IR is STRUCTURALLY RICHER (top-level `Slow` capturing `.slow(3/2)`) and more complete (more chain-method tokens recognised inside the bassline + chord tracks). This is the SAME class as the gate-bearing fix (apostrophe-in-`//`-comment chain-arg walker tolerance — `'sawtooth'`/`'lefthand'`/`'triangle'` adjacent to `// comment` lines).

**The path forward requires a user-locked decision** (the executor's cognitive discipline forbids silent extension):

- **Option A (preferred):** Extend the V-3 allow-list to {2 new Wave-B-A fixtures + meltingsubmarine.snap × 2} — recorded as IR-correctness IMPROVEMENT class (same root cause as the gate-bearing fix; legitimate enrichment, NOT regression). Update both `meltingsubmarine` snapshots via `vitest -u`. Document this verbatim in V-4 SUMMARY as a bonus-improvement record.
- **Option B:** Re-pose D-03 scope to "1 exemplar + the bonus improvement at meltingsubmarine" — file a new issue documenting the meltingsubmarine improvement explicitly; PR description cites both flips.
- **Option C (rejected by evidence):** revert the fix and re-pose D-02 fix-shape — would require fabricating a narrower `//`-skip that ONLY triggers for `-7LU6zgzViSM`-shaped patterns, which is not achievable without violating the matcher-line invariant (Strudel transpiler / acorn natively skip `//`; our walker must mirror).

EXECUTOR STOPS HERE per PK18 discipline. Awaiting user-locked decision before proceeding to commit Wave A, vendor Wave B-A fixtures, apply Wave B-B dispositions, or measure V-1.


---

## Wave A tail — V-3 allow-list extension on EVIDENCE (Option A applied 2026-05-22)

### User-locked decision (verbatim)

> **Option A — extend V-3 allow-list to include `meltingsubmarine` + refresh the 2 snapshots; document the bonus-improvement in V-4 SUMMARY as a same-class incidental enrichment; SCOPE stays strict to the gate-bearing class.**

### Extended V-3 allow-list (final)

```
{
  bakery-143-apostrophe-in-chain-arg-comment.strudel,   // Wave B-A (canonical positive)
  bakery-143-NEGATIVE-no-apostrophe-comment.strudel,    // Wave B-A (negative control)
  meltingsubmarine.strudel                              // Wave A tail (bonus-improvement)
}
```

= 3 parity-corpus fixtures + matching 3 loc-fidelity snapshot entries.

### Same-class evidence (meltingsubmarine)

Pre-fix (commit pre-f8bffe7):
```
body.tag = "Code"   via.args = "4,.125,(x,n)=>x.gain(.15*1/(n+1))"  (echoWith — deepest reached)
trailing .slow(3/2) was UNREACHABLE  (findMatchingParen failed inside `'sawtooth'` chain args
                                       adjacent to `//` lines → walker truncated chain)
isCodeFallback = false  (Code with via=defined, not Code-with-undefined)
```

Post-fix (commit f8bffe7):
```
body.tag = "Slow"   via = undefined   (the trailing .slow(3/2) IS now captured at top-level)
inner chain methods now ALL named: .echoWith / .degradeBy / .s('triangle') / .attack(1) /
                                    .cutoff(500) / .s('sawtooth') / etc.
isCodeFallback = false  (still STRUCTURED → STRUCTURED transition, just richer)
```

This is a STRUCTURED→STRUCTURED enrichment, NOT a regression. Both pre-fix and post-fix
pass the whole-program parity classifier. The mechanism class is identical to the
gate-bearing `-7LU6zgzViSM` flip: chain-arg walker `//`-skip tolerance with apostrophes
inside string args.

### 20-19 precedent cite

Phase 20-19 (`-1j62z5xjyCN` bonus-close): same flow — gate-bearing fix surfaced a SAME-CLASS
incidental improvement on a pre-existing fixture; recorded in V-4 SUMMARY as bonus-improvement;
SCOPE stayed strict to gate-bearing class. The 20-21 meltingsubmarine extension applies the
identical precedent.

### Snapshot refresh

```
pnpm --filter @stave/app test -u  → ALL GREEN, 2 snapshots updated for meltingsubmarine
                                    (parity.test.ts.snap + loc-fidelity.test.ts.snap)
git diff --stat (Wave-A + tail vs main):
  - packages/editor/src/lib/parseStrudel.ts         (the 2 //-skip branches from f8bffe7)
  - packages/app/.../__snapshots__/parity.test.ts.snap          (meltingsubmarine entry only)
  - packages/app/.../__snapshots__/loc-fidelity.test.ts.snap    (meltingsubmarine entry only)
  - .planning/phases/20-musician-timeline/20-21-OBSERVATIONS.md (this tail)
```

NOTHING ELSE moved. The byte-additivity invariant holds across all 48 unchanged fixtures.


---

## Wave B-B — backlog dispositions applied (2026-05-22)

Per Wave-0 locked dispositions (OBSERVATIONS line 153-160):

| Issue | Action | URL |
|---|---|---|
| #153 | CLOSE-as-superseded (LAST-WINS Ground Truth §7.2 cite + 20-20 substrate) | comment: https://github.com/MrityunjayBhardwaj/stave-code/issues/153#issuecomment-4511701406 · CLOSED |
| #156 | CLOSE-as-superseded (sole 20-17 residual = `-7LU6zgzViSM` = THIS phase's gate-bearing exemplar) | comment: https://github.com/MrityunjayBhardwaj/stave-code/issues/156#issuecomment-4511707809 · CLOSED |
| #149 | CLOSE-as-superseded (both targets STRUCTURED via intervening 20-18/20-19/20-20 substrate) | comment: https://github.com/MrityunjayBhardwaj/stave-code/issues/149#issuecomment-4511715157 · CLOSED |
| #147 | REFINE-with-product-note (feature placeholder; no parser change; stays open as feature-deferred) | comment: https://github.com/MrityunjayBhardwaj/stave-code/issues/147#issuecomment-4511720561 · STAYS OPEN |

3 closed + 1 refined. SCOPE stayed strict to gate-bearing class; backlog audit was CLASSIFY-only (RUN-classify probes in Wave 0; no fixes outside the gate-bearing class).

### Additionally — #143 supersession annotation

\`gh issue comment 143\` → https://github.com/MrityunjayBhardwaj/stave-code/issues/143#issuecomment-4511678164. #143 stays closed; #163 (NEW gate-bearing issue, filed in Wave V-4 prep) tracks the correct class.

---

## Wave V-1 — Dual gate fresh measurement

```
pnpm parity:bakery --n 50
upstream pin SHA: f73b395648645aabe699f91ba0989f35a6fd8a3c (unchanged)
artifact stamp:   2026-05-21T18-47-02-200Z
N (measured):     50
structured:       50
Code-fallback:    0
real-world %:     100.0%
artifact:         packages/app/tests/parity-corpus/.bakery-runs/samples-2026-05-21T18-47-02-200Z.json
result:           packages/app/tests/parity-corpus/.bakery-runs/result-2026-05-21T18-47-02-200Z.json
```

### Gate-bearing exemplar verdict (full-pipeline)

```
hash:    -7LU6zgzViSM
verdict: structured            ← THE FLIP at full-pipeline level
```

### crit-1 — W3 production-exemplar probe + Wave-B-A canonical-positive fixture

- W3 / `-7LU6zgzViSM` STRUCTURED at full-pipeline (this measurement)
- `bakery-143-apostrophe-in-chain-arg-comment.strudel` parity snapshot STRUCTURED + loc-fidelity snapshot landed (Wave B-A commit f86ad34)
- `bakery-143-NEGATIVE-no-apostrophe-comment.strudel` STRUCTURED (no regression on the over-consumption canary)

crit-1: GREEN.

### crit-2 — arithmetic gate

- 50/50 = 100.0% ≥ 49/50 (98.0% floor); no regression on any of the 49 pre-existing samples.
- Must-not-regress floor: PASS.

crit-2: GREEN.

### PK18 STOP — NONE TRIGGERED

Wave-A tail's V-3 allow-list extension (meltingsubmarine, EVIDENCE-grounded on Option A) resolved the only PK18 trigger of this phase. No further re-pose surfaced through V-1.

### Bonus closes recorded

- meltingsubmarine (Wave A tail; same-mechanism-class IR-correctness enrichment; 20-19 `-1j62z5xjyCN` bonus-close precedent applied)
- `-1j62z5xjyCN` STRUCTURED in current sample (re-confirms 20-19's bonus close holds)
- `-72eEl7NwK9e` STRUCTURED in current sample (#149 audit closure)

### D-04 verdict

D-04 DUAL GATE PASS — 100.0% measurement + 98.0% must-not-regress floor; SCOPE stays strict to gate-bearing class.
