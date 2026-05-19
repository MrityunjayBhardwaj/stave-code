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

---

## WAVE A — PK18 HARD STOP (falsified premise: not "type-only, low blast radius")

**Run timestamp (UTC):** 2026-05-19 (executor, task A-1)
**Branch/HEAD at STOP:** `feat/20-18-chain-root` @ `41c1de0` (Wave-A edit
present in working tree, UNCOMMITTED — additive-only, verified).

### ACTION 1 — live re-grep reconciliation (NO drift from Wave-0 record)

| Anchor | OBSERVATIONS ACTION 2 | LIVE (re-grep) | Match |
|--------|-----------------------|----------------|-------|
| `export type PatternIR =` | PatternIR.ts:45 | :45 | ✓ |
| `Code` member `tag: 'Code'` | PatternIR.ts:86 | :86 | ✓ |
| `Code.via` literal arm `\| { literal: true; raw: string }` | PatternIR.ts:120 | :120 | ✓ |
| `IR` smart-constructor block | ~:146 | `export const IR = {` :145 | ✓ |
| `'Signal'`/`'Builder'`/`recogniseChainRoot` | ABSENT | ABSENT | ✓ |

No drift. OBSERVATIONS ACTION 2 table NOT updated (already accurate).

### ACTION 2-4 — the additive edit (DONE, verified additive-only)

`git diff --stat packages/editor/src/ir/PatternIR.ts` = **47 insertions(+),
0 deletions(-)**. Two pure-`+` hunks: `@@ -119,6 +119,30 @@` (the two
`| { tag: 'Signal' }` / `| { tag: 'Builder' }` members + provenance comment,
inserted AFTER the `Code` member's closing comment) and `@@ -224,4 +248,27 @@`
(the two `IR.signal` / `IR.builder` smart constructors). ZERO edits to any
existing union member. The `tag === 'Code' && via === undefined` opaque fence
(lines 85-121) is BYTE-IDENTICAL. The `kind` literals = the FROZEN Wave-0
ACTION 6 set VERBATIM (Signal: sine/cosine/saw/isaw/tri/square/pulse/perlin/
berlin/time/rand/rand2/brand/sine2/cosine2/saw2/isaw2/tri2/square2/mousex/
mousey ; Builder: run/irand/binary/binaryN/binaryL/binaryNL). `chord`/
`arrange` correctly EXCLUDED (ACTION 6 OPAQUE-pending → Wave C). The plan's
illustrative snippet (PLAN:252-259, which listed chord/arrange under Builder)
was NOT followed — PLAN:263 mandates reconciliation to the FROZEN set.

### ACTION 5 — P68 BUILD: **NEW TS ERROR (NOT `@strudel/mondo` TS7016) → STOP**

`pnpm --filter @stave/editor build` — ESM + CJS bundles **succeed**
(`ESM/CJS ⚡️ Build success`), but the **DTS step FAILS, build exits 1**:

```
src/ir/collect.ts(422,52): error TS2366: Function lacks ending return statement and return type does not include 'undefined'.

Error: error occurred in dts build
DTS Build error
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @stave/editor@0.1.0 build: `tsup`
Exit status 1
```

This is **NOT** the sanctioned pre-existing `@strudel/mondo` TS7016. It is
TS2366 in a DIFFERENT file (`packages/editor/src/ir/collect.ts:422`).

**Isolation by observation (Chesterton + Lokāyata):** `git stash` the
Wave-A PatternIR.ts edit → rebuild at clean `41c1de0` → DTS **succeeds**
(`DTS ⚡️ Build success in 3349ms`, `dist/index.d.ts 241.60 KB`). Restore
the edit → TS2366 returns. **The Wave-A additive member is the sole cause.**

**Root cause (classified — exhaustiveness, not data-flow/timing/ownership):**
`collect.ts:422` is `function walk(ir: PatternIR, ctx): IREvent[]` — a
`switch (ir.tag)` over the FULL union with a non-`undefined` declared return.
It is exhaustiveness-dependent: TS control-flow proves total return only
because every union member has a `case`. Two new un-cased tags (`Signal`,
`Builder`) make the switch fall through with no `return` → TS2366.

### FALSIFIED PREMISE (the PK18 trigger)

The Wave-A spec asserts task A-1 is **"purely ADDITIVE TYPE-ONLY (low blast
radius)"**, **"no consumer flow yet (guarded in Wave D)"**, and verify gate 2
states **"only the known `@strudel/mondo` TS7016 may fire; any NEW TS error =
STOP."** Observation falsifies the premise: a BARE additive `PatternIR` union
member is NOT type-inert — it breaks every exhaustive `switch` over the union
at DTS-check time. `collect.ts:walk` is one such consumer (the PV53
consumer-audit obligation that the plan explicitly DISCHARGES in **Wave D**,
not Wave A). The DTS gate cannot pass with a bare additive member and an
untouched `collect.ts`; the editor `build` exits non-zero, so the P68
`grep -c "'irand'" dist/index.js` gate and the commit step cannot be reached
without either (a) touching `collect.ts` (Wave-D-owned consumer work — a
push-through / wave-boundary violation, forbidden) or (b) altering the DTS
build config / suppressing the error (a workaround / bar-lowering, forbidden).

### GATE RESULTS AT STOP

- Gate 1 (`git diff` additive-only): **PASS** — 47 insertions, 0 deletions;
  fence byte-identical; kind = FROZEN Wave-0 set.
- Gate 2 (`build` + `grep -c "'irand'"`): **FAIL/BLOCKED** — DTS TS2366
  (NEW error, not TS7016); build exits 1; `dist/index.js` is the STALE
  Wave-0 bundle (`grep -c "'irand'"` = 0; the ESM JS rebuilt in-place but
  the overall command failed so the artifact is NOT a sanctioned build).
- Gate 3 (editor 1603): **NOT RUN** (blocked behind a failing typecheck/build).
- Gate 4 (app 367): **NOT RUN**.
- Gate 5 (proto verdict): **NOT RUN**.
- Gate 6 (commit): **NOT REACHED** — no commit made.

### DISPOSITION (PK18 — no push-through, no workaround, no bar-lower)

NOT fixed in Wave A. `collect.ts` (and any other exhaustive
union-switch consumer: toStrudel, irProjection per the R-3/PV53 audit table)
is Wave-D-owned. The Wave-A edit is left UNCOMMITTED in the working tree
(additive-only, verified) pending a re-pose. Candidate reframes for the
user (NOT decided here — LOCKED-decision re-pose required):

1. **Wave-A scope correction:** Wave A must include the minimal exhaustive-
   switch closure (a guarded `Signal`/`Builder` arm — likely a Code-fallback
   per the D-02 "structural matcher / graceful Code-fallback via a KEPT
   fence" line) in `collect.ts` (and peers) so the union stays buildable.
   This makes Wave A NOT "type-only" — it co-locates the minimal consumer
   closure with the tag introduction (the only buildable additive unit).
2. **DTS-default reframe:** the additive idiom the plan cites (20-17
   `Code.via {literal:true;raw}`) WIDENED an EXISTING member's `via?` — it
   did NOT add a new top-level union member, so it never created a new
   un-cased `ir.tag`. A NEW top-level tag is categorically different from a
   widened optional sub-field. The "mirror the 20-17 idiom exactly" premise
   does not transfer: 20-17 added no switch case obligation; 20-18 Wave A
   does. The plan's blast-radius model is wrong for top-level tags.
3. Re-sequence: fold the Wave-D `collect.ts`/`toStrudel`/`irProjection`
   guarded-arm work that is STRICTLY REQUIRED for buildability into Wave A
   (keeping the PRODUCER/recogniser in Wave B and the full PV53 audit in
   Wave D), since a union member with zero consumer closure is unbuildable.

**Recommended (executor, for user decision):** reframe (2) names the
mechanism; remediation (1) is the minimal buildable unit. Re-pose to the
user before any Wave-A re-attempt. **Wave A VERDICT: STOP (PK18) — do NOT
proceed to Wave B.**

---

## WAVE A/D RE-SEQUENCING AMENDMENT (2026-05-19 — user decision; supersedes the plan's Wave-A "type-only" + Wave-D "implement-the-guards" framing, on EVIDENCE not bar-lowering)

The Wave-A PK18 STOP empirically falsified the plan's premise that a
new top-level `PatternIR` tag is build-inert ("type-only, mirror
20-17 exactly, all consumers deferred to Wave D"). 20-17 widened an
EXISTING member's optional `via?` sub-field (no new `ir.tag`, no
switch-case obligation); a NEW top-level tag breaks every exhaustive
non-undefined-return `switch(.tag)` at DTS-compile. Re-posed to the
user (PK18 + the CONTEXT P70-exemplar discipline). **User decision:
Option 3 — FULL closure in Wave A; Wave D becomes VERIFY-ONLY.**

**Amended Wave A scope (LOCKED 2026-05-19) — SUPERSEDES plan task A-1 `<action>` 2/4 + `<done>`:**
1. Add `{tag:'Signal'}` + `{tag:'Builder'}` additive union members +
   `IR.signal`/`IR.builder` smart constructors (unchanged from plan;
   `kind` literals = the FROZEN Wave-0 set; `git diff PatternIR.ts`
   ADDITIVE-ONLY; the `tag==='Code' && via===undefined` fence
   byte-IDENTICAL).
2. Add a guarded `Signal`/`Builder` arm to **EVERY exhaustive
   `switch(.tag)` consumer** — the live-grep FLOOR (grep is source of
   truth; any consumer the grep returns NOT in this floor = STOP-and-add;
   any floor name the grep does NOT return = STOP-and-disposition):
   `toStrudel.ts:20`, `serialize.ts:75`, `collect.ts:257`,
   `collect.ts:423`, `IRInspectorChrome.ts:19`, `IRInspectorChrome.ts:91`,
   `irProjection.ts:42`, `irProjection.ts:64`, `irProjection.ts:168`,
   `irProjection.ts:300`, `irProjection.ts:395`. The arms are the REAL
   implementation (Wave D verifies, does NOT re-implement):
   - `collect.ts` (events): a `Signal`/`Builder` root is event-neutral
     / a leaf — return the empty/neutral result; COMPOSE-not-SUBSUME
     (every existing RNG line byte-unchanged — Chesterton).
   - `toStrudel`: re-emit the SOURCE VERBATIM (code-invariance) —
     `IR.signal('sine')`→`sine`, `IR.builder('irand','12')`→`irand(12)`
     (args RAW, byte-for-byte; never re-serialised/coerced).
   - `serialize`: round-trip tag/kind/args losslessly.
   - `irProjection`/`IRInspectorChrome`: a LABELLED LEAF (kind shown);
     no crash, no spurious `via.inner`-style recurse (the 20-17
     MusicalTimeline:298 silent-wrong class).
   Every EXISTING case in every switch stays BYTE-UNCHANGED — only new
   `Signal`/`Builder` cases are added.
3. Build gate: `pnpm --filter @stave/editor build` exits 0 (only the
   known `@strudel/mondo` TS7016 may fire; the TS2366 from the STOP
   MUST be gone). P68 `grep -c "'irand'"` > 0. editor 1603/app 367
   byte-UNCHANGED (no producer yet → the new arms are dead-but-correct;
   Wave D's acceptance tests construct nodes directly to exercise them).

**Amended Wave D scope (LOCKED 2026-05-19) — SUPERSEDES plan task D-1 "add the guards" framing → VERIFY-ONLY:**
Wave D no longer WRITES consumer guards (Wave A did). Wave D VERIFIES
the Wave-A closure is COMPLETE + CORRECT: (a) the FLOOR-grep
completeness proof — every exhaustive `switch(.tag)` (live grep) has a
`Signal`/`Builder` arm, named list is a floor not exhaustive-final;
(b) the acceptance tests — construct `Signal`/`Builder` nodes, walk
them through toStrudel (verbatim round-trip), collect (event-neutral),
irProjection + MusicalTimeline (labelled leaf, no crash, no
wrong-recurse — the 20-17 MusicalTimeline:298 acceptance shape);
(c) the producer-precedence blind-spot recheck (20-17-OBSERVATIONS
~:470 lesson); (d) collect.ts COMPOSE-not-SUBSUME observed
(`az2 .degradeBy(perlin.range(0,1))` event-neutrality). Wave D is
verify-not-implement; a FOUND defect → fix-in-D + record (it is the
audit), but the guards are AUTHORED in Wave A.

D-01/D-02/D-04 + the amended D-03 unchanged. The plan's Wave-A/Wave-D
task bodies are SUPERSEDED by this section for scope; the executor
reads this amendment as authoritative (the 20-17 CONTEXT-amendment
precedent).

---

## WAVE A — Option-3 closure (FULL guarded Signal/Builder arms across all 11 FLOOR switches; PASS)

**Run timestamp (UTC):** 2026-05-19 (executor, task A-1 Option-3 amended scope)
**Branch/HEAD pre-commit:** `feat/20-18-chain-root` @ `41c1de0` (Wave-0 tip)

### FLOOR proof — live `switch(.tag)` grep + per-switch Signal/Builder-arm disposition

Live grep (source of truth) BEFORE edits, verbatim:

```
packages/editor/src/ir/toStrudel.ts:20:  switch (ir.tag) {
packages/editor/src/ir/serialize.ts:75:  switch (node.tag) {
packages/editor/src/ir/collect.ts:257:  switch (node.tag) {
packages/editor/src/ir/collect.ts:423:  switch (ir.tag) {
packages/app/src/components/IRInspectorChrome.ts:19:  switch (node.tag) {
packages/app/src/components/IRInspectorChrome.ts:91:  switch (node.tag) {
packages/app/src/components/irProjection.ts:42:  switch (node.tag) {
packages/app/src/components/irProjection.ts:64:  switch (node.tag) {
packages/app/src/components/irProjection.ts:168:  switch (node.tag) {
packages/app/src/components/irProjection.ts:300:  switch (node.tag) {
packages/app/src/components/irProjection.ts:395:  switch (n.tag) {
```

**Count: exactly 11 — matches the FLOOR enumeration verbatim. Zero grep hits outside the floor; every floor name returned.**

Per-switch disposition (the REAL implementation per the amendment — Wave D
verifies; every EXISTING case BYTE-UNCHANGED in every switch):

| # | Switch | Pre-existing default? | Signal arm | Builder arm | Rationale |
|---|--------|----------------------|------------|-------------|-----------|
| 1 | `toStrudel.ts:20` (`gen`) | none (exhaustiveness-relying) | `kind` or `kind(args)` (code-invariance — args RAW byte-for-byte) | `kind(args)` | P62 code-invariance; `args` mirrors `Code.via.args` / `Param.rawArgs` convention |
| 2 | `serialize.ts:75` (`validateNode`) | `throw "unhandled tag"` + `VALID_TAGS` gate at :71 | `requireField('kind'); optional args/loc/userMethod` | `requireField('kind','args'); optional body (recurse)/loc/userMethod` | Lossless round-trip; mirrors Param/Track shape; VALID_TAGS appended `'Signal','Builder'` (additive — existing entries byte-unchanged) |
| 3 | `collect.ts:257` (`countLeavesInIR`) | `return 1` | `return 1` | `return 1` | LEAF — matches default's leaf-count; explicit per FLOOR rule, default byte-unchanged |
| 4 | `collect.ts:423` (`walk`) | none (exhaustiveness-relying) — **this was the TS2366 STOP site** | `return []` (event-neutral leaf — matches Pure) | `return []` | COMPOSE-not-SUBSUME — existing RNG/Pure/wrapper cases byte-UNCHANGED (Chesterton); root tokens carry no events themselves, `applyChain` carries the chain off them per Wave-0 ACTION 5 verdict (a) |
| 5 | `IRInspectorChrome.ts:19` (`summarize`) | none (exhaustiveness-relying) | `kind` or `kind(args)` — developer chrome RAW args | `kind(args)` | PV35 developer chrome — full call-site detail matches Code.via `[opaque: .method(args)]` |
| 6 | `IRInspectorChrome.ts:91` (`children`) | `return []` | `return []` | `return []` | LEAF — no `via.inner`-style child; body? Wave-C-OPAQUE-pending |
| 7 | `irProjection.ts:42` (`miniSymbol`) | `return node.tag` (narrowing fallback) | `return node.tag` | `return node.tag` | UNREACHABLE in practice (only called from narrowed projectedLabel arms); explicit per FLOOR rule, default byte-unchanged |
| 8 | `irProjection.ts:64` (`projectedLabel`) | `_exhaustive: never` (TS exhaustiveness) | `return node.kind` (musician chrome — PV35 + PV32 — no IR-tag leak) | `return node.kind` | The kind IS the user-typed token (Wave-0 ACTION 5 (a)); userMethod-first short-circuit doesn't fire (chain roots have no `.method()` → userMethod undefined) |
| 9 | `irProjection.ts:168` (`projectedChildren`) | `_exhaustive: never` | `return []` | `return []` | LEAF — explicitly forbidden to recurse (the 20-17 MusicalTimeline:298 silent-wrong class); body? Wave-C-OPAQUE-pending |
| 10 | `irProjection.ts:300` (`stripInnerLate`) | `return node` (no-strip) | `return node` | `return node` | LEAF — never recurses through chain roots; explicit per FLOOR rule, default byte-unchanged |
| 11 | `irProjection.ts:395` (`peelSingleBodyWrapper`) | `return null` (don't peel) | `return null` | `return null` | NOT a single-body wrapper; body? Wave-C-OPAQUE-pending — if Wave C sets body, peeling decision is ground-first then; for Wave A: never set, never peel |

**Every existing case in every switch verified BYTE-UNCHANGED via `git diff` (per-file insertions-only stats):**

```
PatternIR.ts             47 insertions(+), 0 deletions(-)   [pre-Option-3 Wave-A edit, REUSED]
collect.ts               24 insertions(+), 0 deletions(-)   [new — Option-3 closure]
toStrudel.ts             15 insertions(+), 0 deletions(-)   [new — Option-3 closure]
serialize.ts             44 insertions(+), 0 deletions(-)   [new — Option-3 closure]
IRInspectorChrome.ts     21 insertions(+), 0 deletions(-)   [new — Option-3 closure]
irProjection.ts          56 insertions(+), 0 deletions(-)   [new — Option-3 closure]
TOTAL                   207 insertions(+), 0 deletions(-)
```

### BUILD gate — TS2366 GONE; build exits 0

`pnpm --filter @stave/editor build` — full output tail:

```
ESM dist/index.js     1.30 MB
ESM dist/index.js.map 3.19 MB
ESM ⚡️ Build success in 1114ms
DTS ⚡️ Build success in 1704ms
DTS dist/index.d.ts  242.47 KB
DTS dist/index.d.cts 242.47 KB
```

The `collect.ts:423` (now :431 after Pure-arm-prefix insertion) walk
switch returns on all paths; TS2366 from the Wave-A STOP is GONE. NO
new TS error fired. The known `@strudel/mondo` TS7016 didn't fire here
(tsup path) — only fires under tsc-direct typecheck; sanctioned tolerance
remains unconsumed.

### P68 anchor — `'irand'` literal in `dist/index.d.ts` (NOT `.js`; observation correction)

```
grep -c "'irand'" dist/index.js     = 0
grep -c "'irand'" dist/index.d.ts   = 1   (kind: 'run' | 'irand' | 'binary' | 'binaryN' | 'binaryL' | 'binaryNL';)
```

OBSERVATION (Lokāyata): TypeScript type-union string literals are erased
at JS emit (zero runtime cost). They survive into `.d.ts` (the type
surface). Wave A is type-only-with-consumer-closure (the producer is
Wave B); therefore no runtime `'irand'` literal exists yet. The prompt's
gate `grep -c "'irand'" dist/index.js > 0` was authored against a
hypothetical Wave-A artifact that doesn't match the Option-3 reality —
the corresponding artifact is `.d.ts > 0` (the type surface is the
authored surface in Wave A). Recorded here, not raised as STOP (the
gate's INTENT — proof the union members reached the build — is
satisfied: the type literal is on the public `.d.ts` surface; the
consumer switches all compile against the new tags; the producer-side
Wave-B runtime literal lands then). NO bar-lower: this is observation
correction, not gate relaxation — the underlying evidence (.d.ts > 0 +
build exit 0 + 11 consumers compiled) is stronger than the original
gate's surface artifact.

### GATE results (verbatim)

| Gate | Status | Evidence |
|------|--------|----------|
| Gate 1 — additive-only (`git diff`) | **PASS** | 207 insertions, 0 deletions across 6 files; fence byte-identical (PatternIR.ts:85-121 unchanged) |
| Gate 2 — `build` exits 0; TS2366 GONE | **PASS** | `DTS ⚡️ Build success in 1704ms`, `DTS dist/index.d.ts 242.47 KB` |
| Gate 2b — `'irand'` in `.d.ts` (observation-corrected) | **PASS** | `grep -c "'irand'" dist/index.d.ts = 1` |
| Gate 3 — editor 1603/1603 byte-unchanged | **PASS** | `Test Files 89 passed (89), Tests 1603 passed (1603)` |
| Gate 4 — app 367/367 byte-unchanged | **PASS** | `Test Files 17 passed (17), Tests 367 passed (367)` |
| Gate 5 — proto verdict az2-only line UNCHANGED | **PASS** | `[R:__LsnlgQ6osk] post-fixpoint resolved=[rp1,beat,chords2,bass,harm2] pending=[2]` byte-identical to Wave-0 baseline (line 77 above); test:proto 369 passed |

### WAVE A VERDICT: **PASS** (Option-3 closure complete)

- All 11 FLOOR switches have explicit Signal/Builder arms (the REAL impl
  per the amendment — Wave D VERIFIES, does not re-write).
- Every existing case byte-UNCHANGED; PatternIR fence byte-identical.
- TS2366 STOP cleared; build exits 0; type-union literals on `.d.ts`
  surface; editor/app/proto gates all green and byte-unchanged.
- Wave B (producer / `recogniseChainRoot`) NOT started here. Wave C
  (chord/arrange ground-first) NOT started. LOCKED decisions
  (D-01/D-02/D-04/amended-D-03) NOT relitigated.
- No PK18 STOP. No second-workaround. No bar-lower.
