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

---

## WAVE B — PK18 HARD STOP (per-file loc-fidelity allow-list-empty premise FALSIFIED — 2 parity-UNCHANGED corpus files moved)

**Run timestamp (UTC):** 2026-05-19 (executor, task B-1)
**Branch/HEAD at STOP:** `feat/20-18-chain-root` @ `f66b1c4` (Wave-A
Option-3 closure tip; Wave-B edit present in working tree, UNCOMMITTED
— additive-only, +123 lines / 0 deletions to `parseStrudel.ts`).

### ACTION 1 — live re-grep reconciliation (NO drift from Wave-0)

`parseRoot(` def at **pS:1033**; G2 return at **pS:1082**; `noteMatch`
at **pS:1086**; `applyChain` at **pS:1351**; `RESERVED_LABEL_IDENTS`
at **pS:791**. All match the Wave-0 ACTION 2 table verbatim. The new
`recogniseChainRoot`-style arm sits between **pS:1085** (immediately
after the G2 return at :1082, a blank-line gap) and **pS:1163** (above
the live `noteMatch` regex, now shifted to pS:~1166 post-insertion).
Placement is AFTER G2, BEFORE `noteMatch` — the proven-correct slot.

### ACTION 2-4 — the additive edit + the EXECUTED strict-widen probe (all three parts GREEN)

Per-file `git diff --stat` after the Wave-B edit:
```
packages/editor/src/ir/parseStrudel.ts  | 123 +++++++++++++++++++++++++++++++++
1 file changed, 123 insertions(+), 0 deletions(-)
```
Two pure-`+` hunks: the FROZEN curated-set `CHAIN_ROOT_RECOGNISER`
`ReadonlyMap` (next to `RESERVED_LABEL_IDENTS`:791, the same idiom)
and the two-arm recogniser block (bare-ident 0-arity + arg-taking)
inserted between the G2 return and `noteMatch`. ZERO edits to any
existing arm. Curated set = the FROZEN Wave-0 ACTION 6 membership
VERBATIM (21 Signal kinds + 6 Builder kinds, chord/arrange EXCLUDED).

Executed strict-widen probe (`_waveB-strict-widen.spec.ts`, production
`parseExpression`, isolation, via `pnpm exec vitest run --config
/dev/null tests/parity-corpus/_waveB-strict-widen.spec.ts`) — all
three parts GREEN (1/1 test passed):

```
=== Wave B-1 strict-widen probe — production parseExpression ===
--- (i) R-1 chain-roots → STRUCTURED + deep-walk hits ---
irand bare             tag=Builder  bare=false  deep:Builder/irand=HIT  src="irand(12)"
irand.struct           tag=Struct   bare=false  deep:Builder/irand=HIT  src="irand(12).struct(\"x(8,8)|x(4,8)\")"
sine bare              tag=Signal   bare=false  deep:Signal/sine=HIT  src="sine"
sine.range             tag=Code     bare=false  deep:Signal/sine=HIT  src="sine.range(200,2000)"
perlin bare            tag=Signal   bare=false  deep:Signal/perlin=HIT  src="perlin"
perlin.range           tag=Code     bare=false  deep:Signal/perlin=HIT  src="perlin.range(0.3,0.8)"
rand bare              tag=Signal   bare=false  deep:Signal/rand=HIT  src="rand"
run                    tag=Builder  bare=false  deep:Builder/run=HIT  src="run(8)"
saw.range              tag=Code     bare=false  deep:Signal/saw=HIT  src="saw.range(0,1)"
--- (ii) CONTROLS — byte-identical to pre-arm ---
sound("hh hh hh hh")    tag=Seq      bare=false
note(`<e5 d5>`).slow(4) tag=Slow     bare=false
n("0 1 2")              tag=Seq      bare=false
--- (iii) USER-SHADOW via G2 (bound sine wins) ---
bound sine bare-ref     tag=Play     bare=false  isSignal=false
```

VERDICT (a) ROOT-recognition-suffices CONFIRMED in production: `sine`
emits as `{tag:'Signal', kind:'sine'}` leaf; `sine.range(200,2000)`
emits as `{tag:'Code', via:{method:'range', inner:{tag:'Signal',
kind:'sine'}}}` — the existing `applyChain`'s `wrapAsOpaque` default
carried `.range` over the new Signal root EXACTLY as predicted. Zero
new chain code needed. User-shadow correct (G2 fires first; the bound
`s("bd")` Play subtree wins; the curated arm never sees `sine` as a
bare ident).

### ACTION 5 — P68 build hygiene: PASS

`pnpm --filter @stave/editor build` exits 0 (after a SINGLE
SourceLocation-shape fix mid-execution: `{offset, length}` →
`{start, end}` matching `IREvent.ts:15-18` — the convention every
existing arm uses, e.g. pS:1376 `loc: [{ start: trimmedAbs, end: ... }]`):
```
ESM dist/index.js     1.30 MB
CJS dist/index.cjs    1.31 MB
DTS dist/index.d.ts  242.47 KB
ESM/CJS/DTS ⚡️ Build success
```
Anchor counts (runtime literals, NOT type-erased — proving the curated
arm reached the bundle):
```
grep -c "'irand'"  dist/index.js  = 1   (curated-Map key — runtime literal in CHAIN_ROOT_RECOGNISER)
grep -c "'sine'"   dist/index.js  = 11  (curated-Map keys + IR.signal call sites)
grep -c "'perlin'" dist/index.js  = 1   (curated-Map key)
grep -c "CHAIN_ROOT_RECOGNISER" dist/index.js = 3 (declaration + 2 use sites)
```
Build gate INTENT satisfied (proof the arm reached production JS).

### ACTION 6 — PER-FILE LOC-FIDELITY STOP GATE TRIGGERED (the falsified premise)

`pnpm --filter @stave/app test` — `parity.test.ts` and
`loc-fidelity.test.ts` BOTH report **2 of 33 corpus files moved**:
```
FAIL  tests/parity-corpus/loc-fidelity.test.ts > amensister — loc→source-slice map is stable & in-bounds
FAIL  tests/parity-corpus/loc-fidelity.test.ts > belldub    — loc→source-slice map is stable & in-bounds
FAIL  tests/parity-corpus/parity.test.ts       > amensister parses to a stable IR shape
FAIL  tests/parity-corpus/parity.test.ts       > belldub    parses to a stable IR shape
 Tests  4 failed | 363 passed (367)
```
Per-wave allow-list is **EMPTY** (no Wave-V fixture exists yet); per
the PLAN ACTION 6 contract: "**ANY moved corpus file = silent drift =
STOP.**"

### FALSIFIED PREMISE (the PK18 trigger)

The Wave-B `<pre_mortem>` Third Error states:
> *"a parity-UNCHANGED corpus file silently moves … Mitigation: the
> per-file loc-fidelity STOP gate — the set MUST be empty this wave
> (no Wave-V fixture exists yet); any move = STOP."*

The PLAN ACTION 6 + RESEARCH R-4 + the prompt's PK18 discipline all
asserted **"every R-1-probe input that reaches this arm was bareCode
(Wave-0 observed) → NOT in any current 33-file snapshot → ZERO
existing corpus file may legitimately move."**

**Observation falsifies that premise.** The Wave-0 R-1 BAKERY-slice
classification (ACTION 4, the 7 Code-fallback samples) did NOT scan
the full 33-file parity corpus — the 33 files were assumed to not
contain curated-set tokens at parseable chain-root positions because
R-1's 7 fallbacks didn't include them. Direct grep against the corpus:

```
amensister.strudel:20    sine.add(saw.slow(4)).range(0,7).segment(8)
amensister.strudel:26    .cutoff(perlin.range(300,3000).slow(8))
amensister.strudel:38    .speed(rand.range(.5,1.5))
belldub.strudel:15       .end(perlin.range(0.02,1))
belldub.strudel:23       .cutoff(perlin.range(400,3000).slow(8))
belldub.strudel:24       .decay(perlin.range(0.05,.2)).sustain(0)
belldub.strudel:31       ).s('square').cutoff(2000)
belldub.strudel:36       note(rand.range(0,12).struct(...))
```

These tokens (`sine`, `saw`, `perlin`, `rand`) appear inside
**partially-structured** tunes: the outer track/stack/note shape
parses; the curated-root sub-expression (e.g. `sine.add(saw.slow(4)).
range(0,7).segment(8)`) was previously bareCoded into an opaque
`Code.via` fence. The new arm makes the sub-expression STRUCTURED —
now `{tag:'Signal', kind:'sine'}` with `Code.via{method:'add', inner:
{tag:'Signal', kind:'sine'}, args:'saw.slow(4)'}` wrappers carrying
the chain (verdict (a) working exactly). The OUTER snapshot moves
because the inner IR shape changed.

**The "parity-IMPROVED" framing does NOT rescue this** — the prompt's
HARD STOP discipline is explicit: "ANY parity-UNCHANGED corpus file
moves loc → STOP (silent offset drift)." The 4 failing snapshots are
not regressions (they are improvements: bareCode → structured), but
the allow-list-empty contract is binary — moved is moved, and the
gate fires. Pushing through would (a) regenerate snapshots without
re-posing the LOCKED decision; (b) bar-lower the per-wave gate that
the AMENDED D-03 explicitly retains; (c) be the 20-16 4×-cascade /
P70 push-through trap.

### GATE results at STOP

| Gate | Status | Evidence |
|------|--------|----------|
| Action 1 — placement live-regrep | **PASS** | AFTER G2 (:1082), BEFORE `noteMatch` (:1166 post-insertion) |
| Action 2 — curated module-const | **PASS** | 21 Signal + 6 Builder kinds = FROZEN Wave-0 set verbatim; module-const `ReadonlyMap`, NOT module state |
| Action 3 — arm insertion | **PASS** | Two-arm shape (bare 0-arity + arg-taking balanced-paren); chord/arrange fall through |
| Action 4 — strict-widen probe (i/ii/iii) | **PASS** | All three parts GREEN — recorded verbatim above |
| Action 5 — P68 build + anchor | **PASS** | Build exits 0; runtime literal `'irand'`/`'sine'`/`'perlin'`/`CHAIN_ROOT_RECOGNISER` present in `dist/index.js` |
| Action 6 — per-file loc-fidelity | **FAIL/STOP** | `amensister` + `belldub` moved (4 snapshots); allow-list empty this wave |
| Action 7 — MINOR-3 proto trace | **PASS — provisional crit-1 hit** | See below |
| Action 8 — commit | **NOT REACHED** — no commit made |

### ACTION 7 — MINOR-3 PROTO TRACE (verbatim — recorded for the V-1 audit trail even though Wave B stops here)

`pnpm exec vitest run --config /dev/null tests/parity-corpus/_proto-d01.spec.ts` (the `_proto-d01` harness `:run-by-vite-node-bypassing-the-exclude`):
```
=== 6 REPROS (PRODUCTION parseStrudel — current source with Wave B edit) ===
__LsnlgQ6osk   | production=structured (body.tag=Stack)
_1j62z5xjyCN   | production=code (bare)
_72eEl7NwK9e   | production=structured (body.tag=Code via)
_CyO42BOyp5a   | production=structured (body.tag=Code via)
_L13nBhrqGR_   | production=structured (body.tag=Param)
_LHtBlF8peGC   | production=structured (body.tag=Stack)
```
DIAGNOSTICS (relax run, `--LsnlgQ6osk`):
```
[R:__LsnlgQ6osk] iter0 az2 rhs="irand(12).struct(\"x(8,8)|x(4,8)\")\n  .sometimesBy(p" -> tag=Code bareCode=false
[R:__LsnlgQ6osk] post-fixpoint resolved=[rp1,beat,az2,chords2,bass,harm2] pending=[]
[R:__LsnlgQ6osk] FINAL parse -> tag=Stack via=false bareCode=false
```

**MINOR-3 ASSERTION: PASS.** `rp1,beat,chords2,bass,harm2` — all 5
protected descriptors STILL RESOLVED (zero consumer-wave regression);
`az2` flips from `bareCode=true pending=[2]` (Wave-0 baseline,
ACTION 3 line 76) → `bareCode=false resolved` (Wave B-1) → the whole
program `--LsnlgQ6osk` flips from `production=code (bare)` (Wave-0
ACTION 3 line 56) → `production=structured (body.tag=Stack)`. **The
Wave-0 (a) verdict CONFIRMED in production: ROOT-recognition alone
sufficed — `applyChain` carried `.struct/.sometimesBy/.fm/.pan/...`
opaquely over the new `{tag:'Builder', kind:'irand'}` root, including
the signal-VALUED chain args. Crit-1 evidence provisional — V-1
confirms.**

### DISPOSITION (PK18 — no push-through, no workaround, no bar-lower)

NOT fixed in Wave B. The amended `parseStrudel.ts` is left
UNCOMMITTED in the working tree (additive-only, +123/-0; build green;
crit-1 hit; per-file loc-fidelity STOP-gate fail) pending a re-pose.
The mechanism WORKS — the falsified premise is about the SCOPE of
"parity-UNCHANGED" files, not about the recogniser's correctness.

**Candidate reframes for the user (NOT decided here — LOCKED-decision re-pose required):**

1. **Allow-list widening (the V-2 path, pulled forward):** the PLAN
   V-2 explicitly creates 3 permanent CI fixtures + UPDATES affected
   corpus snapshots once the producer + audit are in. The natural
   resolution is: the 2 moved files are the (previously-unrecognised)
   first-found instances of the V-2 corpus update — list `amensister`
   + `belldub` in the per-wave allow-list with a `git diff` audit
   (every diff line is bareCode → STRUCTURED, never STRUCTURED →
   bareCode; loc-fidelity diffs are all PV49-loc-additive
   shape-changes, not coordinate drift). This is the cleanest path —
   it does NOT lower the gate; it widens the EVIDENCED allow-list
   with provenance.

2. **Pre-mortem-Third-Error reframe:** the PLAN's Third Error
   pre-mortem (`<pre_mortem>` and ACTION 6) assumed the curated-root
   tokens never appeared in any of the 33 currently-structured files.
   Observation falsifies that. The premise needs an explicit grep
   sweep over the corpus for curated tokens at chain-root position
   BEFORE asserting allow-list-empty (the Wave-0 R-1 7-sample slice
   is not the corpus-wide claim it was used as). Apply this grep
   sweep retroactively → the moved set is provably ≤ {`amensister`,
   `belldub`} (the only corpus files with chain-root-positioned
   curated tokens — verified above), and reframe (1)'s allow-list
   widening lands the wave with EVIDENCED non-regressing parity-up.

3. **Sequence: fold V-2 corpus-snapshot regeneration into Wave B**
   conditional on a per-file `git diff` audit (every snapshot's diff
   = bareCode→STRUCTURED + PV49 loc-additivity preserved on every
   surviving entry; never STRUCTURED→bareCode; never an entry whose
   coordinates drift independent of an IR-shape change). This is
   structurally equivalent to reframe (1) but explicit about WHICH
   wave owns the allow-list update.

**Recommended (executor, for user decision):** reframe (1) — the
moved files are the EVIDENCE of the producer working (crit-1 hit
verbatim above), not silent drift. The allow-list-empty premise was
based on the R-1 7-sample slice, not the full 33-file corpus; this
is a SCOPE error in the premise, not a recogniser bug. Re-pose to
the user before any Wave-B re-attempt. **Wave B VERDICT: STOP
(PK18) — do NOT proceed to Wave C.**

### CROSS-REFERENCE — Wave-A precedent (the SAME class of falsified premise)

Wave A STOPPED on a similar "premise falsified by build observation"
class (the "type-only / Wave-D-deferred" claim, vs. TS exhaustiveness
breaking every `switch(.tag)` consumer). Wave B STOPS on the symmetric
class: "allow-list-empty for parity-UNCHANGED files" vs. observation
that 2 of 33 corpus files DO contain curated tokens at chain-root
position. **Both STOPs are EVIDENCE the recogniser/closure mechanism
WORKS** — and both are SCOPE errors in the per-wave preconditions
that need a re-pose before continuing. The Wave-A user decision
folded the right work into the right wave (Option 3: full closure in
A); the Wave-B decision should mirror — fold V-2's allow-list update
into B with the EVIDENCED bareCode→STRUCTURED audit.

---

## Wave B — RECLASSIFIED (user-approved within-plan reframe, 2026-05-20)

**The "Wave B — STOP (PK18)" section above is PRESERVED verbatim as
the audit trail of the discipline.** This section records the
user-approved within-plan reframe that lands Wave B as a PASS via
the plan's V-3 per-wave commit-body-flagged allow-list mechanism
(PLAN.md V-3 line ~593 — the explicit `{Wave-0} ∪ {V-2 fixtures} ∪
{per-wave commit-body-flagged}` envelope).

### The falsified plan brief (quoted verbatim from the STOP record)

> "allow-list EMPTY this wave; ZERO existing corpus file may
> legitimately move"

This brief was a SCOPE error — the 7-sample bakery slice from
Wave-0 R-1 was used as a corpus-wide claim, but the 33-file corpus
contains tunes with signal-roots at parseRoot-reachable positions
(`amensister.strudel`, `belldub.strudel`) that the 7-sample slice
did not survey. The "allow-list empty" premise survived planning
only because the survey was scoped to the slice, not the corpus.

### The empirical contradiction (post-Wave-B observation)

Corpus-wide grep for FROZEN Wave-0 curated tokens (`sine`/`cosine`/
`saw`/`isaw`/`tri`/`square`/`pulse`/`perlin`/`berlin`/`time`/`rand`/
`rand2`/`brand`/`sine2`/`cosine2`/`saw2`/`isaw2`/`tri2`/`square2`/
`mousex`/`mousey`/`run`/`irand`/`binary`/`binaryN`/`binaryL`/
`binaryNL`) over the 33-file `tests/parity-corpus/fixtures/`
returned 9 signal-containing files. Position analysis:

- **At parseRoot-reachable positions** (top-level RHS or loose-arm
  inner) → **2 files**: `amensister.strudel:20`
  (`sine.add(saw.slow(4)).range(0,7).segment(8)…` — top-level
  binding RHS); `belldub.strudel:36`
  (`note(rand.range(...).struct(...).scale(...))` — loose-arm inner
  reachable via the existing loose-arm split).
- **At chain-method-arg positions** (inside `.range(...)`,
  `.fast(...)`, `.cutoff(...)`, etc.) → **7 files**: `arpoon`,
  `bassFuge`, `dinofunk`, `flatrave`, `juxUndTollerei`,
  `meltingsubmarine`, `randomBells`. These are wrapped opaquely by
  `applyChain`'s existing arg machinery — `applyChain` does NOT
  recursively `parseRoot` chain args.

### The reclassification

**(i) Legitimate bareCode→STRUCTURED improvements on
amensister + belldub.** Mechanism: Wave B's `recogniseChainRoot`
arm working exactly as designed. Direction at every changed leaf
verified bareCode→STRUCTURED (audit below). Sample of the new
structured IR:
- `amensister` (was monolithic `Code{code:"sine.add(saw.slow(4)).range(...)..."}`):
  now innermost is `{tag:'Signal', kind:'sine'}`, wrapped by
  `Code.via{method:'add', args:'saw.slow(4)', inner:{tag:'Signal',
  kind:'sine'}}`, then `.range(0,7)`, then `.segment(8)`, then
  `.superimpose(...)`, then `.scale('G0 minor')`, then `.note()`,
  then `.s("sawtooth")` (which the EXISTING `.s` arm recognises as
  `Param`), then `.gain(.4)`, `.decay(.1)`, `.sustain(0)`,
  `.lpa(.1)`, `.lpenv(-4)`, `.lpq(10)`, `.cutoff(perlin.range(...).slow(8))`,
  `.degradeBy("0 0.1 .5 .1")`, `.rarely(add(note("12")))`. Every
  layer is the EXISTING chain arms composing over the newly
  recognised Signal root — the (a)-verdict from Wave 0 ACTION 5
  realised at corpus scale: zero new chain code needed.
- `belldub` (was monolithic `Code{code:"rand.range(0,12).struct(...).scale(...).s('bell')...:.mask(...)"}`):
  now innermost is `{tag:'Signal', kind:'rand'}`, wrapped by
  `.range(0,12)`, then the EXISTING `Struct` arm fires on
  `.struct("x(5,8,-1)")`, then `.scale('g2 minor pentatonic')`,
  then `.s('bell')`, then the EXISTING `FX` arms on `.begin(.05)` +
  `.delay(.2)`, then the EXISTING `Degrade` arm on `.degradeBy(.4)`
  (numeric arg — meets the existing Degrade arm's contract), then
  `.gain(.4)`, then the EXISTING `When` arm on `.mask("<1 0>/8")`.
  All existing chain arms compose over the new Signal root — same
  mechanism, exact same arms.

**(ii) Corpus-scale (a)-verdict CORROBORATED.** The 7
method-arg files' snapshots stayed UNCHANGED — confirming the
Wave-0 ACTION 5 (a)-verdict at corpus scale, not just in the
isolated probe: signal-valued chain ARGS ride existing `applyChain`
opaquely because `applyChain` wraps args without recursing into
them; signal-valued chain ROOTS at parseRoot-reachable positions
flow through the `recogniseChainRoot` arm; the two paths are
disjoint by `applyChain`'s structure. This is the empirical
corroboration the Wave-B pre-mortem now demands.

### V-3 allow-list extension (per PLAN.md V-3 mechanism)

The plan's V-3 allow-list is explicitly defined as `{Wave-0} ∪
{V-2 fixtures} ∪ {per-wave commit-body-flagged}` (PLAN.md V-3 line
~593). The "per-wave commit-body-flagged" envelope is the within-
plan mechanism for legitimate first-found bareCode→STRUCTURED
moves whose mechanism was not surveyed at plan-time. This is the
SAME mechanism the 20-17 Wave-C bakery-152 precedent used (user-
approved within-plan reframe for first-found legitimate moves the
plan didn't survey). It is NOT bar-lowering — every flagged entry
carries `git diff` provenance (every changed leaf verified
bareCode→STRUCTURED; PV49 loc-additivity preserved on every
surviving entry; no STRUCTURED→bareCode regressions; no coordinate
drift independent of IR-shape change).

**Wave-B V-3 allow-list entries** (commit-body-flagged):
- `tests/parity-corpus/fixtures/amensister.strudel` — legitimate
  bareCode→STRUCTURED improvement; mechanism = `recogniseChainRoot`
  arm matching `sine` at line 20 (top-level binding RHS, parseRoot-
  reachable). Audit: 1 parity snapshot key + 1 loc-fidelity
  snapshot key changed; every changed leaf is bareCode→STRUCTURED;
  PV49 loc-additivity preserved.
- `tests/parity-corpus/fixtures/belldub.strudel` — legitimate
  bareCode→STRUCTURED improvement; mechanism = `recogniseChainRoot`
  arm matching `rand` at line 36 (loose-arm inner via the existing
  `note(...)` loose-arm split, parseRoot-reachable). Audit: 1 parity
  snapshot key + 1 loc-fidelity snapshot key changed; every changed
  leaf is bareCode→STRUCTURED; PV49 loc-additivity preserved.

### Crit-1 evidence callout (provisional hit)

`--LsnlgQ6osk` flipped STRUCTURED in production (the
MICROVAULT-152 D-01 reclaim sample):

```
__LsnlgQ6osk   | production=structured (body.tag=Stack)
[R:__LsnlgQ6osk] iter0 rp1 rhs="\"<sd hh>\".fast(\"<2@3 4>\")" -> tag=Code bareCode=false
[R:__LsnlgQ6osk] iter0 beat rhs="sound(rp1).bank(\"RolandTR707\").gain(0.4)\n   .gain(" -> tag=Degrade bareCode=false
[R:__LsnlgQ6osk] iter0 az2 rhs="irand(12).struct(\"x(8,8)|x(4,8)\")\n  .sometimesBy(p" -> tag=Code bareCode=false
[R:__LsnlgQ6osk] iter0 chords2 rhs="\"<Gsus G7 Em7 D7>\"" -> tag=Cycle bareCode=false
[R:__LsnlgQ6osk] iter0 bass rhs="chords2.rootNotes(2).note()\n  .s(\"sawtooth\")\n  .cl" -> tag=FX bareCode=false
[R:__LsnlgQ6osk] iter0 harm2 rhs="chords2.voicings('ireal')\n  .slow(1)\n  .note()\n  ." -> tag=Param bareCode=false
[R:__LsnlgQ6osk] post-fixpoint resolved=[rp1,beat,az2,chords2,bass,harm2] pending=[]
[R:__LsnlgQ6osk] FINAL parse -> tag=Stack via=false bareCode=false
```

Pre-Wave-B, `az2` resolved to bareCode (the `irand(12)` root was
opaque); post-Wave-B, `az2`'s root `irand(12)` is recognised by the
`recogniseChainRoot` arm, the existing `Struct` arm fires on
`.struct("x(8,8)|x(4,8)")`, and the binding resolves. The remaining
chain `.sometimesBy(perlin.range(0,1), sub(8))` rides existing
`applyChain` opaquely (a)-verdict — the signal-valued ARG stays
opaque, which is precisely the Wave-C boundary, but no longer
blocks the binding from resolving STRUCTURED. **MINOR-3 ASSERTION
PASS**: all 6 of `rp1,beat,az2,chords2,bass,harm2` post-fixpoint
resolved with `pending=[]`.

`--LsnlgQ6osk` is the provisional crit-1 reclaim the amended D-03
anchors on; V-1 (the final crit-1 dual gate) will confirm at the
end of the wave sequence. LOCKED D-01/D-02-CORRECTION/D-03 (dual
gate ≥85%, no bar-lower) — all untouched.

**Wave B VERDICT: PASS (user-approved within-plan reframe per the
20-17 Wave-C bakery-152 precedent).**

---

## WAVE C — `chord`/`arrange` grounded modelling + #7 PASS + #3 PK18 STOP

**Branch:** `feat/20-18-chain-root` (Wave B HEAD `deb94f8` → Wave C
this commit). Tip below.

### ACTION 1 — Locate + READ real source (Grounding Check, P69 discharge)

`chord` source — NOT in `@strudel/tonal` (despite the surface
feature). It is a CONTROL in `@strudel/core`:
```
node_modules/.pnpm/@strudel+core@1.2.6/node_modules/@strudel/core/controls.mjs:2130
  export const { chord } = registerControl('chord');
controls.mjs:63-74   registerControl(names, ...aliases) → returns { [name]: createParam(names) }
controls.mjs:10-54   createParam(names) → returns `func(value, pat)` closure
controls.mjs:41-49   At root position (no pat): `return reify(value).withValue(withVal)`
                     → reify parses value as mini-notation; withVal wraps each Hap value
                       into `{chord: <value>}`.
```

`arrange` source — in `@strudel/core/pattern.mjs`:
```
pattern.mjs:1469-1473
  export function arrange(...sections) {
    const total = sections.reduce((sum, [cycles]) => sum + cycles, 0);
    sections = sections.map(([cycles, section]) => [cycles, section.fast(cycles)]);
    return stepcat(...sections).slow(total);
  }
pattern.mjs:1458-1468  Doc: "Takes a variable number of arrays with two elements
                            specifying the number of cycles and the pattern to use."
```

Version delta: local `@strudel/core@1.2.6` (vs CONTEXT pin
`f73b395648645aabe699f91ba0989f35a6fd8a3c`). `collect.ts` line-number
citations corroborate 1.2.6 — same baseline used.

### ACTION 2 — `GROUND_TRUTH_SIGNAL_MJS.md` seeded

Created at `~/.anvideck/projects/struCode/ref/GROUND_TRUTH_SIGNAL_MJS.md`
(outside repo per ground-truth-docs protocol — committed only as a
reference in the commit body, not via `git add`).

Contents: §1 signal.mjs seed table (the R-2 21+6 entries), §2 `chord`
grounded section (with the 3 `controls.mjs:LINE` citations above), §3
`arrange` grounded section (with the `pattern.mjs:1469-1473` citation),
§4 opaque-not-load-bearing list, **§5 the body-decision matrix
(GROUNDED, not inferred):**

| Kind | `args` | `body` | Justification |
|------|--------|--------|---------------|
| `chord` | RAW source slice | **ABSENT** | Arg is a chord-symbol sublanguage (`Am`, `Bb^7`, …) routed through `reify`+`withVal`-control-wrapping. No Strudel-pattern recursion available without a chord-symbol parser the IR does not own. Modelling `body` would be inferred-taxonomy. |
| `arrange` | RAW source slice | **ABSENT** | Arg is `...sections: Array<[cycles, pattern]>` — a varargs of JS-tuple-array literals. Matcher does not parse JS array/tuple literals; recursion would require a tuple-aware sub-parser outside matcher competence (D-02 matcher line, EXECUTOR NOTES line 842). |

Both decisions follow RESEARCH R-3's `args`-RAW-ONLY OPAQUE-builder
disposition: the GROUNDING here closes the gate by EXCLUDING a body
shape, not constructing one.

### ACTION 3 — Curated-set + arm extended (the ADDITIVE edit)

`PatternIR.ts:142` Builder kind union: widened from
`'run'|'irand'|'binary'|'binaryN'|'binaryL'|'binaryNL'` to that PLUS
`'chord'|'arrange'`. Comment annotated with the GT REF + the
body-ABSENT contract.

`parseStrudel.ts:811-841` `CHAIN_ROOT_RECOGNISER` Map: 2 new entries
appended in the Builder section:
```
['chord',    { tag: 'Builder', kind: 'chord'    }],
['arrange',  { tag: 'Builder', kind: 'arrange'  }],
```
With a multi-paragraph comment grounding each choice + the body-ABSENT
contract (the inline doc is the catalogue's first-tier interpretation
layer). Arm path UNCHANGED — the existing Wave-B `recogniseChainRoot`
shape (~pS:1155-1206) handles arg-taking → balanced-paren slice → emit
`IR.builder(kind, rawArgs, undefined, {loc})`. Chain composition is the
EXISTING `applyChain` (PK16(b), unchanged).

### ACTION 4 — Probe + per-binding diagnostic (the EXECUTED proof)

Two new maintainer specs at
`packages/app/tests/parity-corpus/`:
- `_waveC-grounding.spec.ts` — loads `samples-2026-05-19T13-24-45-538Z.json`
  verbatim, asserts on #3 + #7 (record-the-STOP form, see below).
- `_waveC-diagnose.spec.ts` — pure observation; per-binding-RHS tag
  classification; "proves chord works" stripped-shape probe (the
  load-bearing evidence that classifies #3 as a NEW-class blocker).

Plus dedicated configs `vitest.waveC.config.ts` + `vitest.waveCdiag.config.ts`
mirroring the proto/bakery pattern (do NOT widen the CI gate).

#### #7 `-KLGNJUtyyj1` — GROUNDED PASS

```
--- #7 -KLGNJUtyyj1 (arrange final expr) — GROUNDED PASS expected ---
whole-program tag=Track    structured=true
deep-walk Builder/arrange = HIT
  hit.kind=arrange  args="
  [48, stack(
    richter_chords.euclidRot(3,8,"<0 1 6 0 1 …"
  body present? NO (correct — args-RAW-only per Ground Truth §5)
```

#7's program is a clean `bindings*, finalExpr` shape (the
`richter_chords`/`richter_tenor`/`richter_sopran` bindings, then the
`arrange(...)` final expression). `buildBindingMap` accepts it; the
fixpoint resolves all 3 bindings; the final `arrange(...)` parses
through the Wave-C arm → `{tag:'Builder', kind:'arrange', args:<RAW>}`;
no body. Whole-program flips STRUCTURED. **Crit-1 (provisional)
contributor: #7 — gate-critical PASS.**

#### #3 `-6c1hEXe8Agi` — PK18 STOP (whole-program shape gap, NOT chord arm)

```
--- #3 -6c1hEXe8Agi (chord-rooted bindings + trailing side-effect) — PK18 STOP recorded ---
whole-program tag=Track    structured=false
deep-walk Builder/chord  = MISS
CLASSIFICATION: whole-program-shape blocker (NOT chain-root) →
  buildBindingMap rejects `bindings*, all(...), finalExpr` shape
  (finalIdx !== stmts.length-1 → returns null → bareCode fallback).
  The chord arm itself WORKS — verified by _waveC-diagnose.spec.ts
  ("proves chord works" probe): stripped-#3 → Track/body.tag=Pick,
  deep Builder/chord HIT, args="\"Am Am\"".
  Disposition: PK18 STOP per plan pre-mortem 2 (PLAN:380).
  Backlog: file issue for buildBindingMap shape-tolerance gap.
```

#### The "proves chord works" stripped-shape probe (verbatim diagnostic)

```
stripped-#3 whole-program tag=Track bare=false
body.tag=Pick bare=false
deep-walk Builder/chord = HIT
  hit.args="\"Am Am\""
```

The only difference between #3 and stripped-#3 is the removal of the
`all(x=>x.punchcard())` line. With it: whole-program bareCode (the
shape rejection). Without it: clean STRUCTURED + chord HIT. The
classification is **direct, captured**, not inferred.

#### Per-binding RHS tag census (verbatim — `_waveC-diagnose.spec.ts` Pass 2)

```
=== Pass 2 — declaration order with accumulating bindings ===
crackles   tag=Param    bare=false
padsbell   tag=Code     bare=false      ← chord(...).voicing()... structured via Wave-C
leadbell   tag=Param    bare=false
keysbcbg   tag=Code     bare=false
softkeys   tag=Code     bare=false
dotsawst   tag=Choice   bare=false
deadchoir  tag=Choice   bare=false
deadkeys   tag=Param    bare=false
melosupp   tag=Param    bare=false      ← chord(...).voicing()... structured
allsnare   tag=Param    bare=false
hihatpat   tag=Param    bare=false
kicktemp   tag=Param    bare=false
basse808   tag=Param    bare=false
ultmkick   tag=Param    bare=false
intro      tag=Stack    bare=false
core1      tag=Stack    bare=false
interlude  tag=Stack    bare=false
core2      tag=Stack    bare=false
core3      tag=Stack    bare=false
outro      tag=Stack    bare=false
FINAL      tag=Pick     bare=false      ← "<...>".pick([intro, core1, …]) — structured
```

EVERY binding RHS + the final expression parse non-bareCode in
declaration order. The whole-program failure is purely the
`buildBindingMap` shape rejection at line 534 (the `finalIdx !==
stmts.length - 1` predicate trips on the `all(...)` side-effect
statement sitting between the bindings block and the finalExpr).

**Classification: NEW-CLASS blocker (program-shape, NOT chain-root
recognition).** Per plan pre-mortem 2 (PLAN:380):
"a non-flip with a NEW-class blocker is a PK18 STOP → backlog →
re-pose, NEVER an ad-hoc fix this phase." Backlog filed:
[issue #158](https://github.com/MrityunjayBhardwaj/stave-code/issues/158)
"buildBindingMap: `bindings*, sideEffect, finalExpr` shape rejected
(20-18 Wave C residual — gate-relevant #3 `-6c1hEXe8Agi`)".

### ACTION 5 — Corpus-wide chord/arrange grep + audit

```
$ grep -rlE '(^|[^a-zA-Z_$])(chord|arrange)\(' packages/app/tests/parity-corpus --include='*.strudel' | grep -v bakery-runs | xargs -n1 basename | sort -u
arpoon.strudel       ← `.chord(...)` (leading dot — CHAIN method, not root; unaffected)
belldub.strudel      ← `chord("[~ Gm7] ~ [~ Dm7] ~")` root inside stack(...)
dinofunk.strudel     ← `chord("Abm7")` root inside stack(...)
meltingsubmarine.strudel ← `chord("<Am7!3 <Em7 …>>")` root inside stack(...)
```

Three NEW Wave-C movers (`belldub` was already Wave-B-allow-listed and
gets a further diff; `dinofunk` + `meltingsubmarine` are NEW
allow-list extensions). Per-file diff audit:

- `dinofunk.strudel` — `chord("Abm7").mode(...).dict(...).voicing().struct(...)` was bareCode block; now nested `Code.via{method:'struct', inner:Code.via{voicing, inner:Code.via{dict, inner:Code.via{mode, inner:{tag:'Builder',kind:'chord',args:'"Abm7"'}}}}}`. Clean bareCode→STRUCTURED via Wave-C arm. PV49 loc-additivity preserved (chain-method `loc` entries are subsequence-of-source). Code-invariance preserved (toStrudel emits `chord("Abm7")` verbatim).
- `meltingsubmarine.strudel` — `chord("<Am7!3 <Em7 …>>").dict('lefthand').voicing().add(...)` block; same nested Code.via over Builder/chord. Same class.
- `belldub.strudel` — `chord("[~ Gm7] ~ [~ Dm7] ~").dict(...).voicing().add(...).cutoff(perlin.range(...))...` block; same nested Code.via over Builder/chord. Combines with Wave-B's `perlin.range` chains (the perlin chain inside cutoff is now ALSO structured); deeper diff than Wave B alone.

All 3 diffs were AUDITED before snapshot refresh. The mechanism is
identical to Wave-B's amensister/belldub disposition: same
`recogniseChainRoot` arm, same PV49 loc-additivity, same
code-invariance. **V-3 allow-list extension (Wave C):**
- `dinofunk.strudel` — legitimate bareCode→STRUCTURED via
  `recogniseChainRoot` + `chord` curated key.
- `meltingsubmarine.strudel` — same mechanism.
- `belldub.strudel` — Wave-B-allow-listed; Wave-C deepens the
  existing diff.

### ACTION 6 — Gate results

| Gate | Result | Detail |
|------|--------|--------|
| 1 — `GROUND_TRUTH_SIGNAL_MJS.md` exists with grounded citations | **PASS** | `~/.anvideck/projects/struCode/ref/GROUND_TRUTH_SIGNAL_MJS.md` — `controls.mjs:2130/:10-54/:41-49` for chord, `pattern.mjs:1469-1473` for arrange, version-delta noted (1.2.6 vs Codeberg `f73b3956`). |
| 2 — Probe records #3/#7 verbatim | **PASS** | `/tmp/waveC-grounding-output.txt` captured; #7 GROUNDED PASS, #3 PK18 STOP classified verbatim. |
| 3 — P68 build + minification-stable anchor | **PASS** | `pnpm --filter @stave/editor build` exit 0. `dist/index.js`: `"chord"`=5, `"arrange"`=1, `"irand"`=1, `"sine"`=11, `CHAIN_ROOT_RECOGNISER`=3. (tsup re-emits with double quotes; the single-quoted source idiom converts at bundle time.) |
| 4 — editor 1603/1603 + app 367/367 + per-file loc-fidelity STOP gate | **PASS** | editor `1603 passed (1603)`; app `367 passed (367)` after V-3 allow-list-extended snapshot refresh (the 3 mover files audited per ACTION 5). Per-file STOP gate: only the allow-listed 3 files (belldub Wave-B+C, dinofunk Wave-C, meltingsubmarine Wave-C) moved. |
| 5 — proto MINOR-3 ASSERTION | **PASS** | `__LsnlgQ6osk \| production=structured (body.tag=Stack)`; `[R:__LsnlgQ6osk] post-fixpoint resolved=[rp1,beat,az2,chords2,bass,harm2] pending=[]`. All 6 stay resolved — no consumer-wave regression. |
| 6 — Commit via COMMIT_TEMPLATE | **PASS** | See tip below. |

### Wave C — VERDICT: **PASS (within scope) + PK18 STOP recorded on #3**

The Wave-C scope was: GROUND `chord`/`arrange` against real source,
seed the Ground Truth doc, model them as `Builder` with a GROUNDED
body decision (RAW args, body ABSENT — never inferred), and prove
the arm via executed probe. **All four are done.**

#7 flips STRUCTURED (gate-critical PASS — contributes to Wave-V crit-1
parity counting). #3's chord recogniser also flips (proven via
stripped-shape probe), but the whole-program does NOT flip because of
a `bindings*, sideEffect, finalExpr` shape rejection in
`buildBindingMap` that is OUTSIDE Wave C's scope — a NEW-class
blocker. Per the plan's pre-mortem 2 + the executor's HARD STOP
discipline, this is a PK18 STOP: backlog issue #158 filed, no
scope-expansion, no second workaround, no bar-lower. The locked
`expect(struct3).toBe(false)` assertion in `_waveC-grounding.spec.ts`
captures the STOP — when issue #158's fix lands, that assertion
fails LOUDLY and Wave V picks up #3 then.

The chord/arrange GROUNDING is complete. The chord arm WORKS where
the program-shape allows. The Wave-V parity-counting will see
#7 + `dinofunk` + `meltingsubmarine` + (belldub Wave-B+C deepening)
as Wave-C STRUCTURED contributions; #3 awaits the backlog fix.

**Wave C READY for Wave D (the PV53 consumer audit — VERIFY-ONLY per
the Wave-A/D re-sequencing amendment).** LOCKED D-01/D-02-CORRECTION/D-03
(dual gate ≥85%, no bar-lower) — all untouched. The body-ABSENT
contract on the new `chord`/`arrange` kinds is the Wave-D verifier's
gate: every `case 'Builder'` consumer arm sees `body?: PatternIR`
present-but-undefined for these kinds (no consumer code change
needed).

---

## D-03 AMENDMENT-2 (2026-05-20 — user-approved evidence reframe)

Wave C empirical finding: #3's chord-arm-fires-correctly was proved
(stripped-#3 probe + 3 corpus flips + #7 peer = 4 observations), but
#3 also has a SECOND blocker class (`buildBindingMap` shape-fence;
filed #158, 20-19 seed). The 2026-05-19 AMENDMENT placed #3 in crit-1
under the inferred classification "chord-family = chain-root class" —
partially falsified: chord IS chain-root for the `padsbell` binding,
but #3 has an ADDITIONAL trailing-side-effect-statement shape blocker
that is NOT chain-root. P70 occurrence-4 in this phase series.

User decision (PK18 re-pose): **drop #3 from crit-1**. Re-amended
D-03 crit-1 = `--LsnlgQ6osk` + #7 STRUCTURED (both already HIT in
Waves B/C — provisional, V-1 confirms). #3 → backlog #158 → 20-19.
NOT bar-lowering: same falsified-premise-reframe class as the
2026-05-19 `--LsnlgQ6osk` re-anchor that established the AMENDMENT
precedent. The CONTEXT D-03 AMENDMENT-2 section is the authoritative
re-statement.

**Crit-1 evidence as of HEAD `35aac5f`:**
- `--LsnlgQ6osk` `production=structured (body.tag=Stack)` (Wave B
  proto trace verbatim; `post-fixpoint resolved=[rp1,beat,az2,
  chords2,bass,harm2] pending=[]`).
- `-KLGNJUtyyj1` `production=structured` + `deep-walk Builder/arrange
  = HIT` (Wave C probe verbatim).

V-1 confirms in the final dual gate run.
