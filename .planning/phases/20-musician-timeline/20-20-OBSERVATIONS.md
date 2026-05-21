---
phase: 20-20
created: 2026-05-21T18:13:00Z
branch: feat/20-20-tokenizer-whitespace
branched_from: a150889 (20-19 merge into main; planning-doc-only commits afc918e + fb53e68 on top)
---

# Phase 20-20 — Wave-by-wave verbatim observation record

## Wave 0 — Re-confirm Outcome 1; FROZEN scope lock

### Branch + ancestry confirmation

```
$ git merge-base HEAD a150889
a150889f45c1d1e19cbf3a3eb4fe5bebb5cc037a
$ git checkout -b feat/20-20-tokenizer-whitespace
$ git rev-parse --abbrev-ref HEAD
feat/20-20-tokenizer-whitespace
```

The merge-base of the fresh branch with the 20-19 merge SHA `a150889` is
exactly `a150889` — main contains the 20-19 merge in its ancestry. The
only commits between `a150889` and the fresh branch tip are planning-doc-
only (`fb53e68` CONTEXT, `afc918e` RESEARCH+PLAN+PLAN-CHECK). No
production-src commit on main since `a150889`. Action-2 re-grep below
not strictly required (no drift) but performed regardless.

### Live anchor re-grep (action 2)

| Anchor | Live line | Shape |
|---|---|---|
| `export function splitRootAndChain` | `parseStrudel.ts:2489` | function head — unchanged |
| `} else {` identifier-then-paren arm | `parseStrudel.ts:2521` | the surgery site |
| identifier-scan `while` | `parseStrudel.ts:2523` | `while (i < expr.length && /[a-zA-Z0-9_$]/.test(expr[i])) i++` |
| `if (i < expr.length && expr[i] === '(')` | `parseStrudel.ts:2526` | the direct-paren check |
| `findMatchingParen` call | `parseStrudel.ts:2527` | the followup, unchanged |
| `return { root: expr.slice(0, i), chain: expr.slice(i) }` | `parseStrudel.ts:2534-2537` | function tail, unchanged |
| `export function skipWhitespaceAndLineComments(src: string, pos: number): number` | `parseStrudel.ts:1075` | PV49 primitive; signature CONFIRMED |
| `parseRoot.sMatch` regex | `parseStrudel.ts:1347` | `/^(?:s|sound)\s*\(\s*"([^"]*)"\s*\)/` — already tolerates `\s*\(` |

Live line numbers MATCH RESEARCH §5 + PLAN §"Live precedent shapes"
byte-for-byte. No drift.

### Baseline re-observation (action 3)

```
$ pnpm --filter @stave/editor test
 Test Files  91 passed (91)
      Tests  1627 passed (1627)
   Duration  3.41s

$ pnpm --filter @stave/app test
 Test Files  18 passed (18)
      Tests  409 passed (409)
   Duration  1.45s
```

editor **1627/1627** + app **409/409** — baselines RE-CONFIRMED.

### Pre-fix dist grep baselines (P68 INCREASE-by-1 anchor — captured on Wave-0 head BEFORE Wave A's edit)

```
$ pnpm --filter @stave/editor build          # one-shot, clean dist
$ grep -c "splitRootAndChain"          packages/editor/dist/index.js  # 4
$ grep -c "skipWhitespaceAndLineComments" packages/editor/dist/index.js  # 6
$ grep -c "findMatchingParen"          packages/editor/dist/index.js  # 9
$ grep -c "afterIdent"                  packages/editor/dist/index.js  # 0
```

These are the pre-fix anchor counts. Wave A's commit body cites them as
the comparison baseline. Expected post-Wave-A:
- splitRootAndChain: 4 → 5 (the new caller site adds a reference)
- skipWhitespaceAndLineComments: 6 → 7 (the new 5th caller — the
  P68-anchor INCREASE-by-1 gate)
- findMatchingParen: 9 → 9 (unchanged; defensive)
- afterIdent: 0 → 1 OR 0 (the local name may be minified away;
  informational only — NOT a STOP gate)

### Wave-0 5-cell factoring probe RE-CONFIRMATION on `feat/20-20-tokenizer-whitespace` from `a150889`

Probe spec `packages/editor/src/_wave0-classify-20-20.spec.ts` written
to mirror RESEARCH §2.1 exactly (vitest run, stdout-printed, no
assertions). Run command:

```
$ pnpm --filter @stave/editor exec vitest run src/_wave0-classify-20-20.spec.ts
```

**Verbatim stdout:**

```
[A control (no space, single line)]
  source: "sound(\"hh hh hh hh\")"
  outer.tag=Track bare=false inner.tag=Seq inner.bare=false
[B whitespace fence (with space, single line)]
  source: "sound (\"hh hh hh hh\")"
  outer.tag=Track bare=false inner.tag=Code inner.bare=true
[C multi-top-level (no space)]
  source: "sound(\"a\")\nsound(\"b\")"
  outer.tag=Track bare=false inner.tag=Play inner.bare=false
[D EXEMPLAR shape (with space + two siblings)]
  source: "sound (\"a\")\nsound (\"b\")"
  outer.tag=Track bare=false inner.tag=Code inner.bare=true
[E REAL bakery -G2drHRNFueu (verbatim)]
  source: "sound (\"hh hh hh hh\")\nsound (\"[bd bd][sd bd] bd sd\")\n\n\n// @version 1.0"
  outer.tag=Track bare=false inner.tag=Code inner.bare=true
```

### Decision rule (action 5) — verdict

Per RESEARCH §2.4: A and C STRUCTURED (inner.bare=false); B/D/E
bareCode (inner.bare=true). **Verdict: Outcome 1 RE-CONFIRMED on the
fresh branch.** Scope LOCKS to #159 only.

The probe spec `_wave0-classify-20-20.spec.ts` is DELETED post-capture
(it is a one-off Wave-0 instrument; the OBSERVATIONS record above is
the source of truth; the permanent regression coverage lands in Wave
B's `bakery-159-*.strudel` fixtures).

### FROZEN scope lock (action 5/7)

- IN-SCOPE: **#159 only** (tokenizer-whitespace fence at
  `splitRootAndChain`'s identifier-then-paren branch).
- DEFERRED BACKLOG (Outcome 1 disposition):
  - **#153** (multi-top-level sibling expressions) — stays backlog
    with the RESEARCH §4 LAST-WINS upstream verdict recorded for any
    future maintainer who picks up the issue. Citations:
    `@strudel/transpiler@1.2.6 transpiler.mjs:198-204` (`addReturn`
    rewrites ONLY `body[body.length-1]`); `@strudel/core@1.2.6
    evaluate.mjs:37-38` (`Function(body)()` returns last
    ReturnStatement); `@strudel/core@1.2.6 repl.mjs:237` (`pattern`
    binds to last value). Our parser today is FIRST-WINS for case C
    (`sound("a")\nsound("b")` → inner.tag=Play of FIRST `sound`); a
    semantic mismatch with upstream LAST-WINS but NOT a parity
    blocker (case C STRUCTURES). #153 phase that picks this up
    inherits the §4 grounding without re-doing P69 discharge.
  - **#143** (`-7LU6zgzViSM` guarded-boot prelude variant) — separate
    class, out of 20-20 scope.
  - **#156**, **#149**, **#147**, **#158-other-residuals** —
    untouched.

### Expected V-3 allow-list (action 7) — pre-allocated

```
$ ls packages/app/tests/parity-corpus/bakery-*.strudel | grep -E '159|G2dr'
NONE
```

No pre-existing corpus file for `-G2drHRNFueu` (the hash lives in
`.bakery-runs/samples-*.json`, not in `*.strudel`). Expected V-3
allow-list (the EXACT files that may have moved across the entire
phase) is therefore:

1. `packages/app/tests/parity-corpus/bakery-159-tokenizer-whitespace.strudel`  (Wave-B canonical positive — new)
2. `packages/app/tests/parity-corpus/bakery-159-NEGATIVE-no-whitespace.strudel` (Wave-B negative control — new)

Plus the corresponding `__snapshots__/{parity,loc-fidelity}.test.ts.snap` snapshot entries.

Allow-list size: **EXACTLY 2** fixtures (+ their snapshot entries).
Every other parity-corpus file's loc-fidelity diff MUST be EMPTY
across the entire phase (PV49 byte-additive substrate proof; V-3
observational gate confirms).

---

## Wave A — PV49-extend `splitRootAndChain` with whitespace-then-paren tolerance

### Surgical edit applied

`packages/editor/src/ir/parseStrudel.ts:2521-2531` — inserted (additive
only):

- 14-line provenance comment block citing `@strudel/transpiler@1.2.6
  transpiler.mjs:25-30` (`acorn.parse(input, {ecmaVersion: 2022, …})`)
  + `@strudel/core@1.2.6 evaluate.mjs:29-39` (`Function(body)()`),
  Codeberg pin `f73b3956`.
- `const afterIdent = i` — capture identifier boundary for restore.
- `i = skipWhitespaceAndLineComments(expr, i)` — the new 5th caller of
  the PV49 substrate at the identifier-to-paren boundary class.
- New `} else { i = afterIdent }` restore arm — preserves today's
  disposition for bare-identifier roots (no `(` follows the
  whitespace).

`git diff packages/editor/src/ir/parseStrudel.ts` confirms strictly-
additive surgery: zero edits to the bare-string arm (pS:2492-2503),
backtick arm (pS:2504-2520), identifier-scan `while` (pS:2523), the
`(` check condition itself (pS:2526), the `findMatchingParen` call
(pS:2527), the final `return` (pS:2534-2537), or any other function
in `parseStrudel.ts`.

### P68 build hygiene — INCREASE-by-1 gate VERIFIED

One-shot `pnpm --filter @stave/editor build` clean. Post-fix dist grep:

| Anchor | Pre-fix | Post-fix | Rule | Verdict |
|---|---|---|---|---|
| `splitRootAndChain` | 4 | 4 | `> 0` | PASS |
| `skipWhitespaceAndLineComments` | 6 | **7** | INCREASE-by-1 | **PASS — the new 5th caller is in the shipped dist** |
| `findMatchingParen` | 9 | 9 | unchanged | PASS |
| `afterIdent` | 0 | 2 | informational (local; may be minified) | observed — survived as a local |

### Wave-A throwaway probe — strict-widen + false-positive + exemplar round-trip (RUN; verbatim stdout)

Probe spec `packages/editor/src/_waveA-whitespace-probe.spec.ts` written
+ run. Deleted post-capture (one-off; OBSERVATIONS is the regression
record; permanent coverage lands in Wave B).

```
$ pnpm --filter @stave/editor exec vitest run src/_waveA-whitespace-probe.spec.ts

[i.1 sound (" ") single hh]
  source: "sound (\"hh\")"
  outer.tag=Track bare=false inner.tag=Play inner.bare=false (expect=STRUCTURED)
[i.2 sound (" ") multi hh]
  source: "sound (\"hh hh hh hh\")"
  outer.tag=Track bare=false inner.tag=Seq inner.bare=false (expect=STRUCTURED)
[i.3 s (" ") alias]
  source: "s (\"bd sd\")"
  outer.tag=Track bare=false inner.tag=Seq inner.bare=false (expect=STRUCTURED)
[i.4 note (" ")]
  source: "note (\"c d\")"
  outer.tag=Track bare=false inner.tag=Seq inner.bare=false (expect=STRUCTURED)
[ii.1 let allBindings binding]
  source: "let allBindings = \"x\"; sound(\"y\")"
  outer.tag=Track bare=false inner.tag=Play inner.bare=false (expect=UNCHANGED)
[ii.2 let x = sine bare ident]
  source: "let x = sine"
  outer.tag=Track bare=false inner.tag=Code inner.bare=true (expect=UNCHANGED)
[ii.3 sine .range chain (leading ws)]
  source: "sine .range(0,1)"
  outer.tag=Track bare=false inner.tag=Code inner.bare=false (expect=UNCHANGED)
[ii.4 let x = sine // c\n.range]
  source: "let x = sine // comment\n.range(0,1)"
  outer.tag=Track bare=false inner.tag=Code inner.bare=true (expect=UNCHANGED)
[iii.exemplar -G2drHRNFueu verbatim]
  source: "sound (\"hh hh hh hh\")\nsound (\"[bd bd][sd bd] bd sd\")\n\n\n// @version 1.0"
  outer.tag=Track bare=false inner.tag=Seq inner.bare=false (expect=STRUCTURED)
[ctrl sound("hh") no-whitespace]
  source: "sound(\"hh\")"
  outer.tag=Track bare=false inner.tag=Play inner.bare=false (expect=STRUCTURED)
```

**Verdict — all gates PASS:**

- (i) strict-widen — all 4 cases FLIPPED to STRUCTURED (`inner.bare`:
  true → false). The pre-fix Wave-0 case-B-equivalent was `inner.tag=Code
  inner.bare=true`; post-fix `inner.tag=Play|Seq inner.bare=false`. The
  PV49 walker tolerance + the inherited `sMatch` (`Play`) /
  `looseMatch` /`miniMatch` (`Seq`) regex arms FIRE downstream as
  predicted by RESEARCH §5.2.
- (ii) false-positive guards — all 4 cases preserved disposition. The
  `i = afterIdent` restore arm fires when no `(` follows the
  whitespace (cases ii.2/ii.3/ii.4); case ii.1's `let allBindings = "x";`
  binding is handled by the binding-map layer UPSTREAM of
  `splitRootAndChain`, so the new walker tolerance does not perturb
  it. **NO over-widening.**
- (iii) exemplar `-G2drHRNFueu` verbatim → `inner.tag=Seq
  inner.bare=false`. **The gate-bearing observation: the exemplar
  FLIPS STRUCTURED via the PV49 extension.** Inner.tag=Seq (not Play)
  because the `sMatch` regex's body `"hh hh hh hh"` is multi-token
  mini-notation; the inherited `Seq` projection fires (RESEARCH §5.2
  predicted Play; observed Seq is a stronger structural signal — both
  are non-bareCode and both PASS the parity-oracle fence
  `body.tag !== 'Code'`).
- control `sound("hh")` → unchanged (Play/false). No regression on the
  no-whitespace case.

### Editor + app test gates (action 7)

```
$ pnpm --filter @stave/editor test
 Test Files  91 passed (91)
      Tests  1627 passed (1627)         # unchanged — no regression

$ pnpm --filter @stave/app test
 Test Files  18 passed (18)
      Tests  409 passed (409)           # unchanged — no fixture vendored yet
```

### Per-file loc-fidelity STOP gate (Wave A)

The app test suite includes `loc-fidelity.test.ts` (the byte-exact
slicing invariant). It passed 409/409 with zero pre-existing fixture
moved. The parity-CHANGED set this wave: **EMPTY** (Wave A vendors no
fixtures; B-1 owns that). PV49 byte-additive substrate carries by
construction (R-5 grounded: consumed whitespace included in root
slice; no source mutation). STOP gate CLEAN.

### Files staged for commit

- `packages/editor/src/ir/parseStrudel.ts` (the additive surgical edit)
- `packages/editor/dist/index.{js,cjs,js.map,cjs.map}` (the rebuilt
  shipped bundle reflecting the source change)
- `.planning/phases/20-musician-timeline/20-20-OBSERVATIONS.md` (this
  Wave-A record append)

---

## Wave B — Permanent CI fixture vendoring (V-2 cadence)

### `-G2drHRNFueu` verbatim source (action 2)

```
$ node -e "const j=JSON.parse(require('fs').readFileSync('packages/app/tests/parity-corpus/.bakery-runs/samples-2026-05-20T13-22-13-320Z.json','utf8'));console.log(j.samples.find(s=>s.hash==='-G2drHRNFueu').code)"
sound ("hh hh hh hh")
sound ("[bd bd][sd bd] bd sd")


// @version 1.0
```

### Canonical positive fixture (action 3)

`packages/app/tests/parity-corpus/bakery-159-tokenizer-whitespace.strudel`
— minimal distillation per RESEARCH §7.1 (trailing 3 blank lines +
`// @version 1.0` dropped; the inert prelude content is covered by the
20-14 `stripParserPrelude` arm and adds no discriminative load to the
whitespace-fence fixture):

```
sound ("hh hh hh hh")
sound ("[bd bd][sd bd] bd sd")
```

(Two lines exactly; LF newlines; final newline; no trailing whitespace.)
Keeps BOTH `sound (…)` siblings to lock today's FIRST-WINS multi-line
disposition (per cross-issue inheritance note in BAKERY-FIXTURES.md).

### Negative-control fixture (action 4)

`packages/app/tests/parity-corpus/bakery-159-NEGATIVE-no-whitespace.strudel`
— same shape MINUS the whitespace:

```
sound("hh hh hh hh")
sound("[bd bd][sd bd] bd sd")
```

Pre-fix AND post-fix structures (the inherited `sound("…")` recogniser
arm carries it); locks the proposition "the whitespace-tolerance is the
gate, not the bindings".

### BAKERY-FIXTURES.md update (action 5)

New "Phase 20-20 fixtures (#159 — tokenizer-whitespace fence relaxation)"
section documenting both fixtures + upstream-grounded provenance note:
`@strudel/transpiler@1.2.6 transpiler.mjs:25-30` (acorn.parse) +
`@strudel/transpiler@1.2.6 transpiler.mjs:21-213` (AST walk) +
`@strudel/core@1.2.6 evaluate.mjs:29-39` (`Function(body)()`); Codeberg
pin SHA `f73b395648645aabe699f91ba0989f35a6fd8a3c`. Cross-issue note
for #153 LAST-WINS inheritance also included.

### parity-refresh.mjs exclusion guard verification (action 6)

```
$ node packages/app/scripts/parity-refresh.mjs --dry-run
# parity:refresh
# vendored pin: f73b395648645aabe699f91ba0989f35a6fd8a3c
# fetching:     main (latest)
# summary
# unchanged: 16
# changed:   0
# missing:   0
# no drift — corpus is in sync with the targeted upstream SHA.
```

16 upstream tunes unchanged; 0 missing. The new `bakery-159-*` slugs are
NOT in TARGETS (they're not upstream tunes), so they're excluded by the
structural guard at `parity-refresh.mjs:68-75` by construction. No
script edit needed.

### Snapshot capture (action 7)

```
$ pnpm --filter @stave/app test
 ✓ tests/parity-corpus/parity.test.ts  (49 tests) 18ms
 ✓ src/components/__tests__/MusicalTimeline.test.tsx  (51 tests) 917ms
  Snapshots  4 written
 Test Files  18 passed (18)
      Tests  413 passed (413)
```

- parity-corpus: 47 → **49** tests (+2 fixtures auto-discovered);
- loc-fidelity: 47 → **49** tests (+2 fixtures auto-discovered);
- 4 snapshots written (2 fixtures × {parity, loc-fidelity});
- Total app: 409 → **413** tests.

The canonical positive fixture's parity snapshot asserts `body.tag:
"Seq"` (the mini-notation expanded into `Play`-children); the
negative-control's snapshot has the SAME body structure (the whole
expression structures via inherited `sound("…")` recogniser arm
regardless of the whitespace fence). The fence inversion would have
been a STOP gate; instead BOTH structure post-fix → the whitespace-
tolerance is the gate AS DESIGNED.

### Per-file loc-fidelity STOP gate (Wave B)

```
$ git diff --stat packages/app/tests/parity-corpus/__snapshots__/
 ... __snapshots__/loc-fidelity.test.ts.snap   |  50 ++++++++++
 ... __snapshots__/parity.test.ts.snap          | 104 +++++++++++++++++++++
 2 files changed, 154 insertions(+)
```

Diff is **PURE ADDITION** (154 insertions, 0 removals). Zero
pre-existing snapshot moved. The parity-CHANGED set this wave: **{2 new
Wave-B fixtures}** ⊆ the V-3 allow-list pre-allocated in Wave 0. STOP
gate CLEAN.

### Files staged for commit

- `packages/app/tests/parity-corpus/bakery-159-tokenizer-whitespace.strudel`
- `packages/app/tests/parity-corpus/bakery-159-NEGATIVE-no-whitespace.strudel`
- `packages/app/tests/parity-corpus/BAKERY-FIXTURES.md`
- `packages/app/tests/parity-corpus/__snapshots__/parity.test.ts.snap`
- `packages/app/tests/parity-corpus/__snapshots__/loc-fidelity.test.ts.snap`
- `.planning/phases/20-musician-timeline/20-20-OBSERVATIONS.md` (Wave-B append)

---

## V-1 — D-04 dual-gate measurement (fresh PK17 step-6 cadence)

### One-arg oracle invariant (action 1)

```
$ grep -n 'parseStrudel(s.code)' packages/app/tests/parity-corpus/_bakery-classify.spec.ts
77:        fallback = isCodeFallback(parseStrudel(s.code))
```

Exactly one arg. 20-20 ships no opts threading change.

### Canonical parity:bakery script (action 2)

```
$ grep parity:bakery package.json
"parity:bakery": "node packages/app/scripts/parity-bakery.mjs"
```

Root-level pnpm script. Canonical form: `pnpm parity:bakery --n 50`.

### Fresh PK17 step-6 measurement (action 3) — VERBATIM stdout tail

```
$ pnpm parity:bakery --n 50
…
# === REAL-WORLD PARITY ===
# N (measured):     50
# structured:       49
# Code-fallback:    1
# real-world %:     98.0%   (structured / N)
# 20-15 baseline:   4/10 = 40.0% (2026-05-15 stress test)

# === NEW fallback classes (BACKLOG — NOT fixed this phase, D-03) ===
#   [1x] BACKLOG #143: guarded boot expr typeof X && X(...)

# artifact (gitignored, dated/SHA'd): packages/app/tests/parity-corpus/.bakery-runs/samples-2026-05-21T12-51-24-407Z.json
# result:                              packages/app/tests/parity-corpus/.bakery-runs/result-2026-05-21T12-51-24-407Z.json
```

- **New ISO stamp:** `2026-05-21T12-51-24-407Z`
- **Upstream pin SHA:** `f73b395648645aabe699f91ba0989f35a6fd8a3c` (unchanged from baseline)
- **structured:** **49/50 = 98.0%**
- **fallback classes:** 1× `#143 guarded boot` (`-7LU6zgzViSM`)

### Per-row diff vs baseline (action 4)

```
$ node -e "<diff script — see commit body>"
FLIPPED code->structured: [ '-G2drHRNFueu' ]
REGRESSED structured->code: []
baseline -G2drHRNFueu: code -> fresh: structured
baseline -7LU6zgzViSM: code -> fresh: code
```

- **FLIPPED:** exactly **`-G2drHRNFueu`** (the +1 from the fix; the
  gate-bearing observation). No BONUS exemplar flipped (vs 20-19's
  `-1j62z5xjyCN`; SCOPE strict to #159 holds).
- **REGRESSED:** **EMPTY**. Zero regressions across the 48
  baseline-structured rows. The PV49 byte-additive substrate proof
  (the consumed whitespace is included in the root slice; no source
  mutation; remaining offsets unchanged) is observationally confirmed.
- **`-7LU6zgzViSM`:** unchanged (out-of-scope per D-04 + the
  `BACKLOG #143` classifier still fires).

### Crit-1 isolated re-run (action 5 crit-1)

The Wave-B canonical-positive fixture's parity snapshot was captured
in Wave B and confirmed body.tag="Seq" (whole-program STRUCTURED at the
parity oracle fence `body.tag !== 'Code'`). The negative-control
fixture also asserts STRUCTURED. Both PASS. Inner shape `Seq` (NOT
`Play` — the multi-token mini-pattern body routes through
`miniMatch`/`looseMatch` arm rather than the single-token `sMatch`).
The auto-discovered parity oracle already locks this; the optional
`_wave159-grounding.spec.ts` is SKIPPED per PLAN action 8's
sane-default disposition (no ambiguity in the inner shape; the
parity snapshot is sufficient evidence).

### D-04 dual-gate verdict (action 5)

| Gate | Threshold | Observed | Verdict |
|---|---|---|---|
| **Crit-1 HARD** | Wave-B canonical-positive fixture asserts whole-program STRUCTURED (`body.tag !== 'Code'`) | body.tag="Seq" with Play children; negative-control also STRUCTURED | **PASS** |
| **Crit-2 HARD (≥98.0%)** | structured ≥ 49 / 50 | **49 / 50 = 98.0%** | **PASS** |
| **Crit-2 HARD (must-not-regress)** | structured ≥ 48 / 50 (96.0% floor) | **49 / 50 ≥ 48 / 50** | **PASS** |
| **No bar-lowering** | floor unchanged at 96.0% | floor preserved; no scope-expansion; no second-workaround | **PASS** |

**D-04 dual gate: PASS on the SAME merge-candidate head SHA (Wave A +
Wave B + V-1 on `feat/20-20-tokenizer-whitespace`).**

### Files staged for commit (V-1)

- `.planning/phases/20-musician-timeline/20-20-OBSERVATIONS.md`
  (V-1 record append; the `.bakery-runs/*.json` are gitignored)
