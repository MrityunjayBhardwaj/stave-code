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
