# 20-18 OBSERVATIONS — the EMPIRICAL classification record (Wave 0 source-of-truth)

> The source of record for every later wave's `read_first` line numbers and
> for the FROZEN curated-set scope contract. Every later wave APPENDS its
> verbatim findings; **no wave rewrites this file.** All entries are
> OBSERVATION (executed), never inference (P70 spine; PK18 discipline).

**Branch:** `feat/20-18-chain-root`
**Base:** `22a54300ba12c13bbd0ebe44cf4fc2ed35ffb26a` (`22a5430`) — the 20-18
PLAN-tip on `main`. NOTE: the plan text says "branch from `4c97930` (HEAD)";
`4c97930` was the RESEARCH commit and is the PARENT of the PLAN commit
`22a5430`. The plan was authored before its own commit landed, so the current
`main` tip `22a5430` is the correct, COMPLETE base (it includes CONTEXT +
RESEARCH + PLAN). This is the expected PLAN-tip state, NOT a falsified-premise
PK18 STOP. `e3e6571` (PR #157, 20-17) is an ancestor of `22a5430`.
**Wave 0 run timestamp (UTC):** 2026-05-19T17:03:38Z

---

## ACTION 2 — LIVE ANCHOR TABLE (re-grepped; 20-17 shifted the numbers)

Source of record for every later wave's `read_first` line numbers. File:
`packages/editor/src/ir/parseStrudel.ts` unless noted.

| Anchor | File | Line(s) (verbatim grep) |
|--------|------|-------------------------|
| `export function parseStrudel(code: string): PatternIR` | parseStrudel.ts | **599** |
| `export function parseExpression(` | parseStrudel.ts | **950** |
| `export function parseRoot(` | parseStrudel.ts | **1033** |
| `export function applyChain(` | parseStrudel.ts | **1351** |
| `applyChain(rootIR, chain, chainOffset, bindings)` (parseExpression call) | parseStrudel.ts | **1017** |
| 20-17 G2 (D-01) bound-ident-ROOT substitution arm (`return bindings.get(trimmed)`) | parseStrudel.ts | **1064–1082** (comment 1064–1071; `if` body returns at **1082**) |
| `RESERVED_LABEL_IDENTS = new Set([...])` | parseStrudel.ts | **791** |
| `noteMatch = trimmed.match(/^(?:note|n)\s*\(\s*"([^"]*)"\s*\)/)` | parseStrudel.ts | **1086** (use at 1087–1091) |
| `sMatch = trimmed.match(/^(?:s|sound)\s*\(\s*"([^"]*)"\s*\)/)` | parseStrudel.ts | **1107** (use 1108–1111) |
| `miniMatch = trimmed.match(/^mini\s*\(\s*"([^"]*)"\s*\)/)` | parseStrudel.ts | **1126** (use 1127–1130) |
| `looseMatch = trimmed.match(/^(note|n|s|sound|mini)\s*\(/)` | parseStrudel.ts | **1154** (use 1155–1157) |
| `PatternIR` union head (`export type PatternIR =`) | PatternIR.ts | **45** (members 46+) |
| `Code` union member (`tag: 'Code'`) | PatternIR.ts | **86** |
| `Code.via` widened literal arm `\| { literal: true; raw: string }` | PatternIR.ts | **120** |
| `Code.via` literal-arm constructor (`{ tag: 'Code', code: t, lang: 'strudel', via: { literal: true, raw: t } }`) | parseStrudel.ts | **127** (helper sig 121) |
| `'Signal'` / `'Builder'` / `recogniseChainRoot` | parseStrudel.ts / PatternIR.ts | **ABSENT** (correct Wave-0 pre-state — Wave A/B introduces them) |

The curated-root arm placement target (per plan: AFTER 20-17 G2, BEFORE
`noteMatch`) lands between **parseStrudel.ts:1082** (G2 return) and **:1086**
(`noteMatch`).

---

## ACTION 3 — ORACLE RE-BASELINE (`pnpm --filter @stave/app test:proto`)

Captured VERBATIM. The az2-only single-blocker premise on THIS branch:

```
=== 6 REPROS (PRODUCTION parseStrudel — current source with Wave 0 bundle) ===
__LsnlgQ6osk   | production=code (bare)
_1j62z5xjyCN   | production=code (bare)
_72eEl7NwK9e   | production=structured (body.tag=Code via)
_CyO42BOyp5a   | production=structured (body.tag=Code via)
_L13nBhrqGR_   | production=structured (body.tag=Param)
_LHtBlF8peGC   | production=structured (body.tag=Stack)
```

DIAGNOSTICS (relax run, `--LsnlgQ6osk`), verbatim — **THE az2-only line**:

```
[R:__LsnlgQ6osk] stmts=7
[R:__LsnlgQ6osk] descs=rp1,beat,az2,chords2,bass,harm2 finalIdx=6 finalText="stack(\n  bass,\n  beat,\n  harm2,\n  az2,\n)"
[R:__LsnlgQ6osk] iter0 rp1 rhs="\"<sd hh>\".fast(\"<2@3 4>\")" -> tag=Code bareCode=false
[R:__LsnlgQ6osk] iter0 beat rhs="sound(rp1).bank(\"RolandTR707\").gain(0.4)\n   .gain(" -> tag=Degrade bareCode=false
[R:__LsnlgQ6osk] iter0 az2 rhs="irand(12).struct(\"x(8,8)|x(4,8)\")\n  .sometimesBy(p" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] iter0 chords2 rhs="\"<Gsus G7 Em7 D7>\"" -> tag=Cycle bareCode=false
[R:__LsnlgQ6osk] iter0 bass rhs="chords2.rootNotes(2).note()\n  .s(\"sawtooth\")\n  .cl" -> tag=FX bareCode=false
[R:__LsnlgQ6osk] iter0 harm2 rhs="chords2.voicings('ireal')\n  .slow(1)\n  .note()\n  ." -> tag=Param bareCode=false
[R:__LsnlgQ6osk] iter1 az2 rhs="irand(12).struct(\"x(8,8)|x(4,8)\")\n  .sometimesBy(p" -> tag=Code bareCode=true
[R:__LsnlgQ6osk] post-fixpoint resolved=[rp1,beat,chords2,bass,harm2] pending=[2]
```

**CONFIRMED — az2-only: YES.** `descs=rp1,beat,az2,chords2,bass,harm2` →
`pending=[2]` is stmtIndex 2 = `az2`. `rp1,beat,chords2,bass,harm2` ALL
resolve in the whole-program fixpoint; the ONLY remaining blocker is `az2`
(the `irand` chain-root). `beat`/`bass`/`harm2` are NOT pending. The
whole-program-fixpoint premise (CONTEXT P70 R-1 FINDING orchestrator
correction) HOLDS on this branch. **No PK18 STOP.** test:proto: 369 passed.

---

## ACTION 4 — R-1 RE-CLASSIFICATION (all 7 V-1 N=50 Code-fallbacks)

`samples-2026-05-19T13-24-45-538Z.json`, production `parseStrudel` +
per-stmt `parseExpression`. **NOTE:** the `_r1-classify` harness uses
`new Map()` (NO fixpoint bindings) — its per-stmt verdict is the ISOLATED
pessimistic view; the genuine-class verdict for #1 is the whole-program
fixpoint (action 3), exactly as the CONTEXT orchestrator-correction states.

`R-1: total=50 fallbacks=7`. Per-sample TRUE first-blocking construct
(verbatim from `/tmp/r1-classify-output.txt`):

| # | hash | Isolated first-blocking (verbatim) | Genuine-class verdict |
|---|------|-------------------------------------|-----------------------|
| 1 | `--LsnlgQ6osk` | `[1] beat`/`[2] az2`/`[4] bass`/`[5] harm2` all `bare=true` in isolation; final `stack(...)` `tag=Stack bare=false`. Whole-program fixpoint (action 3) → only `az2` pending. | **GENUINE chain-root** (`az2`'s `irand`) |
| 2 | `-1j62z5xjyCN` | `[0] cpm: tag=Code bare=true rhs="30"`; `[1] (final-expr) bare=true rhs="samples('github:yaxu/clean-breaks')"`; `[2] stack(...) bare=false` | out-of-scope: boot-stmt-then-expr |
| 3 | `-6c1hEXe8Agi` | `[1] padsbell: tag=Code bare=true rhs="chord(\"Am Am\").voicing().sound(\"gm_celesta:3\")..."` (FIRST genuine binding-blocker; also `[8] melosupp` = `chord(...).voicing()`) | **GENUINE chain-root (`chord`)** |
| 4 | `-7LU6zgzViSM` | `[0] (final-expr): tag=Code bare=true rhs="typeof setDefaultVoicings !== 'undefined' && setDefaultVoicings('legacy')..."` | out-of-scope: guarded boot expr (#143) |
| 5 | `-G2drHRNFueu` | `[0] (final-expr): tag=Code bare=true rhs="sound (\"hh hh hh hh\")"`; `[1] (final-expr) bare=true rhs="sound (\"[bd bd]...\")"` | out-of-scope: multi-top-level-expr |
| 6 | `-HyFCSbuSlq5` | `[6] await loadScript(...)`, `[9] osc(10,0.2,2.0)...`, `[10] a.show()`, `[14] render(o1)` — Hydra/visual mashup | out-of-scope: non-Strudel Hydra (= #156; NOT folded) |
| 7 | `-KLGNJUtyyj1` | `[0] richter_chords: tag=Seq bare=false`; `[5] (final-expr): tag=Code bare=true rhs="arrange(   [48, stack(     richter_chords.euclidRot(...)..."` | **GENUINE builder-root (`arrange`)** |

**CONFIRMED — distribution matches R-1's recorded ~3/7 genuine class:**
genuine = #1 `--LsnlgQ6osk` / #3 `-6c1hEXe8Agi` / #7 `-KLGNJUtyyj1`; the
other 4 (#2 boot-stmt, #4 guarded-boot #143, #5 multi-top-expr, #6 Hydra
#156) are out-of-scope. The live re-run distribution does NOT differ from
R-1. **No PK18 STOP.**

---

## ACTION 5 — THE LOKĀYATA az2 CHAIN-ARG-SIGNAL PROTOTYPE — settled by observation

The phase's PRIMARY parity risk, settled EMPIRICALLY (executed prototype,
ZERO production change, production `parseExpression` in isolation). Verbatim
from the `_proto-d01.spec.ts` WAVE-0 block / `/tmp/proto-d01-chainarg.txt`:

```
=== WAVE-0 az2 CHAIN-ARG-SIGNAL PROTOTYPE (production parseExpression, isolation) ===
(a) irand+struct (no sig arg)      tag=Code     bare=true   src="irand(12).struct(\"x(8,8)|x(4,8)\")"
(b) irand+sometimesBy(sigarg)      tag=Code     bare=true   src="irand(12).sometimesBy(perlin.range(0,1), sub(8))"
(c) FULL verbatim az2 RHS          tag=Code     bare=true   src="irand(12).struct(\"x(8,8)|x(4,8)\")\n  .sometimesBy(perlin.range(0.0,1.0)"
(d) STOP-BOUNDARY recursive sigarg tag=Code     bare=true   src="sine.range(1.5,8).fast(perlin.range(2.8,3.2))"
ctrl perlin.range(0,1)             tag=Code     bare=true   src="perlin.range(0,1)"
ctrl sound("a").sometimesBy(.5,x)  tag=Choice   bare=false  src="sound(\"a b\").sometimesBy(0.5, fast(2))"
```

### VERDICT: (a) ROOT-RECOGNITION-SUFFICES (NOT (b); NOT the (b)-recursive STOP)

Settled by observation, not inference:

1. **The discriminator is the ROOT, not the arg.** `(a)` has NO signal-valued
   arg yet bareCodes IDENTICALLY to `(b)` (signal arg) and `(c)` (the full
   az2). The signal-valued chain ARG is *not* what bareCodes the chain — an
   UNRECOGNISED ROOT short-circuits the entire chain before `applyChain` ever
   inspects the args.
2. **`applyChain` ALREADY tolerates a non-trivial chain arg opaquely once the
   root is recognised.** Control `sound("a b").sometimesBy(0.5, fast(2))` →
   `tag=Choice bare=false` (STRUCTURED). The ONLY delta vs `(a)` is the root
   token (`sound("a b")` recognised vs `irand(12)` not). The chain arm wraps
   unparsed/opaque args by default and keeps the chain structured.
3. **Therefore the curated set need only model the ROOT.** Once
   `recogniseChainRoot` makes `irand(12)` a `{tag:'Builder', kind:'irand'}`
   root, the EXISTING `applyChain` carries the whole `az2` chain — including
   `.sometimesBy(perlin.range(...),...)`, `.fm(sine.range(...).fast(...))`,
   `.pan(...)` — exactly as it already carries the control. Signal-valued
   chain ARGS do NOT need their own recognition mechanism for `az2` to flip
   structured. Verdict **(a)**.

### STOP-BOUNDARY CHECK (action 5 named NEW-CLASS STOP) — NOT TRIGGERED

`(d) sine.range(1.5,8).fast(perlin.range(2.8,3.2))` (the recursive
signal-arg-of-signal-arg shape from `repro__LsnlgQ6osk.strudel:22`) bareCodes
for the SAME root-recognition reason (`sine` is an unrecognised root), NOT
because of recursion depth. The verdict is **(a)** — stronger than even
(b)-non-recursive: bounded one-level arg recognition is not even REQUIRED for
`az2`. The (b)-RECURSIVE sub-case (a recursive signal-expr parser to
arbitrary depth) is **NOT triggered** → **no NEW-CLASS PK18 STOP**, no
re-pose, no backlog→20-19 routing. The recursive shape is carried opaquely by
the existing `applyChain` once the ROOT (`irand`/`sine`) is curated.

**Wave A/B taxonomy scope consequence:** model the ROOT tokens only
(`{tag:'Signal'|'Builder', kind, args?}` where `args` is SOURCE TEXT
byte-verbatim). Do NOT build a signal-expression-as-ARG recogniser. The
`chord`/`arrange` builders stay OPAQUE-pending → Wave C (ground-first).

---

## ACTION 6 — FROZEN CURATED-SET MEMBERSHIP (the scope contract)

R-1 (observed) ∪ R-2 `signal.mjs` Ground Truth seed ∪ closed-loop signal
taxonomy ∪ the Wave-0 prototype verdict (root-only). **FROZEN** — the set
does NOT grow mid-phase without explicit provenance + a re-pose (the 20-16
4×-cascade scope-discipline lesson). `args` = SOURCE TEXT byte-verbatim;
the parser NEVER evaluates a signal / runs `.range` / invokes a builder.

**Continuous / random `Signal` roots** (`{tag:'Signal', kind}`; leaf,
event-neutral; `.range`/`.fast`/etc. carried by existing `applyChain`):
`sine`, `cosine`, `saw`, `isaw`, `tri`, `square`, `pulse`, `perlin`,
`berlin`, `time`, `rand`, `rand2`, `brand`, `sine2`, `cosine2`, `saw2`,
`isaw2`, `tri2`, `square2`, `mousex`, `mousey`, `mous.x`, `mousey`/`mousy`
(R-2 GT canonical names; the exact membership keys are R-2-grounded — Wave A
reads `signal.mjs` to lock the EXACT identifier list; this list is the
seed scope, not a Wave-A pre-commitment of every alias).

**Discrete `Builder` roots** (`{tag:'Builder', kind, args}`; consumed by
existing struct machinery / event-producing): `run`, `irand`, `binary`,
`binaryN`, `binaryL`, `binaryNL`.

**OPAQUE-pending builders (Wave C — args RAW until grounded, Grounding
Check; in `@strudel/tonal` / `pattern.mjs`, NOT read this wave):**
`chord` (R-1 #3, gate-critical), `arrange` (R-1 #7, gate-relevant). These
are NOT in the frozen Signal/Builder set — they are deferred, args-raw-only,
modelled GROUND-FIRST in Wave C. `chord`/`arrange` flipping STRUCTURED is
crit-1 (amended D-03) but their TAXONOMY is Wave-C-grounded, not Wave-0-set.

**Explicitly OUT of the frozen set (do NOT add without re-pose):**
signal-expression-AS-ARG recognisers (verdict (a) — not needed); recursive
signal-arg parsers (the named NEW-CLASS STOP — not triggered, stays out);
the 4 R-1 out-of-scope classes (#2/#4/#5/#6).

---

## ACTION 7 — THE never-gate-counted INVARIANT (pre-state record)

`grep -n 'parseStrudel(s.code)' packages/app/tests/parity-corpus/_bakery-classify.spec.ts`:

```
77:        fallback = isCodeFallback(parseStrudel(s.code))
```

**ASSERTION (Wave-0 pre-state):** the parity-oracle call site
`_bakery-classify.spec.ts:77` passes `parseStrudel` **EXACTLY ONE arg**
(`s.code`) — NO opts object. The flagged-general path is therefore
structurally never-gate-counted in the pre-state (Wave E HARDENS this; Wave
0 RECORDS it). Any later wave adding a 2nd arg here is a STOP.

---

## WAVE 0 VERDICT: **PASS**

- Branch `feat/20-18-chain-root` confirmed (base `22a5430`, the PLAN-tip;
  `4c97930` is its parent — expected, not a STOP).
- az2-only single-blocker premise: **CONFIRMED** verbatim
  (`post-fixpoint resolved=[rp1,beat,chords2,bass,harm2] pending=[2]`).
- R-1 7-fallback distribution: **MATCHES** the recorded ~3/7 genuine class
  (#1/#3/#7 genuine; #2/#4/#5/#6 out-of-scope).
- The Lokāyata az2 chain-arg-signal prototype verdict: **(a)
  root-recognition-suffices** — executed traces recorded; the named
  (b)-RECURSIVE NEW-CLASS STOP is **NOT triggered**.
- FROZEN curated-set membership locked; one-arg oracle invariant recorded.
- NO production source changed (only the `_proto-d01.spec.ts` oracle harness
  + this OBSERVATIONS file).
- editor/app baselines UNCHANGED (see commit-time verification).
- **NO PK18 STOP. Wave A may proceed (separate task — not started here).**
